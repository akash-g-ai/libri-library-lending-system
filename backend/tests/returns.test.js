'use strict';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
const app    = require('../src/app');
const { pool, setupDb, cleanDb, closePool } = require('./helpers');
const { setClock } = require('../src/utils/clock');

beforeAll(async () => { await setupDb(); });
beforeEach(async () => { await cleanDb(); });
afterEach(() => setClock(null));
afterAll(async () => { await closePool(); });

// ---- Helpers ----------------------------------------------------------------

async function makeLibrarian() {
  const bcrypt = require('bcrypt');
  const jwt    = require('jsonwebtoken');
  const config = require('../src/config');
  const hash   = await bcrypt.hash('adminpass', 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Lib', 'lib@test.com', $1, 'librarian') RETURNING id, email, role`,
    [hash]
  );
  return jwt.sign({ id: rows[0].id, email: rows[0].email, role: 'librarian' },
    config.jwtSecret, { expiresIn: '1h' });
}

async function makeMember(email = 'member@test.com') {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Member', email, password: 'secret123',
  });
  return { token: res.body.token, user: res.body.user };
}

async function makeBook(libToken, copies = 3) {
  const res = await request(app).post('/api/books')
    .set('Authorization', `Bearer ${libToken}`)
    .send({ title: 'Test Book', author: 'Auth', total_copies: copies, available_copies: copies });
  return res.body.book;
}

