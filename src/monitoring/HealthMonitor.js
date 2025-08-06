/**
 * HealthMonitor - Comprehensive health monitoring for GH200 system
 * Monitors all components and provides detailed health reports
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');
const { AlertManager, ALERT_TYPES, SEVERITY } = require('./AlertManager');

/**
 * Health status levels
 */
const HEALTH_STATUS = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNHEALTHY: 'unhealthy',
    CRITICAL: 'critical'
};

class ComponentHealth {
    constructor(name, checkFunction, options = {}) {
        this.name = name;
        this.checkFunction = checkFunction;
        this.options = {
            interval: 30000, // 30 seconds
            timeout: 5000,   // 5 seconds
            retries: 3,
            criticalThreshold: 0.5, // 50% failure rate
            degradedThreshold: 0.2, // 20% failure rate
            ...options
        };
        
        this.status = HEALTH_STATUS.HEALTHY;
        this.lastCheck = null;
        this.lastSuccess = null;
        this.checkHistory = [];
        this.currentError = null;
        this.consecutiveFailures = 0;
        
        // Statistics
        this.stats = {
            totalChecks: 0,
            successfulChecks: 0,
            failedChecks: 0,
            averageLatency: 0,
            uptime: 0
        };
        
        this.startTime = Date.now();
    }
    
    /**
     * Perform health check
     * @returns {Promise<Object>} Health check result
     */
    async performCheck() {
        const checkStartTime = Date.now();
        
        try {
            const result = await Promise.race([
                this.checkFunction(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Health check timeout')), this.options.timeout)
                )
            ]);
            
            const latency = Date.now() - checkStartTime;
            
            this._recordSuccess(latency, result);
            
            return {
                status: HEALTH_STATUS.HEALTHY,
                timestamp: new Date().toISOString(),
                latency,
                result,
                component: this.name
            };
            
        } catch (error) {
            const latency = Date.now() - checkStartTime;
            
            this._recordFailure(error, latency);
            
            return {
                status: this._calculateStatus(),
                timestamp: new Date().toISOString(),
                latency,
                error: error.message,
                component: this.name,
                consecutiveFailures: this.consecutiveFailures
            };
        }
    }
    
    /**
     * Get component health status
     * @returns {Object} Health status
     */
    getStatus() {
        return {
            name: this.name,
            status: this.status,
            lastCheck: this.lastCheck,
            lastSuccess: this.lastSuccess,
            consecutiveFailures: this.consecutiveFailures,
            currentError: this.currentError,
            stats: { ...this.stats },
            uptime: this._calculateUptime()
        };
    }
    
    /**
     * Record successful check
     */
    _recordSuccess(latency, result) {
        this.lastCheck = new Date().toISOString();
        this.lastSuccess = this.lastCheck;
        this.consecutiveFailures = 0;
        this.currentError = null;
        
        this.stats.totalChecks++;
        this.stats.successfulChecks++;
        this.stats.averageLatency = (
            (this.stats.averageLatency * (this.stats.successfulChecks - 1) + latency) /
            this.stats.successfulChecks
        );
        
        this._addToHistory(true, latency);
        this.status = HEALTH_STATUS.HEALTHY;
    }
    
    /**
     * Record failed check
     */
    _recordFailure(error, latency) {
        this.lastCheck = new Date().toISOString();
        this.consecutiveFailures++;
        this.currentError = error.message;
        
        this.stats.totalChecks++;
        this.stats.failedChecks++;
        
        this._addToHistory(false, latency);
        this.status = this._calculateStatus();
    }
    
    /**
     * Add check result to history
     */
    _addToHistory(success, latency) {
        this.checkHistory.push({
            timestamp: Date.now(),
            success,
            latency
        });
        
        // Keep only last 100 checks
        if (this.checkHistory.length > 100) {
            this.checkHistory.shift();
        }
    }
    
    /**
     * Calculate health status based on failure rate
     */
    _calculateStatus() {
        if (this.checkHistory.length === 0) {
            return HEALTH_STATUS.HEALTHY;
        }
        
        // Calculate failure rate over recent checks
        const recentChecks = this.checkHistory.slice(-20); // Last 20 checks
        const failures = recentChecks.filter(check => !check.success).length;
        const failureRate = failures / recentChecks.length;
        
        if (failureRate >= this.options.criticalThreshold) {
            return HEALTH_STATUS.CRITICAL;
        } else if (failureRate >= this.options.degradedThreshold) {
            return HEALTH_STATUS.DEGRADED;
        } else if (this.consecutiveFailures > 0) {
            return HEALTH_STATUS.UNHEALTHY;
        } else {
            return HEALTH_STATUS.HEALTHY;
        }
    }
    
