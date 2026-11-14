'use strict';
const { pool } = require('../db/connection');
const { getClock } = require('../utils/clock');
const { addDays, calcOverdueDays, calcFine } = require('../utils/dateUtils');
const { allocateNextReservation, processExpiredHolds } = require('../utils/reservationAllocator');

// ---------- Checkout --------------------------------------------------------

async function checkout(req, res, next) {
  const memberId = req.user.id;
  const { book_id } = req.body;

  if (!book_id) return res.status(400).json({ error: 'book_id is required.' });
  const bookId = parseInt(book_id, 10);
  if (isNaN(bookId)) return res.status(400).json({ error: 'book_id must be an integer.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: settings } = await client.query(
      `SELECT loan_period_days, max_active_loans, unpaid_fine_borrowing_threshold,
              reservation_hold_window_hours
       FROM library_settings LIMIT 1`
    );
    if (settings.length === 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Library settings not configured.' });
    }
    const { loan_period_days, max_active_loans, unpaid_fine_borrowing_threshold,
            reservation_hold_window_hours } = settings[0];
    const holdWindowHours = parseInt(reservation_hold_window_hours, 10);

    // Process expired holds before assessing availability
    await processExpiredHolds(client, bookId, holdWindowHours);

    // Lock book row
    const { rows: books } = await client.query(
      'SELECT id, title, available_copies FROM books WHERE id = $1 FOR UPDATE', [bookId]
    );
    if (books.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Book not found.' });
    }
    if (books[0].available_copies <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No copies available for checkout.' });
    }

    // Active loan limit
    const { rows: activeLoans } = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM loans WHERE member_id = $1 AND status = 'active'",
      [memberId]
    );
    if (activeLoans[0].cnt >= parseInt(max_active_loans, 10)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Active loan limit reached (maximum ${max_active_loans}).` });
    }

    // Unpaid fine threshold
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
        error: `Checkout blocked: outstanding fines ($${outstanding.toFixed(2)}) exceed the allowed threshold ($${threshold.toFixed(2)}). Please pay your fines first.`,
      });
    }

    // Duplicate active loan guard
    const { rows: dupLoans } = await client.query(
      "SELECT id FROM loans WHERE member_id = $1 AND book_id = $2 AND status = 'active'",
      [memberId, bookId]
    );
    if (dupLoans.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have an active loan for this book.' });
    }

    const today   = getClock().today();
    const dueDate = addDays(today, parseInt(loan_period_days, 10));

    await client.query(
      'UPDATE books SET available_copies = available_copies - 1, updated_at = NOW() WHERE id = $1',
      [bookId]
    );

    const { rows: loan } = await client.query(
      `INSERT INTO loans (member_id, book_id, checkout_date, due_date, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, member_id, book_id,
                 checkout_date::text, due_date::text, return_date::text,
                 status, created_at`,
      [memberId, bookId, today, dueDate]
    );

    await client.query('COMMIT');
    return res.status(201).json({ loan: loan[0], book: { id: books[0].id, title: books[0].title } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ---------- My loans --------------------------------------------------------

async function getMyLoans(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.member_id, l.book_id,
              b.title AS book_title, b.author AS book_author,
              l.checkout_date::text, l.due_date::text, l.return_date::text,
              l.status, l.created_at
       FROM loans l JOIN books b ON b.id = l.book_id
       WHERE l.member_id = $1
       ORDER BY l.created_at DESC`,
      [req.user.id]
    );
    return res.status(200).json({ loans: rows });
  } catch (err) { next(err); }
}

// ---------- All loans (librarian) -------------------------------------------

async function getAllLoans(req, res, next) {
  try {
    const { status } = req.query;
    const today = getClock().today();
    let query, params = [];

    if (status === 'overdue') {
      query = `SELECT l.id, l.member_id, u.name AS member_name, u.email AS member_email,
               l.book_id, b.title AS book_title,
               l.checkout_date::text, l.due_date::text, l.return_date::text, l.status, l.created_at
               FROM loans l JOIN users u ON u.id = l.member_id JOIN books b ON b.id = l.book_id
               WHERE l.status = 'active' AND l.due_date < $1::date ORDER BY l.due_date ASC`;
      params = [today];
    } else if (status === 'active' || status === 'returned') {
      query = `SELECT l.id, l.member_id, u.name AS member_name, u.email AS member_email,
               l.book_id, b.title AS book_title,
               l.checkout_date::text, l.due_date::text, l.return_date::text, l.status, l.created_at
               FROM loans l JOIN users u ON u.id = l.member_id JOIN books b ON b.id = l.book_id
               WHERE l.status = $1 ORDER BY l.created_at DESC`;
      params = [status];
    } else {
      query = `SELECT l.id, l.member_id, u.name AS member_name, u.email AS member_email,
               l.book_id, b.title AS book_title,
               l.checkout_date::text, l.due_date::text, l.return_date::text, l.status, l.created_at
               FROM loans l JOIN users u ON u.id = l.member_id JOIN books b ON b.id = l.book_id
               ORDER BY l.created_at DESC`;
    }
    const { rows } = await pool.query(query, params);
    return res.status(200).json({ loans: rows });
  } catch (err) { next(err); }
}

