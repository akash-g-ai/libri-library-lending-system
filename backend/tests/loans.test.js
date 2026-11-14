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

// ---- Checkout ---------------------------------------------------------------

describe('POST /api/loans/checkout', () => {
  it('1. successful checkout creates loan and decrements inventory', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 2);
    const { token, user } = await makeMember();

    const res = await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ book_id: book.id });

    expect(res.status).toBe(201);
    expect(res.body.loan.status).toBe('active');
    expect(res.body.loan.member_id).toBe(user.id);

    // Inventory decremented
    const bookRes = await request(app).get(`/api/books/${book.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(bookRes.body.book.available_copies).toBe(1);
  });

  it('2. checkout rejected when no copies available', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    const { token: t1 } = await makeMember('m1@test.com');
    const { token: t2 } = await makeMember('m2@test.com');

    await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });

    const res = await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${t2}`).send({ book_id: book.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/No copies available/);
  });

  it('3. checkout rejected when active loan limit reached', async () => {
    const libToken = await makeLibrarian();
    await insertSettings({ max_active_loans: 2 });
    const { token } = await makeMember();

    for (let i = 0; i < 3; i++) {
      const book = await makeBook(libToken, 1);
      const res  = await request(app).post('/api/loans/checkout')
        .set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
      if (i < 2) {
        expect(res.status).toBe(201);
      } else {
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/loan limit/i);
      }
    }
  });

  it('4. checkout rejected when unpaid fines exceed threshold', async () => {
    const libToken = await makeLibrarian();
    await insertSettings({ unpaid_fine_borrowing_threshold: 5.00 });
    const { token, user } = await makeMember();
    const book = await makeBook(libToken, 2);

    // Create a returned loan then attach a large fine manually
    await pool.query(
      `INSERT INTO loans (member_id, book_id, checkout_date, due_date, return_date, status)
       VALUES ($1, $2, '2024-01-01', '2024-01-15', '2024-01-20', 'returned')`,
      [user.id, book.id]
    );
    const { rows: loanRows } = await pool.query(
      'SELECT id FROM loans WHERE member_id = $1', [user.id]
    );
    await pool.query(
      `INSERT INTO fines (loan_id, member_id, fine_amount, paid_amount, payment_status)
       VALUES ($1, $2, 10.00, 0, 'unpaid')`,
      [loanRows[0].id, user.id]
    );

    const book2 = await makeBook(libToken, 1);
    const res = await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${token}`).send({ book_id: book2.id });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/fines/i);
  });

  it('5. due date correctly follows configured loan period', async () => {
    setClock('2024-06-01');
    const libToken = await makeLibrarian();
    await insertSettings({ loan_period_days: 14 });
    const book = await makeBook(libToken, 1);
    const { token } = await makeMember();

    const res = await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    expect(res.status).toBe(201);
    expect(res.body.loan.checkout_date).toBe('2024-06-01');
    expect(res.body.loan.due_date).toBe('2024-06-15');
  });

  it('6. member cannot checkout on behalf of another member (JWT identity enforced)', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 2);
    const { token } = await makeMember('attacker@test.com');
    const { user: victim } = await makeMember('victim@test.com');

    // Even if attacker sends victim ID in body, JWT identity is used
    const res = await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ book_id: book.id, member_id: victim.id });

    expect(res.status).toBe(201);
    // Loan belongs to attacker's id from JWT, NOT victim's id
    expect(res.body.loan.member_id).not.toBe(victim.id);
  });

  it('7. librarian cannot use checkout endpoint (member-only)', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);

    const res = await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${libToken}`)
      .send({ book_id: book.id });
    expect(res.status).toBe(403);
  });
});

// ---- My loans ---------------------------------------------------------------

describe('GET /api/loans/my-loans', () => {
  it('member sees only their own loans', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 2);
    const { token: t1, user: u1 } = await makeMember('m1@test.com');
    const { token: t2 }           = await makeMember('m2@test.com');

    await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });

    const res = await request(app).get('/api/loans/my-loans')
      .set('Authorization', `Bearer ${t2}`);
    expect(res.status).toBe(200);
    expect(res.body.loans.every(l => l.member_id !== u1.id)).toBe(true);
    expect(res.body.loans.length).toBe(0);
  });
});

// ---- All loans (librarian) --------------------------------------------------

describe('GET /api/loans', () => {
  it('librarian can view all loans', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    const { token } = await makeMember();

    await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${token}`).send({ book_id: book.id });

    const res = await request(app).get('/api/loans')
      .set('Authorization', `Bearer ${libToken}`);
    expect(res.status).toBe(200);
    expect(res.body.loans.length).toBeGreaterThanOrEqual(1);
  });

  it('member cannot access all-loans endpoint', async () => {
    const { token } = await makeMember();
    const res = await request(app).get('/api/loans')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});