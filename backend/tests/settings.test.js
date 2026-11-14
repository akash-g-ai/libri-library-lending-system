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

// -- Settings access permissions -----------------------------------------------

describe('GET /api/settings permissions', () => {
  it('librarian can read settings', async () => {
    await insertSettings();
    const libToken = await makeLibrarian();
    const res = await request(app).get('/api/settings').set('Authorization', `Bearer ${libToken}`);
    expect(res.status).toBe(200);
    expect(res.body.settings.loan_period_days).toBe(14);
    expect(res.body.settings.reservation_hold_window_hours).toBe(48);
  });

  it('member cannot access settings', async () => {
    await insertSettings();
    const { token } = await makeMember();
    const res = await request(app).get('/api/settings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('unauthenticated access rejected', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });
});

// -- Settings update -----------------------------------------------------------

describe('PUT /api/settings', () => {
  it('librarian can update settings', async () => {
    await insertSettings();
    const libToken = await makeLibrarian();
    const res = await request(app).put('/api/settings').set('Authorization', `Bearer ${libToken}`)
      .send({ loan_period_days: 21, fine_per_overdue_day: 2.00, max_fine_cap: 50.00, max_active_loans: 4, unpaid_fine_borrowing_threshold: 10.00, reservation_hold_window_hours: 72 });
    expect(res.status).toBe(200);
    expect(res.body.settings.loan_period_days).toBe(21);
    expect(res.body.settings.fine_per_overdue_day).toBe(2.0);
    expect(res.body.settings.reservation_hold_window_hours).toBe(72);
    expect(res.body.message).toBeDefined();
  });

  it('member cannot update settings', async () => {
    await insertSettings();
    const { token } = await makeMember();
    const res = await request(app).put('/api/settings').set('Authorization', `Bearer ${token}`)
      .send({ loan_period_days: 21 });
    expect(res.status).toBe(403);
  });

  it('rejects negative loan_period_days', async () => {
    await insertSettings();
    const libToken = await makeLibrarian();
    const res = await request(app).put('/api/settings').set('Authorization', `Bearer ${libToken}`)
      .send({ loan_period_days: -1, fine_per_overdue_day: 1, max_fine_cap: 20, max_active_loans: 5, unpaid_fine_borrowing_threshold: 5, reservation_hold_window_hours: 48 });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('rejects zero max_active_loans', async () => {
    await insertSettings();
    const libToken = await makeLibrarian();
    const res = await request(app).put('/api/settings').set('Authorization', `Bearer ${libToken}`)
      .send({ loan_period_days: 14, fine_per_overdue_day: 1, max_fine_cap: 20, max_active_loans: 0, unpaid_fine_borrowing_threshold: 5, reservation_hold_window_hours: 48 });
    expect(res.status).toBe(400);
  });

  it('rejects negative fine_per_overdue_day', async () => {
    await insertSettings();
    const libToken = await makeLibrarian();
    const res = await request(app).put('/api/settings').set('Authorization', `Bearer ${libToken}`)
      .send({ loan_period_days: 14, fine_per_overdue_day: -1, max_fine_cap: 20, max_active_loans: 5, unpaid_fine_borrowing_threshold: 5, reservation_hold_window_hours: 48 });
    expect(res.status).toBe(400);
  });

  it('rejects zero reservation_hold_window_hours', async () => {
    await insertSettings();
    const libToken = await makeLibrarian();
    const res = await request(app).put('/api/settings').set('Authorization', `Bearer ${libToken}`)
      .send({ loan_period_days: 14, fine_per_overdue_day: 1, max_fine_cap: 20, max_active_loans: 5, unpaid_fine_borrowing_threshold: 5, reservation_hold_window_hours: 0 });
    expect(res.status).toBe(400);
  });
});

// -- Settings affecting business logic -----------------------------------------

describe('Settings affect future operations', () => {
  it('updated loan period affects future checkouts', async () => {
    // Register member BEFORE setting clock so JWT uses real time
    const libToken = await makeLibrarian();
    await insertSettings({ loan_period_days: 14 });
    const br = await request(app).post('/api/books').set('Authorization', `Bearer ${libToken}`)
      .send({ title: 'B', author: 'A', total_copies: 1, available_copies: 1 });
    const { token } = await makeMember();

    // Now set clock for business-logic dates
    setClock('2024-05-01');
    const co1 = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${token}`).send({ book_id: br.body.book.id });
    expect(co1.status).toBe(201);
    expect(co1.body.loan.due_date).toBe('2024-05-15'); // 14 days

    // Return the book
    await request(app).post(`/api/loans/${co1.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);

    // Update settings to 21 days
    await request(app).put('/api/settings').set('Authorization', `Bearer ${libToken}`)
      .send({ loan_period_days: 21, fine_per_overdue_day: 1, max_fine_cap: 20, max_active_loans: 5, unpaid_fine_borrowing_threshold: 5, reservation_hold_window_hours: 48 });

    // Checkout again — due date should now be 21 days
    const co2 = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${token}`).send({ book_id: br.body.book.id });
    expect(co2.status).toBe(201);
    expect(co2.body.loan.due_date).toBe('2024-05-22');
  });

  it('updated fine settings affect future fines', async () => {
    // Register member BEFORE setting clock
    const libToken = await makeLibrarian();
    await insertSettings({ fine_per_overdue_day: 1.00, max_fine_cap: 20.00, loan_period_days: 14 });
    const br = await request(app).post('/api/books').set('Authorization', `Bearer ${libToken}`)
      .send({ title: 'B', author: 'A', total_copies: 1, available_copies: 1 });
    const { token } = await makeMember();

    // Set clock for first checkout
    setClock('2024-05-01');
    const co = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${token}`).send({ book_id: br.body.book.id });
    expect(co.status).toBe(201);

    // Return overdue by 5 days (fine = $5)
    setClock('2024-05-20');
    const ret1 = await request(app).post(`/api/loans/${co.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    expect(ret1.status).toBe(200);
    expect(parseFloat(ret1.body.fine.fine_amount)).toBe(5.00);

    // Update fine settings to $3/day, cap=$10
    await request(app).put('/api/settings').set('Authorization', `Bearer ${libToken}`)
      .send({ loan_period_days: 14, fine_per_overdue_day: 3.00, max_fine_cap: 10.00, max_active_loans: 5, unpaid_fine_borrowing_threshold: 5, reservation_hold_window_hours: 48 });

    // Checkout another book, return overdue by 5 days -> fine = $15 -> capped to $10
    const br2 = await request(app).post('/api/books').set('Authorization', `Bearer ${libToken}`)
      .send({ title: 'B2', author: 'A', total_copies: 1, available_copies: 1 });
    setClock('2024-05-01');
    const co2 = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${token}`).send({ book_id: br2.body.book.id });
    expect(co2.status).toBe(201);
    setClock('2024-05-20');
    const ret2 = await request(app).post(`/api/loans/${co2.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    expect(ret2.status).toBe(200);
    expect(parseFloat(ret2.body.fine.fine_amount)).toBe(10.00); // capped
  });

  it('updated hold duration affects future reservations', async () => {
    // Register all users BEFORE setting clock
    const libToken = await makeLibrarian();
    await insertSettings({ reservation_hold_window_hours: 24 });
    const book = await (await request(app).post('/api/books').set('Authorization', `Bearer ${libToken}`)
      .send({ title: 'B', author: 'A', total_copies: 1, available_copies: 1 })).body.book;
    const { token: bor } = await makeMember('bor@t.com');
    const { token: w1 } = await makeMember('w1@t.com');

    // Now set clock for business logic
    setClock('2024-06-01T00:00:00Z');
    const co = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${bor}`).send({ book_id: book.id });
    expect(co.status).toBe(201);
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${w1}`).send({ book_id: book.id });
    const retRes = await request(app).post(`/api/loans/${co.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    expect(retRes.status).toBe(200);
    const exp1 = new Date(retRes.body.allocated_reservation.hold_expires_at).getTime();
    const start1 = new Date(retRes.body.allocated_reservation.hold_start_at).getTime();
    expect((exp1 - start1) / 3600000).toBeCloseTo(24, 1);

    // Update to 72 hours
    await request(app).put('/api/settings').set('Authorization', `Bearer ${libToken}`)
      .send({ loan_period_days: 14, fine_per_overdue_day: 1, max_fine_cap: 20, max_active_loans: 5, unpaid_fine_borrowing_threshold: 5, reservation_hold_window_hours: 72 });

    // New scenario: checkout, reserve, return -> new hold should be 72h
    const book2 = await (await request(app).post('/api/books').set('Authorization', `Bearer ${libToken}`)
      .send({ title: 'B2', author: 'A', total_copies: 1, available_copies: 1 })).body.book;

    // Register new users for second scenario BEFORE setting clock
    const { token: bor2 } = await makeMember('bor2@t.com');
    const { token: w2 } = await makeMember('w2@t.com');

    setClock('2024-07-01T00:00:00Z');
    const co2 = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${bor2}`).send({ book_id: book2.id });
    expect(co2.status).toBe(201);
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${w2}`).send({ book_id: book2.id });
    const ret2 = await request(app).post(`/api/loans/${co2.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    expect(ret2.status).toBe(200);
    const exp2 = new Date(ret2.body.allocated_reservation.hold_expires_at).getTime();
    const start2 = new Date(ret2.body.allocated_reservation.hold_start_at).getTime();
    expect((exp2 - start2) / 3600000).toBeCloseTo(72, 1);
  });
});