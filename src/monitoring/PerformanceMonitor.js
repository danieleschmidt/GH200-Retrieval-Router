/**
 * PerformanceMonitor - Real-time performance monitoring and metrics collection
 * Optimized for GH200 Grace Hopper system metrics
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');

class PerformanceMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            metricsInterval: 10000, // 10 seconds
            enableGraceMetrics: true,
            enableNVLinkMetrics: true,
            enableQueryMetrics: true,
            retentionPeriod: 3600000, // 1 hour
            ...options
        };
        
        this.router = options.router;
        
        // Metrics storage
        this.metrics = {
            queries: new Map(),
            system: new Map(),
            grace: new Map(),
            nvlink: new Map()
        };
        
        // Performance counters
        this.counters = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averageLatency: 0,
            throughput: 0,
            circuitBreakerTrips: 0,
            timeouts: 0,
            errorRate: 0
        };
        
        // Advanced monitoring features
        this.alerts = {
            thresholds: {
                errorRate: 5, // %
                responseTime: 5000, // ms
                throughputDrop: 50, // %
                memoryUsage: 90, // %
                cpuUsage: 95 // %
            },
            activeAlerts: new Map(),
            silencedAlerts: new Set()
        };
        
        // Predictive monitoring
        this.predictive = {
            patterns: new Map(),
            anomalies: [],
            baseline: {
                throughput: [],
                latency: [],
                errorRate: []
            }
        };
        
        // Health check state
        this.healthState = {
            overall: 'healthy',
            components: new Map(),
            lastHealthCheck: null,
            degradedComponents: new Set()
        };
        
        // Monitoring intervals
        this.intervals = [];
        this.started = false;
    }
    
    async start() {
        if (this.started) return;
        
        logger.info('Starting PerformanceMonitor');
        
        try {
            // Start metrics collection intervals
            await this._startMetricsCollection();
            
            // Start cleanup interval
            this._startCleanup();
            
            // Start alerting system
            this._startAlertingSystem();
            
            // Start predictive monitoring
            this._startPredictiveMonitoring();
            
            // Start health checks
            this._startHealthChecks();
            
            // Listen to router events
            if (this.router) {
                this._attachRouterListeners();
            }
            
            this.started = true;
            this.emit('started');
            
            logger.info('PerformanceMonitor started successfully');
            
        } catch (error) {
            logger.error('PerformanceMonitor start failed', { error: error.message });
            throw error;
        }
    }
    
    async stop() {
        if (!this.started) return;
        
        logger.info('Stopping PerformanceMonitor');
        
        try {
            // Clear all intervals
            this.intervals.forEach(interval => clearInterval(interval));
            this.intervals = [];
            
            // Detach router listeners
            if (this.router) {
                this.router.removeAllListeners('queryCompleted');
                this.router.removeAllListeners('queryFailed');
            }
            
            this.started = false;
            this.emit('stopped');
            
            logger.info('PerformanceMonitor stopped successfully');
            
        } catch (error) {
            logger.error('PerformanceMonitor stop failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Get current performance metrics
     */
    getMetrics() {
        const now = Date.now();
        
        return {
            timestamp: new Date().toISOString(),
            counters: { ...this.counters },
            system: this._getRecentMetrics('system', now),
            grace: this._getRecentMetrics('grace', now),
            nvlink: this._getRecentMetrics('nvlink', now),
            queries: this._getQueryMetrics()
        };
    }
    
    /**
     * Get performance summary
     */
    getSummary() {
        const metrics = this.getMetrics();
        
        return {
            uptime: process.uptime(),
            totalQueries: this.counters.totalQueries,
            successRate: this.counters.totalQueries > 0 ? 
                (this.counters.successfulQueries / this.counters.totalQueries) * 100 : 0,
            averageLatency: this.counters.averageLatency,
            currentThroughput: this.counters.throughput,
            cacheHitRate: (this.counters.cacheHits + this.counters.cacheMisses) > 0 ?
                (this.counters.cacheHits / (this.counters.cacheHits + this.counters.cacheMisses)) * 100 : 0,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage()
        };
    }
    
    /**
     * Record custom metric
     */
    recordMetric(category, name, value, tags = {}) {
        const timestamp = Date.now();
        
        if (!this.metrics[category]) {
            this.metrics[category] = new Map();
        }
        
        const key = `${name}_${timestamp}`;
        this.metrics[category].set(key, {
            name,
            value,
            timestamp,
            tags
        });
    }
    
    /**
     * Start metrics collection intervals
     */
    async _startMetricsCollection() {
        // System metrics collection
        const systemInterval = setInterval(() => {
            this._collectSystemMetrics();
        }, this.options.metricsInterval);
        this.intervals.push(systemInterval);
        
        // Grace memory metrics
        if (this.options.enableGraceMetrics) {
            const graceInterval = setInterval(() => {
                this._collectGraceMetrics();
            }, this.options.metricsInterval);
            this.intervals.push(graceInterval);
        }
        
        // NVLink metrics
        if (this.options.enableNVLinkMetrics) {
            const nvlinkInterval = setInterval(() => {
                this._collectNVLinkMetrics();
            }, this.options.metricsInterval);
            this.intervals.push(nvlinkInterval);
        }
        
        // Performance calculation interval
        const perfInterval = setInterval(() => {
            this._calculatePerformanceMetrics();
        }, this.options.metricsInterval);
        this.intervals.push(perfInterval);
        
        logger.info('Metrics collection intervals started');
    }
    
    /**
     * Start cleanup interval
     */
    _startCleanup() {
        const cleanupInterval = setInterval(() => {
            this._cleanupOldMetrics();
        }, 60000); // Clean every minute
        
        this.intervals.push(cleanupInterval);
    }
    
    /**
     * Attach router event listeners
     */
    _attachRouterListeners() {
        this.router.on('queryCompleted', (result) => {
            this._recordQueryCompletion(result, true);
        });
        
        this.router.on('queryFailed', (result) => {
            this._recordQueryCompletion(result, false);
        });
        
        logger.info('Router event listeners attached');
    }
    
    /**
     * Collect system metrics
     */
    _collectSystemMetrics() {
        const timestamp = Date.now();
        
        // Memory usage
        const memUsage = process.memoryUsage();
        this.metrics.system.set(`memory_${timestamp}`, {
            name: 'memory_usage',
            value: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers
            },
            timestamp
        });
        
        // CPU usage
        const cpuUsage = process.cpuUsage();
        this.metrics.system.set(`cpu_${timestamp}`, {
            name: 'cpu_usage',
            value: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            timestamp
        });
        
        // Event loop lag (simplified)
        const start = process.hrtime.bigint();
        setImmediate(() => {
            const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
            this.metrics.system.set(`eventloop_lag_${timestamp}`, {
                name: 'eventloop_lag',
                value: lag,
                timestamp
            });
        });
    }
    
    /**
     * Collect Grace memory metrics (mock implementation)
     */
    _collectGraceMetrics() {
        const timestamp = Date.now();
        
        // Mock Grace memory metrics
        const graceMetrics = {
            totalMemory: 480 * 1024 * 1024 * 1024, // 480GB
            usedMemory: Math.floor(Math.random() * 300 * 1024 * 1024 * 1024), // Random usage
            bandwidth: 850 + Math.random() * 50, // 850-900 GB/s
            utilizationPercent: Math.random() * 100
        };
        
        this.metrics.grace.set(`grace_memory_${timestamp}`, {
            name: 'grace_memory',
            value: graceMetrics,
            timestamp
        });
    }
    
    /**
     * Collect NVLink metrics (mock implementation)
     */
    _collectNVLinkMetrics() {
        const timestamp = Date.now();
        
        // Mock NVLink metrics
        const nvlinkMetrics = {
            bandwidth: 400 + Math.random() * 500, // GB/s
            utilization: Math.random() * 100, // Percent
            errorRate: Math.random() * 0.001, // Very low error rate
            activeConnections: Math.floor(Math.random() * 32) + 1
        };
        
        this.metrics.nvlink.set(`nvlink_${timestamp}`, {
            name: 'nvlink_metrics',
            value: nvlinkMetrics,
            timestamp
        });
    }
    
    /**
     * Calculate performance metrics
     */
    _calculatePerformanceMetrics() {
        // Calculate throughput (queries per second)
        const timeWindow = 60000; // 1 minute
        const now = Date.now();
        const recentQueries = Array.from(this.metrics.queries.values())
            .filter(metric => now - metric.timestamp <= timeWindow);
        
        this.counters.throughput = (recentQueries.length / 60).toFixed(2);
        
        // Calculate average latency from recent queries
        if (recentQueries.length > 0) {
            const totalLatency = recentQueries
                .filter(q => q.value.latency)
                .reduce((sum, q) => sum + q.value.latency, 0);
            
            const queryCount = recentQueries.filter(q => q.value.latency).length;
            this.counters.averageLatency = queryCount > 0 ? 
                Math.round(totalLatency / queryCount) : 0;
        }
    }
    
    /**
     * Record query completion
     */
    _recordQueryCompletion(result, success) {
        const timestamp = Date.now();
        
        // Update counters
        this.counters.totalQueries++;
        if (success) {
            this.counters.successfulQueries++;
        } else {
            this.counters.failedQueries++;
        }
        
        // Track cache hits/misses
        if (result.metadata && result.metadata.cacheHit) {
            this.counters.cacheHits++;
        } else {
            this.counters.cacheMisses++;
        }
        
        // Store detailed query metrics
        this.metrics.queries.set(`query_${result.queryId}`, {
            name: 'query_completion',
            value: {
                queryId: result.queryId,
                success,
                latency: result.metadata ? result.metadata.latency : result.latency,
                retrievedCount: result.metadata ? result.metadata.retrievedCount : 0,
                shardsQueried: result.metadata ? result.metadata.shardsQueried : 0,
                cacheHit: result.metadata ? result.metadata.cacheHit : false,
                error: result.error
            },
            timestamp
        });
    }
    
    /**
     * Get recent metrics for a category
     */
    _getRecentMetrics(category, currentTime) {
        const timeWindow = 300000; // 5 minutes
        const metrics = this.metrics[category];
        
        if (!metrics) return [];
        
        return Array.from(metrics.values())
            .filter(metric => currentTime - metric.timestamp <= timeWindow)
            .sort((a, b) => a.timestamp - b.timestamp);
    }
    
    /**
     * Get query metrics summary
     */
    _getQueryMetrics() {
        const now = Date.now();
        const timeWindow = 300000; // 5 minutes
        
        const recentQueries = Array.from(this.metrics.queries.values())
            .filter(metric => now - metric.timestamp <= timeWindow);
        
        const successful = recentQueries.filter(q => q.value.success).length;
        const failed = recentQueries.filter(q => !q.value.success).length;
        const cacheHits = recentQueries.filter(q => q.value.cacheHit).length;
        
        const latencies = recentQueries
            .filter(q => q.value.latency)
            .map(q => q.value.latency)
            .sort((a, b) => a - b);
        
        return {
            total: recentQueries.length,
            successful,
            failed,
            cacheHits,
            successRate: recentQueries.length > 0 ? (successful / recentQueries.length) * 100 : 0,
            cacheHitRate: recentQueries.length > 0 ? (cacheHits / recentQueries.length) * 100 : 0,
            latency: {
                min: latencies.length > 0 ? latencies[0] : 0,
                max: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
                median: latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0,
                p95: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0,
                p99: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0
            }
        };
    }
    
    /**
     * Clean up old metrics
     */
    _cleanupOldMetrics() {
        const now = Date.now();
        const retentionPeriod = this.options.retentionPeriod;
        
        for (const [category, metricsMap] of Object.entries(this.metrics)) {
            if (metricsMap instanceof Map) {
                for (const [key, metric] of metricsMap.entries()) {
                    if (now - metric.timestamp > retentionPeriod) {
                        metricsMap.delete(key);
                    }
                }
            }
        }
        
        // Clean up old alerts
        for (const [alertId, alert] of this.alerts.activeAlerts) {
            if (now - alert.timestamp > 3600000) { // 1 hour
                this.alerts.activeAlerts.delete(alertId);
            }
        }
        
        // Clean up old anomalies
        this.predictive.anomalies = this.predictive.anomalies
            .filter(anomaly => now - anomaly.timestamp < 86400000); // 24 hours
    }
    
    /**
     * Start alerting system
     * @private
     */
    _startAlertingSystem() {
        const alertInterval = setInterval(() => {
            this._checkAlertThresholds();
        }, 30000); // Check every 30 seconds
        
        this.intervals.push(alertInterval);
        logger.info('Alerting system started');
    }
    
    /**
     * Start predictive monitoring
     * @private
     */
    _startPredictiveMonitoring() {
        const predictiveInterval = setInterval(() => {
            this._updateBaselineMetrics();
            this._detectAnomalies();
        }, 60000); // Every minute
        
        this.intervals.push(predictiveInterval);
        logger.info('Predictive monitoring started');
    }
    
    /**
     * Start health checks
     * @private
     */
    _startHealthChecks() {
        const healthInterval = setInterval(() => {
            this._performHealthCheck();
        }, 15000); // Every 15 seconds
        
        this.intervals.push(healthInterval);
        logger.info('Health check system started');
    }
    
    /**
     * Check alert thresholds
     * @private
     */
    _checkAlertThresholds() {
        const summary = this.getSummary();
        const now = Date.now();
        
        // Check error rate
        const errorRate = summary.totalQueries > 0 ? 
            (100 - summary.successRate) : 0;
        this.counters.errorRate = errorRate;
        
        if (errorRate > this.alerts.thresholds.errorRate) {
            this._triggerAlert('ERROR_RATE_HIGH', {
                current: errorRate,
                threshold: this.alerts.thresholds.errorRate,
                severity: 'critical'
            });
        }
        
        // Check response time
        if (summary.averageLatency > this.alerts.thresholds.responseTime) {
            this._triggerAlert('RESPONSE_TIME_HIGH', {
                current: summary.averageLatency,
                threshold: this.alerts.thresholds.responseTime,
                severity: 'warning'
            });
        }
        
        // Check memory usage
        const memoryUsagePercent = (summary.memoryUsage.heapUsed / summary.memoryUsage.heapTotal) * 100;
        if (memoryUsagePercent > this.alerts.thresholds.memoryUsage) {
            this._triggerAlert('MEMORY_USAGE_HIGH', {
                current: memoryUsagePercent,
                threshold: this.alerts.thresholds.memoryUsage,
                severity: 'warning'
            });
        }
        
        // Check for throughput drops
        this._checkThroughputTrends();
    }
    
    /**
     * Check throughput trends for drops
     * @private
     */
    _checkThroughputTrends() {
        const recentThroughput = parseFloat(this.counters.throughput);
        const baseline = this.predictive.baseline.throughput;
        
        if (baseline.length > 10) {
            const avgBaseline = baseline.reduce((sum, val) => sum + val, 0) / baseline.length;
            const dropPercentage = ((avgBaseline - recentThroughput) / avgBaseline) * 100;
            
            if (dropPercentage > this.alerts.thresholds.throughputDrop) {
                this._triggerAlert('THROUGHPUT_DROP', {
                    current: recentThroughput,
                    baseline: avgBaseline,
                    drop: dropPercentage,
                    severity: 'warning'
                });
            }
        }
    }
    
    /**
     * Trigger alert
     * @private
     */
    _triggerAlert(alertType, details) {
        const alertId = `${alertType}_${Date.now()}`;
        
        // Check if alert is silenced
        if (this.alerts.silencedAlerts.has(alertType)) {
            return;
        }
        
        // Check if similar alert is already active
        for (const [id, alert] of this.alerts.activeAlerts) {
            if (alert.type === alertType && Date.now() - alert.timestamp < 300000) { // 5 minutes
                return; // Don't spam alerts
            }
        }
        
        const alert = {
            id: alertId,
            type: alertType,
            timestamp: Date.now(),
            severity: details.severity || 'info',
            details,
            acknowledged: false
        };
        
        this.alerts.activeAlerts.set(alertId, alert);
        
        logger.warn(`Alert triggered: ${alertType}`, {
            alertId,
            severity: alert.severity,
            details: alert.details
        });
        
        this.emit('alert', alert);
    }
    
    /**
     * Update baseline metrics for anomaly detection
     * @private
     */
    _updateBaselineMetrics() {
        const summary = this.getSummary();
        const maxBaseline = 100; // Keep last 100 data points
        
        // Update throughput baseline
        const throughput = parseFloat(summary.currentThroughput) || 0;
        this.predictive.baseline.throughput.push(throughput);
        if (this.predictive.baseline.throughput.length > maxBaseline) {
            this.predictive.baseline.throughput.shift();
        }
        
        // Update latency baseline
        this.predictive.baseline.latency.push(summary.averageLatency);
        if (this.predictive.baseline.latency.length > maxBaseline) {
            this.predictive.baseline.latency.shift();
        }
        
        // Update error rate baseline
        this.predictive.baseline.errorRate.push(this.counters.errorRate);
        if (this.predictive.baseline.errorRate.length > maxBaseline) {
            this.predictive.baseline.errorRate.shift();
        }
    }
    
    /**
     * Detect anomalies in metrics
     * @private
     */
    _detectAnomalies() {
        const now = Date.now();
        
        // Simple anomaly detection using standard deviation
        this._detectMetricAnomaly('throughput', this.predictive.baseline.throughput, parseFloat(this.counters.throughput));
        this._detectMetricAnomaly('latency', this.predictive.baseline.latency, this.counters.averageLatency);
        this._detectMetricAnomaly('errorRate', this.predictive.baseline.errorRate, this.counters.errorRate);
    }
    
    /**
     * Detect anomaly for specific metric
     * @private
     */
    _detectMetricAnomaly(metricName, baseline, currentValue) {
        if (baseline.length < 10) return; // Need sufficient data
        
        const mean = baseline.reduce((sum, val) => sum + val, 0) / baseline.length;
        const variance = baseline.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / baseline.length;
        const stdDev = Math.sqrt(variance);
        
        // Consider value anomalous if it's more than 2 standard deviations from mean
        const threshold = 2;
        const zScore = Math.abs((currentValue - mean) / (stdDev || 1));
        
        if (zScore > threshold && stdDev > 0) {
            const anomaly = {
                metric: metricName,
                timestamp: Date.now(),
                currentValue,
                baseline: mean,
                zScore,
                severity: zScore > 3 ? 'high' : 'medium'
            };
            
            this.predictive.anomalies.push(anomaly);
            
            logger.info(`Anomaly detected in ${metricName}`, {
                currentValue,
                baseline: mean,
                zScore: zScore.toFixed(2),
                severity: anomaly.severity
            });
            
            this.emit('anomaly', anomaly);
        }
    }
    
    /**
     * Perform comprehensive health check
     * @private
     */
    async _performHealthCheck() {
        const now = Date.now();
        this.healthState.lastHealthCheck = now;
        
        const componentHealth = new Map();
        let overallHealthy = true;
        
        try {
            // Check router health
            if (this.router && typeof this.router.healthCheck === 'function') {
                try {
                    const routerHealth = await this.router.healthCheck();
                    componentHealth.set('router', routerHealth);
                    if (!routerHealth.healthy) {
                        overallHealthy = false;
                        this.healthState.degradedComponents.add('router');
                    } else {
                        this.healthState.degradedComponents.delete('router');
                    }
                } catch (error) {
                    componentHealth.set('router', { healthy: false, error: error.message });
                    overallHealthy = false;
                    this.healthState.degradedComponents.add('router');
                }
            }
            
            // Check system health
            const systemHealth = this._checkSystemHealth();
            componentHealth.set('system', systemHealth);
            if (!systemHealth.healthy) {
                overallHealthy = false;
                this.healthState.degradedComponents.add('system');
            } else {
                this.healthState.degradedComponents.delete('system');
            }
            
            // Check performance health
            const performanceHealth = this._checkPerformanceHealth();
            componentHealth.set('performance', performanceHealth);
            if (!performanceHealth.healthy) {
                overallHealthy = false;
                this.healthState.degradedComponents.add('performance');
            } else {
                this.healthState.degradedComponents.delete('performance');
            }
            
            // Update overall health
            const previousHealth = this.healthState.overall;
            this.healthState.overall = overallHealthy ? 'healthy' : 'degraded';
            this.healthState.components = componentHealth;
            
            // Emit health change event
            if (previousHealth !== this.healthState.overall) {
                logger.info(`System health changed: ${previousHealth} -> ${this.healthState.overall}`);
                this.emit('healthStateChanged', {
                    previous: previousHealth,
                    current: this.healthState.overall,
                    degradedComponents: Array.from(this.healthState.degradedComponents)
                });
            }
            
        } catch (error) {
            logger.error('Health check failed', { error: error.message });
            this.healthState.overall = 'unhealthy';
            overallHealthy = false;
        }
        
        this.emit('healthCheck', {
            overall: this.healthState.overall,
            healthy: overallHealthy,
            components: Object.fromEntries(componentHealth),
            timestamp: now,
            degradedComponents: Array.from(this.healthState.degradedComponents)
        });
    }
    
    /**
     * Check system health
     * @private
     */
    _checkSystemHealth() {
        const summary = this.getSummary();
        const memUsagePercent = (summary.memoryUsage.heapUsed / summary.memoryUsage.heapTotal) * 100;
        
        const checks = {
            memoryUsage: memUsagePercent < 90,
            eventLoopHealthy: true, // Would check event loop lag in real implementation
            processUptime: summary.uptime > 0
        };
        
        const healthy = Object.values(checks).every(check => check === true);
        
        return {
            healthy,
            checks,
            memoryUsagePercent: memUsagePercent.toFixed(1),
            uptime: summary.uptime
        };
    }
    
    /**
     * Check performance health
     * @private
     */
    _checkPerformanceHealth() {
        const summary = this.getSummary();
        
        const checks = {
            successRate: summary.successRate >= 95,
            responseTime: summary.averageLatency < 5000,
            errorRate: this.counters.errorRate < 5,
            throughput: parseFloat(summary.currentThroughput) > 0 || summary.totalQueries === 0
        };
        
        const healthy = Object.values(checks).every(check => check === true);
        
        return {
            healthy,
            checks,
            metrics: {
                successRate: summary.successRate.toFixed(1),
                averageLatency: summary.averageLatency,
                errorRate: this.counters.errorRate.toFixed(2),
                throughput: summary.currentThroughput
            }
        };
    }
    
    /**
     * Get comprehensive health status
     */
    getHealthStatus() {
        return {
            overall: this.healthState.overall,
            lastCheck: this.healthState.lastHealthCheck,
            components: Object.fromEntries(this.healthState.components || new Map()),
            degradedComponents: Array.from(this.healthState.degradedComponents),
            activeAlerts: Array.from(this.alerts.activeAlerts.values()),
            recentAnomalies: this.predictive.anomalies.slice(-10) // Last 10 anomalies
        };
    }
    
    /**
     * Acknowledge alert
     */
    acknowledgeAlert(alertId, acknowledgedBy) {
        const alert = this.alerts.activeAlerts.get(alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedBy = acknowledgedBy;
            alert.acknowledgedAt = Date.now();
            
            logger.info(`Alert acknowledged: ${alertId}`, {
                alertType: alert.type,
                acknowledgedBy
            });
            
            this.emit('alertAcknowledged', alert);
            return true;
        }
        return false;
    }
    
    /**
     * Silence alert type
     */
    silenceAlertType(alertType, duration = 3600000) { // Default 1 hour
        this.alerts.silencedAlerts.add(alertType);
        
        // Auto-remove silence after duration
        setTimeout(() => {
            this.alerts.silencedAlerts.delete(alertType);
            logger.info(`Alert silence removed: ${alertType}`);
        }, duration);
        
        logger.info(`Alert silenced: ${alertType}`, { duration });
        return true;
    }
}

module.exports = { PerformanceMonitor };