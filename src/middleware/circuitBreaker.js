/**
 * Circuit Breaker Pattern Implementation for GH200 Retrieval Router
 * Provides fault tolerance and prevents cascade failures
 */

const { logger } = require('../utils/logger');
const EventEmitter = require('events');

class CircuitBreaker extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            failureThreshold: 5,
            resetTimeout: 60000, // 60 seconds
            monitor: true,
            ...options
        };
        
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
        this.resetTimer = null;
        
        // Statistics
        this.stats = {
            totalRequests: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            stateChanges: 0,
            lastStateChange: null
        };
    }
    
    /**
     * Execute function with circuit breaker protection
     * @param {Function} fn - Function to execute
     * @param {...any} args - Arguments for the function
     * @returns {Promise} Result or circuit breaker error
     */
    async execute(fn, ...args) {
        this.stats.totalRequests++;
        
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
                this._setState('HALF_OPEN');
                logger.info('Circuit breaker transitioning to HALF_OPEN');
            } else {
                const error = new Error('Circuit breaker is OPEN');
                error.code = 'CIRCUIT_BREAKER_OPEN';
                this.emit('reject', error);
                throw error;
            }
        }
        
        try {
            const result = await fn(...args);
            this._onSuccess();
            return result;
        } catch (error) {
            this._onFailure(error);
            throw error;
        }
    }
    
    /**
     * Force circuit breaker to open state
     */
    forceOpen(reason = 'Manual override') {
        logger.warn('Circuit breaker forced open', { reason });
        this._setState('OPEN');
        this.lastFailureTime = Date.now();
    }
    
    /**
     * Force circuit breaker to closed state
     */
    forceClose(reason = 'Manual override') {
        logger.info('Circuit breaker forced closed', { reason });
        this._setState('CLOSED');
        this.failureCount = 0;
        this.successCount = 0;
    }
    
    /**
     * Get current circuit breaker status
     */
    getStatus() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            stats: { ...this.stats },
            options: { ...this.options }
        };
    }
    
    /**
     * Handle successful execution
     */
    _onSuccess() {
        this.stats.totalSuccesses++;
        
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            
            if (this.successCount >= Math.ceil(this.options.failureThreshold / 2)) {
                this._setState('CLOSED');
                this.failureCount = 0;
                this.successCount = 0;
                logger.info('Circuit breaker recovered to CLOSED state');
            }
        } else if (this.state === 'CLOSED') {
            this.failureCount = 0;
        }
        
        this.emit('success');
    }
    
    /**
     * Handle failed execution
     */
    _onFailure(error) {
        this.stats.totalFailures++;
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        logger.warn('Circuit breaker recorded failure', {
            error: error.message,
            failureCount: this.failureCount,
            threshold: this.options.failureThreshold,
            state: this.state
        });
        
        if (this.state === 'HALF_OPEN' || this.failureCount >= this.options.failureThreshold) {
            this._setState('OPEN');
            this._startResetTimer();
            logger.error('Circuit breaker opened due to failures', {
                failureCount: this.failureCount,
                threshold: this.options.failureThreshold
            });
        }
        
        this.emit('failure', error);
    }
    
    /**
     * Set circuit breaker state
     */
    _setState(newState) {
        const oldState = this.state;
        this.state = newState;
        this.stats.stateChanges++;
        this.stats.lastStateChange = new Date().toISOString();
        
        this.emit('stateChange', {
            from: oldState,
            to: newState,
            timestamp: this.stats.lastStateChange
        });
    }
    
    /**
     * Start reset timer for automatic recovery
     */
    _startResetTimer() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        
        this.resetTimer = setTimeout(() => {
            if (this.state === 'OPEN') {
                this._setState('HALF_OPEN');
                this.successCount = 0;
                logger.info('Circuit breaker auto-recovery to HALF_OPEN');
            }
        }, this.options.resetTimeout);
    }
}

/**
 * Circuit Breaker Manager for multiple services
 */
class CircuitBreakerManager {
    constructor() {
        this.breakers = new Map();
    }
    
    /**
     * Get or create circuit breaker for service
     * @param {string} serviceName - Service identifier
     * @param {Object} options - Circuit breaker options
     * @returns {CircuitBreaker} Circuit breaker instance
     */
    getBreaker(serviceName, options = {}) {
        if (!this.breakers.has(serviceName)) {
            const breaker = new CircuitBreaker({
                ...options,
                serviceName
            });
            
            // Log state changes
            breaker.on('stateChange', (event) => {
                logger.info('Circuit breaker state change', {
                    service: serviceName,
                    from: event.from,
                    to: event.to,
                    timestamp: event.timestamp
                });
            });
            
            this.breakers.set(serviceName, breaker);
        }
        
        return this.breakers.get(serviceName);
    }
    
    /**
     * Get status of all circuit breakers
     */
    getAllStatus() {
        const status = {};
        
        for (const [serviceName, breaker] of this.breakers) {
            status[serviceName] = breaker.getStatus();
        }
        
        return status;
    }
    
    /**
     * Get health summary
     */
    getHealthSummary() {
        const summary = {
            healthy: 0,
            degraded: 0,
            failed: 0,
            total: this.breakers.size
        };
        
        for (const breaker of this.breakers.values()) {
            switch (breaker.state) {
                case 'CLOSED':
                    summary.healthy++;
                    break;
                case 'HALF_OPEN':
                    summary.degraded++;
                    break;
                case 'OPEN':
                    summary.failed++;
                    break;
            }
        }
        
        return summary;
    }
}

// Create global circuit breaker manager
const circuitBreakerManager = new CircuitBreakerManager();

module.exports = {
    CircuitBreaker,
    CircuitBreakerManager,
    circuitBreakerManager
};