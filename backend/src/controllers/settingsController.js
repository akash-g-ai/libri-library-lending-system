'use strict';
const { pool } = require('../db/connection');

/**
 * GET /api/settings
 * Librarian only. Returns the current library settings row.
 */
async function getSettings(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT loan_period_days, fine_per_overdue_day::float, max_fine_cap::float,
              max_active_loans, reservation_hold_window_hours,
              unpaid_fine_borrowing_threshold::float,
              updated_at
       FROM library_settings LIMIT 1`
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Library settings not found.' });
    }
    return res.status(200).json({ settings: rows[0] });
  } catch (err) { next(err); }
}

/**
 * PUT /api/settings
 * Librarian only. Updates library settings with full validation.
 */
async function updateSettings(req, res, next) {
  try {
    const {
      loan_period_days,
      fine_per_overdue_day,
      max_fine_cap,
      max_active_loans,
      unpaid_fine_borrowing_threshold,
      reservation_hold_window_hours,
    } = req.body;

    const errors = [];

    const lpd = parseInt(loan_period_days, 10);
    if (isNaN(lpd) || lpd <= 0) errors.push('loan_period_days must be a positive integer.');

    const fpd = parseFloat(fine_per_overdue_day);
    if (isNaN(fpd) || fpd < 0) errors.push('fine_per_overdue_day must be a non-negative number.');

    const mfc = parseFloat(max_fine_cap);
    if (isNaN(mfc) || mfc < 0) errors.push('max_fine_cap must be a non-negative number.');

    const mal = parseInt(max_active_loans, 10);
    if (isNaN(mal) || mal <= 0) errors.push('max_active_loans must be a positive integer.');

    const ufbt = parseFloat(unpaid_fine_borrowing_threshold);
    if (isNaN(ufbt) || ufbt < 0) errors.push('unpaid_fine_borrowing_threshold must be a non-negative number.');

    const rhwh = parseInt(reservation_hold_window_hours, 10);
    if (isNaN(rhwh) || rhwh <= 0) errors.push('reservation_hold_window_hours must be a positive integer.');

    if (errors.length > 0) return res.status(400).json({ errors });

    const { rows } = await pool.query(
      `UPDATE library_settings
       SET loan_period_days = $1,
           fine_per_overdue_day = $2,
           max_fine_cap = $3,
           max_active_loans = $4,
           unpaid_fine_borrowing_threshold = $5,
           reservation_hold_window_hours = $6,
           updated_at = NOW()
       RETURNING loan_period_days, fine_per_overdue_day::float, max_fine_cap::float,
                 max_active_loans, reservation_hold_window_hours,
                 unpaid_fine_borrowing_threshold::float, updated_at`,
      [lpd, fpd.toFixed(2), mfc.toFixed(2), mal, ufbt.toFixed(2), rhwh]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Library settings not found. Run seed first.' });
    }
    return res.status(200).json({ settings: rows[0], message: 'Settings updated successfully.' });
  } catch (err) { next(err); }
}

module.exports = { getSettings, updateSettings };