'use strict';
const express = require('express');
const router  = express.Router();
const {
  createReservation, getMyReservations, getAllReservations,
  collectReservation, cancelReservation,
} = require('../controllers/reservationController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

function requireMemberRole(req, res, next) {
  if (!req.user || req.user.role !== 'member') {
    return res.status(403).json({ error: 'Only library members can manage reservations.' });
  }
  next();
}

// Member routes
router.post('/',                    authenticate, requireMemberRole, createReservation);
router.get('/my-reservations',      authenticate, requireMemberRole, getMyReservations);
router.post('/:id/collect',         authenticate, requireMemberRole, collectReservation);

// Both roles can cancel (member=own, librarian=any) - auth controller handles RBAC internally
router.delete('/:id',               authenticate, cancelReservation);

// Librarian view
router.get('/',                     authenticate, requireLibrarian,  getAllReservations);

module.exports = router;