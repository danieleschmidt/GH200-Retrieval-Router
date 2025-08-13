/**
 * Advanced Validation Framework
 * Comprehensive input validation, sanitization, and schema enforcement
 */

const EventEmitter = require('events');
const Joi = require('joi');
const { logger } = require('../../utils/logger');
const crypto = require('crypto');

class AdvancedValidationFramework extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            strictMode: true,
            sanitization: {
                enabled: true,
                stripHtml: true,
                normalizeWhitespace: true,
                maxStringLength: 10000
            },
            security: {
                detectSqlInjection: true,
                detectXss: true,
                detectCommandInjection: true,
                maxPayloadSize: 10 * 1024 * 1024 // 10MB
            },
            performance: {
                cacheSchemas: true,
                cacheValidationResults: true,
                cacheTtl: 300000 // 5 minutes
            },
            customValidators: new Map(),
            ...config
        };
        
        this.schemas = new Map();
        this.validationCache = new Map();
        this.sanitizers = new Map();
        this.securityPatterns = new Map();
        this.validationStats = {
            totalValidations: 0,
            passedValidations: 0,
            failedValidations: 0,
            sanitizedInputs: 0,
            threatsDetected: 0
        };
        
        this.isInitialized = false;
        
        this.initializeDefaultSchemas();
        this.initializeSanitizers();
        this.initializeSecurityPatterns();
    }

    async initialize() {
        logger.info('Initializing Advanced Validation Framework');
        
        this.isInitialized = true;
        this.emit('initialized');
        
        logger.info('Advanced Validation Framework initialized');
        return true;
    }

    initializeDefaultSchemas() {
        // Vector search query schema
        this.schemas.set('searchQuery', Joi.object({
            query: Joi.string().required().min(1).max(1000),
            k: Joi.number().integer().min(1).max(1000).default(10),
            threshold: Joi.number().min(0).max(1).default(0.5),
            filters: Joi.object().optional(),
            includeMetadata: Joi.boolean().default(false),
            timeout: Joi.number().integer().min(100).max(30000).default(5000)
        }));
        
        // Vector data schema
        this.schemas.set('vectorData', Joi.object({
            id: Joi.string().required().pattern(/^[a-zA-Z0-9_-]+$/),
            vector: Joi.array().items(Joi.number()).min(1).max(4096).required(),
            metadata: Joi.object().optional(),
            timestamp: Joi.date().iso().optional()
        }));
        
        // User authentication schema
        this.schemas.set('userAuth', Joi.object({
            username: Joi.string().alphanum().min(3).max(30).required(),
            password: Joi.string().min(8).max(128).required(),
            email: Joi.string().email().optional(),
            apiKey: Joi.string().pattern(/^[a-zA-Z0-9_-]{32,}$/).optional()
        }).xor('password', 'apiKey'));
        
        // Configuration schema
        this.schemas.set('configuration', Joi.object({
            graceMemory: Joi.object({
                enabled: Joi.boolean().default(true),
                poolSize: Joi.number().integer().min(1).max(1000).default(100)
            }),
            nvlink: Joi.object({
                enabled: Joi.boolean().default(true),
                nodes: Joi.number().integer().min(1).max(32).default(4)
            }),
            performance: Joi.object({
                caching: Joi.boolean().default(true),
                concurrent: Joi.boolean().default(true),
                maxConnections: Joi.number().integer().min(1).max(10000).default(1000)
            })
        }));
        
        // Health check schema
        this.schemas.set('healthCheck', Joi.object({
            service: Joi.string().valid('database', 'cache', 'search', 'all').required(),
            detailed: Joi.boolean().default(false),
            timeout: Joi.number().integer().min(1000).max(30000).default(5000)
        }));
        
        // Metrics query schema
        this.schemas.set('metricsQuery', Joi.object({
            metric: Joi.string().valid('latency', 'throughput', 'errors', 'memory', 'cpu').required(),
            timeRange: Joi.string().valid('1h', '6h', '24h', '7d', '30d').default('1h'),
            aggregation: Joi.string().valid('avg', 'min', 'max', 'sum', 'count').default('avg'),
            granularity: Joi.string().valid('1m', '5m', '1h', '1d').default('5m')
        }));
    }

    initializeSanitizers() {
        // HTML sanitizer
        this.sanitizers.set('html', (input) => {
            if (typeof input !== 'string') return input;
            
            return input
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<[^>]*>/g, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '');
        });
        
        // SQL injection sanitizer
        this.sanitizers.set('sql', (input) => {
            if (typeof input !== 'string') return input;
            
            return input
                .replace(/['";]/g, '')
                .replace(/--/g, '')
                .replace(/\/\*/g, '')
                .replace(/\*\//g, '')
                .replace(/\bUNION\b/gi, '')
                .replace(/\bSELECT\b/gi, '')
                .replace(/\bINSERT\b/gi, '')
                .replace(/\bUPDATE\b/gi, '')
                .replace(/\bDELETE\b/gi, '')
                .replace(/\bDROP\b/gi, '');
        });
        
        // Command injection sanitizer
        this.sanitizers.set('command', (input) => {
            if (typeof input !== 'string') return input;
            
            return input
                .replace(/[;&|`$(){}[\]]/g, '')
                .replace(/\.\./g, '')
                .replace(/\//g, '')
                .replace(/\\/g, '');
        });
        
        // General text sanitizer
        this.sanitizers.set('text', (input) => {
            if (typeof input !== 'string') return input;
            
            let sanitized = input;
            
            // Normalize whitespace
            if (this.config.sanitization.normalizeWhitespace) {
                sanitized = sanitized.replace(/\s+/g, ' ').trim();
            }
            
            // Limit length
            if (sanitized.length > this.config.sanitization.maxStringLength) {
                sanitized = sanitized.substring(0, this.config.sanitization.maxStringLength);
            }
            
            // Remove control characters
            sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            
            return sanitized;
        });
        
        // Number sanitizer
        this.sanitizers.set('number', (input) => {
            if (typeof input === 'number') return input;
            if (typeof input === 'string') {
                const parsed = parseFloat(input);
                return isNaN(parsed) ? null : parsed;
            }
            return null;
        });
        
        // Email sanitizer
        this.sanitizers.set('email', (input) => {
            if (typeof input !== 'string') return input;
            
            return input.toLowerCase().trim();
        });
    }

    initializeSecurityPatterns() {
        // SQL injection patterns
        this.securityPatterns.set('sqlInjection', [
            /(\bUNION\b.*\bSELECT\b)|(\bSELECT\b.*\bFROM\b)|(\bINSERT\b.*\bINTO\b)|(\bUPDATE\b.*\bSET\b)|(\bDELETE\b.*\bFROM\b)/i,
            /('|(\\')|(--)|(#)|(\|)|(\*)|(\;))/,
            /(\bOR\b.*=.*)|(\bAND\b.*=.*)/i,
            /\b(DROP|CREATE|ALTER|TRUNCATE)\b/i
        ]);
        
        // XSS patterns
        this.securityPatterns.set('xss', [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe|<object|<embed/gi,
            /expression\s*\(/gi,
            /vbscript:/gi
        ]);
        
        // Command injection patterns
        this.securityPatterns.set('commandInjection', [
            /[;&|`]/,
            /\$\([^)]*\)/,
            /\${[^}]*}/,
            /\.\.\//,
            /\/etc\/passwd|\/etc\/shadow/,
            /\b(cat|ls|pwd|whoami|id|uname)\b/
        ]);
        
        // Path traversal patterns
        this.securityPatterns.set('pathTraversal', [
            /\.\.\//,
            /\.\.\\/,
            /%2e%2e%2f/i,
            /%2e%2e%5c/i,
            /\/etc\/|\/proc\/|\/sys\//,
            /c:\\|\\windows\\|\\system32\\/i
        ]);
        
        // NoSQL injection patterns
        this.securityPatterns.set('nosqlInjection', [
            /\$where/i,
            /\$regex/i,
            /\$gt|\$lt|\$gte|\$lte|\$ne/i,
            /\$in|\$nin/i,
            /\$or|\$and|\$not/i
        ]);
    }

    async validate(data, schemaName, options = {}) {
        const validationId = this.generateValidationId(data, schemaName);
        
        // Check cache if enabled
        if (this.config.performance.cacheValidationResults && this.validationCache.has(validationId)) {
            const cached = this.validationCache.get(validationId);
            if (Date.now() - cached.timestamp < this.config.performance.cacheTtl) {
                return cached.result;
            }
            this.validationCache.delete(validationId);
        }
        
        const startTime = Date.now();
        this.validationStats.totalValidations++;
        
        try {
            // Get schema
            const schema = this.schemas.get(schemaName);
            if (!schema) {
                throw new Error(`Schema '${schemaName}' not found`);
            }
            
            // Sanitize input if enabled
            let sanitizedData = data;
            if (this.config.sanitization.enabled) {
                sanitizedData = await this.sanitizeData(data, options.sanitizers);
            }
            
            // Perform security checks
            if (this.config.security) {
                await this.performSecurityChecks(sanitizedData);
            }
            
            // Validate against schema
            const validationOptions = {
                allowUnknown: !this.config.strictMode,
                stripUnknown: this.config.strictMode,
                abortEarly: false,
                ...options.joiOptions
            };
            
            const { error, value } = schema.validate(sanitizedData, validationOptions);
            
            const validationTime = Date.now() - startTime;
            
            const result = {
                valid: !error,
                data: value,
                errors: error ? error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    type: detail.type
                })) : [],
                sanitized: sanitizedData !== data,
                validationTime,
                timestamp: Date.now()
            };
            
            // Cache result if enabled
            if (this.config.performance.cacheValidationResults) {
                this.validationCache.set(validationId, {
                    result: { ...result },
                    timestamp: Date.now()
                });
            }
            
            // Update stats
            if (result.valid) {
                this.validationStats.passedValidations++;
            } else {
                this.validationStats.failedValidations++;
            }
            
            if (result.sanitized) {
                this.validationStats.sanitizedInputs++;
            }
            
            // Emit validation event
            this.emit('validationComplete', {
                schemaName,
                result,
                validationTime
            });
            
            return result;
            
        } catch (error) {
            this.validationStats.failedValidations++;
            
            logger.error('Validation failed', {
                schemaName,
                error: error.message,
                validationTime: Date.now() - startTime
            });
            
            throw error;
        }
    }

    async sanitizeData(data, customSanitizers = []) {
        if (data === null || data === undefined) {
            return data;
        }
        
        if (typeof data === 'string') {
            let sanitized = data;
            
            // Apply default sanitizers
            if (this.config.sanitization.stripHtml) {
                sanitized = this.sanitizers.get('html')(sanitized);
            }
            
            sanitized = this.sanitizers.get('text')(sanitized);
            
            // Apply custom sanitizers
            for (const sanitizerName of customSanitizers) {
                if (this.sanitizers.has(sanitizerName)) {
                    sanitized = this.sanitizers.get(sanitizerName)(sanitized);
                }
            }
            
            return sanitized;
        }
        
        if (Array.isArray(data)) {
            return await Promise.all(data.map(item => this.sanitizeData(item, customSanitizers)));
        }
        
        if (typeof data === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(data)) {
                const sanitizedKey = typeof key === 'string' ? 
                    this.sanitizers.get('text')(key) : key;
                sanitized[sanitizedKey] = await this.sanitizeData(value, customSanitizers);
            }
            return sanitized;
        }
        
        return data;
    }

    async performSecurityChecks(data) {
        const threats = [];
        
        const checkString = (str, context = '') => {
            if (typeof str !== 'string') return;
            
            // Check each security pattern category
            for (const [threatType, patterns] of this.securityPatterns) {
                for (const pattern of patterns) {
                    if (pattern.test(str)) {
                        threats.push({
                            type: threatType,
                            context,
                            pattern: pattern.toString(),
                            value: str.substring(0, 100) // Limit logged value length
                        });
                    }
                }
            }
        };
        
        const checkData = (obj, path = '') => {
            if (typeof obj === 'string') {
                checkString(obj, path);
            } else if (Array.isArray(obj)) {
                obj.forEach((item, index) => {
                    checkData(item, `${path}[${index}]`);
                });
            } else if (typeof obj === 'object' && obj !== null) {
                Object.entries(obj).forEach(([key, value]) => {
                    const newPath = path ? `${path}.${key}` : key;
                    checkString(key, `${newPath}:key`);
                    checkData(value, newPath);
                });
            }
        };
        
        checkData(data);
        
        if (threats.length > 0) {
            this.validationStats.threatsDetected += threats.length;
            
            logger.warn('Security threats detected in input', {
                threatCount: threats.length,
                threats: threats.map(t => ({ type: t.type, context: t.context }))
            });
            
            this.emit('threatsDetected', { threats, data });
            
            if (this.config.strictMode) {
                throw new Error(`Security threats detected: ${threats.map(t => t.type).join(', ')}`);
            }
        }
    }

    registerSchema(name, schema) {
        if (typeof schema === 'object' && !schema.isJoi) {
            // Convert plain object to Joi schema
            schema = Joi.object(schema);
        }
        
        this.schemas.set(name, schema);
        logger.info('Schema registered', { name });
    }

    registerCustomValidator(name, validator) {
        this.config.customValidators.set(name, validator);
        logger.info('Custom validator registered', { name });
    }

    registerSanitizer(name, sanitizer) {
        this.sanitizers.set(name, sanitizer);
        logger.info('Sanitizer registered', { name });
    }

    async validateBatch(items, schemaName, options = {}) {
        const results = [];
        const batchOptions = {
            parallel: options.parallel !== false,
            failFast: options.failFast === true,
            ...options
        };
        
        if (batchOptions.parallel) {
            // Parallel validation
            const promises = items.map(item => 
                this.validate(item, schemaName, options).catch(error => ({
                    valid: false,
                    error: error.message
                }))
            );
            
            return await Promise.all(promises);
        } else {
            // Sequential validation
            for (const item of items) {
                try {
                    const result = await this.validate(item, schemaName, options);
                    results.push(result);
                    
                    if (batchOptions.failFast && !result.valid) {
                        break;
                    }
                } catch (error) {
                    const errorResult = {
                        valid: false,
                        error: error.message
                    };
                    results.push(errorResult);
                    
                    if (batchOptions.failFast) {
                        break;
                    }
                }
            }
            
            return results;
        }
    }

    async validateMiddleware() {
        return (req, res, next) => {
            const originalJson = res.json;
            
            // Wrap response to validate outgoing data
            res.json = function(obj) {
                // Optionally validate outgoing data here
                return originalJson.call(this, obj);
            };
            
            // Validate incoming request data
            const validateRequest = async () => {
                try {
                    // Determine schema based on route or content-type
                    const schemaName = req.route?.schemaName || 'default';
                    
                    if (req.body && Object.keys(req.body).length > 0) {
                        const result = await this.validate(req.body, schemaName);
                        
                        if (!result.valid) {
                            return res.status(400).json({
                                error: 'Validation failed',
                                details: result.errors
                            });
                        }
                        
                        // Replace request body with sanitized data
                        req.body = result.data;
                    }
                    
                    // Validate query parameters
                    if (req.query && Object.keys(req.query).length > 0) {
                        const queryResult = await this.sanitizeData(req.query);
                        req.query = queryResult;
                    }
                    
                    next();
                    
                } catch (error) {
                    logger.error('Request validation error', { error: error.message });
                    res.status(400).json({
                        error: 'Validation error',
                        message: error.message
                    });
                }
            };
            
            validateRequest();
        };
    }

    generateValidationId(data, schemaName) {
        const dataStr = JSON.stringify(data);
        const hash = crypto.createHash('md5').update(`${schemaName}:${dataStr}`).digest('hex');
        return `${schemaName}_${hash}`;
    }

    getSchemas() {
        return Array.from(this.schemas.keys());
    }

    getMetrics() {
        return {
            ...this.validationStats,
            schemasRegistered: this.schemas.size,
            sanitizersRegistered: this.sanitizers.size,
            securityPatterns: this.securityPatterns.size,
            cacheSize: this.validationCache.size,
            successRate: this.validationStats.totalValidations > 0 ? 
                (this.validationStats.passedValidations / this.validationStats.totalValidations) * 100 : 0
        };
    }

    clearCache() {
        this.validationCache.clear();
        logger.info('Validation cache cleared');
    }

    async shutdown() {
        logger.info('Shutting down Advanced Validation Framework');
        
        this.clearCache();
        this.emit('shutdown');
        
        logger.info('Advanced Validation Framework shutdown complete');
    }
}

module.exports = { AdvancedValidationFramework };