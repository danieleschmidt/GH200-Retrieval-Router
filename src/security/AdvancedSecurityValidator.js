/**
 * Advanced Security Validator for GH200 Retrieval Router
 * Comprehensive security validation and threat detection
 */

const crypto = require('crypto');
const { logger } = require('../utils/logger');
const { ValidationError, SecurityError } = require('../utils/errorHandler');

class AdvancedSecurityValidator {
    constructor(options = {}) {
        this.config = {
            maxRequestSize: options.maxRequestSize || 10485760, // 10MB
            rateLimit: options.rateLimit || 1000,
            ipWhitelist: options.ipWhitelist || [],
            enableThreatDetection: options.enableThreatDetection !== false,
            logSecurityEvents: options.logSecurityEvents !== false,
            enableDataProtection: options.enableDataProtection !== false,
            enableEncryption: options.enableEncryption !== false,
            enableAuditLog: options.enableAuditLog !== false,
            piiDetectionEnabled: options.piiDetectionEnabled !== false,
            ...options
        };
        
        this.threatPatterns = this._initializeThreatPatterns();
        this.rateLimitStore = new Map();
        this.suspiciousIPs = new Set();
        
        // Advanced security features
        this.auditLog = [];
        this.encryptionKeys = new Map();
        this.securityMetrics = {
            threatsDetected: 0,
            blockedRequests: 0,
            encryptedRequests: 0,
            piiDetections: 0,
            lastThreatDetected: null
        };
        
        // PII detection patterns
        this.piiPatterns = this._initializePIIPatterns();
        
        // Initialize encryption if enabled
        if (this.config.enableEncryption) {
            this._initializeEncryption();
        }
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

    /**
     * Initialize PII detection patterns
     * @private
     */
    _initializePIIPatterns() {
        return {
            email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
            phone: /\b(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
            creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
            ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
        };
    }
    
    /**
     * Initialize encryption system
     * @private
     */
    _initializeEncryption() {
        // Generate master encryption key
        this.masterKey = crypto.randomBytes(32);
        
        logger.info('Encryption system initialized', {
            algorithm: 'aes-256-gcm',
            keySize: 256
        });
    }
    
    /**
     * Encrypt sensitive data
     */
    encryptData(data, keyId = 'default') {
        if (!this.config.enableEncryption) {
            return { encrypted: false, data };
        }
        
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher('aes-256-gcm', this.masterKey);
            
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            const result = {
                encrypted: true,
                data: encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                keyId,
                algorithm: 'aes-256-gcm',
                timestamp: Date.now()
            };
            
            this.securityMetrics.encryptedRequests++;
            
            return result;
        } catch (error) {
            logger.error('Encryption failed', { error: error.message });
            return { encrypted: false, data, error: error.message };
        }
    }
    
    /**
     * Decrypt sensitive data
     */
    decryptData(encryptedData) {
        if (!this.config.enableEncryption || !encryptedData.encrypted) {
            return encryptedData.data;
        }
        
        try {
            const decipher = crypto.createDecipher('aes-256-gcm', this.masterKey);
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            logger.error('Decryption failed', { error: error.message });
            throw new SecurityError('Data decryption failed', 'DECRYPTION_ERROR', {}, error);
        }
    }
    
    /**
     * Detect and mask PII in content
     */
    detectAndMaskPII(content) {
        if (!this.config.piiDetectionEnabled) {
            return { content, piiFound: false, maskedItems: [] };
        }
        
        let maskedContent = content;
        const maskedItems = [];
        
        for (const [type, pattern] of Object.entries(this.piiPatterns)) {
            const matches = content.match(pattern);
            
            if (matches) {
                for (const match of matches) {
                    const masked = this._maskPII(match, type);
                    maskedContent = maskedContent.replace(match, masked);
                    
                    maskedItems.push({
                        type,
                        original: match,
                        masked,
                        position: content.indexOf(match)
                    });
                    
                    this.securityMetrics.piiDetections++;
                }
            }
        }
        
        if (maskedItems.length > 0) {
            this.logSecurityEvent('pii_detected', {
                piiTypes: maskedItems.map(item => item.type),
                count: maskedItems.length
            });
        }
        
        return {
            content: maskedContent,
            piiFound: maskedItems.length > 0,
            maskedItems
        };
    }
    
    /**
     * Mask PII based on type
     * @private
     */
    _maskPII(value, type) {
        switch (type) {
            case 'email':
                return value.replace(/(.{2}).*(@.*)/, '$1***$2');
            case 'ssn':
                return 'XXX-XX-' + value.slice(-4);
            case 'phone':
                return value.replace(/\d/g, 'X').slice(0, -4) + value.slice(-4);
            case 'creditCard':
                return 'XXXX-XXXX-XXXX-' + value.replace(/\D/g, '').slice(-4);
            case 'ipAddress':
                return value.split('.').map((octet, index) => index < 2 ? 'XXX' : octet).join('.');
            default:
                return 'XXXXX';
        }
    }
    
    /**
     * Add audit log entry
     */
    addAuditEntry(action, details = {}) {
        if (!this.config.enableAuditLog) return;
        
        const auditEntry = {
            timestamp: new Date().toISOString(),
            action,
            details: {
                ...details,
                ip: details.ip || 'unknown',
                userAgent: details.userAgent || 'unknown'
            },
            id: crypto.randomUUID()
        };
        
        this.auditLog.push(auditEntry);
        
        // Limit audit log size
        if (this.auditLog.length > 10000) {
            this.auditLog = this.auditLog.slice(-5000); // Keep last 5000 entries
        }
        
        logger.info('Security audit entry added', {
            action,
            id: auditEntry.id,
            details: auditEntry.details
        });
    }
    
    /**
     * Validate compliance requirements
     */
    validateCompliance(req, data) {
        const compliance = {
            gdpr: { compliant: true, issues: [] },
            ccpa: { compliant: true, issues: [] },
            hipaa: { compliant: true, issues: [] }
        };
        
        // GDPR validation
        if (this.config.enableDataProtection) {
            // Check for explicit consent
            if (!req.headers['x-data-consent'] && data && typeof data === 'object') {
                compliance.gdpr.compliant = false;
                compliance.gdpr.issues.push('Missing explicit data processing consent');
            }
            
            // Check data minimization
            if (this._containsExcessivePersonalData(data)) {
                compliance.gdpr.compliant = false;
                compliance.gdpr.issues.push('Potential violation of data minimization principle');
            }
        }
        
        // CCPA validation
        if (req.headers['x-user-location'] === 'california' && !req.headers['x-ccpa-opt-out']) {
            compliance.ccpa.issues.push('California resident detected without CCPA opt-out flag');
        }
        
        // HIPAA validation (simplified)
        if (this._containsHealthInformation(data)) {
            if (!req.headers['x-hipaa-authorization']) {
                compliance.hipaa.compliant = false;
                compliance.hipaa.issues.push('Health information detected without HIPAA authorization');
            }
        }
        
        return compliance;
    }
    
    /**
     * Check if data contains excessive personal information
     * @private
     */
    _containsExcessivePersonalData(data) {
        if (!data || typeof data !== 'object') return false;
        
        const personalDataFields = ['ssn', 'dob', 'address', 'phone', 'email', 'salary', 'medical'];
        const dataString = JSON.stringify(data).toLowerCase();
        
        const foundFields = personalDataFields.filter(field => 
            dataString.includes(field) || this.piiPatterns[field]?.test(dataString)
        );
        
        return foundFields.length > 3; // More than 3 personal data types might be excessive
    }
    
    /**
     * Check if data contains health information
     * @private
     */
    _containsHealthInformation(data) {
        if (!data) return false;
        
        const healthKeywords = [
            'medical', 'health', 'diagnosis', 'treatment', 'medication', 'prescription',
            'doctor', 'hospital', 'patient', 'symptom', 'illness', 'disease'
        ];
        
        const dataString = JSON.stringify(data).toLowerCase();
        return healthKeywords.some(keyword => dataString.includes(keyword));
    }
    
    /**
     * Generate security token
     */
    generateSecurityToken(payload = {}) {
        const tokenData = {
            ...payload,
            timestamp: Date.now(),
            nonce: crypto.randomBytes(16).toString('hex')
        };
        
        const token = crypto
            .createHash('sha256')
            .update(JSON.stringify(tokenData) + this.masterKey.toString('hex'))
            .digest('hex');
            
        return {
            token,
            payload: tokenData,
            expires: Date.now() + 3600000 // 1 hour
        };
    }
    
    /**
     * Verify security token
     */
    verifySecurityToken(token, expectedPayload = {}) {
        try {
            // This is a simplified verification - in production, use proper JWT
            const isValid = token.length === 64 && /^[a-f0-9]+$/.test(token);
            
            if (!isValid) {
                throw new SecurityError('Invalid token format', 'INVALID_TOKEN_FORMAT');
            }
            
            return {
                valid: true,
                payload: expectedPayload
            };
        } catch (error) {
            logger.error('Token verification failed', { error: error.message });
            return {
                valid: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get comprehensive security report
     */
    getSecurityReport() {
        return {
            metrics: { ...this.securityMetrics },
            threatPatterns: Object.keys(this.threatPatterns),
            piiPatterns: Object.keys(this.piiPatterns),
            auditLogSize: this.auditLog.length,
            suspiciousIPCount: this.suspiciousIPs.size,
            rateLimitedIPs: this.rateLimitStore.size,
            encryptionEnabled: this.config.enableEncryption,
            auditLogEnabled: this.config.enableAuditLog,
            piiDetectionEnabled: this.config.piiDetectionEnabled,
            complianceFeatures: {
                gdpr: this.config.enableDataProtection,
                ccpa: this.config.enableDataProtection,
                hipaa: this.config.enableDataProtection
            },
            lastThreatDetected: this.securityMetrics.lastThreatDetected,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Get audit log entries
     */
    getAuditLog(filters = {}) {
        let filteredLog = [...this.auditLog];
        
        if (filters.action) {
            filteredLog = filteredLog.filter(entry => entry.action === filters.action);
        }
        
        if (filters.since) {
            const sinceDate = new Date(filters.since);
            filteredLog = filteredLog.filter(entry => new Date(entry.timestamp) >= sinceDate);
        }
        
        if (filters.limit) {
            filteredLog = filteredLog.slice(-filters.limit);
        }
        
        return {
            entries: filteredLog,
            total: this.auditLog.length,
            filtered: filteredLog.length
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
        
        // Clean old audit log entries (older than 30 days)
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        this.auditLog = this.auditLog.filter(entry => 
            new Date(entry.timestamp).getTime() > thirtyDaysAgo
        );
        
        logger.debug('Security validator cleanup completed', {
            rateLimitEntries: this.rateLimitStore.size,
            suspiciousIPs: this.suspiciousIPs.size,
            auditLogEntries: this.auditLog.length
        });
    }
}

module.exports = AdvancedSecurityValidator;