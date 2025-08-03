/**
 * Authentication middleware for GH200 Retrieval Router
 */

const logger = require('../utils/logger');

/**
 * API key authentication middleware
 */
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    logger.warn('Authentication failed: No API key provided', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });

    return res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'API key required. Provide in X-API-Key header or Authorization header'
    });
  }

  // Validate API key (in production, this would check against a secure store)
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  
  if (validApiKeys.length > 0 && !validApiKeys.includes(apiKey)) {
    logger.warn('Authentication failed: Invalid API key', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      apiKeyPrefix: apiKey.substring(0, 8) + '...'
    });

    return res.status(401).json({
      error: 'AUTHENTICATION_FAILED',
      message: 'Invalid API key'
    });
  }

  // Set authenticated user context
  req.auth = {
    apiKey: apiKey.substring(0, 8) + '...',
    authenticated: true,
    timestamp: new Date().toISOString()
  };

  logger.debug('Authentication successful', {
    ip: req.ip,
    endpoint: req.path,
    apiKeyPrefix: req.auth.apiKey
  });

  next();
};

/**
 * Optional authentication middleware (doesn't fail if no auth provided)
 */
const optionalAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (apiKey) {
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
    
    if (validApiKeys.length === 0 || validApiKeys.includes(apiKey)) {
      req.auth = {
        apiKey: apiKey.substring(0, 8) + '...',
        authenticated: true,
        timestamp: new Date().toISOString()
      };
    }
  }

  if (!req.auth) {
    req.auth = {
      authenticated: false,
      timestamp: new Date().toISOString()
    };
  }

  next();
};

/**
 * Role-based access control middleware
 */
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.auth || !req.auth.authenticated) {
      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required for this endpoint'
      });
    }

    // In a real implementation, roles would be associated with API keys
    // For now, we'll use a simple role mapping based on API key prefixes
    const userRole = getUserRole(req.auth.apiKey);

    if (!hasPermission(userRole, requiredRole)) {
      logger.warn('Authorization failed: Insufficient permissions', {
        userRole,
        requiredRole,
        endpoint: req.path,
        ip: req.ip
      });

      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `Role '${requiredRole}' required for this endpoint`
      });
    }

    req.auth.role = userRole;
    next();
  };
};

/**
 * Admin access middleware
 */
const requireAdmin = requireRole('admin');

/**
 * Write access middleware (for data modification operations)
 */
const requireWrite = requireRole('write');

/**
 * Read access middleware (for data reading operations)
 */
const requireRead = requireRole('read');

/**
 * Get user role based on API key
 */
function getUserRole(apiKeyPrefix) {
  // Simple role mapping based on API key prefix
  // In production, this would lookup roles from a secure database
  const roleMapping = {
    'admin123': 'admin',
    'write456': 'write',
    'read789': 'read'
  };

  return roleMapping[apiKeyPrefix] || 'read'; // Default to read-only
}

/**
 * Check if user role has permission for required role
 */
function hasPermission(userRole, requiredRole) {
  const roleHierarchy = {
    'admin': ['admin', 'write', 'read'],
    'write': ['write', 'read'],
    'read': ['read']
  };

  return roleHierarchy[userRole]?.includes(requiredRole) || false;
}

/**
 * Create audit log entry for authenticated requests
 */
const auditLogger = (req, res, next) => {
  if (req.auth && req.auth.authenticated) {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the request after response is sent
      setImmediate(() => {
        logger.info('API request audit', {
          method: req.method,
          endpoint: req.path,
          query: req.query,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          apiKeyPrefix: req.auth.apiKey,
          role: req.auth.role,
          statusCode: res.statusCode,
          responseTime: Date.now() - req.startTime,
          timestamp: new Date().toISOString()
        });
      });

      originalSend.call(this, data);
    };
  }

  next();
};

module.exports = {
  apiKeyAuth,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireWrite,
  requireRead,
  auditLogger
};