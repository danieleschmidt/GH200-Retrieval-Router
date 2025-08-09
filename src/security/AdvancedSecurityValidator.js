/**
 * Advanced Security Validator for GH200 Retrieval Router
 * Comprehensive security validation and threat detection
 */

// Crypto utilities for future enhancements
// const crypto = require('crypto');
const { logger } = require('../utils/logger');

class AdvancedSecurityValidator {
    constructor(options = {}) {
        this.config = {
            maxRequestSize: options.maxRequestSize || 10485760, // 10MB
            rateLimit: options.rateLimit || 1000,
            ipWhitelist: options.ipWhitelist || [],
            enableThreatDetection: options.enableThreatDetection !== false,
            logSecurityEvents: options.logSecurityEvents !== false,
            ...options
        };
        
        this.threatPatterns = this._initializeThreatPatterns();
        this.rateLimitStore = new Map();
        this.suspiciousIPs = new Set();
    }

    _initializeThreatPatterns() {
        return {
            sqlInjection: [
                /(\b(union|select|insert|update|delete|drop|alter|create|grant|revoke)\b)/i,
                /(';|"|;|--|\*|\/\*|\*\/)/,
                /(or\s+1\s*=\s*1|and\s+1\s*=\s*1)/i
            ],
            xss: [
                /<script[^>]*>.*?<\/script>/gi,
                /<iframe[^>]*>.*?<\/iframe>/gi,
                /javascript\s*:/i,
                /on\w+\s*=/i
            ],
            pathTraversal: [
                /\.\.\//,
                /\.\.\\\\/, 
                /%2e%2e%2f/i,
                /%252e%252e%252f/i
            ],
            commandInjection: [
                /[;&|`$(){}[\]]/,
                /\b(cat|ls|ps|whoami|id|pwd|uname)\b/i
            ]
        };
    }

    async validateRequest(req) {
        const validationResult = {
            isValid: true,
            threats: [],
            riskLevel: 'low',
            details: {}
        };

        try {
            // IP validation and rate limiting
            await this._validateIP(req, validationResult);
            
            // Request size validation
            this._validateRequestSize(req, validationResult);
            
            // Content validation for threats
            await this._validateContent(req, validationResult);
            
            // Authorization validation
            this._validateAuthorization(req, validationResult);
            
            // Calculate overall risk level
            this._calculateRiskLevel(validationResult);
            
            if (this.config.logSecurityEvents && validationResult.threats.length > 0) {
                logger.warn('Security validation threats detected', {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    threats: validationResult.threats,
                    riskLevel: validationResult.riskLevel
                });
            }
            
        } catch (error) {
            logger.error('Security validation error', { error: error.message });
            validationResult.isValid = false;
            validationResult.riskLevel = 'high';
            validationResult.threats.push({
                type: 'validation_error',
                severity: 'high',
                description: 'Internal validation error'
            });
        }

        return validationResult;
    }

    async _validateIP(req, result) {
        const clientIP = req.ip || req.connection.remoteAddress;
        
        // Check IP whitelist if configured
        if (this.config.ipWhitelist.length > 0 && !this.config.ipWhitelist.includes(clientIP)) {
            result.threats.push({
                type: 'ip_not_whitelisted',
                severity: 'medium',
                description: 'IP address not in whitelist'
            });
        }
        
        // Check if IP is marked as suspicious
        if (this.suspiciousIPs.has(clientIP)) {
            result.threats.push({
                type: 'suspicious_ip',
                severity: 'high',
                description: 'IP address flagged as suspicious'
            });
        }
        
        // Rate limiting check
        const now = Date.now();
        const ipKey = `rate_${clientIP}`;
        const requests = this.rateLimitStore.get(ipKey) || [];
        
        // Clean old requests (older than 1 minute)
        const recentRequests = requests.filter(timestamp => now - timestamp < 60000);
        
        if (recentRequests.length >= this.config.rateLimit) {
            result.threats.push({
                type: 'rate_limit_exceeded',
                severity: 'high',
                description: 'Rate limit exceeded'
            });
            result.isValid = false;
            
            // Mark IP as suspicious if repeatedly exceeding rate limit
            this.suspiciousIPs.add(clientIP);
        }
        
        recentRequests.push(now);
        this.rateLimitStore.set(ipKey, recentRequests);
        
        result.details.clientIP = clientIP;
        result.details.requestCount = recentRequests.length;
    }

    _validateRequestSize(req, result) {
        const contentLength = parseInt(req.get('Content-Length') || '0');
        
        if (contentLength > this.config.maxRequestSize) {
            result.threats.push({
                type: 'oversized_request',
                severity: 'medium',
                description: `Request size ${contentLength} exceeds maximum ${this.config.maxRequestSize}`
            });
            result.isValid = false;
        }
        
        result.details.contentLength = contentLength;
    }

    async _validateContent(req, result) {
        if (!this.config.enableThreatDetection) return;
        
        const contentToValidate = [
            JSON.stringify(req.query || {}),
            JSON.stringify(req.params || {}),
            JSON.stringify(req.body || {}),
            req.get('User-Agent') || '',
            req.get('Referer') || ''
        ].join(' ');
        
        // Check for various threat patterns
        for (const [threatType, patterns] of Object.entries(this.threatPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(contentToValidate)) {
                    result.threats.push({
                        type: threatType,
                        severity: this._getThreatSeverity(threatType),
                        description: `Potential ${threatType} detected`,
                        pattern: pattern.toString()
                    });
                }
            }
        }
        
        // Check for suspicious encodings
        if (this._containsSuspiciousEncoding(contentToValidate)) {
            result.threats.push({
                type: 'suspicious_encoding',
                severity: 'medium',
                description: 'Suspicious character encoding detected'
            });
        }
    }

    _validateAuthorization(req, result) {
        // Check for authorization bypass attempts
        const authHeader = req.get('Authorization');
        const apiKey = req.get('X-API-Key');
        
        if (authHeader && this._isInvalidAuthFormat(authHeader)) {
            result.threats.push({
                type: 'invalid_auth_format',
                severity: 'medium',
                description: 'Invalid authorization header format'
            });
        }
        
        if (apiKey && this._isWeakApiKey(apiKey)) {
            result.threats.push({
                type: 'weak_api_key',
                severity: 'low',
                description: 'API key appears to be weak or predictable'
            });
        }
    }

    _calculateRiskLevel(result) {
        const severityScores = { low: 1, medium: 3, high: 5 };
        const totalScore = result.threats.reduce((score, threat) => {
            return score + (severityScores[threat.severity] || 1);
        }, 0);
        
        if (totalScore === 0) {
            result.riskLevel = 'low';
        } else if (totalScore <= 3) {
            result.riskLevel = 'medium';
        } else {
            result.riskLevel = 'high';
            result.isValid = false; // High risk requests are invalid
        }
    }

    _getThreatSeverity(threatType) {
        const severityMap = {
            sqlInjection: 'high',
            xss: 'high',
            pathTraversal: 'high',
            commandInjection: 'high',
            suspicious_encoding: 'medium',
            rate_limit_exceeded: 'high',
            oversized_request: 'medium',
            ip_not_whitelisted: 'medium',
            suspicious_ip: 'high',
            invalid_auth_format: 'medium',
            weak_api_key: 'low'
        };
        
        return severityMap[threatType] || 'medium';
    }

    _containsSuspiciousEncoding(content) {
        // Check for various encoding patterns that might hide malicious content
        const suspiciousPatterns = [
            /%[0-9a-fA-F]{2}/, // URL encoding
            /\\u[0-9a-fA-F]{4}/, // Unicode escape
            /\\x[0-9a-fA-F]{2}/, // Hex escape
            /&#x?[0-9a-fA-F]+;/, // HTML entity
            /\+/g // Plus encoding in suspicious contexts
        ];
        
        return suspiciousPatterns.some(pattern => {
            const matches = content.match(pattern);
            return matches && matches.length > 10; // More than 10 encoded chars is suspicious
        });
    }

    _isInvalidAuthFormat(authHeader) {
        // Check for common authorization bypass patterns
        const invalidPatterns = [
            /^Bearer\s*$/i,
            /^Basic\s*$/i,
            /null/i,
            /undefined/i,
            /^\s*$/,
            /[<>"']/
        ];
        
        return invalidPatterns.some(pattern => pattern.test(authHeader));
    }

    _isWeakApiKey(apiKey) {
        // Check for weak API key patterns
        if (apiKey.length < 16) return true; // Too short
        if (/^[0-9]+$/.test(apiKey)) return true; // Only numbers
        if (/^[a-zA-Z]+$/.test(apiKey)) return true; // Only letters
        if (/^(test|demo|sample|admin|key|api)$/i.test(apiKey)) return true; // Common weak keys
        
        return false;
    }

    // Security event logging
    logSecurityEvent(event, details = {}) {
        if (!this.config.logSecurityEvents) return;
        
        const securityEvent = {
            timestamp: new Date().toISOString(),
            event,
            ...details,
            severity: details.severity || 'medium'
        };
        
        logger.warn('Security event logged', securityEvent);
    }

    // Get security statistics
    getSecurityStats() {
        return {
            suspiciousIPCount: this.suspiciousIPs.size,
            rateLimitedIPs: this.rateLimitStore.size,
            threatPatternsActive: Object.keys(this.threatPatterns).length,
            config: {
                maxRequestSize: this.config.maxRequestSize,
                rateLimit: this.config.rateLimit,
                threatDetectionEnabled: this.config.enableThreatDetection
            }
        };
    }

    // Clean up old entries
    cleanup() {
        const now = Date.now();
        
        // Clean rate limit store (remove entries older than 5 minutes)
        for (const [key, requests] of this.rateLimitStore.entries()) {
            const recentRequests = requests.filter(timestamp => now - timestamp < 300000);
            if (recentRequests.length === 0) {
                this.rateLimitStore.delete(key);
            } else {
                this.rateLimitStore.set(key, recentRequests);
            }
        }
        
        logger.debug('Security validator cleanup completed', {
            rateLimitEntries: this.rateLimitStore.size,
            suspiciousIPs: this.suspiciousIPs.size
        });
    }
}

module.exports = AdvancedSecurityValidator;