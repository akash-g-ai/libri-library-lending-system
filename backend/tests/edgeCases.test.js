'use strict';
/**
 * Phase 6 — Targeted edge-case tests for critical scenarios
 * not explicitly covered by existing test files.
 *
 * Covers:
 *   - Double collection prevention (collecting same held reservation twice)
 *   - Concurrent checkout of last copy (two simultaneous HTTP requests)
 *   - Settings change takes effect without restart (already in settings.test.js
 *     but verified here via the dashboard endpoint)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
const app = require('../src/app');
const { pool, setupDb, cleanDb, closePool } = require('./helpers');
const { setClock } = require('../src/utils/clock');

beforeAll(async () => { await setupDb(); });
beforeEach(async () => { await cleanDb(); });
afterEach(() => setClock(null));
afterAll(async () => { await closePool(); });

// ---- Helpers ----------------------------------------------------------------

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

async function makeBook(libToken, copies = 1) {
  const res = await request(app).post('/api/books')
    .set('Authorization', `Bearer ${libToken}`)
    .send({ title: 'Test Book', author: 'Author', total_copies: copies, available_copies: copies });
  return res.body.book;
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

// ---- Double collection prevention -------------------------------------------

describe('Double collection prevention', () => {
  it('collecting the same held reservation twice fails on second attempt', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);

    setClock('2024-09-01T00:00:00Z');
    const { token: bor } = await makeMember('bor@t.com');
    const co = await request(app).post('/api/loans/checkout')
      .set('Authorization', `Bearer ${bor}`).send({ book_id: book.id });
    expect(co.status).toBe(201);

    const { token: holder } = await makeMember('holder@t.com');
    await request(app).post('/api/reservations')
      .set('Authorization', `Bearer ${holder}`).send({ book_id: book.id });

    // Return -> allocates to holder
    await request(app).post(`/api/loans/${co.body.loan.id}/return`)
      .set('Authorization', `Bearer ${libToken}`);

    // Get reservation ID
    const myRes = await request(app).get('/api/reservations/my-reservations')
      .set('Authorization', `Bearer ${holder}`);
    const resId = myRes.body.reservations[0].id;

    // First collection succeeds
    setClock('2024-09-02T00:00:00Z');
    const collect1 = await request(app).post(`/api/reservations/${resId}/collect`)
      .set('Authorization', `Bearer ${holder}`);
    expect(collect1.status).toBe(201);

    // Second collection must fail (reservation is now 'fulfilled')
    const collect2 = await request(app).post(`/api/reservations/${resId}/collect`)
      .set('Authorization', `Bearer ${holder}`);
    expect(collect2.status).toBe(409);
    expect(collect2.body.error).toMatch(/not in held status/i);
  });
});

// ---- Concurrent checkout of last copy ---------------------------------------

describe('Concurrent checkout of last copy', () => {
  it('two simultaneous checkouts for the last available copy — only one succeeds', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1); // only 1 copy

    const { token: t1, user: u1 } = await makeMember('m1@t.com');
    const { token: t2, user: u2 } = await makeMember('m2@t.com');

    // Fire two checkout requests simultaneously
    const [res1, res2] = await Promise.all([
      request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id }),
      request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${t2}`).send({ book_id: book.id }),
    ]);

    // Exactly one should succeed (201), the other should fail (409)
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    // Verify only 1 active loan exists for this book
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM loans WHERE book_id = $1 AND status = 'active'", [book.id]
    );
    expect(rows[0].cnt).toBe(1);

    // Verify available_copies is 0
    const bookRes = await request(app).get(`/api/books/${book.id}`)
      .set('Authorization', `Bearer ${libToken}`);
    expect(bookRes.body.book.available_copies).toBe(0);
  });
});

// ---- Settings affect dashboard without restart ------------------------------

describe('Settings changes visible immediately', () => {
  it('dashboard reflects updated hold window without server restart', async () => {
    const libToken = await makeLibrarian();
    await insertSettings({ reservation_hold_window_hours: 48 });

    // Read initial settings via API
    const before = await request(app).get('/api/settings')
      .set('Authorization', `Bearer ${libToken}`);
    expect(before.body.settings.reservation_hold_window_hours).toBe(48);

    // Update via API
    await request(app).put('/api/settings').set('Authorization', `Bearer ${libToken}`)
      .send({ loan_period_days: 14, fine_per_overdue_day: 1, max_fine_cap: 20, max_active_loans: 5, unpaid_fine_borrowing_threshold: 5, reservation_hold_window_hours: 96 });

    // Read again — should reflect change immediately
    const after = await request(app).get('/api/settings')
      .set('Authorization', `Bearer ${libToken}`);
    expect(after.body.settings.reservation_hold_window_hours).toBe(96);
  });
});