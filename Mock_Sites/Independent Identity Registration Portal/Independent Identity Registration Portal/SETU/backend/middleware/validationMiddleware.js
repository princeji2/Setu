const { body, validationResult } = require('express-validator');
const {
  validateSyntheticIdentity,
  validatePersonName,
  validateIndianMobile,
  validateAddress,
} = require('../utils/validators');

/**
 * Validation rules for registration check endpoint (v2)
 * Validates: identityReference, name, mobileNumber, address, fatherName, captchaToken, captchaAnswer
 */
const validateRegistrationCheck = [
  // ── Identity Reference ──────────────────────────────────────────────────────
  body('identityReference')
    .exists({ checkFalsy: true })
    .withMessage('Identity reference is required')
    .isString()
    .withMessage('Identity reference must be a string')
    .trim()
    .custom((value, { req }) => {
      const result = validateSyntheticIdentity(value);
      if (!result.isValid) {
        throw new Error(result.error);
      }
      // Attach normalized value to request for controller use
      req.normalizedIdentityReference = result.normalized;
      return true;
    }),

  // ── Full Name ───────────────────────────────────────────────────────────────
  body('name')
    .exists({ checkFalsy: true })
    .withMessage('Full name is required')
    .isString()
    .withMessage('Full name must be a string')
    .trim()
    .custom((value) => {
      const result = validatePersonName(value, 'Full Name');
      if (!result.isValid) throw new Error(result.error);
      return true;
    }),

  // ── Mobile Number ───────────────────────────────────────────────────────────
  body('mobileNumber')
    .exists({ checkFalsy: true })
    .withMessage('Mobile number is required')
    .isString()
    .withMessage('Mobile number must be a string')
    .trim()
    .custom((value) => {
      const result = validateIndianMobile(value);
      if (!result.isValid) throw new Error(result.error);
      return true;
    }),

  // ── Address ─────────────────────────────────────────────────────────────────
  body('address')
    .exists({ checkFalsy: true })
    .withMessage('Address is required')
    .isString()
    .withMessage('Address must be a string')
    .trim()
    .custom((value) => {
      const result = validateAddress(value);
      if (!result.isValid) throw new Error(result.error);
      return true;
    }),

  // ── Father's Name ────────────────────────────────────────────────────────────
  body('fatherName')
    .exists({ checkFalsy: true })
    .withMessage("Father's name is required")
    .isString()
    .withMessage("Father's name must be a string")
    .trim()
    .custom((value) => {
      const result = validatePersonName(value, "Father's Name");
      if (!result.isValid) throw new Error(result.error);
      return true;
    }),

  // ── Captcha Token ────────────────────────────────────────────────────────────
  body('captchaToken')
    .if((value, { req }) => {
      // In non-production only: allow Setu Gateway requests with valid X-Gateway-Key to bypass captcha validation
      if (process.env.NODE_ENV !== 'production') {
        const gwKey = req.headers['x-gateway-key'];
        if (gwKey && gwKey === process.env.GATEWAY_API_KEY) {
          return false; // Skip captchaToken validation in dev/test
        }
      }
      return true; // Enforce captchaToken in production or for public requests
    })
    .exists({ checkFalsy: true })
    .withMessage('Captcha token is missing. Please refresh the captcha.')
    .isString()
    .withMessage('Captcha token must be a string'),

  // ── Captcha Answer ───────────────────────────────────────────────────────────
  body('captchaAnswer')
    .if((value, { req }) => {
      // In non-production only: allow Setu Gateway requests with valid X-Gateway-Key to bypass captcha validation
      if (process.env.NODE_ENV !== 'production') {
        const gwKey = req.headers['x-gateway-key'];
        if (gwKey && gwKey === process.env.GATEWAY_API_KEY) {
          return false; // Skip captchaAnswer validation in dev/test
        }
      }
      return true; // Enforce captchaAnswer in production or for public requests
    })
    .exists({ checkFalsy: true })
    .withMessage('Captcha answer is required')
    .isString()
    .withMessage('Captcha answer must be a string')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Captcha answer is invalid'),

  handleValidationErrors,
];

/**
 * Validation rules for admin login endpoint
 */
const validateAdminLogin = [
  body('username')
    .exists({ checkFalsy: true })
    .withMessage('Username is required')
    .isString()
    .withMessage('Username must be a string')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters'),
  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .isString()
    .withMessage('Password must be a string')
    .isLength({ min: 6, max: 100 })
    .withMessage('Password must be between 6 and 100 characters'),
  handleValidationErrors,
];

/**
 * Formats express-validator validation failures into safe, structured API error responses
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((err) => err.msg).join('; ');
    return res.status(400).json({
      success: false,
      data: null,
      error: `Validation failed: ${errorMessages}`,
      message: 'Validation failed',
      errors: errors.array().map((err) => ({
        field: err.path || err.param,
        message: err.msg,
      })),
    });
  }
  next();
}

module.exports = {
  validateRegistrationCheck,
  validateAdminLogin,
  handleValidationErrors,
};
