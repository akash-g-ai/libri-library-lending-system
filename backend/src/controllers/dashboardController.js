'use strict';
const { pool } = require('../db/connection');
const { getClock } = require('../utils/clock');

/**
 * GET /api/dashboard/member
 * Member only. Returns personal dashboard data.
 */
async function getMemberDashboard(req, res, next) {
  const memberId = req.user.id;
  try {
    const today = getClock().today();

    const [loansRes, finesRes, reservationsRes] = await Promise.all([
      pool.query(
        `SELECT l.id, l.book_id, b.title AS book_title,
                l.checkout_date::text, l.due_date::text, l.return_date::text, l.status
         FROM loans l JOIN books b ON b.id = l.book_id
         WHERE l.member_id = $1
         ORDER BY l.created_at DESC LIMIT 10`,
        [memberId]
      ),
      pool.query(
        `SELECT f.id, f.fine_amount::float, f.paid_amount::float,
                (f.fine_amount - f.paid_amount)::float AS outstanding,
                f.payment_status, b.title AS book_title
         FROM fines f
         JOIN loans l ON l.id = f.loan_id
         JOIN books b ON b.id = l.book_id
         WHERE f.member_id = $1 AND f.payment_status IN ('unpaid','partial')
         ORDER BY f.created_at DESC`,
        [memberId]
      ),
      pool.query(
        `SELECT r.id, r.book_id, b.title AS book_title,
                r.queue_position, r.status, r.hold_expires_at, r.created_at
         FROM reservations r JOIN books b ON b.id = r.book_id
         WHERE r.member_id = $1 AND r.status IN ('waiting','held')
         ORDER BY r.created_at DESC`,
        [memberId]
      ),
    ]);

    const loans        = loansRes.rows;
    const fines        = finesRes.rows;
    const reservations = reservationsRes.rows;

    const activeLoans   = loans.filter(l => l.status === 'active');
    const overdueLoans  = activeLoans.filter(l => l.due_date < today);
    const totalOutstanding = fines.reduce((s, f) => s + f.outstanding, 0);

    return res.status(200).json({
      loans,
      fines,
      reservations,
      summary: {
        active_loans:      activeLoans.length,
        overdue_loans:     overdueLoans.length,
        pending_fines:     fines.length,
        total_outstanding: parseFloat(totalOutstanding.toFixed(2)),
        active_reservations: reservations.length,
        held_reservations:   reservations.filter(r => r.status === 'held').length,
      },
    });
  } catch (err) { next(err); }
}

/**
 * GET /api/dashboard/librarian
 * Librarian only. Returns system-wide statistics from the database.
 */
async function getLibrarianDashboard(req, res, next) {
  try {
    const today = getClock().today();

    const [
      booksRes, loansRes, overdueRes,
      membersRes, reservationsRes,
      heldRes, finesRes,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total,
                         SUM(available_copies)::int AS available_copies
                  FROM books`),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM loans WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM loans WHERE status = 'active' AND due_date < $1::date`, [today]),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'member'`),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM reservations WHERE status = 'waiting'`),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM reservations WHERE status = 'held'`),
      pool.query(`SELECT COALESCE(SUM(fine_amount - paid_amount), 0)::float AS outstanding
                  FROM fines WHERE payment_status IN ('unpaid','partial')`),
    ]);

    return res.status(200).json({
      stats: {
        total_books:            booksRes.rows[0].total,
        available_copies:       booksRes.rows[0].available_copies,
        active_loans:           loansRes.rows[0].cnt,
        overdue_loans:          overdueRes.rows[0].cnt,
        registered_members:     membersRes.rows[0].cnt,
        pending_reservations:   reservationsRes.rows[0].cnt,
        active_holds:           heldRes.rows[0].cnt,
        total_outstanding_fines: parseFloat(finesRes.rows[0].outstanding.toFixed(2)),
      },
    });
  } catch (err) { next(err); }
}

module.exports = { getMemberDashboard, getLibrarianDashboard };