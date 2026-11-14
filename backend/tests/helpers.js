'use strict';
// Test helpers: manage a clean test database state.
// Tests that mutate data should call cleanDb() in beforeEach.
const { pool } = require('../src/db/connection');
const { runMigrations } = require('../src/db/migrate');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');

async function setupDb() {
  await runMigrations(MIGRATIONS_DIR);
}

async function cleanDb() {
  await pool.query(
    'TRUNCATE reservations, fines, loans, books, users, library_settings RESTART IDENTITY CASCADE'
  );
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, setupDb, cleanDb, closePool };