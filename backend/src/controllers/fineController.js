'use strict';
const { pool } = require('../db/connection');

/**
 * GET /api/fines/my-fines
 */
async function getMyFines(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT f.id, f.loan_id, b.title AS book_title,
              f.fine_amount::float AS fine_amount,
              f.paid_amount::float AS paid_amount,
              (f.fine_amount - f.paid_amount)::float AS outstanding,
              f.payment_status, f.paid_at, f.created_at, f.updated_at
       FROM fines f
       JOIN loans l ON l.id = f.loan_id
       JOIN books b ON b.id = l.book_id
       WHERE f.member_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    return res.status(200).json({ fines: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/fines
 * Librarian: all fines with optional payment_status filter.
 */
async function getAllFines(req, res, next) {
  try {
    const { payment_status } = req.query;
    const validStatuses = ['unpaid', 'partial', 'paid'];

    let query;
    let params = [];
    const select = `
        SELECT f.id, f.loan_id, f.member_id,
               u.name AS member_name, u.email AS member_email,
               b.title AS book_title,
               f.fine_amount::float AS fine_amount,
               f.paid_amount::float AS paid_amount,
               (f.fine_amount - f.paid_amount)::float AS outstanding,
               f.payment_status, f.paid_at, f.created_at, f.updated_at
        FROM fines f
        JOIN users u ON u.id = f.member_id
        JOIN loans l ON l.id = f.loan_id
        JOIN books b ON b.id = l.book_id`;

    if (payment_status && validStatuses.includes(payment_status)) {
      query  = select + ' WHERE f.payment_status = $1 ORDER BY f.created_at DESC';
      params = [payment_status];
    } else {
      query = select + ' ORDER BY f.created_at DESC';
    }

    const { rows } = await pool.query(query, params);
    return res.status(200).json({ fines: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/fines/:id/pay
 * Librarian: record a partial or full payment.
 */
async function payFine(req, res, next) {
  const fineId = parseInt(req.params.id, 10);
  if (isNaN(fineId)) return res.status(400).json({ error: 'Invalid fine ID.' });

  const amount = parseFloat(req.body.amount);
  if (!req.body.amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Payment amount must be a positive number.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id, fine_amount::float AS fine_amount, paid_amount::float AS paid_amount, payment_status FROM fines WHERE id = $1 FOR UPDATE',
      [fineId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fine not found.' });
    }
    const fine = rows[0];

    if (fine.payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This fine has already been fully paid.' });
    }

    const outstanding = parseFloat((fine.fine_amount - fine.paid_amount).toFixed(2));
    const roundedAmount = parseFloat(amount.toFixed(2));

    if (roundedAmount > outstanding) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Payment amount ($${roundedAmount.toFixed(2)}) exceeds outstanding balance ($${outstanding.toFixed(2)}).`,
      });
    }

    const newPaid   = parseFloat((fine.paid_amount + roundedAmount).toFixed(2));
    const newStatus = newPaid >= parseFloat(fine.fine_amount.toFixed(2)) ? 'paid' : 'partial';

    const { rows: updated } = await client.query(
      `UPDATE fines
       SET paid_amount = $1,
           payment_status = $2,
           paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, loan_id, member_id,
                 fine_amount::float AS fine_amount,
                 paid_amount::float AS paid_amount,
                 (fine_amount - paid_amount)::float AS outstanding,
                 payment_status, paid_at, updated_at`,
      [newPaid.toFixed(2), newStatus, fineId]
    );

    await client.query('COMMIT');
    return res.status(200).json({ fine: updated[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { getMyFines, getAllFines, payFine };