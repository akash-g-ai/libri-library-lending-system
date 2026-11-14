'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Verifies JWT token from Authorization: Bearer <token> header.
 * Attaches decoded user payload to req.user on success.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Provide a Bearer token.' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

/**
 * Requires the authenticated user to have role = 'librarian'.
 * Must be used after authenticate middleware.
 */
function requireLibrarian(req, res, next) {
  if (!req.user || req.user.role !== 'librarian') {
    return res.status(403).json({ error: 'Librarian access required.' });
  }
  next();
}

/**
 * Requires role = 'member' OR 'librarian' (any authenticated user).
 * Must be used after authenticate middleware.
 */
function requireMember(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  next();
}

module.exports = { authenticate, requireLibrarian, requireMember };