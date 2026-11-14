'use strict';
require('dotenv').config();
const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port} [${config.nodeEnv}]`);
});

module.exports = app;