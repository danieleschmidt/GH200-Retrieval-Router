/**
 * Advanced Security Middleware for Express
 * Integration with AdvancedSecurityValidator and ComplianceManager
 */

const AdvancedSecurityValidator = require('../security/AdvancedSecurityValidator');
const ComplianceManager = require('../security/ComplianceManager');
const { logger } = require('../utils/logger');

let securityValidator;
let complianceManager;

// Initialize security components
function initializeSecurityMiddleware(options = {}) {
    securityValidator = new AdvancedSecurityValidator(options.security);
    complianceManager = new ComplianceManager(options.compliance);
    
    logger.info('Advanced security middleware initialized', {
        securityValidation: !!securityValidator,
        complianceManagement: !!complianceManager
    });
}

// Main security validation middleware
async function securityValidationMiddleware(req, res, next) {
    if (!securityValidator) {
        logger.error('Security validator not initialized');
        return res.status(500).json({
            error: 'SECURITY_SYSTEM_ERROR',
            message: 'Security system not properly initialized'
        });
    }
    
    try {
        const validationResult = await securityValidator.validateRequest(req);
        
        // Attach validation result to request for downstream use
        req.securityValidation = validationResult;
        
        if (!validationResult.isValid) {
            logger.warn('Request blocked by security validation', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                threats: validationResult.threats,
                riskLevel: validationResult.riskLevel
            });
            
            return res.status(403).json({
                error: 'SECURITY_VALIDATION_FAILED',
                message: 'Request blocked due to security concerns',
                riskLevel: validationResult.riskLevel,
                timestamp: new Date().toISOString()
            });
        }
        
        // Log high-risk but valid requests
        if (validationResult.riskLevel === 'high') {
            logger.warn('High-risk request allowed', {
                ip: req.ip,
                path: req.path,
                threats: validationResult.threats
            });
        }
        
        next();
        
    } catch (error) {
        logger.error('Security validation error', { 
            error: error.message,
            stack: error.stack
        });
        
        return res.status(500).json({
            error: 'SECURITY_VALIDATION_ERROR',
            message: 'Internal security validation error'
        });
    }
}

// GDPR compliance middleware
async function gdprComplianceMiddleware(req, res, next) {
    if (!complianceManager) {
        return next(); // Continue without compliance if not enabled
    }
    
    try {
        // Check for GDPR-specific headers or parameters
        const gdprRequest = req.headers['x-gdpr-request'] || req.query.gdpr_request;
        
        if (gdprRequest) {
            const userId = req.headers['x-user-id'] || req.auth?.userId;
            
            if (!userId) {
                return res.status(400).json({
                    error: 'GDPR_USER_ID_REQUIRED',
                    message: 'User ID required for GDPR requests'
                });
            }
            
            const result = await complianceManager.processGDPRRequest(
                userId,
                gdprRequest,
                req.body
            );
            
            return res.json({
                success: true,
                gdprRequest,
                result,
                processedAt: new Date().toISOString()
            });
        }
        
        // For regular requests, check consent if processing personal data
        if (req.path.includes('/search') || req.path.includes('/vectors')) {
            const userId = req.auth?.userId;
            if (userId) {
                const hasConsent = complianceManager.hasValidConsent(userId, 'data_processing');
                
                if (!hasConsent) {
                    logger.warn('Request blocked due to missing GDPR consent', { userId, path: req.path });
                    return res.status(403).json({
                        error: 'GDPR_CONSENT_REQUIRED',
                        message: 'Valid consent required for data processing',
                        consentUrl: '/api/v1/consent'
                    });
                }
            }
        }
        
        next();
        
    } catch (error) {
        logger.error('GDPR compliance error', { 
            error: error.message,
            path: req.path
        });
        
        return res.status(500).json({
            error: 'COMPLIANCE_ERROR',
            message: 'Internal compliance system error'
        });
    }
}

