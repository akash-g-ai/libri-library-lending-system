'use strict';
const express = require('express');
const router = express.Router();
const {
  getAllBooks, getBookById, createBook, updateBook, deleteBook,
} = require('../controllers/bookController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

// Any authenticated user can browse the catalogue
router.get('/',    authenticate, getAllBooks);
router.get('/:id', authenticate, getBookById);

// Librarian-only operations
router.post('/',    authenticate, requireLibrarian, createBook);
router.put('/:id',  authenticate, requireLibrarian, updateBook);
router.delete('/:id', authenticate, requireLibrarian, deleteBook);

module.exports = router;