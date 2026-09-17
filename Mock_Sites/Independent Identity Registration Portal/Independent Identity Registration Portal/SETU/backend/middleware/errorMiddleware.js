/**
 * Centralized error-handling middleware.
 * Ensures zero internal database errors, query strings, or stack traces
 * are ever transmitted to the frontend client.
 */

function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    data: null,
    error: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
}

function globalErrorHandler(err, req, res, next) {
  // Log internal diagnostics for server-side troubleshooting
  console.error('[SERVER ERROR CAUGHT]:', {
    message: err.message,
    name: err.name,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Handle PostgreSQL specific errors safely
  if (err.code === '23505') {
    // Unique violation
    return res.status(409).json({
      success: false,
      data: null,
      error: 'A duplicate record already exists in the system.',
    });
  }

  if (err.code === 'ECONNREFUSED' || err.code === '28P01' || err.code === '3D000') {
    // Database connection or authentication failure
    return res.status(503).json({
      success: false,
      data: null,
      error: 'Database service is currently unavailable. Please check backend configuration.',
    });
  }

  // Handle standard HTTP status if set on error
  const statusCode = err.status || err.statusCode || 500;
  const clientMessage = statusCode === 500
    ? 'An unexpected internal server error occurred. Please try again later.'
    : err.message || 'An error occurred processing your request.';

  res.status(statusCode).json({
    success: false,
    data: null,
    error: clientMessage,
  });
}

module.exports = {
  notFoundHandler,
  globalErrorHandler,
};
