'use strict';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
const app    = require('../src/app');
const { pool, setupDb, cleanDb, closePool } = require('./helpers');
const { setClock } = require('../src/utils/clock');
const { _calcFine, _calcOverdueDays, _addDays } = require('../src/controllers/loanController');

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

/**
 * Checks out and returns a book overdue to generate a fine.
 * Returns { libToken, memberToken, user, loanId, fineId }
 */
async function createFineScenario({ finePerDay = 1.00, maxCap = 20.00, overdueDays = 5 } = {}) {
  setClock('2024-03-01');
  const libToken = await makeLibrarian();
  const book = await makeBook(libToken, 1);
  await insertSettings({ fine_per_overdue_day: finePerDay, max_fine_cap: maxCap, loan_period_days: 14 });
  const { token, user } = await makeMember();

  const checkoutRes = await request(app).post('/api/loans/checkout')
    .set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
  expect(checkoutRes.status).toBe(201);
  const loanId = checkoutRes.body.loan.id;

  // Due date is 2024-03-15; return overdueDays after that
  const dueMs = new Date('2024-03-15T00:00:00Z').getTime();
  const retDate = new Date(dueMs + overdueDays * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  setClock(retDate);

  const retRes = await request(app).post(`/api/loans/${loanId}/return`)
    .set('Authorization', `Bearer ${libToken}`);
  expect(retRes.status).toBe(200);
  const fineId = retRes.body.fine?.id;

  return { libToken, memberToken: token, user, loanId, fineId };
}

// ---- Clock / determinism unit tests -----------------------------------------

describe('20. Fine calculations are deterministic with a fixed clock', () => {
  it('calculates overdue days correctly', () => {
    expect(_calcOverdueDays('2024-03-15', '2024-03-20')).toBe(5);
    expect(_calcOverdueDays('2024-03-15', '2024-03-15')).toBe(0);
    expect(_calcOverdueDays('2024-03-15', '2024-03-10')).toBe(0);
  });

  it('calculates fine with cap applied', () => {
    expect(_calcFine(5, 1.00, 20.00)).toBe(5.00);
    expect(_calcFine(30, 1.00, 20.00)).toBe(20.00);
    expect(_calcFine(0, 1.00, 20.00)).toBe(0);
  });

  it('addDays produces correct date string', () => {
    expect(_addDays('2024-03-01', 14)).toBe('2024-03-15');
    expect(_addDays('2024-02-14', 14)).toBe('2024-02-28');
    expect(_addDays('2024-02-15', 14)).toBe('2024-02-29');
  });

  it('fixed clock injected via setClock is used in checkout', async () => {
    setClock('2024-06-01');
    const libToken = await makeLibrarian();
    await insertSettings({ loan_period_days: 7 });
    const book = await makeBook(libToken, 1);
    const { token } = await makeMember();

    const res = await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${token}`).send({ book_id: book.id });

    expect(res.status).toBe(201);
    expect(res.body.loan.checkout_date).toBe('2024-06-01');
    expect(res.body.loan.due_date).toBe('2024-06-08');
  });
});

// ---- My fines ---------------------------------------------------------------

describe('GET /api/fines/my-fines', () => {
  it('member can view their own fines with book title', async () => {
    const { memberToken } = await createFineScenario({ overdueDays: 5 });
    setClock(null);
    const res = await request(app).get('/api/fines/my-fines')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.fines.length).toBeGreaterThanOrEqual(1);
    expect(res.body.fines[0].book_title).toBeDefined();
    expect(res.body.fines[0].outstanding).toBeDefined();
  });

  it('19. member cannot access another member\'s fines', async () => {
    await createFineScenario({ overdueDays: 5 });
    setClock(null);
    const { token: t2 } = await makeMember('other@test.com');
    const res = await request(app).get('/api/fines/my-fines')
      .set('Authorization', `Bearer ${t2}`);
    expect(res.status).toBe(200);
    expect(res.body.fines.length).toBe(0);
  });
});

// ---- All fines (librarian) --------------------------------------------------

describe('GET /api/fines', () => {
  it('librarian can view all fines', async () => {
    const { libToken } = await createFineScenario({ overdueDays: 5 });
    setClock(null);
    const res = await request(app).get('/api/fines')
      .set('Authorization', `Bearer ${libToken}`);
    expect(res.status).toBe(200);
    expect(res.body.fines.length).toBeGreaterThanOrEqual(1);
  });

  it('member cannot access all-fines endpoint', async () => {
    const { memberToken } = await createFineScenario({ overdueDays: 5 });
    setClock(null);
    const res = await request(app).get('/api/fines')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });
});

// ---- Fine payment -----------------------------------------------------------

describe('POST /api/fines/:id/pay', () => {
  it('15. librarian can record full payment', async () => {
    // fine = 5 days × $1.00 = $5.00
    const { libToken, fineId } = await createFineScenario({ finePerDay: 1.00, overdueDays: 5 });
    setClock(null);

    const res = await request(app).post(`/api/fines/${fineId}/pay`)
      .set('Authorization', `Bearer ${libToken}`)
      .send({ amount: 5.00 });
    expect(res.status).toBe(200);
    expect(res.body.fine.payment_status).toBe('paid');
    expect(res.body.fine.outstanding).toBe(0);
    expect(res.body.fine.paid_at).not.toBeNull();
  });

  it('16. partial payment updates outstanding balance', async () => {
    // fine = 5 days × $1.00 = $5.00; pay $2 ? outstanding $3
    const { libToken, fineId } = await createFineScenario({ finePerDay: 1.00, overdueDays: 5 });
    setClock(null);

    const res = await request(app).post(`/api/fines/${fineId}/pay`)
      .set('Authorization', `Bearer ${libToken}`)
      .send({ amount: 2.00 });
    expect(res.status).toBe(200);
    expect(res.body.fine.payment_status).toBe('partial');
    expect(res.body.fine.outstanding).toBe(3);
  });

  it('17. negative or zero payment is rejected', async () => {
    const { libToken, fineId } = await createFineScenario({ overdueDays: 5 });
    setClock(null);

    const r1 = await request(app).post(`/api/fines/${fineId}/pay`)
      .set('Authorization', `Bearer ${libToken}`).send({ amount: 0 });
    expect(r1.status).toBe(400);

    const r2 = await request(app).post(`/api/fines/${fineId}/pay`)
      .set('Authorization', `Bearer ${libToken}`).send({ amount: -1 });
    expect(r2.status).toBe(400);
  });

  it('18. payment exceeding outstanding balance is rejected', async () => {
    const { libToken, fineId } = await createFineScenario({ finePerDay: 1.00, overdueDays: 5 }); // $5
    setClock(null);

    const res = await request(app).post(`/api/fines/${fineId}/pay`)
      .set('Authorization', `Bearer ${libToken}`)
      .send({ amount: 99.00 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds outstanding/);
  });

  it('member cannot process fine payments', async () => {
    const { memberToken, fineId } = await createFineScenario({ overdueDays: 5 });
    setClock(null);

    const res = await request(app).post(`/api/fines/${fineId}/pay`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ amount: 5.00 });
    expect(res.status).toBe(403);
  });
});