'use strict';
require('dotenv').config();
const { runSeed } = require('./seed');

runSeed()
  .then(() => process.exit(0))
  .catch(err => { console.error(err.message); process.exit(1); });