/**
 * Error handling middleware for GH200 Retrieval Router
 */

const { logger } = require('../utils/logger');

/**
 * Application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error classes for specific scenarios
 */
class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

class ServiceUnavailableError extends AppError {
  constructor(service = 'Service') {
    super(`${service} unavailable`, 503, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

class MemoryError extends AppError {
  constructor(message = 'Memory allocation failed') {
    super(message, 507, 'MEMORY_ERROR');
    this.name = 'MemoryError';
  }
}

/**
 * Error response formatter
 */
const formatErrorResponse = (error, req) => {
  const response = {
    error: error.code || 'INTERNAL_ERROR',
    message: error.message,
    timestamp: new Date().toISOString(),
    requestId: req.id || generateRequestId()
  };

  // Add details for operational errors
  if (error.isOperational && error.details && Object.keys(error.details).length > 0) {
    response.details = error.details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' || process.env.INCLUDE_STACK_TRACE === 'true') {
    response.stack = error.stack;
  }

  return response;
};

/**
 * Main error handling middleware
 */
const errorHandler = (error, req, res, next) => {
  // Ensure error has required properties
  if (!error.statusCode) error.statusCode = 500;
  if (!error.code) error.code = 'INTERNAL_ERROR';
  if (!error.isOperational) error.isOperational = false;

  // Log error details
  const logData = {
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      isOperational: error.isOperational
    },
    request: {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.id
    },
    user: req.auth || { authenticated: false },
    timestamp: new Date().toISOString()
  };

  // Include stack trace for non-operational errors
  if (!error.isOperational) {
    logData.error.stack = error.stack;
  }

  // Choose log level based on error severity
  if (error.statusCode >= 500) {
    logger.error('Server error occurred', logData);
  } else if (error.statusCode >= 400) {
    logger.warn('Client error occurred', logData);
  } else {
    logger.info('Request completed with error', logData);
  }

  // Don't expose internal errors to clients in production
  let responseError = error;
  if (!error.isOperational && process.env.NODE_ENV === 'production') {
    responseError = new AppError('Internal server error', 500, 'INTERNAL_ERROR');
  }

  // Format and send error response
  const errorResponse = formatErrorResponse(responseError, req);
  
  // Set appropriate headers
  res.status(error.statusCode);
  res.set({
    'Content-Type': 'application/json',
    'X-Error-Code': error.code,
    'X-Request-ID': req.id || generateRequestId()
  });

  res.json(errorResponse);
};

/**
 * 404 handler for unmatched routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  next(error);
};

/**
 * Async error wrapper for route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global uncaught exception handler
 */
const uncaughtExceptionHandler = (error) => {
  logger.error('Uncaught exception', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    timestamp: new Date().toISOString()
  });

  // Give the logger time to write
  setTimeout(() => {
    process.exit(1);
  }, 1000);
};

/**
 * Global unhandled rejection handler
 */
const unhandledRejectionHandler = (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack
    } : reason,
    promise: promise.toString(),
    timestamp: new Date().toISOString()
  });

  // Give the logger time to write
  setTimeout(() => {
    process.exit(1);
  }, 1000);
};

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Request ID middleware
 */
const requestIdMiddleware = (req, res, next) => {
  req.id = req.get('X-Request-ID') || generateRequestId();
  res.set('X-Request-ID', req.id);
  next();
};

/**
 * Setup global error handlers
 */
const setupGlobalErrorHandlers = () => {
  process.on('uncaughtException', uncaughtExceptionHandler);
  process.on('unhandledRejection', unhandledRejectionHandler);
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  MemoryError,
  
  // Middleware
  errorHandler,
  notFoundHandler,
  asyncHandler,
  requestIdMiddleware,
  
  // Setup functions
  setupGlobalErrorHandlers
};