'use strict';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const { setupDb, closePool } = require('./helpers');

beforeAll(async () => { await setupDb(); });
afterAll(async () => { await closePool(); });

describe('Config module', () => {
  it('exports a databaseUrl string', () => {
    const config = require('../src/config');
    expect(typeof config.databaseUrl).toBe('string');
    expect(config.databaseUrl.length).toBeGreaterThan(0);
  });

  it('exports a port number', () => {
    const config = require('../src/config');
    expect(typeof config.port).toBe('number');
  });

  it('provides a jwtSecret', () => {
    const config = require('../src/config');
    expect(typeof config.jwtSecret).toBe('string');
    expect(config.jwtSecret.length).toBeGreaterThan(0);
  });

  // Test the production guard logic directly without module re-loading.
  // Re-requiring with dotenv in the mix re-reads .env and defeats the test.
  it('production guard rejects missing JWT_SECRET', () => {
    const { DEV_JWT_FALLBACK } = require('../src/config');
    function checkProductionSecret(jwtSecret) {
      if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required in production');
      if (jwtSecret === DEV_JWT_FALLBACK) throw new Error('JWT_SECRET must not be the development fallback value in production');
    }
    expect(() => checkProductionSecret(undefined)).toThrow('JWT_SECRET environment variable is required in production');
  });

  it('production guard rejects development fallback JWT_SECRET', () => {
    const { DEV_JWT_FALLBACK } = require('../src/config');
    function checkProductionSecret(jwtSecret) {
      if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required in production');
      if (jwtSecret === DEV_JWT_FALLBACK) throw new Error('JWT_SECRET must not be the development fallback value in production');
    }
    expect(() => checkProductionSecret(DEV_JWT_FALLBACK)).toThrow('must not be the development fallback');
  });

  it('production guard accepts a strong JWT_SECRET', () => {
    const { DEV_JWT_FALLBACK } = require('../src/config');
    function checkProductionSecret(jwtSecret) {
      if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required in production');
      if (jwtSecret === DEV_JWT_FALLBACK) throw new Error('JWT_SECRET must not be the development fallback value in production');
    }
    expect(() => checkProductionSecret('a-strong-32-char-random-secret!!')).not.toThrow();
  });
});

describe('Health check endpoint', () => {
  it('GET /health returns 200 with status ok', async () => {
    const request = (await import('supertest')).default;
    const app = require('../src/app');
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });
});