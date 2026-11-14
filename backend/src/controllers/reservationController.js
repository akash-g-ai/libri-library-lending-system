'use strict';
const { pool } = require('../db/connection');
const { getClock } = require('../utils/clock');
const { allocateNextReservation, processExpiredHolds } = require('../utils/reservationAllocator');
const { addDays } = require('../utils/dateUtils');

// ---------- Helpers ---------------------------------------------------------

async function getSettings(client) {
  const { rows } = await (client || pool).query(
    `SELECT loan_period_days, max_active_loans, unpaid_fine_borrowing_threshold,
            reservation_hold_window_hours
     FROM library_settings LIMIT 1`
  );
  if (rows.length === 0) throw Object.assign(new Error('Library settings not configured.'), { status: 500 });
  return rows[0];
}

// ---------- POST /api/reservations ------------------------------------------

async function createReservation(req, res, next) {
  const memberId = req.user.id;
  const { book_id } = req.body;

  if (!book_id) return res.status(400).json({ error: 'book_id is required.' });
  const bookId = parseInt(book_id, 10);
  if (isNaN(bookId)) return res.status(400).json({ error: 'book_id must be an integer.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const settings = await getSettings(client);
    const holdWindowHours = parseInt(settings.reservation_hold_window_hours, 10);

    // Process expired holds before assessing availability
    await processExpiredHolds(client, bookId, holdWindowHours);

    // Lock the book row
    const { rows: books } = await client.query(
      'SELECT id, title, available_copies FROM books WHERE id = $1 FOR UPDATE',
      [bookId]
    );
    if (books.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Book not found.' });
    }

    // If copies are available, don't create a reservation
    if (books[0].available_copies > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'A copy of this book is currently available. Please check it out instead.',
        available: true,
      });
    }

    // Prevent duplicate active reservation (enforced also by partial unique index)
    const { rows: existing } = await client.query(
      "SELECT id FROM reservations WHERE member_id = $1 AND book_id = $2 AND status IN ('waiting','held')",
      [memberId, bookId]
    );
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have an active reservation for this book.' });
    }

    // Assign queue position: max existing waiting position + 1
    const { rows: posRows } = await client.query(
      "SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM reservations WHERE book_id = $1 AND status = 'waiting'",
      [bookId]
    );
    const queuePosition = posRows[0].max_pos + 1;

    const now = getClock().now().toISOString();
    const { rows: reservation } = await client.query(
      `INSERT INTO reservations (member_id, book_id, queue_position, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'waiting', $4, $4)
       RETURNING id, member_id, book_id, queue_position, status,
                 hold_start_at, hold_expires_at, created_at, updated_at`,
      [memberId, bookId, queuePosition, now]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      reservation: reservation[0],
      book: { id: books[0].id, title: books[0].title },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ---------- GET /api/reservations/my-reservations ---------------------------

async function getMyReservations(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.book_id, b.title AS book_title, b.author AS book_author,
              r.queue_position, r.status,
              r.hold_start_at, r.hold_expires_at,
              r.created_at, r.updated_at
       FROM reservations r
       JOIN books b ON b.id = r.book_id
       WHERE r.member_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    return res.status(200).json({ reservations: rows });
  } catch (err) { next(err); }
}

// ---------- GET /api/reservations (librarian) --------------------------------

