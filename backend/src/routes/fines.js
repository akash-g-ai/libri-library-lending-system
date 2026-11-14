'use strict';
const express = require('express');
const router  = express.Router();
const { getMyFines, getAllFines, payFine } = require('../controllers/fineController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

// Member route
router.get('/my-fines', authenticate, getMyFines);

// Librarian routes
router.get('/',          authenticate, requireLibrarian, getAllFines);
router.post('/:id/pay',  authenticate, requireLibrarian, payFine);

module.exports = router;