// Rate limiting with intelligent blocking
function intelligentRateLimitMiddleware(options = {}) {
    const {
        windowMs = 15 * 60 * 1000, // 15 minutes
        max = 1000,
        skipSuccessfulRequests = false,
        skipFailedRequests = false
    } = options;
    
    const requests = new Map();
    const suspiciousIPs = new Set();
    
    return (req, res, next) => {
        const clientIP = req.ip;
        const now = Date.now();
        const windowStart = now - windowMs;
        
        // Get current requests for this IP
        const ipRequests = requests.get(clientIP) || [];
        
        // Filter out old requests
        const recentRequests = ipRequests.filter(timestamp => timestamp > windowStart);
        
        // Check if IP is marked as suspicious
        if (suspiciousIPs.has(clientIP)) {
            logger.warn('Request from suspicious IP blocked', { ip: clientIP });
            return res.status(429).json({
                error: 'SUSPICIOUS_IP_BLOCKED',
                message: 'IP address temporarily blocked due to suspicious activity',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }
        
        // Check rate limit
        if (recentRequests.length >= max) {
            // Mark IP as suspicious if consistently hitting rate limits
            if (recentRequests.length > max * 1.5) {
                suspiciousIPs.add(clientIP);
                setTimeout(() => suspiciousIPs.delete(clientIP), windowMs * 2);
            }
            
            logger.warn('Rate limit exceeded', { 
                ip: clientIP, 
                requests: recentRequests.length,
                limit: max
            });
            
            return res.status(429).json({
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests, please try again later',
                limit: max,
                window: windowMs,
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }
        
        // Add current request
        recentRequests.push(now);
        requests.set(clientIP, recentRequests);
        
        // Clean up old entries periodically
        if (Math.random() < 0.01) { // 1% chance
            for (const [ip, timestamps] of requests.entries()) {
                const recent = timestamps.filter(t => t > windowStart);
                if (recent.length === 0) {
                    requests.delete(ip);
                } else {
                    requests.set(ip, recent);
                }
            }
        }
        
        // Add rate limit headers
        res.set({
            'X-RateLimit-Limit': max,
            'X-RateLimit-Remaining': Math.max(0, max - recentRequests.length),
            'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
        });
        
        next();
    };
}

// Data encryption middleware for sensitive responses
function dataEncryptionMiddleware(req, res, next) {
    if (!complianceManager) {
        return next();
    }
    
    const originalJson = res.json;
    
    res.json = function(data) {
        try {
            // Check if data contains sensitive information and user has consented
            const userId = req.auth?.userId;
            
            if (userId && data && typeof data === 'object') {
                // Encrypt sensitive data if required
                const encryptedData = complianceManager.encryptSensitiveData(data, {
                    userId,
                    endpoint: req.path,
                    timestamp: new Date().toISOString()
                });
                
                return originalJson.call(this, encryptedData);
            }
            
            return originalJson.call(this, data);
        } catch (error) {
            logger.error('Data encryption middleware error', { 
                error: error.message,
                path: req.path
            });
            return originalJson.call(this, data);
        }
    };
    
    next();
}

// Security headers middleware
function securityHeadersMiddleware(req, res, next) {
    // Advanced security headers
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin'
    });
    
    // Remove server signature
    res.removeHeader('X-Powered-By');
    
    next();
}

// Request sanitization middleware
function requestSanitizationMiddleware(req, res, next) {
    // Sanitize query parameters
    if (req.query) {
        for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') {
                req.query[key] = value.replace(/[<>]/g, '').trim();
            }
        }
    }
    
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }
    
    next();
}

function sanitizeObject(obj) {
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }
    
    if (obj !== null && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                sanitized[key] = value.replace(/[<>]/g, '').trim();
            } else {
                sanitized[key] = sanitizeObject(value);
            }
        }
        return sanitized;
    }
    
    return obj;
}

module.exports = {
    initializeSecurityMiddleware,
    securityValidationMiddleware,
    gdprComplianceMiddleware,
    intelligentRateLimitMiddleware,
    dataEncryptionMiddleware,
    securityHeadersMiddleware,
    requestSanitizationMiddleware
};