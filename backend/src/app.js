'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const healthRouter       = require('./routes/health');
const authRouter         = require('./routes/auth');
const booksRouter        = require('./routes/books');
const loansRouter        = require('./routes/loans');
const finesRouter        = require('./routes/fines');
const reservationsRouter = require('./routes/reservations');
const settingsRouter     = require('./routes/settings');
const dashboardRouter    = require('./routes/dashboard');
const errorHandler       = require('./middleware/errorHandler');

const app = express();

// In production restrict CORS to the deployed frontend origin.
// In development allow all origins for local Vite dev server.
const corsOptions = process.env.CORS_ORIGIN
  ? { origin: process.env.CORS_ORIGIN, credentials: true }
  : {};
app.use(cors(corsOptions));

app.use(express.json());

app.use('/health',           healthRouter);
app.use('/api/auth',         authRouter);
app.use('/api/books',        booksRouter);
app.use('/api/loans',        loansRouter);
app.use('/api/fines',        finesRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/settings',     settingsRouter);
app.use('/api/dashboard',    dashboardRouter);

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use(errorHandler);

module.exports = app;