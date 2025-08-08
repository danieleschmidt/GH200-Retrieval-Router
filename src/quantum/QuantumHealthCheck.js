/**
 * Quantum Health Check System
 * Monitors and validates quantum component health
 */

const { logger } = require('../utils/logger');

class QuantumHealthCheck {
    constructor(options = {}) {
        this.config = {
            checkInterval: options.checkInterval || 30000, // 30 seconds
            healthThresholds: {
                coherence: options.minCoherence || 0.1,
                entanglementRatio: options.maxEntanglementRatio || 0.8,
                errorRate: options.maxErrorRate || 0.05,
                responseTime: options.maxResponseTime || 5000
            },
            enableAutoHealing: options.enableAutoHealing !== false,
            alertThreshold: options.alertThreshold || 3, // failures before alert
            ...options
        };
        
        this.healthStatus = new Map();
        this.healthHistory = [];
        this.failureCounts = new Map();
        this.isMonitoring = false;
        this.healthTimer = null;
    }
    
    async startMonitoring(quantumComponents) {
        if (this.isMonitoring) return;
        
        try {
            this.components = quantumComponents;
            
            logger.info('Starting quantum health monitoring', {
                checkInterval: this.config.checkInterval,
                components: Object.keys(quantumComponents)
            });
            
            // Initial health check
            await this.performHealthCheck();
            
            // Start periodic monitoring
            this.healthTimer = setInterval(() => {
                this.performHealthCheck().catch(error => {
                    logger.error('Health check failed', { error: error.message });
                });
            }, this.config.checkInterval);
            
            this.isMonitoring = true;
            
        } catch (error) {
            logger.error('Failed to start health monitoring', { error: error.message });
            throw error;
        }
    }
    
    async performHealthCheck() {
        const healthReport = {
            timestamp: Date.now(),
            overall: 'healthy',
            components: {},
            alerts: []
        };
        
        try {
            // Check each quantum component
            for (const [name, component] of Object.entries(this.components)) {
                try {
                    const componentHealth = await this.checkComponentHealth(name, component);
                    healthReport.components[name] = componentHealth;
                    
                    if (componentHealth.status !== 'healthy') {
                        healthReport.overall = 'degraded';
                    }
                    
                    if (componentHealth.status === 'critical') {
                        healthReport.overall = 'critical';
                        healthReport.alerts.push({
                            component: name,
                            severity: 'critical',
                            message: componentHealth.issues.join(', ')
                        });
                    }
                    
                } catch (error) {
                    logger.error(`Health check failed for ${name}`, { error: error.message });
                    healthReport.components[name] = {
                        status: 'error',
                        error: error.message
                    };
                    healthReport.overall = 'critical';
                }
            }
            
            // Update health status
            this.healthStatus.set(Date.now(), healthReport);
            this.healthHistory.push(healthReport);
            
            // Maintain history size
            if (this.healthHistory.length > 100) {
                this.healthHistory.shift();
            }
            
            // Handle alerts and auto-healing
            if (healthReport.alerts.length > 0) {
                await this.handleHealthAlerts(healthReport.alerts);
            }
            
            // Log health status
            if (healthReport.overall !== 'healthy') {
                logger.warn('Quantum system health degraded', {
                    overall: healthReport.overall,
                    issues: healthReport.alerts.length
                });
            }
            
            return healthReport;
            
        } catch (error) {
            logger.error('Critical health check failure', { error: error.message });
            throw error;
        }
    }
    
    async checkComponentHealth(name, component) {
        const health = {
            status: 'healthy',
            metrics: {},
            issues: []
        };
        
        try {
            switch (name) {
                case 'planner':
                    await this.checkPlannerHealth(component, health);
                    break;
                case 'optimizer':
                    await this.checkOptimizerHealth(component, health);
                    break;
                case 'monitor':
                    await this.checkMonitorHealth(component, health);
                    break;
                case 'cache':
                    await this.checkCacheHealth(component, health);
                    break;
                default:
                    health.status = 'unknown';
                    health.issues.push('Unknown component type');
            }
            
            // Determine overall component status
            if (health.issues.length > 0) {
                const criticalIssues = health.issues.filter(issue => 
                    issue.includes('critical') || issue.includes('failed')
                );
                health.status = criticalIssues.length > 0 ? 'critical' : 'degraded';
            }
            
        } catch (error) {
            health.status = 'error';
            health.error = error.message;
        }
        
        return health;
    }
    
