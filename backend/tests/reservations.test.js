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
    `INSERT INTO users (name,email,password_hash,role) VALUES ('Lib','lib@t.com',$1,'librarian') RETURNING id,email,role`,
    [hash]
  );
  return jwt.sign({ id: rows[0].id, email: rows[0].email, role: 'librarian' }, config.jwtSecret, { expiresIn: '1h' });
}

async function makeMember(email = 'm@t.com') {
  const res = await request(app).post('/api/auth/register').send({ name: 'M', email, password: 'pass1234' });
  return { token: res.body.token, user: res.body.user };
}

async function makeBook(libToken, copies = 2) {
  const res = await request(app).post('/api/books')
    .set('Authorization', `Bearer ${libToken}`)
    .send({ title: 'Book', author: 'Auth', total_copies: copies, available_copies: copies });
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

async function exhaustCopies(libToken, bookId, copies) {
  for (let i = 0; i < copies; i++) {
    const { token } = await makeMember(`exhaust${i}@t.com`);
    await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${token}`).send({ book_id: bookId });
  }
}
describe('POST /api/reservations - creation', () => {
  it('1. member reserves unavailable book', async () => {
    setClock('2024-05-01');
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    await exhaustCopies(libToken, book.id, 1);
    const { token } = await makeMember('reserver@t.com');
    const res = await request(app).post('/api/reservations').set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    expect(res.status).toBe(201);
    expect(res.body.reservation.status).toBe('waiting');
    expect(res.body.reservation.queue_position).toBe(1);
  });

  it('2. member cannot reserve available book', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 2);
    const { token } = await makeMember();
    const res = await request(app).post('/api/reservations').set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    expect(res.status).toBe(409);
    expect(res.body.available).toBe(true);
  });

  it('3. duplicate active reservation prevented', async () => {
    setClock('2024-05-01');
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    await exhaustCopies(libToken, book.id, 1);
    const { token } = await makeMember();
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    const res2 = await request(app).post('/api/reservations').set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    expect(res2.status).toBe(409);
  });

  it('4. member cannot access another member\'s reservations', async () => {
    setClock('2024-05-01');
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    await exhaustCopies(libToken, book.id, 1);
    const { token: t1, user: u1 } = await makeMember('a@t.com');
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });
    const { token: t2 } = await makeMember('b@t.com');
    const res = await request(app).get('/api/reservations/my-reservations').set('Authorization', `Bearer ${t2}`);
    expect(res.status).toBe(200);
    expect(res.body.reservations.length).toBe(0);
  });

  it('5. librarian endpoint rejects members', async () => {
    const { token } = await makeMember();
    const res = await request(app).get('/api/reservations').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('5b. librarian can view all reservations', async () => {
    setClock('2024-05-01');
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    await exhaustCopies(libToken, book.id, 1);
    const { token } = await makeMember();
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    const res = await request(app).get('/api/reservations').set('Authorization', `Bearer ${libToken}`);
    expect(res.status).toBe(200);
    expect(res.body.reservations.length).toBeGreaterThanOrEqual(1);
  });
});
describe('FIFO ordering and return allocation', () => {
  it('6. FIFO: earlier reservation gets lower queue_position', async () => {
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    await exhaustCopies(libToken, book.id, 1);
    const { token: t1 } = await makeMember('first@t.com');
    const { token: t2 } = await makeMember('second@t.com');
    const { token: t3 } = await makeMember('third@t.com');
    setClock('2024-05-01');
    const r1 = await request(app).post('/api/reservations').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });
    setClock('2024-05-02');
    const r2 = await request(app).post('/api/reservations').set('Authorization', `Bearer ${t2}`).send({ book_id: book.id });
    setClock('2024-05-03');
    const r3 = await request(app).post('/api/reservations').set('Authorization', `Bearer ${t3}`).send({ book_id: book.id });
    expect(r1.body.reservation.queue_position).toBeLessThan(r2.body.reservation.queue_position);
    expect(r2.body.reservation.queue_position).toBeLessThan(r3.body.reservation.queue_position);
  });

  it('7. returned book allocated to first waiting member', async () => {
    setClock('2024-05-01');
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    const { token: borrower } = await makeMember('borrower@t.com');
    const co = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${borrower}`).send({ book_id: book.id });
    const { token: t1, user: u1 } = await makeMember('q1@t.com');
    const { token: t2 }           = await makeMember('q2@t.com');
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${t2}`).send({ book_id: book.id });
    const retRes = await request(app).post(`/api/loans/${co.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    expect(retRes.status).toBe(200);
    expect(retRes.body.allocated_reservation).not.toBeNull();
    expect(retRes.body.allocated_reservation.member_id).toBe(u1.id);
    expect(retRes.body.allocated_reservation.status).toBe('held');
    // available_copies stays 0 (copy is held)
    const bookRes = await request(app).get(`/api/books/${book.id}`).set('Authorization', `Bearer ${t1}`);
    expect(bookRes.body.book.available_copies).toBe(0);
  });

  it('19. concurrent reservations: exactly one hold created', async () => {
    setClock('2024-06-01');
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    const { token: bor } = await makeMember('concbor@t.com');
    const co = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${bor}`).send({ book_id: book.id });
    for (let i = 0; i < 5; i++) {
      const { token } = await makeMember(`conc${i}@t.com`);
      await request(app).post('/api/reservations').set('Authorization', `Bearer ${token}`).send({ book_id: book.id });
    }
    await request(app).post(`/api/loans/${co.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM reservations WHERE book_id=$1 AND status='held'", [book.id]
    );
    expect(rows[0].cnt).toBe(1);
    const { token: v } = await makeMember('viewer@t.com');
    const bookRes = await request(app).get(`/api/books/${book.id}`).set('Authorization', `Bearer ${v}`);
    expect(bookRes.body.book.available_copies).toBe(0);
  });
});
describe('Hold expiry', () => {
  it('11. hold duration matches configured hours', async () => {
    const libToken = await makeLibrarian();
    await insertSettings({ reservation_hold_window_hours: 24 });
    const book = await makeBook(libToken, 1);
    setClock('2024-08-01T10:00:00Z');
    const { token: bor } = await makeMember('bh@t.com');
    const co = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${bor}`).send({ book_id: book.id });
    const { token: t1 } = await makeMember('hd@t.com');
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });
    const retRes = await request(app).post(`/api/loans/${co.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    const holdsAt = retRes.body.allocated_reservation?.hold_expires_at;
    expect(holdsAt).toBeDefined();
    const start   = new Date(retRes.body.allocated_reservation.hold_start_at).getTime();
    const expires = new Date(holdsAt).getTime();
    const diffHours = (expires - start) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(24, 1);
  });

  it('10. queue empty after expiry restores availability', async () => {
    const libToken = await makeLibrarian();
    await insertSettings({ reservation_hold_window_hours: 1 });
    const book = await makeBook(libToken, 1);
    setClock('2024-07-01T00:00:00Z');
    const { token: borrower } = await makeMember('lone@t.com');
    const co = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${borrower}`).send({ book_id: book.id });
    const { token: t1 } = await makeMember('solo@t.com');
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });
    // Return -> t1 gets hold
    await request(app).post(`/api/loans/${co.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    // Advance clock past expiry
    setClock('2024-07-01T03:00:00Z');
    // t1 tries to collect — rejected as expired; collection handler releases copy to inventory
    const myRes = await request(app).get('/api/reservations/my-reservations').set('Authorization', `Bearer ${t1}`);
    const resId = myRes.body.reservations[0].id;
    const collectRes = await request(app).post(`/api/reservations/${resId}/collect`).set('Authorization', `Bearer ${t1}`);
    expect(collectRes.status).toBe(409);
    expect(collectRes.body.error).toMatch(/expired/i);
    // Book should have available_copies = 1 now
    const { token: viewer } = await makeMember('viewer2@t.com');
    const bookRes = await request(app).get(`/api/books/${book.id}`).set('Authorization', `Bearer ${viewer}`);
    expect(bookRes.body.book.available_copies).toBe(1);
  });

  it('9. expired hold passed to next waiting member', async () => {
    const libToken = await makeLibrarian();
    await insertSettings({ reservation_hold_window_hours: 1 });
    const book = await makeBook(libToken, 1);
    setClock('2024-06-01T00:00:00Z');
    const { token: bor } = await makeMember('bor2x@t.com');
    const co = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${bor}`).send({ book_id: book.id });
    const { token: t1 }           = await makeMember('w1x@t.com');
    const { token: t2, user: u2 } = await makeMember('w2x@t.com');
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${t2}`).send({ book_id: book.id });
    // Return -> t1 gets hold
    await request(app).post(`/api/loans/${co.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    // Advance past expiry
    setClock('2024-06-01T02:30:00Z');
    // t1 collects (expired) -> copy released, t2 should be promoted
    const myRes1 = await request(app).get('/api/reservations/my-reservations').set('Authorization', `Bearer ${t1}`);
    const resId1 = myRes1.body.reservations[0].id;
    await request(app).post(`/api/reservations/${resId1}/collect`).set('Authorization', `Bearer ${t1}`);
    // Check t2 is now held
    const myRes2 = await request(app).get('/api/reservations/my-reservations').set('Authorization', `Bearer ${t2}`);
    expect(myRes2.body.reservations[0].status).toBe('held');
  });
});
describe('Collection', () => {
  async function setupHeld() {
    const libToken = await makeLibrarian();
    await insertSettings({ reservation_hold_window_hours: 48 });
    const book = await makeBook(libToken, 1);
    setClock('2024-09-01T00:00:00Z');
    const { token: bor } = await makeMember('bor3@t.com');
    const co = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${bor}`).send({ book_id: book.id });
    const { token: holder, user: holderUser } = await makeMember('holder@t.com');
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${holder}`).send({ book_id: book.id });
    await request(app).post(`/api/loans/${co.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    const myRes = await request(app).get('/api/reservations/my-reservations').set('Authorization', `Bearer ${holder}`);
    const resId = myRes.body.reservations[0].id;
    return { libToken, holder, holderUser, book, resId };
  }

  it('12. only the hold owner can collect', async () => {
    const { resId } = await setupHeld();
    const { token: other } = await makeMember('other3@t.com');
    const res = await request(app).post(`/api/reservations/${resId}/collect`).set('Authorization', `Bearer ${other}`);
    expect(res.status).toBe(403);
  });

  it('13. expired hold cannot be collected', async () => {
    const { holder, resId } = await setupHeld();
    setClock('2024-09-05T00:00:00Z');
    const res = await request(app).post(`/api/reservations/${resId}/collect`).set('Authorization', `Bearer ${holder}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('14. successful collection creates active loan', async () => {
    const { holder, resId } = await setupHeld();
    setClock('2024-09-02T00:00:00Z');
    const res = await request(app).post(`/api/reservations/${resId}/collect`).set('Authorization', `Bearer ${holder}`);
    expect(res.status).toBe(201);
    expect(res.body.loan.status).toBe('active');
    expect(res.body.reservation.status).toBe('fulfilled');
  });

  it('15. loan limit blocks collection', async () => {
    const libToken = await makeLibrarian();
    await insertSettings({ reservation_hold_window_hours: 48, max_active_loans: 1 });
    const book1 = await makeBook(libToken, 1);
    const book2 = await makeBook(libToken, 1);
    setClock('2024-10-01T00:00:00Z');
    const { token: bor1 } = await makeMember('lb1@t.com');
    const { token: bor2 } = await makeMember('lb2@t.com');
    await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${bor1}`).send({ book_id: book1.id });
    await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${bor2}`).send({ book_id: book2.id });
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${bor1}`).send({ book_id: book2.id });
    const { rows: ln } = await pool.query(
      "SELECT id FROM loans WHERE book_id=$1 AND status='active' LIMIT 1", [book2.id]
    );
    await request(app).post(`/api/loans/${ln[0].id}/return`).set('Authorization', `Bearer ${libToken}`);
    const myRes = await request(app).get('/api/reservations/my-reservations').set('Authorization', `Bearer ${bor1}`);
    const resId = myRes.body.reservations[0].id;
    setClock('2024-10-02T00:00:00Z');
    const res = await request(app).post(`/api/reservations/${resId}/collect`).set('Authorization', `Bearer ${bor1}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/loan limit/i);
  });
});

describe('Cancellation', () => {
  it('17. cancelling waiting reservation does not disturb other entries', async () => {
    setClock('2024-05-10');
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    await exhaustCopies(libToken, book.id, 1);
    const { token: t1 } = await makeMember('c1@t.com');
    const { token: t2 } = await makeMember('c2@t.com');
    const { token: t3 } = await makeMember('c3@t.com');
    const r1 = await request(app).post('/api/reservations').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });
    const r2 = await request(app).post('/api/reservations').set('Authorization', `Bearer ${t2}`).send({ book_id: book.id });
    const r3 = await request(app).post('/api/reservations').set('Authorization', `Bearer ${t3}`).send({ book_id: book.id });
    await request(app).delete(`/api/reservations/${r2.body.reservation.id}`).set('Authorization', `Bearer ${t2}`);
    const lib = await request(app).get('/api/reservations').set('Authorization', `Bearer ${libToken}`).query({ status: 'waiting', book_id: book.id });
    const ids = lib.body.reservations.map(r => r.id);
    expect(ids).toContain(r1.body.reservation.id);
    expect(ids).toContain(r3.body.reservation.id);
    expect(ids).not.toContain(r2.body.reservation.id);
  });

  it('18. cancelling held reservation passes copy to next member', async () => {
    setClock('2024-05-20');
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    const { token: bor } = await makeMember('canbor@t.com');
    const co = await request(app).post('/api/loans/checkout').set('Authorization', `Bearer ${bor}`).send({ book_id: book.id });
    const { token: t1 }           = await makeMember('can1@t.com');
    const { token: t2, user: u2 } = await makeMember('can2@t.com');
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });
    await request(app).post('/api/reservations').set('Authorization', `Bearer ${t2}`).send({ book_id: book.id });
    await request(app).post(`/api/loans/${co.body.loan.id}/return`).set('Authorization', `Bearer ${libToken}`);
    const myRes1 = await request(app).get('/api/reservations/my-reservations').set('Authorization', `Bearer ${t1}`);
    const resId1 = myRes1.body.reservations[0].id;
    await request(app).delete(`/api/reservations/${resId1}`).set('Authorization', `Bearer ${t1}`);
    const myRes2 = await request(app).get('/api/reservations/my-reservations').set('Authorization', `Bearer ${t2}`);
    expect(myRes2.body.reservations[0].status).toBe('held');
  });

  it('member cannot cancel another member\'s reservation', async () => {
    setClock('2024-05-25');
    const libToken = await makeLibrarian();
    await insertSettings();
    const book = await makeBook(libToken, 1);
    await exhaustCopies(libToken, book.id, 1);
    const { token: t1 } = await makeMember('own@t.com');
    const { token: t2 } = await makeMember('thief@t.com');
    const r1 = await request(app).post('/api/reservations').set('Authorization', `Bearer ${t1}`).send({ book_id: book.id });
    const res = await request(app).delete(`/api/reservations/${r1.body.reservation.id}`).set('Authorization', `Bearer ${t2}`);
    expect(res.status).toBe(403);
  });
});