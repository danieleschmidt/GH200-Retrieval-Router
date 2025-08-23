/**
 * Request validation middleware for GH200 Retrieval Router
 */

const Joi = require('joi');
const { logger } = require('../utils/logger');

/**
 * Generic validation middleware factory
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Validation failed', {
        endpoint: req.path,
        property,
        errors: validationErrors,
        ip: req.ip
      });

      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: validationErrors,
        timestamp: new Date().toISOString()
      });
    }

    // Replace the original property with the validated/sanitized value
    req[property] = value;
    next();
  };
};

/**
 * Content type validation middleware
 */
const requireContentType = (expectedType = 'application/json') => {
  return (req, res, next) => {
    const contentType = req.get('Content-Type');

    if (!contentType || !contentType.includes(expectedType)) {
      return res.status(415).json({
        error: 'UNSUPPORTED_MEDIA_TYPE',
        message: `Content-Type must be ${expectedType}`,
        received: contentType || 'none'
      });
    }

    next();
  };
};

/**
 * Request size validation middleware
 */
const validateRequestSize = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.get('Content-Length');
    const maxSizeBytes = parseSize(maxSize);

    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      return res.status(413).json({
        error: 'REQUEST_TOO_LARGE',
        message: `Request size exceeds maximum allowed size of ${maxSize}`,
        received: `${Math.round(parseInt(contentLength) / 1024 / 1024 * 100) / 100}MB`
      });
    }

    next();
  };
};

/**
 * Rate limiting validation (simple implementation)
 */
const validateRateLimit = (maxRequests = 100, windowMs = 60000) => {
  const requests = new Map();

  return (req, res, next) => {
    const key = req.ip + (req.auth?.apiKey || 'anonymous');
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [requestKey, timestamps] of requests.entries()) {
      const validTimestamps = timestamps.filter(ts => ts > windowStart);
      if (validTimestamps.length === 0) {
        requests.delete(requestKey);
      } else {
        requests.set(requestKey, validTimestamps);
      }
    }

    // Check current user's requests
    const userRequests = requests.get(key) || [];
    const validUserRequests = userRequests.filter(ts => ts > windowStart);

    if (validUserRequests.length >= maxRequests) {
      const resetTime = Math.ceil((validUserRequests[0] + windowMs - now) / 1000);

      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': resetTime
      });

      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${Math.round(windowMs / 1000)} seconds`,
        retryAfter: resetTime
      });
    }

    // Add current request
    validUserRequests.push(now);
    requests.set(key, validUserRequests);

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': maxRequests - validUserRequests.length,
      'X-RateLimit-Reset': Math.ceil(windowMs / 1000)
    });

    next();
  };
};

/**
 * Sanitize input to prevent injection attacks
 */
const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    
    // Remove potentially dangerous characters
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  };

  const sanitizeObject = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

/**
 * Parse size string to bytes
 */
function parseSize(size) {
  const units = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/);
  if (!match) throw new Error(`Invalid size format: ${size}`);

  const [, value, unit] = match;
  return Math.floor(parseFloat(value) * units[unit]);
}

/**
 * CORS validation middleware
 */
const validateCORS = (allowedOrigins = []) => {
  return (req, res, next) => {
    const origin = req.get('Origin');

    if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
      return res.status(403).json({
        error: 'CORS_POLICY_VIOLATION',
        message: 'Origin not allowed by CORS policy',
        origin
      });
    }

    next();
  };
};

/**
 * Request timeout middleware
 */
const requestTimeout = (timeoutMs = 30000) => {
  return (req, res, next) => {
    req.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'REQUEST_TIMEOUT',
          message: `Request timed out after ${timeoutMs}ms`
        });
      }
    });

    next();
  };
};

module.exports = {
  validate,
  requireContentType,
  validateRequestSize,
  validateRateLimit,
  sanitizeInput,
  validateCORS,
  requestTimeout
};