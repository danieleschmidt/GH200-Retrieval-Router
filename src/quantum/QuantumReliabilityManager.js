/**
 * Quantum Reliability Manager
 * Advanced error handling, timeout management, and reliability patterns
 */

const EventEmitter = require('eventemitter3');
const { logger } = require('../utils/logger');

class QuantumReliabilityManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            maxRetryAttempts: options.maxRetryAttempts || 3,
            retryBackoffMs: options.retryBackoffMs || 1000,
            circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: options.circuitBreakerTimeout || 30000,
            bulkheadSize: options.bulkheadSize || 10,
            timeoutMs: options.timeoutMs || 10000,
            ...options
        };
        
        this.circuitBreakers = new Map();
        this.bulkheads = new Map();
        this.retryQueues = new Map();
        this.activeTimeouts = new Set();
        
        this.metrics = {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            retriedOperations: 0,
            circuitBreakerTrips: 0,
            timeouts: 0
        };
        
        this.isInitialized = false;
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        logger.info('Initializing Quantum Reliability Manager', {
            maxRetryAttempts: this.config.maxRetryAttempts,
            circuitBreakerThreshold: this.config.circuitBreakerThreshold
        });
        
        // Initialize default bulkheads
        this.createBulkhead('quantum-operations', this.config.bulkheadSize);
        this.createBulkhead('cache-operations', this.config.bulkheadSize);
        this.createBulkhead('measurement-operations', this.config.bulkheadSize);
        
        this.isInitialized = true;
        this.emit('initialized');
        
        logger.info('Quantum Reliability Manager initialized successfully');
    }
    
    /**
     * Execute operation with full reliability patterns
     */
    async executeWithReliability(operationName, operation, options = {}) {
        const startTime = Date.now();
        const bulkheadName = options.bulkhead || 'quantum-operations';
        const circuitBreakerName = options.circuitBreaker || operationName;
        
        this.metrics.totalOperations++;
        
        try {
            // Check circuit breaker
            if (this.isCircuitBreakerOpen(circuitBreakerName)) {
                throw new Error(`Circuit breaker open for ${circuitBreakerName}`);
            }
            
            // Acquire bulkhead semaphore
            await this.acquireBulkhead(bulkheadName);
            
            try {
                // Execute with timeout and retry
                const result = await this.executeWithTimeout(
                    () => this.executeWithRetry(operation, options),
                    options.timeoutMs || this.config.timeoutMs
                );
                
                this.recordSuccess(circuitBreakerName);
                this.metrics.successfulOperations++;
                
                return result;
                
            } finally {
                this.releaseBulkhead(bulkheadName);
            }
            
        } catch (error) {
            this.recordFailure(circuitBreakerName);
            this.metrics.failedOperations++;
            
            logger.error('Reliable operation failed', {
                operationName,
                error: error.message,
                duration: Date.now() - startTime
            });
            
            throw error;
        }
    }
    
    /**
     * Execute operation with retry logic
     */
    async executeWithRetry(operation, options = {}) {
        const maxAttempts = options.maxRetryAttempts || this.config.maxRetryAttempts;
        const backoffMs = options.retryBackoffMs || this.config.retryBackoffMs;
        
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxAttempts) {
                    break;
                }
                
                // Check if error is retryable
                if (!this.isRetryableError(error)) {
                    break;
                }
                
                // Exponential backoff with jitter
                const delay = backoffMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
                await this.delay(delay);
                
                this.metrics.retriedOperations++;
                
                logger.debug('Operation retry', {
                    attempt,
                    maxAttempts,
                    delay,
                    error: error.message
                });
            }
        }
        
        throw lastError;
    }
    
    /**
     * Execute operation with timeout
     */
    async executeWithTimeout(operation, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.metrics.timeouts++;
                reject(new Error(`Operation timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            
            this.activeTimeouts.add(timeoutId);
            
            Promise.resolve()
                .then(() => operation())
                .then(result => {
                    clearTimeout(timeoutId);
                    this.activeTimeouts.delete(timeoutId);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    this.activeTimeouts.delete(timeoutId);
                    reject(error);
                });
        });
    }
    
    /**
     * Create bulkhead for operation isolation
     */
    createBulkhead(name, size) {
        this.bulkheads.set(name, {
            name,
            size,
            active: 0,
            waiting: [],
            created: Date.now()
        });
        
        logger.debug('Created bulkhead', { name, size });
    }
    
    /**
     * Acquire bulkhead semaphore
     */
    async acquireBulkhead(name) {
        const bulkhead = this.bulkheads.get(name);
        if (!bulkhead) {
            throw new Error(`Bulkhead ${name} does not exist`);
        }
        
        return new Promise((resolve, reject) => {
            if (bulkhead.active < bulkhead.size) {
                bulkhead.active++;
                resolve();
            } else {
                // Add to waiting queue
                bulkhead.waiting.push({ resolve, reject, timestamp: Date.now() });
                
                // Set timeout for waiting
                setTimeout(() => {
                    const index = bulkhead.waiting.findIndex(w => w.resolve === resolve);
                    if (index !== -1) {
                        bulkhead.waiting.splice(index, 1);
                        reject(new Error(`Bulkhead acquisition timeout for ${name}`));
                    }
                }, this.config.timeoutMs);
            }
        });
    }
    
    /**
     * Release bulkhead semaphore
     */
    releaseBulkhead(name) {
        const bulkhead = this.bulkheads.get(name);
        if (!bulkhead) return;
        
        bulkhead.active = Math.max(0, bulkhead.active - 1);
        
        // Process waiting queue
        if (bulkhead.waiting.length > 0 && bulkhead.active < bulkhead.size) {
            const waiter = bulkhead.waiting.shift();
            bulkhead.active++;
            waiter.resolve();
        }
    }
    
    /**
     * Record successful operation for circuit breaker
     */
    recordSuccess(circuitBreakerName) {
        const breaker = this.getOrCreateCircuitBreaker(circuitBreakerName);
        breaker.failures = 0;
        breaker.lastFailureTime = null;
        
        if (breaker.state === 'half-open') {
            breaker.state = 'closed';
            logger.info('Circuit breaker closed', { name: circuitBreakerName });
        }
    }
    
    /**
     * Record failed operation for circuit breaker
     */
    recordFailure(circuitBreakerName) {
        const breaker = this.getOrCreateCircuitBreaker(circuitBreakerName);
        breaker.failures++;
        breaker.lastFailureTime = Date.now();
        
        if (breaker.failures >= this.config.circuitBreakerThreshold && breaker.state === 'closed') {
            breaker.state = 'open';
            this.metrics.circuitBreakerTrips++;
            
            logger.warn('Circuit breaker opened', {
                name: circuitBreakerName,
                failures: breaker.failures
            });
            
            // Schedule half-open attempt
            setTimeout(() => {
                if (breaker.state === 'open') {
                    breaker.state = 'half-open';
                    logger.info('Circuit breaker half-open', { name: circuitBreakerName });
                }
            }, this.config.circuitBreakerTimeout);
        }
    }
    
    /**
     * Check if circuit breaker is open
     */
    isCircuitBreakerOpen(name) {
        const breaker = this.getOrCreateCircuitBreaker(name);
        return breaker.state === 'open';
    }
    
    /**
     * Get or create circuit breaker
     */
    getOrCreateCircuitBreaker(name) {
        if (!this.circuitBreakers.has(name)) {
            this.circuitBreakers.set(name, {
                name,
                state: 'closed', // closed, open, half-open
                failures: 0,
                lastFailureTime: null,
                created: Date.now()
            });
        }
        
        return this.circuitBreakers.get(name);
    }
    
    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        const retryableMessages = [
            'timeout',
            'network',
            'connection',
            'temporary',
            'unavailable',
            'overloaded'
        ];
        
        const message = error.message.toLowerCase();
        return retryableMessages.some(keyword => message.includes(keyword));
    }
    
    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get reliability metrics
     */
    getMetrics() {
        const successRate = this.metrics.totalOperations > 0 ? 
            this.metrics.successfulOperations / this.metrics.totalOperations : 0;
        
        return {
            ...this.metrics,
            successRate,
            circuitBreakers: Array.from(this.circuitBreakers.values()),
            bulkheads: Array.from(this.bulkheads.values()).map(b => ({
                name: b.name,
                size: b.size,
                active: b.active,
                waiting: b.waiting.length,
                utilization: b.active / b.size
            }))
        };
    }
    
    /**
     * Reset circuit breaker
     */
    resetCircuitBreaker(name) {
        const breaker = this.circuitBreakers.get(name);
        if (breaker) {
            breaker.state = 'closed';
            breaker.failures = 0;
            breaker.lastFailureTime = null;
            
            logger.info('Circuit breaker reset', { name });
        }
    }
    
    /**
     * Graceful shutdown
     */
    async shutdown() {
        if (!this.isInitialized) return;
        
        logger.info('Shutting down Quantum Reliability Manager');
        
        try {
            // Clear active timeouts
            for (const timeoutId of this.activeTimeouts) {
                clearTimeout(timeoutId);
            }
            this.activeTimeouts.clear();
            
            // Reject all waiting bulkhead operations
            for (const bulkhead of this.bulkheads.values()) {
                for (const waiter of bulkhead.waiting) {
                    waiter.reject(new Error('System shutting down'));
                }
                bulkhead.waiting.length = 0;
                bulkhead.active = 0;
            }
            
            this.circuitBreakers.clear();
            this.bulkheads.clear();
            this.retryQueues.clear();
            
            this.isInitialized = false;
            this.emit('shutdown');
            
            logger.info('Quantum Reliability Manager shutdown complete');
            
        } catch (error) {
            logger.error('Error during Quantum Reliability Manager shutdown', {
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = { QuantumReliabilityManager };