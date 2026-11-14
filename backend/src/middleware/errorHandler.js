'use strict';

/**
 * Centralized Express error handler.
 * Catches errors forwarded via next(err).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Don't leak stack traces or pg internals to clients
  const isDev = process.env.NODE_ENV !== 'production';

  // PostgreSQL unique violation (23505)
  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with that value already exists.' });
  }

  // PostgreSQL check constraint violation (23514)
  if (err.code === '23514') {
    return res.status(422).json({ error: 'Data failed a database constraint check.' });
  }

  // PostgreSQL foreign key violation (23503)
  if (err.code === '23503') {
    return res.status(422).json({ error: 'Referenced record does not exist.' });
  }

  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error.';

  res.status(status).json({
    error: message,
    ...(isDev && status === 500 ? { detail: err.message } : {}),
  });
}

module.exports = errorHandler;