async function getAllReservations(req, res, next) {
  try {
    const { status, book_id } = req.query;
    const validStatuses = ['waiting', 'held', 'fulfilled', 'expired', 'cancelled'];

    let where = [];
    let params = [];
    let idx = 1;

    if (status && validStatuses.includes(status)) {
      where.push(`r.status = $${idx++}`);
      params.push(status);
    }
    if (book_id) {
      where.push(`r.book_id = $${idx++}`);
      params.push(parseInt(book_id, 10));
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT r.id, r.member_id, u.name AS member_name, u.email AS member_email,
              r.book_id, b.title AS book_title,
              r.queue_position, r.status,
              r.hold_start_at, r.hold_expires_at,
              r.created_at, r.updated_at
       FROM reservations r
       JOIN users u ON u.id = r.member_id
       JOIN books b ON b.id = r.book_id
       ${whereClause}
       ORDER BY r.book_id ASC, r.queue_position ASC, r.created_at ASC`,
      params
    );
    return res.status(200).json({ reservations: rows });
  } catch (err) { next(err); }
}

// ---------- POST /api/reservations/:id/collect ------------------------------

async function collectReservation(req, res, next) {
  const reservationId = parseInt(req.params.id, 10);
  if (isNaN(reservationId)) return res.status(400).json({ error: 'Invalid reservation ID.' });

  const memberId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const settings = await getSettings(client);
    const {
      loan_period_days, max_active_loans,
      unpaid_fine_borrowing_threshold, reservation_hold_window_hours,
    } = settings;
    const holdWindowHours = parseInt(reservation_hold_window_hours, 10);

    // Lock the reservation row
    const { rows: resRows } = await client.query(
      `SELECT r.id, r.member_id, r.book_id, r.status, r.hold_expires_at
       FROM reservations r WHERE r.id = $1 FOR UPDATE`,
      [reservationId]
    );
    if (resRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found.' });
    }
    const reservation = resRows[0];

    // Only the hold owner can collect
    if (reservation.member_id !== memberId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This reservation does not belong to you.' });
    }
    if (reservation.status !== 'held') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Reservation is not in held status (current: ${reservation.status}).` });
    }

    // Check expiry
    const now = getClock().now();
    if (reservation.hold_expires_at && new Date(reservation.hold_expires_at) < now) {
      // Mark expired and try to pass to next waiter
      await client.query(
        "UPDATE reservations SET status = 'expired', updated_at = NOW() WHERE id = $1",
        [reservationId]
      );
      const next = await allocateNextReservation(client, reservation.book_id, holdWindowHours);
      if (!next) {
        // No one waiting - release the copy back to general inventory
        await client.query(
          'UPDATE books SET available_copies = available_copies + 1, updated_at = NOW() WHERE id = $1',
          [reservation.book_id]
        );
      }
      await client.query('COMMIT');
      return res.status(409).json({ error: 'Your hold has expired and has been released to the next member in queue.' });
    }

    // Check active loan limit
    const { rows: activeLoans } = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM loans WHERE member_id = $1 AND status = 'active'",
      [memberId]
    );
    if (activeLoans[0].cnt >= parseInt(max_active_loans, 10)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Active loan limit reached (maximum ${max_active_loans}).` });
    }

    // Check unpaid fine threshold
    const { rows: fineRows } = await client.query(
      `SELECT COALESCE(SUM(fine_amount - paid_amount), 0)::numeric AS outstanding
       FROM fines WHERE member_id = $1 AND payment_status IN ('unpaid', 'partial')`,
      [memberId]
    );
    const outstanding = parseFloat(fineRows[0].outstanding);
    const threshold   = parseFloat(unpaid_fine_borrowing_threshold);
    if (outstanding > threshold) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: `Checkout blocked: outstanding fines ($${outstanding.toFixed(2)}) exceed the allowed threshold ($${threshold.toFixed(2)}).`,
      });
    }

    // Duplicate active loan guard
    const { rows: dupLoans } = await client.query(
      "SELECT id FROM loans WHERE member_id = $1 AND book_id = $2 AND status = 'active'",
      [memberId, reservation.book_id]
    );
    if (dupLoans.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have an active loan for this book.' });
    }

    // Mark reservation as fulfilled
    await client.query(
      "UPDATE reservations SET status = 'fulfilled', updated_at = NOW() WHERE id = $1",
      [reservationId]
    );

    // Create loan (book copy stays "checked out" - available_copies unchanged since it was held)
    const today   = getClock().today();
    const dueDate = addDays(today, parseInt(loan_period_days, 10));

    const { rows: loan } = await client.query(
      `INSERT INTO loans (member_id, book_id, checkout_date, due_date, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, member_id, book_id,
                 checkout_date::text, due_date::text, return_date::text,
                 status, created_at`,
      [memberId, reservation.book_id, today, dueDate]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      loan: loan[0],
      reservation: { id: reservationId, status: 'fulfilled' },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ---------- DELETE /api/reservations/:id ------------------------------------

async function cancelReservation(req, res, next) {
  const reservationId = parseInt(req.params.id, 10);
  if (isNaN(reservationId)) return res.status(400).json({ error: 'Invalid reservation ID.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const settings = await getSettings(client);
    const holdWindowHours = parseInt(settings.reservation_hold_window_hours, 10);

    // Lock reservation
    const { rows: resRows } = await client.query(
      'SELECT id, member_id, book_id, status FROM reservations WHERE id = $1 FOR UPDATE',
      [reservationId]
    );
    if (resRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found.' });
    }
    const reservation = resRows[0];

    // Members can only cancel their own; librarians can cancel any
    if (req.user.role === 'member' && reservation.member_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only cancel your own reservations.' });
    }

    if (!['waiting', 'held'].includes(reservation.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Reservation cannot be cancelled (current status: ${reservation.status}).`,
      });
    }

    // Mark cancelled
    await client.query(
      "UPDATE reservations SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [reservationId]
    );

    if (reservation.status === 'held') {
      // The held copy is released — try to allocate to next waiter
      const next = await allocateNextReservation(client, reservation.book_id, holdWindowHours);
      if (!next) {
        // No one waiting — restore copy to inventory
        await client.query(
          'UPDATE books SET available_copies = available_copies + 1, updated_at = NOW() WHERE id = $1',
          [reservation.book_id]
        );
      }
    }
    // Cancelling a 'waiting' reservation: no inventory change needed

    await client.query('COMMIT');
    return res.status(200).json({ message: 'Reservation cancelled successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = {
  createReservation,
  getMyReservations,
  getAllReservations,
  collectReservation,
  cancelReservation,
};