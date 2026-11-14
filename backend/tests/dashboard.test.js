'use strict';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
const app = require('../src/app');
const { pool, setupDb, cleanDb, closePool } = require('./helpers');
const { setClock } = require('../src/utils/clock');

beforeAll(async () => { await setupDb(); });
beforeEach(async () => { await cleanDb(); });
afterEach(() => setClock(null));
afterAll(async () => { await closePool(); });

async function makeLibrarian() {
  const bcrypt = require('bcrypt');
  const jwt = require('jsonwebtoken');
  const config = require('../src/config');
  const hash = await bcrypt.hash('lib', 10);
  const { rows } = await pool.query(
    "INSERT INTO users (name,email,password_hash,role) VALUES ('L','l@t.com',$1,'librarian') RETURNING id,email,role", [hash]
  );
  return jwt.sign({ id: rows[0].id, email: rows[0].email, role: 'librarian' }, config.jwtSecret, { expiresIn: '1h' });
}

async function makeMember(email = 'm@t.com') {
  const res = await request(app).post('/api/auth/register').send({ name: 'M', email, password: 'pass1234' });
  return { token: res.body.token, user: res.body.user };
}

async function insertSettings(overrides = {}) {
  const d = {
    loan_period_days: 14, fine_per_overdue_day: 1.00, max_fine_cap: 20.00,
    max_active_loans: 5, reservation_hold_window_days: 7,
    reservation_hold_window_hours: 48, unpaid_fine_borrowing_threshold: 5.00,
  };
  const s = { ...d, ...overrides };
  await pool.query(
    `INSERT INTO library_settings (loan_period_days,fine_per_overdue_day,max_fine_cap,
       max_active_loans,reservation_hold_window_days,reservation_hold_window_hours,
       unpaid_fine_borrowing_threshold) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [s.loan_period_days,s.fine_per_overdue_day,s.max_fine_cap,s.max_active_loans,
     s.reservation_hold_window_days,s.reservation_hold_window_hours,s.unpaid_fine_borrowing_threshold]
  );
}

async function makeBook(libToken, copies = 1) {
  const res = await request(app).post('/api/books')
    .set('Authorization', `Bearer ${libToken}`)
    .send({ title: 'Book', author: 'Auth', total_copies: copies, available_copies: copies });
  return res.body.book;
}
describe('GET /api/dashboard/member', () => {
  it('returns member dashboard data', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken);
    const { token, user } = await makeMember();
    setClock('2024-05-01');
    await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    const res = await request(app).get('/api/dashboard/member').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.active_loans).toBe(1);
    expect(res.body.summary.overdue_loans).toBe(0);
    expect(res.body.loans.length).toBe(1);
  });

  it('member dashboard data is isolated between members', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken);
    const { token: t1, user: u1 } = await makeMember('m1@t.com');
    const { token: t2 } = await makeMember('m2@t.com');
    setClock('2024-05-01');
    await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });
    const res = await request(app).get('/api/dashboard/member').set('Authorization', `Bearer ${t2}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.active_loans).toBe(0);
    expect(res.body.loans.length).toBe(0);
  });

  it('librarian cannot access member dashboard', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const res = await request(app).get('/api/dashboard/member').set('Authorization', `Bearer ${libToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/dashboard/librarian', () => {
  it('returns real database-backed stats', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 3);
    const { token } = await makeMember();
    setClock('2024-05-01');
    await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    const res = await request(app).get('/api/dashboard/librarian').set('Authorization', `Bearer ${libToken}`);
    expect(res.status).toBe(200);
    expect(res.body.stats.total_books).toBe(1);
    expect(res.body.stats.available_copies).toBe(2);
    expect(res.body.stats.active_loans).toBe(1);
    expect(res.body.stats.registered_members).toBeGreaterThanOrEqual(1);
  });

  it('member cannot access librarian dashboard', async () => {
    const { token } = await makeMember();
    const res = await request(app).get('/api/dashboard/librarian').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('detects overdue loans', async () => {
    const libToken = await makeLibrarian();
    await insertSettings({ loan_period_days: 14 });
    const book = await makeBook(libToken);
    const { token } = await makeMember();
    setClock('2024-01-01');
    await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    setClock('2024-03-01');
    const res = await request(app).get('/api/dashboard/librarian').set('Authorization', `Bearer ${libToken}`);
    expect(res.body.stats.overdue_loans).toBe(1);
  });

  it('counts outstanding fines', async () => {
    const libToken = await makeLibrarian();
    await insertSettings({ fine_per_overdue_day: 1.00, max_fine_cap: 20.00, loan_period_days: 14 });
    const book = await makeBook(libToken);
    const { token } = await makeMember();
    setClock('2024-01-01');
    const co = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    setClock('2024-02-01');
    await request(app).post(`/api/loans/${co.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    const res = await request(app).get('/api/dashboard/librarian').set('Authorization', `Bearer ${libToken}`);
    expect(res.body.stats.total_outstanding_fines).toBeGreaterThan(0);
  });
});