    async checkPlannerHealth(planner, health) {
        if (!planner.isInitialized) {
            health.issues.push('Planner not initialized');
            return;
        }
        
        const metrics = planner.getMetrics();
        health.metrics = metrics;
        
        // Check coherence levels
        if (metrics.averageCoherence < this.config.healthThresholds.coherence) {
            health.issues.push(`Low average coherence: ${metrics.averageCoherence.toFixed(3)}`);
        }
        
        // Check entanglement ratio
        const entanglementRatio = metrics.totalTasks > 0 ? 
            metrics.entanglements / metrics.totalTasks : 0;
        if (entanglementRatio > this.config.healthThresholds.entanglementRatio) {
            health.issues.push(`High entanglement ratio: ${entanglementRatio.toFixed(3)}`);
        }
        
        // Check task processing
        if (metrics.totalTasks > 1000 && metrics.systemEfficiency < 0.5) {
            health.issues.push(`Low system efficiency: ${metrics.systemEfficiency.toFixed(3)}`);
        }
    }
    
    async checkOptimizerHealth(optimizer, health) {
        if (!optimizer.isRunning) {
            health.issues.push('Optimizer not running');
            return;
        }
        
        // Check execution history
        const historySize = optimizer.executionHistory.length;
        health.metrics.executionHistory = historySize;
        
        if (historySize > 0) {
            const recentExecutions = optimizer.executionHistory.slice(-10);
            const successRate = recentExecutions.filter(e => e.success).length / recentExecutions.length;
            health.metrics.successRate = successRate;
            
            if (successRate < (1 - this.config.healthThresholds.errorRate)) {
                health.issues.push(`Low success rate: ${(successRate * 100).toFixed(1)}%`);
            }
        }
        
        // Check metrics collection
        const metricsSize = optimizer.performanceMetrics.size;
        health.metrics.performanceMetrics = metricsSize;
        
        if (metricsSize === 0 && historySize > 5) {
            health.issues.push('No performance metrics collected');
        }
    }
    
    async checkMonitorHealth(monitor, health) {
        if (!monitor.isMonitoring) {
            health.issues.push('Monitor not active');
            return;
        }
        
        // Check alert system
        const alertCount = monitor.alerts.size;
        health.metrics.activeAlerts = alertCount;
        
        if (alertCount > 10) {
            health.issues.push(`High alert count: ${alertCount}`);
        }
    }
    
    async checkCacheHealth(cache, health) {
        try {
            const stats = cache.getStatistics();
            health.metrics = stats;
            
            // Check hit rates
            if (stats.hitRate < 0.7) {
                health.issues.push(`Low cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
            }
            
            // Check memory usage
            if (stats.memoryUsage > 0.9) {
                health.issues.push(`High memory usage: ${(stats.memoryUsage * 100).toFixed(1)}%`);
            }
            
        } catch (error) {
            health.issues.push(`Cache statistics error: ${error.message}`);
        }
    }
    
    async handleHealthAlerts(alerts) {
        for (const alert of alerts) {
            // Update failure count
            const currentCount = this.failureCounts.get(alert.component) || 0;
            this.failureCounts.set(alert.component, currentCount + 1);
            
            // Trigger alert if threshold exceeded
            if (currentCount >= this.config.alertThreshold) {
                logger.critical('Quantum component failure threshold exceeded', {
                    component: alert.component,
                    failureCount: currentCount,
                    message: alert.message
                });
                
                // Attempt auto-healing if enabled
                if (this.config.enableAutoHealing) {
                    await this.attemptAutoHealing(alert.component);
                }
            }
        }
    }
    
    async attemptAutoHealing(componentName) {
        try {
            logger.info(`Attempting auto-healing for ${componentName}`);
            
            const component = this.components[componentName];
            if (!component) {
                logger.warn(`Cannot heal unknown component: ${componentName}`);
                return;
            }
            
            switch (componentName) {
                case 'planner':
                    if (!component.isInitialized) {
                        await component.initialize();
                        logger.info('Reinitialized quantum planner');
                    }
                    break;
                    
                case 'optimizer':
                    if (!component.isRunning) {
                        await component.initialize();
                        logger.info('Restarted adaptive optimizer');
                    }
                    break;
                    
                case 'monitor':
                    if (!component.isMonitoring) {
                        await component.initialize();
                        logger.info('Restarted quantum monitor');
                    }
                    break;
                    
                default:
                    logger.warn(`No auto-healing strategy for ${componentName}`);
            }
            
            // Reset failure count on successful healing
            this.failureCounts.set(componentName, 0);
            
        } catch (error) {
            logger.error(`Auto-healing failed for ${componentName}`, { 
                error: error.message 
            });
        }
    }
    
    getHealthStatus() {
        const latest = this.healthHistory[this.healthHistory.length - 1];
        return latest || { overall: 'unknown', components: {} };
    }
    
    getHealthHistory(limit = 10) {
        return this.healthHistory.slice(-limit);
    }
    
    async stopMonitoring() {
        if (!this.isMonitoring) return;
        
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
            this.healthTimer = null;
        }
        
        this.isMonitoring = false;
        logger.info('Stopped quantum health monitoring');
    }
}

module.exports = { QuantumHealthCheck };