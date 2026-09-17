'use strict';

const rateLimit = require('express-rate-limit');
const config    = require('../config/env');

/**
 * General API rate limiter.
 */
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    error:   'Too many requests. Please try again later.',
  },
  // Skip logging the full IP in production to minimise PII in logs
  skip: () => false,
});

/**
 * Stricter limiter for authentication endpoints.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    error:   'Too many login attempts. Please try again in 15 minutes.',
  },
});

/**
 * Limiter for registration submission.
 */
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    error:   'Too many registration attempts. Please try again later.',
  },
});

module.exports = { apiLimiter, authLimiter, registrationLimiter };
