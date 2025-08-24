/**
 * Generation 2 Security Middleware - Enhanced robustness and reliability
 * Advanced security, validation, monitoring, and error handling
 */

const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');
const crypto = require('crypto');

/**
 * Advanced Request Validation with Security Enhancement
 */
function advancedRequestValidation(req, res, next) {
  try {
    // Generation 2: Enhanced input sanitization
    if (req.body) {
      req.body = sanitizeDeep(req.body);
    }
    
    // Advanced security headers
    res.set({
      'X-Generation': '2',
      'X-Security-Enhanced': 'true',
      'X-Request-ID': req.id,
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    
    // Log security metrics
    logger.info('Generation 2 security validation', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      contentLength: req.get('content-length'),
      securityLevel: 'generation2'
    });
    
    next();
  } catch (error) {
    logger.error('Advanced validation failed', {
      requestId: req.id,
      error: error.message
    });
    
    res.status(400).json({
      error: 'VALIDATION_FAILED',
      message: 'Advanced security validation failed',
      generation: 2,
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Deep sanitization for nested objects
 */
function sanitizeDeep(obj) {
  if (typeof obj === 'string') {
    return obj
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeDeep);
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeDeep(value);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Generation 2: Enhanced Circuit Breaker with Smart Recovery
 */
class SmartCircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
    this.monitorWindow = options.monitorWindow || 300000; // 5 minutes
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = [];
    this.lastFailureTime = null;
    this.successCount = 0;
    this.generation = 2;
  }
  
  async call(operation, context = {}) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        logger.info(`Circuit breaker ${this.name} entering HALF_OPEN state`, {
          generation: 2,
          context
        });
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN - service unavailable`);
      }
    }
    
    try {
      const result = await operation();
      
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= 3) { // Require 3 successes to fully close
          this.state = 'CLOSED';
          this.failures = [];
          logger.info(`Circuit breaker ${this.name} CLOSED - service recovered`, {
            generation: 2,
            successCount: this.successCount,
            context
          });
        }
      }
      
      return result;
      
    } catch (error) {
      this.recordFailure(error, context);
      throw error;
    }
  }
  
  recordFailure(error, context) {
    const now = Date.now();
    this.failures.push({ timestamp: now, error: error.message });
    this.lastFailureTime = now;
    
    // Clean old failures outside monitor window
    this.failures = this.failures.filter(f => now - f.timestamp < this.monitorWindow);
    
    if (this.failures.length >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker ${this.name} OPENED`, {
        generation: 2,
        failureCount: this.failures.length,
        lastError: error.message,
        context
      });
    }
  }
  
  getStats() {
    return {
      name: this.name,
      state: this.state,
      generation: this.generation,
      failureCount: this.failures.length,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount,
      healthy: this.state !== 'OPEN'
    };
  }
}

/**
 * Generation 2: Smart Rate Limiter with Adaptive Limits
 */
function createSmartRateLimiter() {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
      // Adaptive limits based on endpoint complexity
      if (req.path.includes('/search')) return 500; // Search is expensive
      if (req.path.includes('/rag')) return 100;    // RAG is very expensive
      return 1000; // Default
    },
    message: (req) => ({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Generation 2 smart rate limiting active',
      generation: 2,
      endpoint: req.path,
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
      requestId: req.id
    }),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Generation 2 rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('User-Agent'),
        generation: 2,
        requestId: req.id
      });
      
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Generation 2 smart rate limiting active',
        generation: 2,
        endpoint: req.path,
        retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    },
    keyGenerator: (req) => {
      // Smart key generation
      const apiKey = req.get('x-api-key');
      if (apiKey) {
        return `api:${crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16)}`;
      }
      return `ip:${req.ip}`;
    }
  });
  
  return limiter;
}

/**
 * Generation 2: Advanced Error Handler with Context Preservation
 */
function generation2ErrorHandler(error, req, res, next) {
  const errorId = crypto.randomBytes(8).toString('hex');
  const errorContext = {
    errorId,
    generation: 2,
    requestId: req.id,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  };
  
  // Enhanced error logging with context
  logger.error('Generation 2 error handler', {
    ...errorContext,
    error: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code
  });
  
  let statusCode = error.statusCode || error.status || 500;
  let errorType = 'INTERNAL_ERROR';
  let message = 'An internal error occurred';
  
  // Smart error classification
  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorType = 'VALIDATION_ERROR';
    message = 'Request validation failed';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    errorType = 'UNAUTHORIZED';
    message = 'Authentication required';
  } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
    statusCode = 429;
    errorType = 'RATE_LIMIT_EXCEEDED';
    message = 'Rate limit exceeded';
  } else if (error.message.includes('Circuit breaker')) {
    statusCode = 503;
    errorType = 'SERVICE_UNAVAILABLE';
    message = 'Service temporarily unavailable';
  }
  
  // Generation 2 error response
  res.status(statusCode).json({
    error: errorType,
    message,
    generation: 2,
    errorId,
    requestId: req.id,
    timestamp: errorContext.timestamp,
    // Include safe error details in development
    ...(process.env.NODE_ENV === 'development' && {
      details: error.message,
      stack: error.stack?.split('\n').slice(0, 5) // Limit stack trace
    })
  });
}

/**
 * Generation 2: Health and Monitoring Middleware
 */
function generation2MonitoringMiddleware(req, res, next) {
  const startTime = process.hrtime.bigint();
  
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to ms
    
    // Enhanced monitoring metrics
    logger.info('Generation 2 request metrics', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      generation: 2,
      userAgent: req.get('User-Agent'),
      contentLength: res.get('Content-Length'),
      responseHeaders: {
        generation: res.get('X-Generation'),
        security: res.get('X-Security-Enhanced')
      }
    });
    
    // Track performance metrics
    if (duration > 1000) { // Slow request warning
      logger.warn('Generation 2 slow request detected', {
        requestId: req.id,
        duration,
        url: req.url,
        method: req.method
      });
    }
  });
  
  next();
}

module.exports = {
  advancedRequestValidation,
  SmartCircuitBreaker,
  createSmartRateLimiter,
  generation2ErrorHandler,
  generation2MonitoringMiddleware,
  sanitizeDeep
};