'use strict';
require('dotenv').config();
const path = require('path');
const { runMigrations } = require('./migrate');

const migrationsDir = path.resolve(__dirname, '../../../database/migrations');

runMigrations(migrationsDir)
  .then(() => {
    console.log('All migrations applied successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });