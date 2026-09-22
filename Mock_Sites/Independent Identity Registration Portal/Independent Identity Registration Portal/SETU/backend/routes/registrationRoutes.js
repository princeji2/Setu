const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getCaptcha,
  checkRegistration,
  getRegistrationFields,
  getVoterIdFields,
  getBirthCertificateFields,
} = require('../controllers/registrationController');
const { validateRegistrationCheck } = require('../middleware/validationMiddleware');
const gatewayAuthMiddleware = require('../middleware/gatewayAuthMiddleware');

const router = express.Router();

// Rate limiter for registration checks: maximum 45 requests per 5 minutes per IP
const registrationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: 'Too many registration requests from this IP. Please try again in a few minutes.',
  },
});

// Rate limiter for captcha generation: maximum 30 requests per 5 minutes per IP
const captchaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: 'Too many captcha requests. Please wait a moment before refreshing.',
  },
});

/**
 * @route   GET /api/registration/captcha
 * @desc    Issue a new captcha challenge (SVG image + signed JWT token)
 * @access  Public
 */
router.get('/captcha', captchaLimiter, getCaptcha);

/**
 * @route   POST /api/registration/check
 * @desc    Check and register a synthetic identity reference with personal info
 * @access  Public (Gateway & Frontend)
 */
router.post('/check', registrationLimiter, validateRegistrationCheck, checkRegistration);

/**
 * @route   GET /api/registration/:identityReference/fields
 * @desc    Fetch synthetic demographic fields for consent-based Setu gateway flow
 * @access  Protected (Requires X-Gateway-Key header)
 */
router.get('/:identityReference/fields', gatewayAuthMiddleware, getRegistrationFields);

/**
 * @route   GET /api/registration/voter-id/:voterReference/fields
 * @desc    Fetch verified Voter ID fields
 * @access  Protected (Requires X-Gateway-Key header)
 */
router.get('/voter-id/:voterReference/fields', gatewayAuthMiddleware, getVoterIdFields);

/**
 * @route   GET /api/registration/birth-certificate/:birthReference/fields
 * @desc    Fetch verified Birth Certificate fields
 * @access  Protected (Requires X-Gateway-Key header)
 */
router.get('/birth-certificate/:birthReference/fields', gatewayAuthMiddleware, getBirthCertificateFields);

module.exports = router;

