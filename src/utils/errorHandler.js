/**
 * Comprehensive Error Handling System for GH200-Retrieval-Router
 * Provides structured error handling, recovery strategies, and error analytics
 */

const { logger } = require('./logger');

/**
 * Base error class for GH200-Retrieval-Router
 */
class GH200Error extends Error {
    constructor(message, code = 'UNKNOWN_ERROR', details = {}, cause = null) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.details = details;
        this.cause = cause;
        this.timestamp = new Date().toISOString();
        this.recoverable = false;
        
        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }
    
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            details: this.details,
            timestamp: this.timestamp,
            recoverable: this.recoverable,
            stack: this.stack,
            cause: this.cause ? {
                message: this.cause.message,
                stack: this.cause.stack
            } : null
        };
    }
}

/**
 * Configuration error
 */
class ConfigurationError extends GH200Error {
    constructor(message, field = null, value = null, cause = null) {
        super(message, 'CONFIGURATION_ERROR', { field, value }, cause);
        this.recoverable = false;
    }
}

/**
 * Validation error
 */
class ValidationError extends GH200Error {
    constructor(message, field = null, value = null, constraints = {}, cause = null) {
        super(message, 'VALIDATION_ERROR', { field, value, constraints }, cause);
        this.recoverable = true;
    }
}

/**
 * Memory allocation error
 */
class MemoryError extends GH200Error {
    constructor(message, requestedBytes = 0, availableBytes = 0, cause = null) {
        super(message, 'MEMORY_ERROR', { requestedBytes, availableBytes }, cause);
        this.recoverable = true;
    }
}

/**
 * GPU resource error
 */
class GPUError extends GH200Error {
    constructor(message, gpuId = null, operation = null, cause = null) {
        super(message, 'GPU_ERROR', { gpuId, operation }, cause);
        this.recoverable = true;
    }
}

/**
 * Query processing error
 */
class QueryError extends GH200Error {
    constructor(message, queryId = null, queryType = null, cause = null) {
        super(message, 'QUERY_ERROR', { queryId, queryType }, cause);
        this.recoverable = true;
    }
}

/**
 * Vector database error
 */
class VectorDatabaseError extends GH200Error {
    constructor(message, databaseName = null, operation = null, cause = null) {
        super(message, 'VECTOR_DATABASE_ERROR', { databaseName, operation }, cause);
        this.recoverable = true;
    }
}

/**
 * Networking error
 */
class NetworkError extends GH200Error {
    constructor(message, endpoint = null, statusCode = null, cause = null) {
        super(message, 'NETWORK_ERROR', { endpoint, statusCode }, cause);
        this.recoverable = true;
    }
}

/**
 * Timeout error
 */
class TimeoutError extends GH200Error {
    constructor(message, operation = null, timeoutMs = null, cause = null) {
        super(message, 'TIMEOUT_ERROR', { operation, timeoutMs }, cause);
        this.recoverable = true;
    }
}

/**
 * Resource exhaustion error
 */
class ResourceExhaustionError extends GH200Error {
    constructor(message, resource = null, limit = null, current = null, cause = null) {
        super(message, 'RESOURCE_EXHAUSTION_ERROR', { resource, limit, current }, cause);
        this.recoverable = true;
    }
}

/**
 * Circuit breaker error
 */
class CircuitBreakerError extends GH200Error {
    constructor(message, component = null, state = null, cause = null) {
        super(message, 'CIRCUIT_BREAKER_ERROR', { component, state }, cause);
        this.recoverable = true;
    }
}

/**
 * Security error
 */
class SecurityError extends GH200Error {
    constructor(message, threatType = null, details = {}, cause = null) {
        super(message, 'SECURITY_ERROR', { threatType, ...details }, cause);
        this.recoverable = false;
    }
}

/**
 * Advanced error handler with recovery strategies
 */
class ErrorHandler {
    constructor(options = {}) {
        this.options = {
            enableRecovery: true,
            maxRetryAttempts: 3,
            retryDelayMs: 1000,
            enableErrorAnalytics: true,
            ...options
        };
        
        // Error analytics
        this.analytics = {
            errorCounts: new Map(),
            errorPatterns: new Map(),
            recoverySuccess: new Map(),
            lastErrors: []
        };
        
        // Recovery strategies
        this.recoveryStrategies = new Map();
        this._initializeRecoveryStrategies();
    }
    
