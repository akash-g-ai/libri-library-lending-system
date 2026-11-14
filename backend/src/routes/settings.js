'use strict';
const express = require('express');
const router  = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { authenticate, requireLibrarian } = require('../middleware/auth');

router.get('/',  authenticate, requireLibrarian, getSettings);
router.put('/',  authenticate, requireLibrarian, updateSettings);

module.exports = router;