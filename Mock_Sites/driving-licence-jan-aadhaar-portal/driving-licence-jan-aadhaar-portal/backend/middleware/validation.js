'use strict';

const { body, param, query, validationResult } = require('express-validator');
const config = require('../config/env');

/**
 * Returns a middleware that reads validationResult and sends 400 if errors exist.
 * Error messages intentionally avoid echoing raw input back.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error:   'Validation failed.',
      fields:  errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

// ============================================================
// Registration validators
// ============================================================
const licencePattern = new RegExp(config.validation.licenceNumberPattern);
const janAadhaarLen  = config.validation.janAadhaarIdLength;

const registrationValidators = [
  // --- Licence Number ---
  body('licence_number')
    .trim()
    .notEmpty().withMessage('Licence number is required.')
    .toUpperCase()
    .isLength({ min: 10, max: 20 }).withMessage('Licence number must be between 10 and 20 characters.')
    .custom((val) => {
      if (!licencePattern.test(val)) {
        throw new Error(
          'Licence number format is invalid. ' +
          'NOTE: Format validation does not confirm the licence is genuine.'
        );
      }
      return true;
    }),

  // --- Licence Holder Name ---
  body('licence_holder_name')
    .trim()
    .notEmpty().withMessage('Licence holder name is required.')
    .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters.')
    .matches(/^[A-Za-z\s'\-\.]+$/).withMessage('Name contains invalid characters.'),

  // --- Date of Issue ---
  body('licence_issue_date')
    .notEmpty().withMessage('Licence issue date is required.')
    .isISO8601().withMessage('Licence issue date must be a valid date (YYYY-MM-DD).'),

  // --- Validity From ---
  body('licence_valid_from')
    .notEmpty().withMessage('Validity from date is required.')
    .isISO8601().withMessage('Validity from date must be a valid date (YYYY-MM-DD).')
    .custom((val, { req }) => {
      if (req.body.licence_issue_date && new Date(val) < new Date(req.body.licence_issue_date)) {
        throw new Error('Validity from date cannot be before the issue date.');
      }
      return true;
    }),

  // --- Validity Expiry ---
  body('licence_expiry_date')
    .notEmpty().withMessage('Licence expiry date is required.')
    .isISO8601().withMessage('Licence expiry date must be a valid date (YYYY-MM-DD).')
    .custom((val, { req }) => {
      if (req.body.licence_valid_from && new Date(val) < new Date(req.body.licence_valid_from)) {
        throw new Error('Expiry date cannot be before validity from date.');
      }
      return true;
    }),

  // --- Jan Aadhaar ID ---
  body('jan_aadhaar_id')
    .trim()
    .notEmpty().withMessage('Jan Aadhaar ID is required.')
    .isNumeric().withMessage('Jan Aadhaar ID must contain only digits.')
    .isLength({ min: janAadhaarLen, max: janAadhaarLen })
    .withMessage(
      `Jan Aadhaar ID must be exactly ${janAadhaarLen} digits. ` +
      'NOTE: Format validation does not confirm the ID exists in any government database.'
    ),

  // --- Family Members Count ---
  body('family_members_count')
    .notEmpty().withMessage('Number of family members is required.')
    .isInt({ min: 1, max: 50 }).withMessage('Family members count must be an integer between 1 and 50.')
    .toInt(),

  handleValidationErrors,
];

// ============================================================
// Admin login validators
// ============================================================
const adminLoginValidators = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required.')
    .isLength({ max: 100 }).withMessage('Username too long.'),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ max: 128 }).withMessage('Password too long.'),

  handleValidationErrors,
];

// ============================================================
// Search query validator
// ============================================================
const searchValidator = [
  query('q')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Search query too long.'),

  handleValidationErrors,
];

// ============================================================
// Reference param validator
// ============================================================
const referenceParamValidator = [
  param('reference')
    .trim()
    .notEmpty().withMessage('Registration reference is required.')
    .isLength({ min: 5, max: 20 }).withMessage('Invalid registration reference format.'),

  handleValidationErrors,
];

module.exports = {
  registrationValidators,
  adminLoginValidators,
  searchValidator,
  referenceParamValidator,
  handleValidationErrors,
};