    /**
     * Initialize default recovery strategies
     * @private
     */
    _initializeRecoveryStrategies() {
        // Memory error recovery
        this.recoveryStrategies.set('MEMORY_ERROR', async (error, context) => {
            logger.warn('Attempting memory error recovery', {
                error: error.message,
                requestedBytes: error.details.requestedBytes,
                availableBytes: error.details.availableBytes
            });
            
            // Try garbage collection
            if (global.gc) {
                global.gc();
            }
            
            // Wait for potential memory cleanup
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return { recovered: true, strategy: 'garbage_collection' };
        });
        
        // GPU error recovery
        this.recoveryStrategies.set('GPU_ERROR', async (error, context) => {
            logger.warn('Attempting GPU error recovery', {
                error: error.message,
                gpuId: error.details.gpuId,
                operation: error.details.operation
            });
            
            // Reset GPU context if possible
            try {
                // This would reset GPU state in real implementation
                await new Promise(resolve => setTimeout(resolve, 500));
                return { recovered: true, strategy: 'gpu_reset' };
            } catch (resetError) {
                return { recovered: false, strategy: 'gpu_reset', error: resetError.message };
            }
        });
        
        // Network error recovery
        this.recoveryStrategies.set('NETWORK_ERROR', async (error, context) => {
            logger.warn('Attempting network error recovery', {
                error: error.message,
                endpoint: error.details.endpoint,
                statusCode: error.details.statusCode
            });
            
            // Wait with exponential backoff
            const attempt = context.retryAttempt || 0;
            const delayMs = this.options.retryDelayMs * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            
            return { recovered: true, strategy: 'exponential_backoff' };
        });
        
        // Circuit breaker recovery
        this.recoveryStrategies.set('CIRCUIT_BREAKER_ERROR', async (error, context) => {
            logger.warn('Circuit breaker error detected', {
                error: error.message,
                component: error.details.component,
                state: error.details.state
            });
            
            // Wait for circuit breaker to potentially reset
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            return { recovered: false, strategy: 'wait_for_reset' };
        });
        
        // Timeout error recovery
        this.recoveryStrategies.set('TIMEOUT_ERROR', async (error, context) => {
            logger.warn('Attempting timeout error recovery', {
                error: error.message,
                operation: error.details.operation,
                timeoutMs: error.details.timeoutMs
            });
            
            // Increase timeout for retry
            const newTimeout = (error.details.timeoutMs || 30000) * 1.5;
            
            return { 
                recovered: true, 
                strategy: 'increase_timeout',
                newTimeout 
            };
        });
    }
    
    /**
     * Handle error with recovery strategies
     */
    async handle(error, context = {}) {
        const startTime = Date.now();
        
        try {
            // Normalize error to GH200Error
            const normalizedError = this._normalizeError(error);
            
            // Record error analytics
            if (this.options.enableErrorAnalytics) {
                this._recordErrorAnalytics(normalizedError);
            }
            
            // Log error
            this._logError(normalizedError, context);
            
            // Attempt recovery if enabled and error is recoverable
            if (this.options.enableRecovery && normalizedError.recoverable) {
                const recoveryResult = await this._attemptRecovery(normalizedError, context);
                
                if (recoveryResult.recovered) {
                    logger.info('Error recovery successful', {
                        error: normalizedError.code,
                        strategy: recoveryResult.strategy,
                        recoveryTimeMs: Date.now() - startTime
                    });
                    
                    this._recordRecoverySuccess(normalizedError.code, recoveryResult.strategy);
                    return { recovered: true, result: recoveryResult };
                }
            }
            
            // If recovery failed or not attempted, prepare error response
            return {
                recovered: false,
                error: normalizedError,
                handlingTimeMs: Date.now() - startTime
            };
            
        } catch (handlingError) {
            logger.error('Error handling failed', {
                originalError: error.message,
                handlingError: handlingError.message
            });
            
            return {
                recovered: false,
                error: new GH200Error(
                    'Error handling failed',
                    'ERROR_HANDLER_FAILURE',
                    { originalError: error.message },
                    handlingError
                ),
                handlingTimeMs: Date.now() - startTime
            };
        }
    }
    
    /**
     * Handle errors with retry logic
     */
    async handleWithRetry(operation, context = {}) {
        const maxAttempts = context.maxRetryAttempts || this.options.maxRetryAttempts;
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await operation();
                
                // Operation succeeded
                if (attempt > 1) {
                    logger.info('Operation succeeded after retries', {
                        attempts: attempt,
                        totalAttempts: maxAttempts
                    });
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                logger.warn('Operation attempt failed', {
                    attempt,
                    maxAttempts,
                    error: error.message
                });
                
                // If this is the last attempt, don't handle recovery
                if (attempt === maxAttempts) {
                    break;
                }
                
                // Attempt error handling and recovery
                const handlingResult = await this.handle(error, {
                    ...context,
                    retryAttempt: attempt - 1
                });
                
                if (!handlingResult.recovered) {
                    // If recovery failed and error is not recoverable, stop retrying
                    const normalizedError = this._normalizeError(error);
                    if (!normalizedError.recoverable) {
                        break;
                    }
                }
            }
        }
        
        // All retries failed
        const finalError = new GH200Error(
            `Operation failed after ${maxAttempts} attempts`,
            'MAX_RETRIES_EXCEEDED',
            { maxAttempts, lastError: lastError.message },
            lastError
        );
        
