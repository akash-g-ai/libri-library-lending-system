'use strict';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
const app = require('../src/app');
const { setupDb, cleanDb, closePool } = require('./helpers');

beforeAll(async () => { await setupDb(); });
beforeEach(async () => { await cleanDb(); });
afterAll(async () => { await closePool(); });

// -- Registration --------------------------------------------------------------

describe('POST /api/auth/register', () => {
  it('registers a new member successfully', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice Smith', email: 'alice@example.com', password: 'secret123',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('member');
    expect(res.body.user.email).toBe('alice@example.com');
    // password_hash must NOT be exposed
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejects registration with missing name', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'alice@example.com', password: 'secret123',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('rejects registration with invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Bob', email: 'not-an-email', password: 'secret123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects registration with short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Bob', email: 'bob@example.com', password: 'short',
    });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email registration', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Alice', email: 'alice@example.com', password: 'secret123',
    });
    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice2', email: 'alice@example.com', password: 'secret123',
    });
    expect(res.status).toBe(409);
  });

  it('never allows self-registration as librarian', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Hacker', email: 'hack@example.com', password: 'secret123', role: 'librarian',
    });
    // Should succeed but role must be 'member'
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('member');
  });
});

// -- Login ---------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Alice', email: 'alice@example.com', password: 'secret123',
    });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'alice@example.com', password: 'secret123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('member');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejects incorrect password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'alice@example.com', password: 'wrongpass',
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-existent email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com', password: 'secret123',
    });
    expect(res.status).toBe(401);
  });

  it('rejects request with missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'alice@example.com' });
    expect(res.status).toBe(400);
  });
});

// -- Auth middleware -----------------------------------------------------------

describe('JWT middleware', () => {
  it('rejects request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects request with malformed token', async () => {
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });

  it('allows access with valid token', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      name: 'Alice', email: 'alice@example.com', password: 'secret123',
    });
    const { token } = reg.body;
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alice@example.com');
  });
});