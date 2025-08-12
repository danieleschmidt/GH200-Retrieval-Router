/**
 * Quantum Timeout Manager
 * Advanced timeout handling and cleanup for quantum operations
 */

const { logger } = require('../utils/logger');

class QuantumTimeoutManager {
    constructor(options = {}) {
        this.config = {
            defaultTimeoutMs: options.defaultTimeoutMs || 30000,
            cleanupIntervalMs: options.cleanupIntervalMs || 10000,
            maxPendingTimeouts: options.maxPendingTimeouts || 1000,
            ...options
        };
        
        this.activeTimeouts = new Map();
        this.timeoutStats = {
            created: 0,
            completed: 0,
            expired: 0,
            cancelled: 0
        };
        
        this.cleanupTimer = null;
        this.isShutdown = false;
    }
    
    /**
     * Create a timeout-wrapped promise
     */
    withTimeout(promise, timeoutMs = null, operationName = 'operation') {
        const timeout = timeoutMs || this.config.defaultTimeoutMs;
        const timeoutId = this.generateTimeoutId();
        
        return new Promise((resolve, reject) => {
            if (this.isShutdown) {
                reject(new Error('Timeout manager is shut down'));
                return;
            }
            
            // Check if we have too many pending timeouts
            if (this.activeTimeouts.size >= this.config.maxPendingTimeouts) {
                logger.warn('Too many pending timeouts, rejecting new request', {
                    pending: this.activeTimeouts.size,
                    max: this.config.maxPendingTimeouts
                });
                reject(new Error('Too many pending operations'));
                return;
            }
            
            // Create timeout
            const timeoutHandle = setTimeout(() => {
                this.activeTimeouts.delete(timeoutId);
                this.timeoutStats.expired++;
                
                logger.warn('Operation timeout', {
                    operationName,
                    timeoutMs: timeout,
                    timeoutId
                });
                
                reject(new Error(`${operationName} timeout after ${timeout}ms`));
            }, timeout);
            
            // Track the timeout
            this.activeTimeouts.set(timeoutId, {
                id: timeoutId,
                handle: timeoutHandle,
                operationName,
                timeout,
                startTime: Date.now(),
                resolve,
                reject
            });
            
            this.timeoutStats.created++;
            
            // Handle the promise
            Promise.resolve(promise)
                .then(result => {
                    const timeoutInfo = this.activeTimeouts.get(timeoutId);
                    if (timeoutInfo) {
                        clearTimeout(timeoutInfo.handle);
                        this.activeTimeouts.delete(timeoutId);
                        this.timeoutStats.completed++;
                        resolve(result);
                    }
                })
                .catch(error => {
                    const timeoutInfo = this.activeTimeouts.get(timeoutId);
                    if (timeoutInfo) {
                        clearTimeout(timeoutInfo.handle);
                        this.activeTimeouts.delete(timeoutId);
                        this.timeoutStats.completed++;
                        reject(error);
                    }
                });
        });
    }
    
    /**
     * Create a delayed promise
     */
    delay(ms, value = undefined) {
        return this.withTimeout(
            new Promise(resolve => setTimeout(() => resolve(value), ms)),
            ms + 1000, // Add buffer to prevent timeout
            'delay'
        );
    }
    
    /**
     * Cancel a specific timeout
     */
    cancelTimeout(timeoutId) {
        const timeoutInfo = this.activeTimeouts.get(timeoutId);
        if (timeoutInfo) {
            clearTimeout(timeoutInfo.handle);
            this.activeTimeouts.delete(timeoutId);
            this.timeoutStats.cancelled++;
            
            // Reject the promise
            timeoutInfo.reject(new Error('Operation cancelled'));
            
            logger.debug('Timeout cancelled', { timeoutId });
            return true;
        }
        return false;
    }
    
