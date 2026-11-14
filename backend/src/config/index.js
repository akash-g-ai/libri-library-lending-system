'use strict';
require('dotenv').config();

const DEV_JWT_FALLBACK = 'dev_jwt_secret_change_in_production';

const config = {
  databaseUrl: process.env.DATABASE_URL,
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_FALLBACK,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  DEV_JWT_FALLBACK,
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

// In production, refuse to start with a missing or weak JWT secret.
if (config.isProduction) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  if (process.env.JWT_SECRET === DEV_JWT_FALLBACK) {
    throw new Error(
      'JWT_SECRET must not be the development fallback value in production. ' +
      'Set a strong random secret in your environment.'
    );
  }
}

module.exports = config;