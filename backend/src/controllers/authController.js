'use strict';
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/connection');
const config = require('../config');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 10;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

// POST /api/auth/register — public, always creates a member account
async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const errors = [];
    if (!name || typeof name !== 'string' || name.trim().length === 0) errors.push('name is required.');
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) errors.push('A valid email is required.');
    if (!password || typeof password !== 'string' || password.length < 8) errors.push('password must be at least 8 characters.');
    if (errors.length > 0) return res.status(400).json({ errors });

    const cleanEmail = email.trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email is already registered.' });

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'member') RETURNING id, name, email, role, created_at`,
      [name.trim(), cleanEmail, password_hash]
    );

    const user = rows[0];
    return res.status(201).json({ token: signToken(user), user });
  } catch (err) { next(err); }
}

// POST /api/auth/login — email + password for both members and librarians
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required.' });

    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid email or password.' });

    const user = rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) return res.status(401).json({ error: 'Invalid email or password.' });

    return res.status(200).json({
      token: signToken(user),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) { next(err); }
}

// GET /api/auth/me — protected
async function getMe(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    return res.status(200).json({ user: rows[0] });
  } catch (err) { next(err); }
}

module.exports = { register, login, getMe };