    /**
     * Calculate uptime percentage
     */
    _calculateUptime() {
        if (this.stats.totalChecks === 0) {
            return 1.0;
        }
        
        return this.stats.successfulChecks / this.stats.totalChecks;
    }
}

class HealthMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            globalCheckInterval: 30000, // 30 seconds
            alertManager: null,
            ...options
        };
        
        this.components = new Map();
        this.globalStatus = HEALTH_STATUS.HEALTHY;
        this.isRunning = false;
        this.checkInterval = null;
        
        // Alert manager for health alerts
        this.alertManager = this.options.alertManager || new AlertManager();
        
        logger.info('HealthMonitor initialized');
    }
    
    /**
     * Register a component for health monitoring
     * @param {string} name - Component name
     * @param {Function} checkFunction - Health check function
     * @param {Object} options - Component options
     */
    registerComponent(name, checkFunction, options = {}) {
        const component = new ComponentHealth(name, checkFunction, options);
        this.components.set(name, component);
        
        logger.info('Health monitoring registered for component', { name });
        
        return component;
    }
    
    /**
     * Start health monitoring
     */
    start() {
        if (this.isRunning) {
            logger.warn('HealthMonitor already running');
            return;
        }
        
        this.isRunning = true;
        
        // Perform initial check
        this._performGlobalCheck();
        
        // Start periodic checking
        this.checkInterval = setInterval(() => {
            this._performGlobalCheck();
        }, this.options.globalCheckInterval);
        
        logger.info('HealthMonitor started', {
            interval: this.options.globalCheckInterval,
            components: this.components.size
        });
        
        this.emit('started');
    }
    
    /**
     * Stop health monitoring
     */
    stop() {
        if (!this.isRunning) {
            return;
        }
        
        this.isRunning = false;
        
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        logger.info('HealthMonitor stopped');
        this.emit('stopped');
    }
    
    /**
     * Get overall system health
     * @returns {Object} System health status
     */
    getSystemHealth() {
        const components = {};
        let healthyComponents = 0;
        let degradedComponents = 0;
        let unhealthyComponents = 0;
        let criticalComponents = 0;
        
        for (const [name, component] of this.components) {
            const status = component.getStatus();
            components[name] = status;
            
            switch (status.status) {
                case HEALTH_STATUS.HEALTHY:
                    healthyComponents++;
                    break;
                case HEALTH_STATUS.DEGRADED:
                    degradedComponents++;
                    break;
                case HEALTH_STATUS.UNHEALTHY:
                    unhealthyComponents++;
                    break;
                case HEALTH_STATUS.CRITICAL:
                    criticalComponents++;
                    break;
            }
        }
        
        // Determine overall system status
        let overallStatus = HEALTH_STATUS.HEALTHY;
        if (criticalComponents > 0) {
            overallStatus = HEALTH_STATUS.CRITICAL;
        } else if (unhealthyComponents > 0) {
            overallStatus = HEALTH_STATUS.UNHEALTHY;
        } else if (degradedComponents > 0) {
            overallStatus = HEALTH_STATUS.DEGRADED;
        }
        
        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            components,
            summary: {
                total: this.components.size,
                healthy: healthyComponents,
                degraded: degradedComponents,
                unhealthy: unhealthyComponents,
                critical: criticalComponents
            }
        };
    }
    
    /**
     * Get component health
     * @param {string} name - Component name
     * @returns {Object|null} Component health or null if not found
     */
    getComponentHealth(name) {
        const component = this.components.get(name);
        return component ? component.getStatus() : null;
    }
    
    /**
     * Perform health check on specific component
     * @param {string} name - Component name
     * @returns {Promise<Object>} Health check result
     */
    async checkComponent(name) {
        const component = this.components.get(name);
        if (!component) {
            throw new Error(`Component '${name}' not found`);
        }
        
        return await component.performCheck();
    }
    
    /**
     * Perform global health check on all components
     */
    async _performGlobalCheck() {
        const checkPromises = [];
        
        for (const [name, component] of this.components) {
            checkPromises.push(
                component.performCheck().catch(error => ({
                    component: name,
                    error: error.message,
                    status: HEALTH_STATUS.CRITICAL
                }))
            );
        }
        
        const results = await Promise.all(checkPromises);
        
        // Process results and trigger alerts
        for (const result of results) {
            this._processHealthResult(result);
        }
        
        // Update global status
        const systemHealth = this.getSystemHealth();
        const previousStatus = this.globalStatus;
        this.globalStatus = systemHealth.status;
        
        // Emit status change if changed
        if (previousStatus !== this.globalStatus) {
            this.emit('statusChanged', {
                from: previousStatus,
                to: this.globalStatus,
                timestamp: new Date().toISOString()
            });
            
            logger.warn('System health status changed', {
                from: previousStatus,
                to: this.globalStatus
            });
        }
        
        this.emit('healthCheck', systemHealth);
    }
    
    /**
     * Process individual health check result
     * @param {Object} result - Health check result
     */
    _processHealthResult(result) {
        const component = this.components.get(result.component);
        if (!component) {
            return;
        }
        
        // Check for status changes that warrant alerts
        const previousStatus = component.status;
        
        if (result.status !== previousStatus) {
            let alertSeverity = SEVERITY.INFO;
            
            switch (result.status) {
                case HEALTH_STATUS.DEGRADED:
                    alertSeverity = SEVERITY.WARNING;
                    break;
                case HEALTH_STATUS.UNHEALTHY:
                    alertSeverity = SEVERITY.ERROR;
                    break;
                case HEALTH_STATUS.CRITICAL:
                    alertSeverity = SEVERITY.CRITICAL;
                    break;
            }
            
            if (result.status !== HEALTH_STATUS.HEALTHY) {
                this.alertManager.createAlert(
                    ALERT_TYPES.HEALTH_CHECK,
                    alertSeverity,
                    `Component '${result.component}' health status changed to ${result.status}`,
                    {
                        component: result.component,
                        previousStatus,
                        currentStatus: result.status,
                        error: result.error,
                        consecutiveFailures: result.consecutiveFailures
                    }
                );
            }
        }
        
        // Alert on consecutive failures
        if (component.consecutiveFailures >= 5 && component.consecutiveFailures % 5 === 0) {
            this.alertManager.createAlert(
                ALERT_TYPES.HEALTH_CHECK,
                SEVERITY.ERROR,
                `Component '${result.component}' has ${component.consecutiveFailures} consecutive failures`,
                {
                    component: result.component,
                    consecutiveFailures: component.consecutiveFailures,
                    error: component.currentError
                }
            );
        }
    }
}