        await this.handle(finalError, context);
        throw finalError;
    }
    
    /**
     * Normalize error to GH200Error
     * @private
     */
    _normalizeError(error) {
        if (error instanceof GH200Error) {
            return error;
        }
        
        // Map common error types
        if (error instanceof TypeError && error.message.includes('validation')) {
            return new ValidationError(error.message, null, null, {}, error);
        }
        
        if (error.message.includes('timeout')) {
            return new TimeoutError(error.message, null, null, error);
        }
        
        if (error.message.includes('memory') || error.message.includes('Memory')) {
            return new MemoryError(error.message, null, null, error);
        }
        
        if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
            return new NetworkError(error.message, null, error.code, error);
        }
        
        // Default to generic GH200Error
        return new GH200Error(error.message, 'UNKNOWN_ERROR', {}, error);
    }
    
    /**
     * Attempt error recovery
     * @private
     */
    async _attemptRecovery(error, context) {
        const strategy = this.recoveryStrategies.get(error.code);
        
        if (!strategy) {
            logger.debug('No recovery strategy available for error', {
                errorCode: error.code
            });
            return { recovered: false, strategy: 'none' };
        }
        
        try {
            const result = await strategy(error, context);
            return result;
        } catch (recoveryError) {
            logger.error('Recovery strategy failed', {
                errorCode: error.code,
                recoveryError: recoveryError.message
            });
            
            return { 
                recovered: false, 
                strategy: 'failed',
                error: recoveryError.message 
            };
        }
    }
    
    /**
     * Log error with appropriate level
     * @private
     */
    _logError(error, context) {
        const logData = {
            error: error.toJSON(),
            context,
            recoverable: error.recoverable
        };
        
        if (error.code === 'CONFIGURATION_ERROR' || !error.recoverable) {
            logger.error('Unrecoverable error occurred', logData);
        } else {
            logger.warn('Recoverable error occurred', logData);
        }
    }
    
    /**
     * Record error analytics
     * @private
     */
    _recordErrorAnalytics(error) {
        const errorCode = error.code;
        
        // Update error counts
        const currentCount = this.analytics.errorCounts.get(errorCode) || 0;
        this.analytics.errorCounts.set(errorCode, currentCount + 1);
        
        // Track error patterns
        const pattern = `${errorCode}:${error.details.operation || 'unknown'}`;
        const patternCount = this.analytics.errorPatterns.get(pattern) || 0;
        this.analytics.errorPatterns.set(pattern, patternCount + 1);
        
        // Keep last errors
        this.analytics.lastErrors.push({
            error: error.toJSON(),
            timestamp: Date.now()
        });
        
        // Limit history size
        if (this.analytics.lastErrors.length > 100) {
            this.analytics.lastErrors.shift();
        }
    }
    
    /**
     * Record recovery success
     * @private
     */
    _recordRecoverySuccess(errorCode, strategy) {
        const key = `${errorCode}:${strategy}`;
        const currentCount = this.analytics.recoverySuccess.get(key) || 0;
        this.analytics.recoverySuccess.set(key, currentCount + 1);
    }
    
    /**
     * Get error analytics
     */
    getAnalytics() {
        return {
            errorCounts: Object.fromEntries(this.analytics.errorCounts),
            errorPatterns: Object.fromEntries(this.analytics.errorPatterns),
            recoverySuccess: Object.fromEntries(this.analytics.recoverySuccess),
            recentErrors: this.analytics.lastErrors.slice(-10),
            totalErrors: Array.from(this.analytics.errorCounts.values())
                .reduce((sum, count) => sum + count, 0),
            totalRecoveries: Array.from(this.analytics.recoverySuccess.values())
                .reduce((sum, count) => sum + count, 0)
        };
    }
    
    /**
     * Register custom recovery strategy
     */
    registerRecoveryStrategy(errorCode, strategy) {
        if (typeof strategy !== 'function') {
            throw new Error('Recovery strategy must be a function');
        }
        
        this.recoveryStrategies.set(errorCode, strategy);
        logger.info('Custom recovery strategy registered', { errorCode });
    }
    
    /**
     * Clear analytics data
     */
    clearAnalytics() {
        this.analytics.errorCounts.clear();
        this.analytics.errorPatterns.clear();
        this.analytics.recoverySuccess.clear();
        this.analytics.lastErrors = [];
        
        logger.info('Error analytics cleared');
    }
}

// Global error handler instance
const globalErrorHandler = new ErrorHandler();

/**
 * Wrap async function with error handling
 */
function withErrorHandling(fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            const result = await globalErrorHandler.handle(error, context);
            if (!result.recovered) {
                throw result.error;
            }
            // If recovered, retry the function once
            return await fn(...args);
        }
    };
}

/**
 * Create error with stack trace preservation
 */
function createError(ErrorClass, message, ...args) {
    const error = new ErrorClass(message, ...args);
    Error.captureStackTrace(error, createError);
    return error;
}

module.exports = {
    // Error classes
    GH200Error,
    ConfigurationError,
    ValidationError,
    MemoryError,
    GPUError,
    QueryError,
    VectorDatabaseError,
    NetworkError,
    TimeoutError,
    ResourceExhaustionError,
    CircuitBreakerError,
    SecurityError,
    
    // Error handler
    ErrorHandler,
    globalErrorHandler,
    
    // Utilities
    withErrorHandling,
    createError
};