    /**
     * Cancel all timeouts for a specific operation
     */
    cancelOperation(operationName) {
        let cancelledCount = 0;
        
        for (const [timeoutId, timeoutInfo] of this.activeTimeouts) {
            if (timeoutInfo.operationName === operationName) {
                this.cancelTimeout(timeoutId);
                cancelledCount++;
            }
        }
        
        logger.debug('Operation timeouts cancelled', {
            operationName,
            cancelledCount
        });
        
        return cancelledCount;
    }
    
    /**
     * Get timeout statistics
     */
    getStats() {
        return {
            ...this.timeoutStats,
            activePending: this.activeTimeouts.size,
            longestPending: this.getLongestPendingTimeout(),
            memoryUsage: this.activeTimeouts.size * 200 // Rough estimate
        };
    }
    
    /**
     * Get the longest pending timeout duration
     */
    getLongestPendingTimeout() {
        if (this.activeTimeouts.size === 0) return 0;
        
        const now = Date.now();
        let longestDuration = 0;
        
        for (const timeoutInfo of this.activeTimeouts.values()) {
            const duration = now - timeoutInfo.startTime;
            longestDuration = Math.max(longestDuration, duration);
        }
        
        return longestDuration;
    }
    
    /**
     * Cleanup expired or orphaned timeouts
     */
    performCleanup() {
        const now = Date.now();
        const expiredTimeouts = [];
        
        for (const [timeoutId, timeoutInfo] of this.activeTimeouts) {
            const age = now - timeoutInfo.startTime;
            
            // Consider timeouts that have been pending for too long as expired
            if (age > timeoutInfo.timeout + 5000) { // 5 second grace period
                expiredTimeouts.push(timeoutId);
            }
        }
        
        for (const timeoutId of expiredTimeouts) {
            this.cancelTimeout(timeoutId);
        }
        
        if (expiredTimeouts.length > 0) {
            logger.info('Cleaned up expired timeouts', {
                expiredCount: expiredTimeouts.length,
                remainingActive: this.activeTimeouts.size
            });
        }
    }
    
    /**
     * Start automatic cleanup
     */
    startCleanup() {
        if (this.cleanupTimer) return;
        
        this.cleanupTimer = setInterval(() => {
            try {
                this.performCleanup();
            } catch (error) {
                logger.error('Timeout cleanup error', { error: error.message });
            }
        }, this.config.cleanupIntervalMs);
        
        logger.debug('Timeout cleanup started', {
            intervalMs: this.config.cleanupIntervalMs
        });
    }
    
    /**
     * Stop automatic cleanup
     */
    stopCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            logger.debug('Timeout cleanup stopped');
        }
    }
    
    /**
     * Graceful shutdown - cancel all pending timeouts
     */
    async shutdown() {
        if (this.isShutdown) return;
        
        logger.info('Shutting down Quantum Timeout Manager', {
            pendingTimeouts: this.activeTimeouts.size
        });
        
        this.isShutdown = true;
        
        // Stop cleanup timer
        this.stopCleanup();
        
        // Cancel all pending timeouts
        const timeoutIds = Array.from(this.activeTimeouts.keys());
        for (const timeoutId of timeoutIds) {
            this.cancelTimeout(timeoutId);
        }
        
        // Wait a brief moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        logger.info('Quantum Timeout Manager shutdown complete', {
            stats: this.getStats()
        });
    }
    
    /**
     * Generate unique timeout ID
     */
    generateTimeoutId() {
        return `timeout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Race multiple promises with timeout
     */
    raceWithTimeout(promises, timeoutMs, operationName = 'race') {
        return this.withTimeout(
            Promise.race(promises),
            timeoutMs,
            operationName
        );
    }
    
    /**
     * All promises with timeout
     */
    allWithTimeout(promises, timeoutMs, operationName = 'all') {
        return this.withTimeout(
            Promise.all(promises),
            timeoutMs,
            operationName
        );
    }
}

module.exports = { QuantumTimeoutManager };