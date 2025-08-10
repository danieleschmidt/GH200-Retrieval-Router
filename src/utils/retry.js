/**
 * Retry utilities with exponential backoff and jitter
 * Provides robust retry mechanisms for failed operations
 */

const { logger } = require('./logger');

/**
 * Retry configuration options
 */
const DEFAULT_RETRY_OPTIONS = {
    attempts: 3,
    baseDelay: 1000,        // Base delay in milliseconds
    maxDelay: 30000,        // Maximum delay in milliseconds
    backoffFactor: 2,       // Exponential backoff multiplier
    jitter: true,           // Add random jitter to prevent thundering herd
    retryCondition: null,   // Function to determine if retry should happen
    onRetry: null          // Callback function on retry attempt
};

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Result of successful execution or final error
 */
async function retry(fn, options = {}) {
    const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError;
    
    for (let attempt = 1; attempt <= config.attempts; attempt++) {
        try {
            const result = await fn();
            
            if (attempt > 1) {
                logger.info('Operation succeeded after retry', {
                    attempt,
                    totalAttempts: config.attempts,
                    function: fn.name || 'anonymous'
                });
            }
            
            return result;
        } catch (error) {
            lastError = error;
            
            // Check if we should retry this error
            if (config.retryCondition && !config.retryCondition(error, attempt)) {
                logger.debug('Retry condition not met, aborting', {
                    error: error.message,
                    attempt,
                    function: fn.name || 'anonymous'
                });
                throw error;
            }
            
            // Don't wait after the last attempt
            if (attempt === config.attempts) {
                logger.error('All retry attempts exhausted', {
                    attempts: config.attempts,
                    finalError: error.message,
                    function: fn.name || 'anonymous'
                });
                break;
            }
            
            // Calculate delay with exponential backoff and jitter
            const delay = calculateDelay(attempt, config);
            
            logger.warn('Operation failed, retrying', {
                error: error.message,
                attempt,
                totalAttempts: config.attempts,
                nextRetryDelayMs: delay,
                function: fn.name || 'anonymous'
            });
            
            // Call retry callback if provided
            if (config.onRetry) {
                try {
                    await config.onRetry(error, attempt);
                } catch (callbackError) {
                    logger.warn('Retry callback failed', {
                        error: callbackError.message,
                        attempt
                    });
                }
            }
            
            // Wait before next attempt
            await sleep(delay);
        }
    }
    
    // If we get here, all retries failed
    throw lastError;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 * @param {number} attempt - Current attempt number (1-based)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, config) {
    // Calculate exponential backoff: baseDelay * backoffFactor^(attempt-1)
    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, config.maxDelay);
    
    // Add jitter to prevent thundering herd problem
    if (config.jitter) {
        // Add random jitter ±25%
        const jitterRange = delay * 0.25;
        const jitterOffset = (Math.random() - 0.5) * 2 * jitterRange;
        delay += jitterOffset;
        
        // Ensure delay is not negative
        delay = Math.max(delay, 0);
    }
    
    return Math.round(delay);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a retryable version of a function
 * @param {Function} fn - Function to make retryable
 * @param {Object} defaultOptions - Default retry options
 * @returns {Function} Retryable function
 */
function retryable(fn, defaultOptions = {}) {
    return async (...args) => {
        const options = args.length > 0 && typeof args[args.length - 1] === 'object' && args[args.length - 1].isRetryOptions
            ? args.pop()
            : {};
        
        const finalOptions = { ...defaultOptions, ...options };
        
        return retry(() => fn(...args), finalOptions);
    };
}

/**
 * Retry conditions for common scenarios
 */
const RetryConditions = {
    /**
     * Retry on network errors (ECONNRESET, ETIMEDOUT, etc.)
     */
    networkError: (error) => {
        const networkErrorCodes = [
            'ECONNRESET',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'EHOSTUNREACH',
            'ENETUNREACH',
            'EAI_AGAIN'
        ];
        
        return networkErrorCodes.includes(error.code) || 
               error.message.includes('network') ||
               error.message.includes('timeout');
    },
    
    /**
     * Retry on HTTP 5xx errors (server errors)
     */
    httpServerError: (error) => {
        return error.statusCode >= 500 && error.statusCode < 600;
    },
    
    /**
     * Retry on HTTP 429 (rate limit) and 5xx errors
     */
    httpRetryable: (error) => {
        return error.statusCode === 429 || 
               (error.statusCode >= 500 && error.statusCode < 600);
    },
    
    /**
     * Retry on database connection errors
     */
    databaseError: (error) => {
        const dbErrorPatterns = [
            'connection',
            'timeout',
            'ECONNRESET',
            'pool',
            'lock'
        ];
        
        return dbErrorPatterns.some(pattern => 
            error.message.toLowerCase().includes(pattern.toLowerCase())
        );
    },
    
    /**
     * Retry on memory allocation errors
     */
    memoryError: (error) => {
        return error.message.includes('memory') ||
               error.message.includes('allocation') ||
               error.code === 'ENOMEM';
    },
    
    /**
     * Never retry (useful for overriding default behavior)
     */
    never: () => false,
    
    /**
     * Always retry (use with caution)
     */
    always: () => true
};

/**
 * Batch retry utility for multiple operations
 * @param {Array} operations - Array of functions to retry
 * @param {Object} options - Retry options
 * @returns {Promise<Array>} Array of results
 */
async function retryBatch(operations, options = {}) {
    const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
    const results = [];
    const errors = [];
    
    logger.info('Starting batch retry operation', {
        operationCount: operations.length,
        maxAttempts: config.attempts
    });
    
    for (let i = 0; i < operations.length; i++) {
        try {
            const result = await retry(operations[i], config);
            results[i] = result;
        } catch (error) {
            errors[i] = error;
            logger.error('Batch operation failed permanently', {
                operationIndex: i,
                error: error.message
            });
        }
    }
    
    if (errors.length > 0) {
        const batchError = new Error(`Batch operation failed: ${errors.length}/${operations.length} operations failed`);
        batchError.errors = errors;
        batchError.results = results;
        throw batchError;
    }
    
    return results;
}

/**
 * Create retry options object (for use with retryable functions)
 * @param {Object} options - Retry options
 * @returns {Object} Options object marked for retry
 */
function createRetryOptions(options) {
    return { ...options, isRetryOptions: true };
}

module.exports = {
    retry,
    retryable,
    retryBatch,
    sleep,
    calculateDelay,
    RetryConditions,
    createRetryOptions,
    DEFAULT_RETRY_OPTIONS
};