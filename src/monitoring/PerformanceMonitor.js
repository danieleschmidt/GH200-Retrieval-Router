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
            throughput: 0
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
    }
}

module.exports = { PerformanceMonitor };