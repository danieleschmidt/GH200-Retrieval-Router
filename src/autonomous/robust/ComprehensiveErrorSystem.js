/**
 * Comprehensive Error Handling System
 * Advanced error handling with circuit breakers, retries, and recovery
 */

const EventEmitter = require('events');
const { logger } = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

class ComprehensiveErrorSystem extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            circuitBreaker: {
                failureThreshold: 5,
                recoveryTime: 30000, // 30 seconds
                monitoringPeriod: 60000 // 1 minute
            },
            retry: {
                maxAttempts: 3,
                baseDelay: 1000, // 1 second
                maxDelay: 30000, // 30 seconds
                backoffMultiplier: 2
            },
            errorCategories: {
                transient: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'],
                permanent: ['EACCES', 'EPERM', 'ENOENT'],
                recoverable: ['EMFILE', 'ENOMEM', 'EAGAIN']
            },
            gracefulDegradation: {
                enabled: true,
                fallbackTimeout: 5000
            },
            monitoring: {
                errorRateThreshold: 0.05, // 5%
                alertingEnabled: true,
                metricsRetention: 24 * 60 * 60 * 1000 // 24 hours
            },
            ...config
        };
        
        this.circuitBreakers = new Map();
        this.errorMetrics = new Map();
        this.recoveryStrategies = new Map();
        this.fallbackHandlers = new Map();
        this.healthChecks = new Map();
        
        this.stats = {
            totalErrors: 0,
            recoveredErrors: 0,
            circuitBreakerTrips: 0,
            successfulRetries: 0,
            degradedOperations: 0
        };
        
        this.isInitialized = false;
        this.monitoringTimer = null;
        
        this.initializeRecoveryStrategies();
    }

    async initialize() {
        logger.info('Initializing Comprehensive Error System');
        
        // Initialize error monitoring
        this.startErrorMonitoring();
        
        // Initialize circuit breakers for critical services
        await this.initializeCriticalCircuitBreakers();
        
        // Initialize health checks
        await this.initializeHealthChecks();
        
        this.isInitialized = true;
        this.emit('initialized');
        
        logger.info('Comprehensive Error System initialized');
        return true;
    }

    initializeRecoveryStrategies() {
        // Database connection recovery
        this.recoveryStrategies.set('database_connection', async (error, context) => {
            logger.info('Attempting database connection recovery');
            
            // Wait and retry with exponential backoff
            await this.delay(this.config.retry.baseDelay);
            
            // Try to reconnect
            if (context.database && context.database.reconnect) {
                await context.database.reconnect();
                return { recovered: true, strategy: 'reconnection' };
            }
            
            return { recovered: false, reason: 'no_reconnect_method' };
        });
        
        // Memory pressure recovery
        this.recoveryStrategies.set('memory_pressure', async (error, context) => {
            logger.info('Attempting memory pressure recovery');
            
            // Force garbage collection
            if (global.gc) {
                global.gc();
            }
            
            // Clear caches
            if (context.cacheManager) {
                await context.cacheManager.clearExpiredItems();
            }
            
            // Reduce memory footprint
            return { recovered: true, strategy: 'memory_cleanup' };
        });
        
        // Network timeout recovery
        this.recoveryStrategies.set('network_timeout', async (error, context) => {
            logger.info('Attempting network timeout recovery');
            
            // Implement exponential backoff
            const attempt = context.attempt || 1;
            const delay = Math.min(
                this.config.retry.baseDelay * Math.pow(this.config.retry.backoffMultiplier, attempt - 1),
                this.config.retry.maxDelay
            );
            
            await this.delay(delay);
            
            return { recovered: true, strategy: 'exponential_backoff', nextDelay: delay };
        });
        
        // Rate limit recovery
        this.recoveryStrategies.set('rate_limit', async (error, context) => {
            logger.info('Attempting rate limit recovery');
            
            // Extract retry-after header if available
            const retryAfter = context.response?.headers?.['retry-after'];
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // Default 1 minute
            
            await this.delay(delay);
            
            return { recovered: true, strategy: 'rate_limit_backoff', delay };
        });
        
        // Service unavailable recovery
        this.recoveryStrategies.set('service_unavailable', async (error, context) => {
            logger.info('Attempting service unavailable recovery');
            
            // Switch to fallback service if available
            if (context.fallbackService) {
                return { recovered: true, strategy: 'fallback_service', service: context.fallbackService };
            }
            
            // Or wait and retry
            await this.delay(30000); // 30 seconds
            return { recovered: true, strategy: 'wait_and_retry' };
        });
    }

    async handleError(error, context = {}) {
        const errorId = uuidv4();
        const errorInfo = {
            id: errorId,
            message: error.message,
            stack: error.stack,
            code: error.code,
            category: this.categorizeError(error),
            context,
            timestamp: Date.now(),
            attempts: context.attempts || 1
        };
        
        logger.error('Handling error', errorInfo);
        
        this.stats.totalErrors++;
        this.updateErrorMetrics(errorInfo);
        
        try {
            // Check circuit breaker state
            if (await this.isCircuitOpen(context.service)) {
                return await this.handleCircuitOpen(errorInfo);
            }
            
            // Attempt recovery based on error category
            const recoveryResult = await this.attemptRecovery(errorInfo);
            
            if (recoveryResult.recovered) {
                this.stats.recoveredErrors++;
                logger.info('Error recovery successful', {
                    errorId,
                    strategy: recoveryResult.strategy
                });
                
                this.emit('errorRecovered', { errorInfo, recoveryResult });
                return { recovered: true, result: recoveryResult };
            }
            
            // If recovery failed, try graceful degradation
            const degradationResult = await this.attemptGracefulDegradation(errorInfo);
            
            if (degradationResult.degraded) {
                this.stats.degradedOperations++;
                logger.warn('Error handled with graceful degradation', {
                    errorId,
                    mode: degradationResult.mode
                });
                
                this.emit('gracefulDegradation', { errorInfo, degradationResult });
                return { degraded: true, result: degradationResult };
            }
            
            // If all else fails, trigger circuit breaker
            await this.triggerCircuitBreaker(context.service, errorInfo);
            
            this.emit('errorHandled', { errorInfo, recovered: false });
            return { recovered: false, errorId };
            
        } catch (handlingError) {
            logger.error('Error handling failed', {
                originalError: error.message,
                handlingError: handlingError.message
            });
            
            // Emit critical error event
            this.emit('criticalError', { originalError: error, handlingError });
            
            throw handlingError;
        }
    }

    categorizeError(error) {
        const code = error.code;
        
        if (this.config.errorCategories.transient.includes(code)) {
            return 'transient';
        } else if (this.config.errorCategories.permanent.includes(code)) {
            return 'permanent';
        } else if (this.config.errorCategories.recoverable.includes(code)) {
            return 'recoverable';
        }
        
        // Categorize by message patterns
        const message = error.message.toLowerCase();
        if (message.includes('timeout') || message.includes('connection')) {
            return 'transient';
        } else if (message.includes('permission') || message.includes('access')) {
            return 'permanent';
        } else if (message.includes('memory') || message.includes('resource')) {
            return 'recoverable';
        }
        
        return 'unknown';
    }

    async attemptRecovery(errorInfo) {
        const category = errorInfo.category;
        const context = errorInfo.context;
        
        // Skip recovery for permanent errors
        if (category === 'permanent') {
            return { recovered: false, reason: 'permanent_error' };
        }
        
        // Skip recovery if max attempts reached
        if (errorInfo.attempts >= this.config.retry.maxAttempts) {
            return { recovered: false, reason: 'max_attempts_reached' };
        }
        
        // Try specific recovery strategy based on error type
        let recoveryStrategy = null;
        
        if (errorInfo.code === 'ECONNRESET' || errorInfo.code === 'ECONNREFUSED') {
            recoveryStrategy = 'database_connection';
        } else if (errorInfo.code === 'ENOMEM' || errorInfo.message.includes('memory')) {
            recoveryStrategy = 'memory_pressure';
        } else if (errorInfo.code === 'ETIMEDOUT' || errorInfo.message.includes('timeout')) {
            recoveryStrategy = 'network_timeout';
        } else if (errorInfo.message.includes('rate limit')) {
            recoveryStrategy = 'rate_limit';
        } else if (errorInfo.message.includes('service unavailable')) {
            recoveryStrategy = 'service_unavailable';
        }
        
        if (recoveryStrategy && this.recoveryStrategies.has(recoveryStrategy)) {
            try {
                const strategy = this.recoveryStrategies.get(recoveryStrategy);
                const result = await strategy(errorInfo, context);
                
                if (result.recovered) {
                    return result;
                }
            } catch (recoveryError) {
                logger.error('Recovery strategy failed', {
                    strategy: recoveryStrategy,
                    error: recoveryError.message
                });
            }
        }
        
        // Try generic retry with exponential backoff
        if (category === 'transient' && errorInfo.attempts < this.config.retry.maxAttempts) {
            const delay = Math.min(
                this.config.retry.baseDelay * Math.pow(this.config.retry.backoffMultiplier, errorInfo.attempts - 1),
                this.config.retry.maxDelay
            );
            
            await this.delay(delay);
            
            return { 
                recovered: true, 
                strategy: 'exponential_backoff_retry',
                delay,
                nextAttempt: errorInfo.attempts + 1
            };
        }
        
        return { recovered: false, reason: 'no_suitable_strategy' };
    }

    async attemptGracefulDegradation(errorInfo) {
        if (!this.config.gracefulDegradation.enabled) {
            return { degraded: false, reason: 'degradation_disabled' };
        }
        
        const context = errorInfo.context;
        
        // Try to find a fallback handler
        const service = context.service;
        if (service && this.fallbackHandlers.has(service)) {
            try {
                const fallbackHandler = this.fallbackHandlers.get(service);
                const fallbackResult = await Promise.race([
                    fallbackHandler(context),
                    this.timeoutPromise(this.config.gracefulDegradation.fallbackTimeout)
                ]);
                
                return {
                    degraded: true,
                    mode: 'fallback_service',
                    result: fallbackResult
                };
            } catch (fallbackError) {
                logger.error('Fallback handler failed', {
                    service,
                    error: fallbackError.message
                });
            }
        }
        
        // Default degradation strategies
        if (context.operation === 'search') {
            // Return cached results or simplified search
            return {
                degraded: true,
                mode: 'simplified_search',
                result: context.cachedResults || []
            };
        } else if (context.operation === 'index') {
            // Queue for later processing
            return {
                degraded: true,
                mode: 'queued_processing',
                result: { queued: true, retryAfter: 300 }
            };
        }
        
        return { degraded: false, reason: 'no_degradation_strategy' };
    }

    async initializeCriticalCircuitBreakers() {
        const criticalServices = [
            'vector_database',
            'search_engine',
            'cache_service',
            'authentication_service'
        ];
        
        for (const service of criticalServices) {
            this.createCircuitBreaker(service);
        }
    }

    createCircuitBreaker(serviceName) {
        const circuitBreaker = {
            name: serviceName,
            state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
            failureCount: 0,
            lastFailureTime: null,
            successCount: 0,
            statistics: {
                totalRequests: 0,
                failedRequests: 0,
                successfulRequests: 0
            }
        };
        
        this.circuitBreakers.set(serviceName, circuitBreaker);
        
        logger.info('Circuit breaker created', { service: serviceName });
    }

    async isCircuitOpen(serviceName) {
        if (!serviceName) return false;
        
        const breaker = this.circuitBreakers.get(serviceName);
        if (!breaker) return false;
        
        if (breaker.state === 'CLOSED') {
            return false;
        }
        
        if (breaker.state === 'OPEN') {
            // Check if recovery time has passed
            const timeSinceLastFailure = Date.now() - breaker.lastFailureTime;
            if (timeSinceLastFailure >= this.config.circuitBreaker.recoveryTime) {
                // Move to half-open state
                breaker.state = 'HALF_OPEN';
                breaker.successCount = 0;
                logger.info('Circuit breaker moved to half-open', { service: serviceName });
            }
            return breaker.state === 'OPEN';
        }
        
        return false; // HALF_OPEN allows requests through
    }

    async triggerCircuitBreaker(serviceName, errorInfo) {
        if (!serviceName) return;
        
        const breaker = this.circuitBreakers.get(serviceName);
        if (!breaker) {
            this.createCircuitBreaker(serviceName);
            return;
        }
        
        breaker.failureCount++;
        breaker.lastFailureTime = Date.now();
        breaker.statistics.totalRequests++;
        breaker.statistics.failedRequests++;
        
        if (breaker.state === 'HALF_OPEN') {
            // Failure in half-open state, return to open
            breaker.state = 'OPEN';
            breaker.failureCount = 1; // Reset counter
            this.stats.circuitBreakerTrips++;
            
            logger.warn('Circuit breaker returned to open state', { service: serviceName });
            this.emit('circuitBreakerOpened', { service: serviceName, reason: 'half_open_failure' });
        } else if (breaker.failureCount >= this.config.circuitBreaker.failureThreshold) {
            // Too many failures, open the circuit
            breaker.state = 'OPEN';
            this.stats.circuitBreakerTrips++;
            
            logger.warn('Circuit breaker opened', { 
                service: serviceName, 
                failureCount: breaker.failureCount 
            });
            this.emit('circuitBreakerOpened', { service: serviceName, failureCount: breaker.failureCount });
        }
    }

    async recordSuccess(serviceName) {
        if (!serviceName) return;
        
        const breaker = this.circuitBreakers.get(serviceName);
        if (!breaker) return;
        
        breaker.statistics.totalRequests++;
        breaker.statistics.successfulRequests++;
        
        if (breaker.state === 'HALF_OPEN') {
            breaker.successCount++;
            
            // If enough successes in half-open state, close the circuit
            if (breaker.successCount >= 3) { // Require 3 successes to close
                breaker.state = 'CLOSED';
                breaker.failureCount = 0;
                breaker.successCount = 0;
                
                logger.info('Circuit breaker closed', { service: serviceName });
                this.emit('circuitBreakerClosed', { service: serviceName });
            }
        } else if (breaker.state === 'CLOSED') {
            // Reset failure count on success
            breaker.failureCount = Math.max(0, breaker.failureCount - 1);
        }
    }

    async handleCircuitOpen(errorInfo) {
        const service = errorInfo.context.service;
        
        logger.warn('Service circuit is open, handling with fallback', { service });
        
        // Try graceful degradation
        const degradationResult = await this.attemptGracefulDegradation(errorInfo);
        
        if (degradationResult.degraded) {
            return {
                circuitOpen: true,
                degraded: true,
                result: degradationResult
            };
        }
        
        // Return circuit open error
        return {
            circuitOpen: true,
            error: new Error(`Service ${service} is currently unavailable (circuit breaker open)`)
        };
    }

    registerFallbackHandler(serviceName, handler) {
        this.fallbackHandlers.set(serviceName, handler);
        logger.info('Fallback handler registered', { service: serviceName });
    }

    async initializeHealthChecks() {
        // Database health check
        this.healthChecks.set('database', async () => {
            try {
                // This would check actual database connection
                return { healthy: true, latency: Math.random() * 50 + 10 };
            } catch (error) {
                return { healthy: false, error: error.message };
            }
        });
        
        // Cache health check
        this.healthChecks.set('cache', async () => {
            try {
                // This would check cache connectivity
                return { healthy: true, hitRate: Math.random() * 0.3 + 0.7 };
            } catch (error) {
                return { healthy: false, error: error.message };
            }
        });
        
        // Search engine health check
        this.healthChecks.set('search', async () => {
            try {
                // This would check search engine status
                return { healthy: true, indexSize: Math.floor(Math.random() * 1000000) };
            } catch (error) {
                return { healthy: false, error: error.message };
            }
        });
    }

    async performHealthChecks() {
        const results = {};
        
        for (const [name, healthCheck] of this.healthChecks) {
            try {
                results[name] = await healthCheck();
            } catch (error) {
                results[name] = { healthy: false, error: error.message };
            }
        }
        
        return results;
    }

    updateErrorMetrics(errorInfo) {
        const key = `${errorInfo.category}_${Date.now() - (Date.now() % 60000)}`; // Per minute
        
        if (!this.errorMetrics.has(key)) {
            this.errorMetrics.set(key, {
                count: 0,
                category: errorInfo.category,
                timestamp: Date.now()
            });
        }
        
        this.errorMetrics.get(key).count++;
        
        // Cleanup old metrics
        this.cleanupOldMetrics();
    }

    cleanupOldMetrics() {
        const cutoff = Date.now() - this.config.monitoring.metricsRetention;
        
        for (const [key, metric] of this.errorMetrics) {
            if (metric.timestamp < cutoff) {
                this.errorMetrics.delete(key);
            }
        }
    }

    startErrorMonitoring() {
        this.monitoringTimer = setInterval(() => {
            this.checkErrorRates();
        }, this.config.circuitBreaker.monitoringPeriod);
    }

    checkErrorRates() {
        const now = Date.now();
        const recentMetrics = Array.from(this.errorMetrics.values())
            .filter(metric => now - metric.timestamp < this.config.circuitBreaker.monitoringPeriod);
        
        const totalErrors = recentMetrics.reduce((sum, metric) => sum + metric.count, 0);
        
        if (totalErrors > 0) {
            const errorRate = totalErrors / (this.config.circuitBreaker.monitoringPeriod / 60000); // errors per minute
            
            if (errorRate > this.config.monitoring.errorRateThreshold * 60) { // Convert to per-minute threshold
                logger.warn('High error rate detected', { 
                    errorRate: `${errorRate}/min`,
                    threshold: `${this.config.monitoring.errorRateThreshold * 60}/min`
                });
                
                this.emit('highErrorRate', { errorRate, threshold: this.config.monitoring.errorRateThreshold });
            }
        }
    }

    async executeWithErrorHandling(operation, context = {}) {
        let attempts = 0;
        const maxAttempts = this.config.retry.maxAttempts;
        
        while (attempts < maxAttempts) {
            attempts++;
            
            try {
                // Check circuit breaker
                if (await this.isCircuitOpen(context.service)) {
                    const circuitResult = await this.handleCircuitOpen({ context });
                    if (circuitResult.error) {
                        throw circuitResult.error;
                    }
                    return circuitResult.result;
                }
                
                // Execute operation
                const result = await operation();
                
                // Record success
                await this.recordSuccess(context.service);
                
                return result;
                
            } catch (error) {
                context.attempts = attempts;
                const handlingResult = await this.handleError(error, context);
                
                if (handlingResult.recovered && attempts < maxAttempts) {
                    // Continue with retry
                    continue;
                } else if (handlingResult.degraded) {
                    // Return degraded result
                    return handlingResult.result.result;
                } else if (attempts >= maxAttempts) {
                    // All attempts exhausted
                    throw error;
                }
            }
        }
    }

    getMetrics() {
        const circuitBreakerStats = {};
        for (const [name, breaker] of this.circuitBreakers) {
            circuitBreakerStats[name] = {
                state: breaker.state,
                failureCount: breaker.failureCount,
                statistics: breaker.statistics
            };
        }
        
        const recentErrors = Array.from(this.errorMetrics.values())
            .filter(metric => Date.now() - metric.timestamp < 60000) // Last minute
            .reduce((sum, metric) => sum + metric.count, 0);
        
        return {
            ...this.stats,
            recentErrorRate: recentErrors,
            circuitBreakers: circuitBreakerStats,
            healthChecks: this.healthChecks.size,
            fallbackHandlers: this.fallbackHandlers.size,
            recoveryStrategies: this.recoveryStrategies.size
        };
    }

    // Utility methods
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async timeoutPromise(ms) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Operation timed out')), ms);
        });
    }

    async shutdown() {
        logger.info('Shutting down Comprehensive Error System');
        
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
        }
        
        this.emit('shutdown');
        logger.info('Comprehensive Error System shutdown complete');
    }
}

module.exports = { ComprehensiveErrorSystem };