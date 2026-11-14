'use strict';
const express = require('express');
const router  = express.Router();
const { checkout, getMyLoans, getAllLoans, returnLoan } = require('../controllers/loanController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

// Member-only: checkout and viewing own loans
// Any authenticated user may view their own loans (members only have loans anyway)
router.post('/checkout',  authenticate, requireMemberRole, checkout);
router.get('/my-loans',   authenticate, getMyLoans);

// Librarian-only
router.get('/',            authenticate, requireLibrarian, getAllLoans);
router.post('/:id/return', authenticate, requireLibrarian, returnLoan);

/** Inline guard: only role=member may check out books */
function requireMemberRole(req, res, next) {
  if (!req.user || req.user.role !== 'member') {
    return res.status(403).json({ error: 'Only library members can checkout books.' });
  }
  next();
}

module.exports = router;