async function insertSettings(overrides = {}) {
  const defaults = {
    loan_period_days: 14, fine_per_overdue_day: 1.00, max_fine_cap: 20.00,
    max_active_loans: 3, reservation_hold_window_days: 7,
    unpaid_fine_borrowing_threshold: 5.00,
  };
  const s = { ...defaults, ...overrides };
  await pool.query(
    `INSERT INTO library_settings
       (loan_period_days, fine_per_overdue_day, max_fine_cap,
        max_active_loans, reservation_hold_window_days, unpaid_fine_borrowing_threshold)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [s.loan_period_days, s.fine_per_overdue_day, s.max_fine_cap,
     s.max_active_loans, s.reservation_hold_window_days, s.unpaid_fine_borrowing_threshold]
  );
}

async function doCheckout(memberToken, bookId) {
  return request(app).post('/api/loans/checkout')
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ book_id: bookId });
}

// ---- Return tests -----------------------------------------------------------

describe('POST /api/loans/:id/return', () => {
  it('8. librarian can return an active loan', async () => {
    setClock('2024-03-01');
    const libToken = await makeLibrarian();
    const book = await makeBook(libToken, 1);
    await insertSettings();
    const { token } = await makeMember();

    const checkoutRes = await doCheckout(token, book.id);
    expect(checkoutRes.status).toBe(201);
    const loanId = checkoutRes.body.loan.id;

    setClock('2024-03-10'); // return before due date
    const res = await request(app).post(`/api/loans/${loanId}/return`)
      .set('Authorization', `Bearer ${libToken}`);

    expect(res.status).toBe(200);
    expect(res.body.loan.status).toBe('returned');
    expect(res.body.loan.return_date).toBe('2024-03-10');
    expect(res.body.fine).toBeNull(); // not overdue
  });

  it('9. member cannot process returns', async () => {
    setClock('2024-03-01');
    const libToken = await makeLibrarian();
    const book = await makeBook(libToken, 1);
    await insertSettings();
    const { token } = await makeMember();

    const checkoutRes = await doCheckout(token, book.id);
    const loanId = checkoutRes.body.loan.id;

    const res = await request(app).post(`/api/loans/${loanId}/return`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('10. duplicate return is rejected', async () => {
    setClock('2024-03-01');
    const libToken = await makeLibrarian();
    const book = await makeBook(libToken, 1);
    await insertSettings();
    const { token } = await makeMember();

    const checkoutRes = await doCheckout(token, book.id);
    const loanId = checkoutRes.body.loan.id;

    await request(app).post(`/api/loans/${loanId}/return`)
      .set('Authorization', `Bearer ${libToken}`);

    const res = await request(app).post(`/api/loans/${loanId}/return`)
      .set('Authorization', `Bearer ${libToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been returned/);
  });

  it('11. returning a book restores available inventory', async () => {
    setClock('2024-03-01');
    const libToken = await makeLibrarian();
    const book = await makeBook(libToken, 1);
    await insertSettings();
    const { token } = await makeMember();

    await doCheckout(token, book.id);

    // Check copies = 0 after checkout
    const before = await request(app).get(`/api/books/${book.id}`).set('Authorization', `Bearer ${token}`);
    expect(before.body.book.available_copies).toBe(0);

    const { rows: loans } = await pool.query(
      "SELECT id FROM loans WHERE book_id = $1 AND status = 'active' LIMIT 1", [book.id]
    );
    await request(app).post(`/api/loans/${loans[0].id}/return`)
      .set('Authorization', `Bearer ${libToken}`);

    // Check copies = 1 after return
    const after = await request(app).get(`/api/books/${book.id}`).set('Authorization', `Bearer ${token}`);
    expect(after.body.book.available_copies).toBe(1);
  });

  it('12. returning on or before due date creates no fine', async () => {
    setClock('2024-03-01');
    const libToken = await makeLibrarian();
    const book = await makeBook(libToken, 1);
    await insertSettings({ loan_period_days: 14, fine_per_overdue_day: 1.00 });
    const { token } = await makeMember();

    const checkoutRes = await doCheckout(token, book.id);
    const loanId = checkoutRes.body.loan.id;

    setClock('2024-03-15'); // exactly on due date (14 days later)
    const res = await request(app).post(`/api/loans/${loanId}/return`)
      .set('Authorization', `Bearer ${libToken}`);

    expect(res.status).toBe(200);
    expect(res.body.fine).toBeNull();
    expect(res.body.overdue_days).toBe(0);
  });

  it('13. overdue return calculates correct fine', async () => {
    setClock('2024-03-01');
    const libToken = await makeLibrarian();
    const book = await makeBook(libToken, 1);
    // Fine = 1.00/day, cap = 100.00
    await insertSettings({ loan_period_days: 14, fine_per_overdue_day: 1.00, max_fine_cap: 100.00 });
    const { token } = await makeMember();

    const checkoutRes = await doCheckout(token, book.id);
    const loanId = checkoutRes.body.loan.id;

    setClock('2024-03-20'); // due 2024-03-15, returned 2024-03-20 ? 5 overdue days
    const res = await request(app).post(`/api/loans/${loanId}/return`)
      .set('Authorization', `Bearer ${libToken}`);

    expect(res.status).toBe(200);
    expect(res.body.overdue_days).toBe(5);
    expect(parseFloat(res.body.fine.fine_amount)).toBe(5.00);
  });

  it('14. fine cap is applied correctly', async () => {
    setClock('2024-03-01');
    const libToken = await makeLibrarian();
    const book = await makeBook(libToken, 1);
    // Fine = 2.00/day, cap = 10.00; 20 overdue days would be $40 ? capped at $10
    await insertSettings({ loan_period_days: 14, fine_per_overdue_day: 2.00, max_fine_cap: 10.00 });
    const { token } = await makeMember();

    const checkoutRes = await doCheckout(token, book.id);
    const loanId = checkoutRes.body.loan.id;

    setClock('2024-04-04'); // due 2024-03-15, returned 2024-04-04 ? 20 overdue days
    const res = await request(app).post(`/api/loans/${loanId}/return`)
      .set('Authorization', `Bearer ${libToken}`);

    expect(res.status).toBe(200);
    expect(res.body.overdue_days).toBe(20);
    expect(parseFloat(res.body.fine.fine_amount)).toBe(10.00); // capped
  });
});