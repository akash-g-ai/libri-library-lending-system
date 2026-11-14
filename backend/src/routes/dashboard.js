'use strict';
const express = require('express');
const router  = express.Router();
const { getMemberDashboard, getLibrarianDashboard } = require('../controllers/dashboardController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

function requireMember(req, res, next) {
  if (!req.user || req.user.role !== 'member') {
    return res.status(403).json({ error: 'Member access required.' });
  }
  next();
}

router.get('/member',    authenticate, requireMember,    getMemberDashboard);
router.get('/librarian', authenticate, requireLibrarian, getLibrarianDashboard);

module.exports = router;