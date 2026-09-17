const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_aadhaar_portal_2026_educational_prototype';

/**
 * Middleware to authenticate requests using JSON Web Tokens (JWT)
 */
function authenticateAdminToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Access denied: No authorization token provided.',
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      message: 'Access denied: Invalid token format. Expected Bearer token.',
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Access forbidden: Invalid authentication token.',
    });
  }
}

module.exports = {
  authenticateAdminToken,
  JWT_SECRET,
};
