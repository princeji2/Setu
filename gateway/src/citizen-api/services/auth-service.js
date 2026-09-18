'use strict';

/**
 * Citizen auth service — hand-rolled, gateway-scoped (see tech.md §4).
 * Owns password hashing (bcrypt), duplicate detection, credential
 * verification, and gateway JWT issuance. Storage is injected via a
 * repository so the same logic runs against Postgres or an in-memory
 * store (tests).
 *
 * Errors are thrown with a `.code` the HTTP layer maps to a status:
 *   EMAIL_TAKEN         -> 409
 *   INVALID_CREDENTIALS -> 401
 *   VALIDATION          -> 400
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');

class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertRegisterInput({ fullName, email, password }) {
  if (!fullName || !String(fullName).trim()) {
    throw new AuthError('VALIDATION', 'full_name is required.');
  }
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    throw new AuthError('VALIDATION', 'A valid email is required.');
  }
  if (!password || String(password).length < 8) {
    throw new AuthError('VALIDATION', 'password must be at least 8 characters.');
  }
}

function assertLoginInput({ email, password }) {
  if (!email || !password) {
    throw new AuthError('VALIDATION', 'email and password are required.');
  }
}

/**
 * Shape the citizen row into a safe, public representation.
 * Never leaks password_hash.
 */
function toPublicCitizen(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    created_at: row.created_at,
  };
}

function issueToken(citizen) {
  return jwt.sign(
    { sub: citizen.id, email: citizen.email },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn }
  );
}

function createAuthService(citizenRepository) {
  return {
    async register({ fullName, email, password }) {
      assertRegisterInput({ fullName, email, password });

      const existing = await citizenRepository.findByEmail(email);
      if (existing) {
        throw new AuthError('EMAIL_TAKEN', 'An account with this email already exists.');
      }

      const passwordHash = await bcrypt.hash(password, config.auth.bcryptSaltRounds);
      const row = await citizenRepository.create({ fullName, email, passwordHash });

      return { citizen: toPublicCitizen(row), token: issueToken(row) };
    },

    async login({ email, password }) {
      assertLoginInput({ email, password });

      const row = await citizenRepository.findByEmail(email);
      // Compare even when the user is missing? We short-circuit here; the
      // timing difference is acceptable for a prototype. The response is
      // identical either way so we don't leak whether the email exists.
      if (!row) {
        throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password.');
      }

      const ok = await bcrypt.compare(password, row.password_hash);
      if (!ok) {
        throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password.');
      }

      return { citizen: toPublicCitizen(row), token: issueToken(row) };
    },
  };
}

module.exports = { createAuthService, AuthError, toPublicCitizen, issueToken };
