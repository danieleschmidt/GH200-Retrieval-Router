/**
 * Advanced Security Framework for GH200 Retrieval Router
 * Generation 2: Robustness and Reliability
 */

const crypto = require('crypto');
const { logger } = require('../../utils/logger');
const { EventEmitter } = require('events');

/**
 * Security Threat Detection and Prevention
 */
class SecurityThreatDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      maxRequestsPerIP: options.maxRequestsPerIP || 100,
      timeWindow: options.timeWindow || 60000, // 1 minute
      suspiciousPatterns: options.suspiciousPatterns || [
        /(<script[^>]*>.*?<\/script>)/gi,
        /(javascript:)/gi,
        /(data:text\/html)/gi,
        /(eval\s*\()/gi,
        /(union\s+select)/gi,
        /(drop\s+table)/gi,
        /(insert\s+into)/gi,
        /(delete\s+from)/gi
      ],
      blockedUserAgents: options.blockedUserAgents || [
        /bot/i,
        /crawler/i,
        /spider/i,
        /scraper/i
      ],
      enableGeoBlocking: options.enableGeoBlocking || false,
      blockedCountries: options.blockedCountries || [],
      enableAnomalyDetection: options.enableAnomalyDetection !== false,
      ...options
    };

    this.requestTracker = new Map();
    this.threatMetrics = {
      totalRequests: 0,
      blockedRequests: 0,
      suspiciousRequests: 0,
      rateLimitViolations: 0,
      xssAttempts: 0,
      sqlInjectionAttempts: 0,
      botDetections: 0
    };

    this.anomalyBaseline = {
      avgRequestSize: 0,
      avgResponseTime: 0,
      commonPaths: new Set(),
      requestCount: 0
    };
  }

  /**
   * Analyze incoming request for security threats
   */
  analyzeRequest(req) {
    this.threatMetrics.totalRequests++;
    
    const threats = [];
    const clientIP = this.getClientIP(req);
    const userAgent = req.get('User-Agent') || '';
    
    // Rate limiting check
    const rateLimitThreat = this.checkRateLimit(clientIP);
    if (rateLimitThreat) threats.push(rateLimitThreat);
    
    // User agent analysis
    const userAgentThreat = this.analyzeUserAgent(userAgent);
    if (userAgentThreat) threats.push(userAgentThreat);
    
    // Request payload analysis
    const payloadThreats = this.analyzePayload(req);
    threats.push(...payloadThreats);
    
    // Path traversal detection
    const pathThreat = this.checkPathTraversal(req.path);
    if (pathThreat) threats.push(pathThreat);
    
    // Anomaly detection
    const anomalyThreat = this.detectAnomalies(req);
    if (anomalyThreat) threats.push(anomalyThreat);
    
    // Update baseline for anomaly detection
    this.updateBaseline(req);
    
    const riskScore = this.calculateRiskScore(threats);
    
    const analysis = {
      clientIP,
      userAgent,
      threats,
      riskScore,
      blocked: riskScore >= 0.7, // Block high risk requests
      timestamp: new Date().toISOString()
    };
    
    // Log and emit events for threats
    if (threats.length > 0) {
      this.threatMetrics.suspiciousRequests++;
      
      logger.warn('Security threat detected', {
        ip: clientIP,
        path: req.path,
        threats: threats.map(t => t.type),
        riskScore,
        blocked: analysis.blocked
      });
      
      this.emit('threat:detected', analysis);
    }
    
    if (analysis.blocked) {
      this.threatMetrics.blockedRequests++;
      this.emit('threat:blocked', analysis);
    }
    
    return analysis;
  }

  /**
   * Check rate limiting violations
   */
  checkRateLimit(clientIP) {
    const now = Date.now();
    const windowStart = now - this.config.timeWindow;
    
    // Get or create request history for IP
    if (!this.requestTracker.has(clientIP)) {
      this.requestTracker.set(clientIP, []);
    }
    
    const requests = this.requestTracker.get(clientIP);
    
    // Remove old requests outside the time window
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    
    // Add current request
    validRequests.push(now);
    this.requestTracker.set(clientIP, validRequests);
    
    // Check if rate limit exceeded
    if (validRequests.length > this.config.maxRequestsPerIP) {
      this.threatMetrics.rateLimitViolations++;
      
      return {
        type: 'RATE_LIMIT_VIOLATION',
        severity: 'high',
        description: `IP ${clientIP} exceeded rate limit: ${validRequests.length} requests in ${this.config.timeWindow}ms`,
        metadata: {
          requestCount: validRequests.length,
          timeWindow: this.config.timeWindow,
          limit: this.config.maxRequestsPerIP
        }
      };
    }
    
    return null;
  }

  /**
   * Analyze user agent for suspicious patterns
   */
  analyzeUserAgent(userAgent) {
    for (const pattern of this.config.blockedUserAgents) {
      if (pattern.test(userAgent)) {
        this.threatMetrics.botDetections++;
        
        return {
          type: 'SUSPICIOUS_USER_AGENT',
          severity: 'medium',
          description: `Blocked user agent pattern: ${pattern}`,
          metadata: { userAgent, pattern: pattern.toString() }
        };
      }
    }
    
    // Check for missing or suspicious user agent
    if (!userAgent || userAgent.length < 10) {
      return {
        type: 'MISSING_USER_AGENT',
        severity: 'low',
        description: 'Missing or very short user agent',
        metadata: { userAgent }
      };
    }
    
    return null;
  }

  /**
   * Analyze request payload for malicious content
   */
  analyzePayload(req) {
    const threats = [];
    
    // Analyze query parameters
    const queryString = JSON.stringify(req.query);
    const queryThreats = this.scanForMaliciousPatterns(queryString, 'QUERY_PARAMETER');
    threats.push(...queryThreats);
    
    // Analyze request body if present
    if (req.body) {
      const bodyString = JSON.stringify(req.body);
      const bodyThreats = this.scanForMaliciousPatterns(bodyString, 'REQUEST_BODY');
      threats.push(...bodyThreats);
    }
    
    // Analyze headers
    const headerString = JSON.stringify(req.headers);
    const headerThreats = this.scanForMaliciousPatterns(headerString, 'REQUEST_HEADERS');
    threats.push(...headerThreats);
    
    return threats;
  }

  /**
   * Scan content for malicious patterns
   */
  scanForMaliciousPatterns(content, location) {
    const threats = [];
    
    for (const pattern of this.config.suspiciousPatterns) {
      const matches = content.match(pattern);
      
      if (matches) {
        let type = 'SUSPICIOUS_PATTERN';
        
        // Classify specific threat types
        if (pattern.toString().includes('script') || pattern.toString().includes('javascript')) {
          type = 'XSS_ATTEMPT';
          this.threatMetrics.xssAttempts++;
        } else if (pattern.toString().includes('union') || pattern.toString().includes('drop')) {
          type = 'SQL_INJECTION_ATTEMPT';
          this.threatMetrics.sqlInjectionAttempts++;
        }
        
        threats.push({
          type,
          severity: type.includes('XSS') || type.includes('SQL') ? 'high' : 'medium',
          description: `Malicious pattern detected in ${location}`,
          metadata: {
            location,
            pattern: pattern.toString(),
            matches: matches.slice(0, 3) // Limit to first 3 matches
          }
        });
      }
    }
    
    return threats;
  }

  /**
   * Check for path traversal attempts
   */
  checkPathTraversal(path) {
    const traversalPatterns = [
      /\.\.\//g,
      /\.\.\\/g,
      /%2e%2e%2f/gi,
      /%2e%2e%5c/gi,
      /etc\/passwd/gi,
      /proc\/self/gi
    ];
    
    for (const pattern of traversalPatterns) {
      if (pattern.test(path)) {
        return {
          type: 'PATH_TRAVERSAL_ATTEMPT',
          severity: 'high',
          description: `Path traversal pattern detected: ${pattern}`,
          metadata: { path, pattern: pattern.toString() }
        };
      }
    }
    
    return null;
  }

  /**
   * Detect anomalous request patterns
   */
  detectAnomalies(req) {
    if (!this.config.enableAnomalyDetection || this.anomalyBaseline.requestCount < 100) {
      return null;
    }
    
    const anomalies = [];
    
    // Check request size anomaly
    const requestSize = JSON.stringify(req.body || {}).length;
    if (requestSize > this.anomalyBaseline.avgRequestSize * 10) {
      anomalies.push({
        type: 'REQUEST_SIZE_ANOMALY',
        severity: 'medium',
        description: `Request size significantly larger than baseline`,
        metadata: {
          currentSize: requestSize,
          baselineSize: this.anomalyBaseline.avgRequestSize
        }
      });
    }
    
    // Check unusual path access
    if (!this.anomalyBaseline.commonPaths.has(req.path) && this.anomalyBaseline.commonPaths.size > 50) {
      anomalies.push({
        type: 'UNUSUAL_PATH_ACCESS',
        severity: 'low',
        description: `Access to uncommon path`,
        metadata: { path: req.path }
      });
    }
    
    return anomalies.length > 0 ? anomalies[0] : null;
  }

  /**
   * Update baseline metrics for anomaly detection
   */
  updateBaseline(req) {
    const requestSize = JSON.stringify(req.body || {}).length;
    
    // Update running average for request size
    this.anomalyBaseline.avgRequestSize = 
      (this.anomalyBaseline.avgRequestSize * this.anomalyBaseline.requestCount + requestSize) / 
      (this.anomalyBaseline.requestCount + 1);
    
    // Track common paths
    this.anomalyBaseline.commonPaths.add(req.path);
    
    // Limit path tracking to prevent memory leaks
    if (this.anomalyBaseline.commonPaths.size > 1000) {
      const pathArray = Array.from(this.anomalyBaseline.commonPaths);
      this.anomalyBaseline.commonPaths = new Set(pathArray.slice(-500));
    }
    
    this.anomalyBaseline.requestCount++;
  }

  /**
   * Calculate overall risk score for a request
   */
  calculateRiskScore(threats) {
    if (threats.length === 0) return 0;
    
    const severityWeights = {
      low: 0.2,
      medium: 0.5,
      high: 0.9
    };
    
    let totalScore = 0;
    let maxSeverity = 0;
    
    for (const threat of threats) {
      const severityScore = severityWeights[threat.severity] || 0.5;
      totalScore += severityScore;
      maxSeverity = Math.max(maxSeverity, severityScore);
    }
    
    // Combine threat count and maximum severity
    const countFactor = Math.min(threats.length / 5, 1); // Cap at 5 threats
    return Math.min(maxSeverity + (countFactor * 0.3), 1);
  }

  /**
   * Get client IP address from request
   */
  getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
  }

  /**
   * Get security metrics
   */
  getMetrics() {
    const totalRequests = this.threatMetrics.totalRequests;
    
    return {
      ...this.threatMetrics,
      blockRate: totalRequests > 0 ? this.threatMetrics.blockedRequests / totalRequests : 0,
      threatRate: totalRequests > 0 ? this.threatMetrics.suspiciousRequests / totalRequests : 0,
      activeIPs: this.requestTracker.size,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset metrics and tracking data
   */
  reset() {
    this.requestTracker.clear();
    this.threatMetrics = {
      totalRequests: 0,
      blockedRequests: 0,
      suspiciousRequests: 0,
      rateLimitViolations: 0,
      xssAttempts: 0,
      sqlInjectionAttempts: 0,
      botDetections: 0
    };
    
    this.anomalyBaseline = {
      avgRequestSize: 0,
      avgResponseTime: 0,
      commonPaths: new Set(),
      requestCount: 0
    };
    
    logger.info('Security threat detector metrics reset');
  }
}

/**
 * Advanced Security Framework
 */
class AdvancedSecurityFramework extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      enableThreatDetection: options.enableThreatDetection !== false,
      enableEncryption: options.enableEncryption !== false,
      enableAuditLogging: options.enableAuditLogging !== false,
      secretRotationInterval: options.secretRotationInterval || 86400000, // 24 hours
      encryptionAlgorithm: options.encryptionAlgorithm || 'aes-256-gcm',
      ...options
    };

    this.threatDetector = new SecurityThreatDetector(options.threatDetection);
    this.encryptionKeys = new Map();
    this.auditLog = [];
    this.secrets = new Map();
    
    this.isInitialized = false;
  }

  /**
   * Initialize the security framework
   */
  async initialize() {
    logger.info('Initializing Advanced Security Framework...');
    
    try {
      // Initialize threat detection
      if (this.config.enableThreatDetection) {
        this.threatDetector.on('threat:detected', (analysis) => {
          this.auditEvent('THREAT_DETECTED', analysis);
        });
        
        this.threatDetector.on('threat:blocked', (analysis) => {
          this.auditEvent('THREAT_BLOCKED', analysis);
        });
      }
      
      // Generate initial encryption keys
      if (this.config.enableEncryption) {
        await this.generateEncryptionKey('default');
      }
      
      // Set up secret rotation
      this.setupSecretRotation();
      
      this.isInitialized = true;
      
      logger.info('Advanced Security Framework initialized successfully');
      this.emit('security:initialized');
      
      return { success: true, status: 'initialized' };
      
    } catch (error) {
      logger.error('Failed to initialize Advanced Security Framework', { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Create security middleware for Express
   */
  createSecurityMiddleware() {
    return (req, res, next) => {
      if (!this.config.enableThreatDetection) {
        return next();
      }
      
      // Analyze request for threats
      const analysis = this.threatDetector.analyzeRequest(req);
      
      // Block request if high risk
      if (analysis.blocked) {
        this.auditEvent('REQUEST_BLOCKED', {
          ip: analysis.clientIP,
          path: req.path,
          userAgent: analysis.userAgent,
          threats: analysis.threats,
          riskScore: analysis.riskScore
        });
        
        return res.status(403).json({
          error: 'SECURITY_THREAT_DETECTED',
          message: 'Request blocked due to security policy violation',
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }
      
      // Add security headers
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      
      // Attach security context to request
      req.security = {
        analysis,
        threatDetector: this.threatDetector
      };
      
      next();
    };
  }

  /**
   * Generate encryption key
   */
  async generateEncryptionKey(keyId) {
    const key = crypto.randomBytes(32); // 256-bit key
    const iv = crypto.randomBytes(16);  // 128-bit IV
    
    this.encryptionKeys.set(keyId, { key, iv, created: Date.now() });
    
    logger.info(`Generated encryption key: ${keyId}`);
    this.auditEvent('ENCRYPTION_KEY_GENERATED', { keyId });
    
    return keyId;
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(data, keyId = 'default') {
    if (!this.config.enableEncryption) {
      return data;
    }
    
    const keyData = this.encryptionKeys.get(keyId);
    if (!keyData) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }
    
    const cipher = crypto.createCipher(this.config.encryptionAlgorithm, keyData.key);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return {
      encrypted,
      keyId,
      algorithm: this.config.encryptionAlgorithm,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData, keyId) {
    if (!this.config.enableEncryption || typeof encryptedData === 'string') {
      return encryptedData;
    }
    
    const keyData = this.encryptionKeys.get(keyId || encryptedData.keyId);
    if (!keyData) {
      throw new Error(`Decryption key not found: ${keyId || encryptedData.keyId}`);
    }
    
    const decipher = crypto.createDecipher(
      encryptedData.algorithm || this.config.encryptionAlgorithm,
      keyData.key
    );
    
    let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Store secret securely
   */
  storeSecret(secretId, value) {
    const encryptedValue = this.encrypt(value);
    this.secrets.set(secretId, encryptedValue);
    
    this.auditEvent('SECRET_STORED', { secretId });
    logger.info(`Stored secret: ${secretId}`);
  }

  /**
   * Retrieve secret securely
   */
  getSecret(secretId) {
    const encryptedValue = this.secrets.get(secretId);
    if (!encryptedValue) {
      throw new Error(`Secret not found: ${secretId}`);
    }
    
    return this.decrypt(encryptedValue);
  }

  /**
   * Set up automatic secret rotation
   */
  setupSecretRotation() {
    if (!this.config.secretRotationInterval) return;
    
    setInterval(() => {
      this.rotateEncryptionKeys();
    }, this.config.secretRotationInterval);
    
    logger.info('Secret rotation scheduled', {
      interval: this.config.secretRotationInterval
    });
  }

  /**
   * Rotate encryption keys
   */
  async rotateEncryptionKeys() {
    logger.info('Starting encryption key rotation...');
    
    const oldKeys = Array.from(this.encryptionKeys.keys());
    
    // Generate new keys
    for (const keyId of oldKeys) {
      await this.generateEncryptionKey(`${keyId}_new`);
    }
    
    // Keep old keys for a grace period before deletion
    setTimeout(() => {
      for (const keyId of oldKeys) {
        this.encryptionKeys.delete(keyId);
        logger.info(`Deleted old encryption key: ${keyId}`);
      }
    }, 300000); // 5 minutes grace period
    
    this.auditEvent('ENCRYPTION_KEYS_ROTATED', { rotatedKeys: oldKeys.length });
    logger.info('Encryption key rotation completed');
  }

  /**
   * Log security audit event
   */
  auditEvent(eventType, details = {}) {
    if (!this.config.enableAuditLogging) return;
    
    const auditEntry = {
      timestamp: new Date().toISOString(),
      eventType,
      details,
      severity: this.getEventSeverity(eventType),
      id: crypto.randomUUID()
    };
    
    this.auditLog.push(auditEntry);
    
    // Limit audit log size
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }
    
    logger.info('Security audit event', auditEntry);
    this.emit('security:audit', auditEntry);
  }

  /**
   * Get event severity level
   */
  getEventSeverity(eventType) {
    const severityMap = {
      'THREAT_BLOCKED': 'high',
      'THREAT_DETECTED': 'medium',
      'REQUEST_BLOCKED': 'high',
      'ENCRYPTION_KEY_GENERATED': 'low',
      'ENCRYPTION_KEYS_ROTATED': 'medium',
      'SECRET_STORED': 'low'
    };
    
    return severityMap[eventType] || 'low';
  }

  /**
   * Get security metrics and status
   */
  getSecurityStatus() {
    const threatMetrics = this.threatDetector.getMetrics();
    
    return {
      framework: {
        initialized: this.isInitialized,
        threatDetectionEnabled: this.config.enableThreatDetection,
        encryptionEnabled: this.config.enableEncryption,
        auditLoggingEnabled: this.config.enableAuditLogging
      },
      threats: threatMetrics,
      encryption: {
        keysCount: this.encryptionKeys.size,
        secretsCount: this.secrets.size
      },
      audit: {
        totalEvents: this.auditLog.length,
        recentEvents: this.auditLog.slice(-10)
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Health check for security framework
   */
  async healthCheck() {
    const healthy = this.isInitialized && 
                   (this.config.enableEncryption ? this.encryptionKeys.size > 0 : true);
    
    return {
      healthy,
      message: healthy ? 'Security framework operational' : 'Security framework not properly initialized',
      status: this.getSecurityStatus(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Shutdown security framework
   */
  async shutdown() {
    logger.info('Shutting down Advanced Security Framework...');
    
    // Clear sensitive data
    this.encryptionKeys.clear();
    this.secrets.clear();
    this.auditLog.length = 0;
    
    this.isInitialized = false;
    
    this.emit('security:shutdown');
    logger.info('Advanced Security Framework shutdown complete');
  }
}

module.exports = {
  AdvancedSecurityFramework,
  SecurityThreatDetector
};