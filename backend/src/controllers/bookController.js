'use strict';
const { pool } = require('../db/connection');

/**
 * Validate book input fields. Returns array of error strings.
 */
function validateBook({ title, author, total_copies, available_copies }) {
  const errors = [];
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('title is required.');
  }
  if (!author || typeof author !== 'string' || author.trim().length === 0) {
    errors.push('author is required.');
  }
  const tc = parseInt(total_copies, 10);
  if (isNaN(tc) || tc < 0) {
    errors.push('total_copies must be a non-negative integer.');
  }
  const ac = parseInt(available_copies, 10);
  if (isNaN(ac) || ac < 0) {
    errors.push('available_copies must be a non-negative integer.');
  }
  if (!isNaN(tc) && !isNaN(ac) && ac > tc) {
    errors.push('available_copies cannot exceed total_copies.');
  }
  return errors;
}

/**
 * GET /api/books
 * Public (authenticated members and librarians). Returns all books.
 */
async function getAllBooks(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, author, total_copies, available_copies, created_at, updated_at FROM books ORDER BY title ASC'
    );
    return res.status(200).json({ books: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/books/:id
 * Public (authenticated). Returns a single book by ID.
 */
async function getBookById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid book ID.' });

    const { rows } = await pool.query(
      'SELECT id, title, author, total_copies, available_copies, created_at, updated_at FROM books WHERE id = $1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Book not found.' });

    return res.status(200).json({ book: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/books
 * Librarian only. Creates a new book.
 */
async function createBook(req, res, next) {
  try {
    const { title, author, total_copies = 0, available_copies = 0 } = req.body;

    const errors = validateBook({ title, author, total_copies, available_copies });
    if (errors.length > 0) return res.status(400).json({ errors });

    const { rows } = await pool.query(
      `INSERT INTO books (title, author, total_copies, available_copies)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, author, total_copies, available_copies, created_at, updated_at`,
      [title.trim(), author.trim(), parseInt(total_copies, 10), parseInt(available_copies, 10)]
    );

    return res.status(201).json({ book: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/books/:id
 * Librarian only. Updates book information.
 */
async function updateBook(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid book ID.' });

    // Check book exists
    const existing = await pool.query('SELECT * FROM books WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Book not found.' });

    const current = existing.rows[0];
    const title          = req.body.title          ?? current.title;
    const author         = req.body.author         ?? current.author;
    const total_copies   = req.body.total_copies   ?? current.total_copies;
    const available_copies = req.body.available_copies ?? current.available_copies;

    const errors = validateBook({ title, author, total_copies, available_copies });
    if (errors.length > 0) return res.status(400).json({ errors });

    const { rows } = await pool.query(
      `UPDATE books
       SET title = $1, author = $2, total_copies = $3, available_copies = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, title, author, total_copies, available_copies, created_at, updated_at`,
      [title.trim(), author.trim(), parseInt(total_copies, 10), parseInt(available_copies, 10), id]
    );

    return res.status(200).json({ book: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/books/:id
 * Librarian only. Deletes a book if it has no active loans or waiting/held reservations.
 */
async function deleteBook(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid book ID.' });

    const existing = await pool.query('SELECT id FROM books WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Book not found.' });

    // Block deletion if active loans exist
    const activeLoans = await pool.query(
      "SELECT id FROM loans WHERE book_id = $1 AND status = 'active' LIMIT 1",
      [id]
    );
    if (activeLoans.rows.length > 0) {
      return res.status(409).json({ error: 'Cannot delete book with active loans.' });
    }

    // Block deletion if active reservations exist
    const activeReservations = await pool.query(
      "SELECT id FROM reservations WHERE book_id = $1 AND status IN ('waiting', 'held') LIMIT 1",
      [id]
    );
    if (activeReservations.rows.length > 0) {
      return res.status(409).json({ error: 'Cannot delete book with active reservations.' });
    }

    await pool.query('DELETE FROM books WHERE id = $1', [id]);
    return res.status(200).json({ message: 'Book deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllBooks, getBookById, createBook, updateBook, deleteBook };