/**
 * Create health check functions for common components
 */
const HealthChecks = {
    /**
     * Memory usage health check
     * @param {Object} memoryManager - Grace memory manager
     * @returns {Function} Health check function
     */
    memoryUsage(memoryManager) {
        return async () => {
            const stats = memoryManager.getStats();
            const utilizationRatio = stats.utilizationRatio || 0;
            
            return {
                utilizationRatio,
                totalAllocated: stats.totalAllocated,
                totalAvailable: stats.totalAvailable,
                healthy: utilizationRatio < 0.9
            };
        };
    },
    
    /**
     * Database connection health check
     * @param {Object} database - Vector database instance
     * @returns {Function} Health check function
     */
    database(database) {
        return async () => {
            const stats = database.getStats();
            
            // Simple ping test
            const startTime = Date.now();
            const result = await database.search({
                embedding: new Array(384).fill(0.1),
                k: 1
            });
            const queryTime = Date.now() - startTime;
            
            return {
                queryTime,
                vectorCount: stats.vectorCount,
                healthy: queryTime < 1000 && result.length >= 0
            };
        };
    },
    
    /**
     * Circuit breaker health check
     * @param {Object} circuitBreaker - Circuit breaker instance
     * @returns {Function} Health check function
     */
    circuitBreaker(circuitBreaker) {
        return async () => {
            const status = circuitBreaker.getStatus();
            
            return {
                state: status.state,
                failureCount: status.failureCount,
                healthy: status.state !== 'OPEN'
            };
        };
    }
};

module.exports = {
    HealthMonitor,
    ComponentHealth,
    HealthChecks,
    HEALTH_STATUS
};