// ---------- Return (with FIFO allocation) ------------------------------------

async function returnLoan(req, res, next) {
  const loanId = parseInt(req.params.id, 10);
  if (isNaN(loanId)) return res.status(400).json({ error: 'Invalid loan ID.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: loans } = await client.query(
      `SELECT l.id, l.member_id, l.book_id, l.status, l.due_date::text AS due_date_str
       FROM loans l WHERE l.id = $1 FOR UPDATE`,
      [loanId]
    );
    if (loans.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Loan not found.' });
    }
    const loan = loans[0];
    if (loan.status === 'returned') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This loan has already been returned.' });
    }

    const { rows: settings } = await client.query(
      'SELECT fine_per_overdue_day, max_fine_cap, reservation_hold_window_hours FROM library_settings LIMIT 1'
    );
    const { fine_per_overdue_day, max_fine_cap, reservation_hold_window_hours } = settings[0];
    const holdWindowHours = parseInt(reservation_hold_window_hours, 10);

    const returnDate = getClock().today();

    const { rows: updated } = await client.query(
      `UPDATE loans SET status = 'returned', return_date = $1::date, updated_at = NOW()
       WHERE id = $2
       RETURNING id, member_id, book_id,
                 checkout_date::text, due_date::text, return_date::text, status`,
      [returnDate, loanId]
    );
    const updatedLoan = updated[0];

    // Process any expired holds, then allocate the returned copy
    const { restoredToInventory } = await processExpiredHolds(client, loan.book_id, holdWindowHours);
    const allocated = await allocateNextReservation(client, loan.book_id, holdWindowHours);

    if (!allocated) {
      // No reservation waiting: restore this copy + any freed expired-hold copies
      await client.query(
        'UPDATE books SET available_copies = available_copies + $1, updated_at = NOW() WHERE id = $2',
        [1 + restoredToInventory, loan.book_id]
      );
    } else if (restoredToInventory > 0) {
      // Expired holds freed some copies; the returned copy is held by `allocated`
      await client.query(
        'UPDATE books SET available_copies = available_copies + $1, updated_at = NOW() WHERE id = $2',
        [restoredToInventory, loan.book_id]
      );
    }
    // If allocated != null and restoredToInventory == 0:
    // returned copy is now held — available_copies unchanged

    // Fine calculation
    let fine = null;
    const overdueDays = calcOverdueDays(loan.due_date_str, returnDate);
    if (overdueDays > 0) {
      const { rows: existing } = await client.query(
        'SELECT id FROM fines WHERE loan_id = $1 LIMIT 1', [loanId]
      );
      if (existing.length === 0) {
        const fineAmount = calcFine(overdueDays, fine_per_overdue_day, max_fine_cap);
        const { rows: fineRow } = await client.query(
          `INSERT INTO fines (loan_id, member_id, fine_amount, paid_amount, payment_status)
           VALUES ($1, $2, $3, 0, 'unpaid')
           RETURNING id, loan_id, member_id,
                     fine_amount::text, paid_amount::text, payment_status, created_at`,
          [loanId, loan.member_id, fineAmount.toFixed(2)]
        );
        fine = fineRow[0];
        fine.fine_amount = parseFloat(fine.fine_amount);
        fine.paid_amount = parseFloat(fine.paid_amount);
      }
    }

    await client.query('COMMIT');
    return res.status(200).json({ loan: updatedLoan, fine, overdue_days: overdueDays, allocated_reservation: allocated });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = {
  checkout, getMyLoans, getAllLoans, returnLoan,
  // Re-exported for existing tests that import from loanController
  _calcFine: calcFine,
  _calcOverdueDays: calcOverdueDays,
  _addDays: addDays,
};