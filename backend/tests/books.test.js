'use strict';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
const app = require('../src/app');
const { pool, setupDb, cleanDb, closePool } = require('./helpers');

beforeAll(async () => { await setupDb(); });
beforeEach(async () => { await cleanDb(); });
afterAll(async () => { await closePool(); });

// -- Helpers -------------------------------------------------------------------

async function registerMember(email = 'member@example.com') {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Test Member', email, password: 'secret123',
  });
  return res.body.token;
}

async function createLibrarian() {
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash('adminpass', 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Librarian', 'librarian@example.com', $1, 'librarian')
     RETURNING id, email, role`,
    [hash]
  );
  const jwt = require('jsonwebtoken');
  const config = require('../src/config');
  return jwt.sign(
    { id: rows[0].id, email: rows[0].email, role: 'librarian' },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
}

const BOOK = { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', total_copies: 3, available_copies: 3 };

// -- RBAC on books -------------------------------------------------------------

describe('Books RBAC', () => {
  it('unauthenticated user cannot browse books', async () => {
    const res = await request(app).get('/api/books');
    expect(res.status).toBe(401);
  });

  it('member can browse the catalogue', async () => {
    const token = await registerMember();
    const res = await request(app).get('/api/books')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.books)).toBe(true);
  });

  it('member denied access to create book endpoint', async () => {
    const token = await registerMember();
    const res = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${token}`)
      .send(BOOK);
    expect(res.status).toBe(403);
  });

  it('librarian can create a book', async () => {
    const token = await createLibrarian();
    const res = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${token}`)
      .send(BOOK);
    expect(res.status).toBe(201);
    expect(res.body.book.title).toBe(BOOK.title);
  });

  it('member denied access to delete book endpoint', async () => {
    const libToken = await createLibrarian();
    const bookRes = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${libToken}`).send(BOOK);
    const bookId = bookRes.body.book.id;

    const memberToken = await registerMember();
    const res = await request(app).delete(`/api/books/${bookId}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });
});

// -- Book CRUD -----------------------------------------------------------------

describe('Books CRUD', () => {
  let libToken;
  beforeEach(async () => { libToken = await createLibrarian(); });

  it('creates a book and returns it', async () => {
    const res = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${libToken}`).send(BOOK);
    expect(res.status).toBe(201);
    expect(res.body.book.id).toBeDefined();
    expect(res.body.book.author).toBe('F. Scott Fitzgerald');
  });

  it('gets all books', async () => {
    await request(app).post('/api/books').set('Authorization', `Bearer ${libToken}`).send(BOOK);
    const memberToken = await registerMember();
    const res = await request(app).get('/api/books').set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.books.length).toBeGreaterThanOrEqual(1);
  });

  it('gets a book by id', async () => {
    const created = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${libToken}`).send(BOOK);
    const id = created.body.book.id;
    const memberToken = await registerMember();
    const res = await request(app).get(`/api/books/${id}`).set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.book.id).toBe(id);
  });

  it('returns 404 for non-existent book', async () => {
    const memberToken = await registerMember();
    const res = await request(app).get('/api/books/999999').set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(404);
  });

  it('updates a book', async () => {
    const created = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${libToken}`).send(BOOK);
    const id = created.body.book.id;
    const res = await request(app).put(`/api/books/${id}`)
      .set('Authorization', `Bearer ${libToken}`)
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(200);
    expect(res.body.book.title).toBe('Updated Title');
    expect(res.body.book.author).toBe(BOOK.author); // unchanged
  });

  it('deletes a book with no loans/reservations', async () => {
    const created = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${libToken}`).send(BOOK);
    const id = created.body.book.id;
    const res = await request(app).delete(`/api/books/${id}`)
      .set('Authorization', `Bearer ${libToken}`);
    expect(res.status).toBe(200);
    // Confirm it is gone
    const memberToken = await registerMember();
    const check = await request(app).get(`/api/books/${id}`).set('Authorization', `Bearer ${memberToken}`);
    expect(check.status).toBe(404);
  });
});

// -- Validation ----------------------------------------------------------------

describe('Book validation', () => {
  let libToken;
  beforeEach(async () => { libToken = await createLibrarian(); });

  it('rejects book with missing title', async () => {
    const res = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${libToken}`)
      .send({ author: 'Someone', total_copies: 1, available_copies: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects book with missing author', async () => {
    const res = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${libToken}`)
      .send({ title: 'Some Book', total_copies: 1, available_copies: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects negative total_copies', async () => {
    const res = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${libToken}`)
      .send({ title: 'Book', author: 'Author', total_copies: -1, available_copies: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects available_copies exceeding total_copies', async () => {
    const res = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${libToken}`)
      .send({ title: 'Book', author: 'Author', total_copies: 2, available_copies: 5 });
    expect(res.status).toBe(400);
  });
});

// -- Deletion protection -------------------------------------------------------

describe('Book deletion protection', () => {
  let libToken;
  beforeEach(async () => { libToken = await createLibrarian(); });

  it('rejects deletion of book with active loan', async () => {
    // Create book
    const bookRes = await request(app).post('/api/books')
      .set('Authorization', `Bearer ${libToken}`)
      .send({ title: 'Busy Book', author: 'Author', total_copies: 2, available_copies: 1 });
    const bookId = bookRes.body.book.id;

    // Directly insert an active loan to simulate a checkout
    const memberRes = await request(app).post('/api/auth/register').send({
      name: 'Borrower', email: 'borrower@example.com', password: 'secret123',
    });
    const memberId = memberRes.body.user.id;

    await pool.query(
      `INSERT INTO loans (member_id, book_id, checkout_date, due_date, status)
       VALUES ($1, $2, '2024-01-01', '2024-01-15', 'active')`,
      [memberId, bookId]
    );

    const res = await request(app).delete(`/api/books/${bookId}`)
      .set('Authorization', `Bearer ${libToken}`);
    expect(res.status).toBe(409);
  });
});