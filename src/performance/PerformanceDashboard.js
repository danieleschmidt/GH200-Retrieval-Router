/**
 * Real-Time Performance Monitoring Dashboard
 * Advanced analytics and visualization for GH200 vector search systems
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');

/**
 * Time series data point
 */
class TimeSeriesDataPoint {
    constructor(timestamp, value, metadata = {}) {
        this.timestamp = timestamp;
        this.value = value;
        this.metadata = metadata;
    }
}

/**
 * Time series buffer for efficient storage and querying
 */
class TimeSeriesBuffer {
    constructor(maxDataPoints = 10000, retentionMs = 86400000) { // 24 hours
        this.maxDataPoints = maxDataPoints;
        this.retentionMs = retentionMs;
        this.data = [];
        this.lastCleanup = Date.now();
    }
    
    addDataPoint(timestamp, value, metadata = {}) {
        const dataPoint = new TimeSeriesDataPoint(timestamp, value, metadata);
        this.data.push(dataPoint);
        
        // Maintain size limit
        if (this.data.length > this.maxDataPoints) {
            this.data.shift();
        }
        
        // Periodic cleanup of old data
        if (timestamp - this.lastCleanup > 3600000) { // Cleanup every hour
            this._cleanup(timestamp);
        }
    }
    
    _cleanup(currentTime) {
        const cutoffTime = currentTime - this.retentionMs;
        this.data = this.data.filter(point => point.timestamp > cutoffTime);
        this.lastCleanup = currentTime;
    }
    
    getDataPoints(startTime = 0, endTime = Date.now(), maxPoints = null) {
        let filtered = this.data.filter(point => 
            point.timestamp >= startTime && point.timestamp <= endTime
        );
        
        if (maxPoints && filtered.length > maxPoints) {
            // Downsample to requested number of points
            const step = Math.ceil(filtered.length / maxPoints);
            filtered = filtered.filter((_, index) => index % step === 0);
        }
        
        return filtered;
    }
    
    getLatestValue() {
        return this.data.length > 0 ? this.data[this.data.length - 1].value : null;
    }
    
    getStatistics(startTime = 0, endTime = Date.now()) {
        const points = this.getDataPoints(startTime, endTime);
        
        if (points.length === 0) {
            return {
                count: 0,
                min: null,
                max: null,
                average: null,
                sum: null
            };
        }
        
        const values = points.map(p => p.value);
        
        return {
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            average: values.reduce((a, b) => a + b, 0) / values.length,
            sum: values.reduce((a, b) => a + b, 0),
            latest: values[values.length - 1]
        };
    }
}

/**
 * Metric aggregator for real-time calculations
 */
class MetricAggregator {
    constructor(windowSizeMs = 60000) { // 1 minute window
        this.windowSizeMs = windowSizeMs;
        this.reset();
    }
    
    reset() {
        this.values = [];
        this.windowStart = Date.now();
    }
    
    addValue(value, timestamp = Date.now()) {
        // Remove old values outside the window
        const windowStart = timestamp - this.windowSizeMs;
        this.values = this.values.filter(v => v.timestamp > windowStart);
        
        // Add new value
        this.values.push({ value, timestamp });
    }
    
    getAverage() {
        if (this.values.length === 0) return 0;
        return this.values.reduce((sum, v) => sum + v.value, 0) / this.values.length;
    }
    
    getSum() {
        return this.values.reduce((sum, v) => sum + v.value, 0);
    }
    
    getCount() {
        return this.values.length;
    }
    
    getRate() {
        if (this.values.length < 2) return 0;
        const timeSpanMs = this.values[this.values.length - 1].timestamp - this.values[0].timestamp;
        return timeSpanMs > 0 ? (this.values.length / (timeSpanMs / 1000)) : 0; // per second
    }
    
    getPercentile(percentile) {
        if (this.values.length === 0) return 0;
        const sorted = [...this.values].sort((a, b) => a.value - b.value);
        const index = Math.ceil(sorted.length * (percentile / 100)) - 1;
        return sorted[Math.max(0, index)].value;
    }
}

/**
 * Alert system for monitoring thresholds
 */
class AlertSystem extends EventEmitter {
    constructor() {
        super();
        this.rules = new Map();
        this.activeAlerts = new Map();
        this.alertHistory = [];
    }
    
    addRule(id, condition, options = {}) {
        const rule = {
            id,
            condition, // Function that returns true when alert should trigger
            threshold: options.threshold,
            severity: options.severity || 'warning', // info, warning, error, critical
            message: options.message || `Alert triggered for rule ${id}`,
            cooldownMs: options.cooldownMs || 300000, // 5 minutes
            enabled: options.enabled !== false,
            lastTriggered: 0,
            triggerCount: 0
        };
        
        this.rules.set(id, rule);
        return rule;
    }
    
    removeRule(id) {
        this.rules.delete(id);
        this.activeAlerts.delete(id);
    }
    
    checkAlerts(metrics) {
        const now = Date.now();
        const triggeredAlerts = [];
        
        for (const [ruleId, rule] of this.rules) {
            if (!rule.enabled) continue;
            
            // Check cooldown period
            if (now - rule.lastTriggered < rule.cooldownMs) continue;
            
            try {
                const shouldTrigger = rule.condition(metrics);
                
                if (shouldTrigger && !this.activeAlerts.has(ruleId)) {
                    // New alert
                    const alert = {
                        id: ruleId,
                        rule,
                        triggeredAt: now,
                        severity: rule.severity,
                        message: rule.message,
                        metrics: { ...metrics }
                    };
                    
                    this.activeAlerts.set(ruleId, alert);
                    this.alertHistory.push(alert);
                    
                    rule.lastTriggered = now;
                    rule.triggerCount++;
                    
                    triggeredAlerts.push(alert);
                    
                    logger.warn('Alert triggered', {
                        ruleId,
                        severity: rule.severity,
                        message: rule.message
                    });
                    
                    this.emit('alertTriggered', alert);
                    
                } else if (!shouldTrigger && this.activeAlerts.has(ruleId)) {
                    // Alert resolved
                    const alert = this.activeAlerts.get(ruleId);
                    alert.resolvedAt = now;
                    alert.duration = now - alert.triggeredAt;
                    
                    this.activeAlerts.delete(ruleId);
                    
                    logger.info('Alert resolved', {
                        ruleId,
                        duration: alert.duration
                    });
                    
                    this.emit('alertResolved', alert);
                }
                
            } catch (error) {
                logger.error('Error checking alert rule', {
                    ruleId,
                    error: error.message
                });
            }
        }
        
        // Cleanup old alert history
        if (this.alertHistory.length > 1000) {
            this.alertHistory = this.alertHistory.slice(-1000);
        }
        
        return triggeredAlerts;
    }
    
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    
    getAlertHistory(limit = 100) {
        return this.alertHistory.slice(-limit);
    }
}

/**
 * Performance Dashboard Manager
 */
class PerformanceDashboard extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Data collection
            metricsInterval: options.metricsInterval || 5000, // 5 seconds
            retentionPeriod: options.retentionPeriod || 86400000, // 24 hours
            maxDataPoints: options.maxDataPoints || 10000,
            
            // Aggregation windows
            aggregationWindows: options.aggregationWindows || [60000, 300000, 900000], // 1m, 5m, 15m
            
            // WebSocket configuration
            wsPort: options.wsPort || 8081,
            enableWebSocket: options.enableWebSocket !== false,
            
            // Export options
            enableExport: options.enableExport !== false,
            exportInterval: options.exportInterval || 3600000, // 1 hour
            
            ...options
        };
        
        // Metric storage
        this.timeSeries = new Map();
        this.aggregators = new Map();
        this.snapshots = [];
        
        // Alert system
        this.alertSystem = new AlertSystem();
        
        // Dashboard state
        this.connectedClients = new Set();
        this.isCollecting = false;
        this.collectionTimer = null;
        this.wsServer = null;
        
        // Component references for metric collection
        this.components = new Map();
        
        this.isInitialized = false;
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            logger.info('Initializing Performance Dashboard', {
                metricsInterval: this.config.metricsInterval,
                retentionPeriod: this.config.retentionPeriod,
                wsPort: this.config.wsPort
            });
            
            // Initialize time series for key metrics
            this._initializeMetricSeries();
            
            // Initialize metric aggregators
            this._initializeAggregators();
            
            // Setup default alerts
            this._setupDefaultAlerts();
            
            // Start WebSocket server for real-time updates
            if (this.config.enableWebSocket) {
                await this._startWebSocketServer();
            }
            
            // Start metric collection
            this._startMetricCollection();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            logger.info('Performance Dashboard initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize Performance Dashboard', {
                error: error.message
            });
            throw error;
        }
    }
    
    _initializeMetricSeries() {
        const metricNames = [
            'system.cpu_utilization',
            'system.memory_utilization',
            'system.gpu_utilization',
            'system.disk_utilization',
            'system.network_throughput',
            
            'search.query_rate',
            'search.avg_response_time',
            'search.p95_response_time',
            'search.p99_response_time',
            'search.error_rate',
            'search.concurrent_queries',
            
            'cache.hit_rate',
            'cache.miss_rate',
            'cache.eviction_rate',
            'cache.memory_usage',
            
            'cluster.node_count',
            'cluster.healthy_nodes',
            'cluster.shard_count',
            'cluster.rebalancing_operations',
            
            'performance.throughput_qps',
            'performance.avg_latency',
            'performance.error_count'
        ];
        
        for (const metricName of metricNames) {
            this.timeSeries.set(metricName, new TimeSeriesBuffer(
                this.config.maxDataPoints,
                this.config.retentionPeriod
            ));
        }
    }
    
    _initializeAggregators() {
        for (const windowSize of this.config.aggregationWindows) {
            const aggregatorMap = new Map();
            
            for (const metricName of this.timeSeries.keys()) {
                aggregatorMap.set(metricName, new MetricAggregator(windowSize));
            }
            
            this.aggregators.set(windowSize, aggregatorMap);
        }
    }
    
    _setupDefaultAlerts() {
        // High CPU utilization
        this.alertSystem.addRule('high_cpu', 
            (metrics) => metrics['system.cpu_utilization'] > 80,
            {
                severity: 'warning',
                message: 'High CPU utilization detected',
                cooldownMs: 300000
            }
        );
        
        // High memory utilization
        this.alertSystem.addRule('high_memory',
            (metrics) => metrics['system.memory_utilization'] > 85,
            {
                severity: 'warning',
                message: 'High memory utilization detected'
            }
        );
        
        // High error rate
        this.alertSystem.addRule('high_error_rate',
            (metrics) => metrics['search.error_rate'] > 5,
            {
                severity: 'error',
                message: 'High search error rate detected'
            }
        );
        
        // High response time
        this.alertSystem.addRule('high_latency',
            (metrics) => metrics['search.p99_response_time'] > 1000,
            {
                severity: 'warning',
                message: 'High response time (P99) detected'
            }
        );
        
        // Low cache hit rate
        this.alertSystem.addRule('low_cache_hit_rate',
            (metrics) => metrics['cache.hit_rate'] < 70,
            {
                severity: 'info',
                message: 'Low cache hit rate detected'
            }
        );
        
        // Node health issues
        this.alertSystem.addRule('unhealthy_nodes',
            (metrics) => {
                const total = metrics['cluster.node_count'] || 1;
                const healthy = metrics['cluster.healthy_nodes'] || 0;
                return (healthy / total) < 0.8;
            },
            {
                severity: 'critical',
                message: 'Cluster has unhealthy nodes'
            }
        );
    }
    
    async _startWebSocketServer() {
        try {
            const WebSocket = require('ws');
            
            this.wsServer = new WebSocket.Server({ 
                port: this.config.wsPort,
                perMessageDeflate: true
            });
            
            this.wsServer.on('connection', (ws, request) => {
                const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                logger.debug('Dashboard client connected', { 
                    clientId, 
                    ip: request.socket.remoteAddress 
                });
                
                ws.clientId = clientId;
                this.connectedClients.add(ws);
                
                // Send initial state
                ws.send(JSON.stringify({
                    type: 'initial_state',
                    data: this.getCurrentSnapshot()
                }));
                
                ws.on('close', () => {
                    this.connectedClients.delete(ws);
                    logger.debug('Dashboard client disconnected', { clientId });
                });
                
                ws.on('message', (message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        this._handleClientMessage(ws, data);
                    } catch (error) {
                        logger.error('Invalid message from dashboard client', {
                            clientId,
                            error: error.message
                        });
                    }
                });
                
                ws.on('error', (error) => {
                    logger.error('Dashboard WebSocket error', {
                        clientId,
                        error: error.message
                    });
                });
            });
            
            logger.info('Dashboard WebSocket server started', { 
                port: this.config.wsPort 
            });
            
        } catch (error) {
            logger.error('Failed to start WebSocket server', {
                error: error.message
            });
        }
    }
    
    _handleClientMessage(ws, data) {
        switch (data.type) {
            case 'get_metrics':
                ws.send(JSON.stringify({
                    type: 'metrics_data',
                    data: this.getMetrics(data.startTime, data.endTime, data.metrics)
                }));
                break;
                
            case 'get_alerts':
                ws.send(JSON.stringify({
                    type: 'alerts_data',
                    data: {
                        active: this.alertSystem.getActiveAlerts(),
                        history: this.alertSystem.getAlertHistory(data.limit)
                    }
                }));
                break;
                
            case 'subscribe_metric':
                // Client wants to subscribe to specific metric updates
                if (!ws.subscriptions) ws.subscriptions = new Set();
                ws.subscriptions.add(data.metric);
                break;
                
            case 'unsubscribe_metric':
                if (ws.subscriptions) {
                    ws.subscriptions.delete(data.metric);
                }
                break;
                
            default:
                logger.warn('Unknown message type from dashboard client', {
                    type: data.type,
                    clientId: ws.clientId
                });
        }
    }
    
    _startMetricCollection() {
        this.isCollecting = true;
        
        this.collectionTimer = setInterval(() => {
            this._collectMetrics();
        }, this.config.metricsInterval);
        
        logger.info('Metric collection started', {
            interval: this.config.metricsInterval
        });
    }
    
    async _collectMetrics() {
        try {
            const timestamp = Date.now();
            const metrics = await this._gatherAllMetrics();
            
            // Store metrics in time series
            for (const [metricName, value] of Object.entries(metrics)) {
                const timeSeries = this.timeSeries.get(metricName);
                if (timeSeries) {
                    timeSeries.addDataPoint(timestamp, value);
                }
                
                // Update aggregators
                for (const [windowSize, aggregatorMap] of this.aggregators) {
                    const aggregator = aggregatorMap.get(metricName);
                    if (aggregator) {
                        aggregator.addValue(value, timestamp);
                    }
                }
            }
            
            // Check alerts
            const triggeredAlerts = this.alertSystem.checkAlerts(metrics);
            
            // Create snapshot
            const snapshot = this._createSnapshot(timestamp, metrics);
            this.snapshots.push(snapshot);
            
            // Limit snapshot history
            if (this.snapshots.length > 1000) {
                this.snapshots = this.snapshots.slice(-1000);
            }
            
            // Broadcast to connected clients
            if (this.connectedClients.size > 0) {
                this._broadcastUpdate(snapshot, triggeredAlerts);
            }
            
            // Emit update event
            this.emit('metricsUpdated', { 
                timestamp, 
                metrics, 
                alerts: triggeredAlerts 
            });
            
        } catch (error) {
            logger.error('Metric collection failed', {
                error: error.message
            });
        }
    }
    
    async _gatherAllMetrics() {
        const metrics = {};
        
        // System metrics
        const systemMetrics = this._getSystemMetrics();
        Object.assign(metrics, systemMetrics);
        
        // Component metrics
        for (const [componentName, component] of this.components) {
            try {
                if (typeof component.getMetrics === 'function') {
                    const componentMetrics = await component.getMetrics();
                    
                    // Flatten component metrics with prefix
                    for (const [key, value] of Object.entries(componentMetrics)) {
                        if (typeof value === 'number') {
                            metrics[`${componentName}.${key}`] = value;
                        }
                    }
                }
            } catch (error) {
                logger.warn('Failed to collect metrics from component', {
                    componentName,
                    error: error.message
                });
            }
        }
        
        return metrics;
    }
    
    _getSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            'system.memory_utilization': (memUsage.heapUsed / memUsage.heapTotal) * 100,
            'system.cpu_utilization': Math.random() * 100, // Placeholder - would use actual CPU monitoring
            'system.gpu_utilization': Math.random() * 100, // Placeholder
            'system.disk_utilization': Math.random() * 100, // Placeholder
            'system.network_throughput': Math.random() * 1000, // MB/s
            'system.uptime': process.uptime(),
            'system.heap_used': memUsage.heapUsed,
            'system.heap_total': memUsage.heapTotal,
            'system.external_memory': memUsage.external
        };
    }
    
    _createSnapshot(timestamp, metrics) {
        // Calculate aggregated values
        const aggregatedMetrics = {};
        
        for (const [windowSize, aggregatorMap] of this.aggregators) {
            const windowKey = `${windowSize}ms`;
            aggregatedMetrics[windowKey] = {};
            
            for (const [metricName, aggregator] of aggregatorMap) {
                aggregatedMetrics[windowKey][metricName] = {
                    average: aggregator.getAverage(),
                    sum: aggregator.getSum(),
                    count: aggregator.getCount(),
                    rate: aggregator.getRate(),
                    p95: aggregator.getPercentile(95),
                    p99: aggregator.getPercentile(99)
                };
            }
        }
        
        return {
            timestamp,
            rawMetrics: metrics,
            aggregatedMetrics,
            activeAlerts: this.alertSystem.getActiveAlerts().length,
            components: Array.from(this.components.keys())
        };
    }
    
    _broadcastUpdate(snapshot, triggeredAlerts) {
        const message = JSON.stringify({
            type: 'metrics_update',
            data: {
                snapshot,
                triggeredAlerts
            }
        });
        
        // Send to all connected clients
        for (const client of this.connectedClients) {
            if (client.readyState === 1) { // WebSocket.OPEN
                try {
                    client.send(message);
                } catch (error) {
                    logger.error('Failed to send update to client', {
                        clientId: client.clientId,
                        error: error.message
                    });
                    
                    this.connectedClients.delete(client);
                }
            }
        }
    }
    
    // Public API
    
    /**
     * Register a component for metric collection
     */
    registerComponent(name, component) {
        this.components.set(name, component);
        
        logger.debug('Registered component for monitoring', { 
            componentName: name,
            hasGetMetrics: typeof component.getMetrics === 'function'
        });
        
        return this;
    }
    
    /**
     * Unregister a component
     */
    unregisterComponent(name) {
        return this.components.delete(name);
    }
    
    /**
     * Get current metrics snapshot
     */
    getCurrentSnapshot() {
        if (this.snapshots.length === 0) return null;
        return this.snapshots[this.snapshots.length - 1];
    }
    
    /**
     * Get historical metrics
     */
    getMetrics(startTime = 0, endTime = Date.now(), metricNames = null) {
        const result = {};
        
        const metricsToQuery = metricNames || Array.from(this.timeSeries.keys());
        
        for (const metricName of metricsToQuery) {
            const timeSeries = this.timeSeries.get(metricName);
            if (timeSeries) {
                result[metricName] = {
                    dataPoints: timeSeries.getDataPoints(startTime, endTime),
                    statistics: timeSeries.getStatistics(startTime, endTime)
                };
            }
        }
        
        return result;
    }
    
    /**
     * Get aggregated metrics for a time window
     */
    getAggregatedMetrics(windowSize = 60000, metricNames = null) {
        const aggregatorMap = this.aggregators.get(windowSize);
        if (!aggregatorMap) return {};
        
        const result = {};
        const metricsToQuery = metricNames || Array.from(aggregatorMap.keys());
        
        for (const metricName of metricsToQuery) {
            const aggregator = aggregatorMap.get(metricName);
            if (aggregator) {
                result[metricName] = {
                    average: aggregator.getAverage(),
                    sum: aggregator.getSum(),
                    count: aggregator.getCount(),
                    rate: aggregator.getRate(),
                    p95: aggregator.getPercentile(95),
                    p99: aggregator.getPercentile(99)
                };
            }
        }
        
        return result;
    }
    
    /**
     * Get dashboard statistics
     */
    getStats() {
        return {
            connectedClients: this.connectedClients.size,
            trackedMetrics: this.timeSeries.size,
            totalDataPoints: Array.from(this.timeSeries.values())
                .reduce((sum, ts) => sum + ts.data.length, 0),
            activeAlerts: this.alertSystem.getActiveAlerts().length,
            alertRules: this.alertSystem.rules.size,
            components: Array.from(this.components.keys()),
            snapshots: this.snapshots.length,
            isCollecting: this.isCollecting,
            aggregationWindows: Array.from(this.aggregators.keys())
        };
    }
    
    /**
     * Export metrics data
     */
    exportMetrics(format = 'json', startTime = 0, endTime = Date.now()) {
        const metrics = this.getMetrics(startTime, endTime);
        const alerts = this.alertSystem.getAlertHistory();
        
        const exportData = {
            timestamp: new Date().toISOString(),
            timeRange: { startTime, endTime },
            metrics,
            alerts,
            metadata: {
                retentionPeriod: this.config.retentionPeriod,
                metricsInterval: this.config.metricsInterval,
                totalDataPoints: Object.values(metrics).reduce(
                    (sum, metric) => sum + metric.dataPoints.length, 0
                )
            }
        };
        
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(exportData, null, 2);
            case 'csv':
                return this._formatCSV(exportData);
            case 'prometheus':
                return this._formatPrometheus(exportData);
            default:
                return JSON.stringify(exportData, null, 2);
        }
    }
    
    _formatCSV(exportData) {
        const lines = ['timestamp,metric,value'];
        
        for (const [metricName, metricData] of Object.entries(exportData.metrics)) {
            for (const dataPoint of metricData.dataPoints) {
                lines.push(`${new Date(dataPoint.timestamp).toISOString()},${metricName},${dataPoint.value}`);
            }
        }
        
        return lines.join('\n');
    }
    
    _formatPrometheus(exportData) {
        const lines = [];
        
        for (const [metricName, metricData] of Object.entries(exportData.metrics)) {
            const stats = metricData.statistics;
            const prometheusName = metricName.replace(/[^a-zA-Z0-9_]/g, '_');
            
            lines.push(`# HELP ${prometheusName} ${metricName} metric from GH200 dashboard`);
            lines.push(`# TYPE ${prometheusName} gauge`);
            
            if (stats.latest !== null) {
                lines.push(`${prometheusName} ${stats.latest}`);
            }
        }
        
        return lines.join('\n');
    }
    
    /**
     * Add custom alert rule
     */
    addAlertRule(id, condition, options) {
        return this.alertSystem.addRule(id, condition, options);
    }
    
    /**
     * Remove alert rule
     */
    removeAlertRule(id) {
        return this.alertSystem.removeRule(id);
    }
    
    /**
     * Get active alerts
     */
    getActiveAlerts() {
        return this.alertSystem.getActiveAlerts();
    }
    
    /**
     * Get alert history
     */
    getAlertHistory(limit = 100) {
        return this.alertSystem.getAlertHistory(limit);
    }
    
    /**
     * Generate dashboard HTML
     */
    generateDashboardHTML() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GH200 Performance Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background-color: #0f1419; 
            color: #e6e6e6; 
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { text-align: center; margin-bottom: 30px; color: #00d4aa; }
        .metrics-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px; 
        }
        .metric-card { 
            background: #1a1f2e; 
            border-radius: 8px; 
            padding: 20px; 
            border: 1px solid #2d3748; 
        }
        .metric-title { color: #a0aec0; margin-bottom: 10px; }
        .metric-value { 
            font-size: 2em; 
            font-weight: bold; 
            color: #00d4aa; 
        }
        .metric-unit { font-size: 0.8em; color: #718096; }
        .alerts-section { margin-top: 30px; }
        .alert { 
            padding: 15px; 
            margin-bottom: 10px; 
            border-radius: 6px; 
            border-left: 4px solid; 
        }
        .alert.warning { background: #2d1b0e; border-color: #f6ad55; }
        .alert.error { background: #2d0e0e; border-color: #fc8181; }
        .alert.critical { background: #3d0e0e; border-color: #e53e3e; }
        .status-indicator { 
            display: inline-block; 
            width: 12px; 
            height: 12px; 
            border-radius: 50%; 
            margin-right: 8px; 
        }
        .status-healthy { background-color: #48bb78; }
        .status-warning { background-color: #ed8936; }
        .status-error { background-color: #f56565; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 GH200 Performance Dashboard</h1>
        
        <div class="metrics-grid" id="metricsGrid">
            <!-- Metrics will be populated by JavaScript -->
        </div>
        
        <div class="alerts-section">
            <h2>Active Alerts</h2>
            <div id="alertsContainer">
                <!-- Alerts will be populated by JavaScript -->
            </div>
        </div>
    </div>
    
    <script>
        const wsUrl = 'ws://localhost:${this.config.wsPort}';
        let ws = null;
        
        function connectWebSocket() {
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                console.log('Connected to dashboard');
            };
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                switch (data.type) {
                    case 'initial_state':
                    case 'metrics_update':
                        updateDashboard(data.data);
                        break;
                }
            };
            
            ws.onclose = () => {
                console.log('Disconnected from dashboard');
                setTimeout(connectWebSocket, 5000);
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        }
        
        function updateDashboard(_data) {
            if (data.snapshot) {
                updateMetrics(data.snapshot.rawMetrics);
            }
            
            if (data.triggeredAlerts) {
                updateAlerts(data.triggeredAlerts);
            }
        }
        
        function updateMetrics(_metrics) {
            const grid = document.getElementById('metricsGrid');
            grid.innerHTML = '';
            
            const keyMetrics = [
                { key: 'search.query_rate', title: 'Query Rate', unit: 'QPS' },
                { key: 'search.avg_response_time', title: 'Avg Response Time', unit: 'ms' },
                { key: 'search.error_rate', title: 'Error Rate', unit: '%' },
                { key: 'cache.hit_rate', title: 'Cache Hit Rate', unit: '%' },
                { key: 'system.cpu_utilization', title: 'CPU Usage', unit: '%' },
                { key: 'system.memory_utilization', title: 'Memory Usage', unit: '%' }
            ];
            
            keyMetrics.forEach(metric => {
                const value = metrics[metric.key] || 0;
                const card = document.createElement('div');
                card.className = 'metric-card';
                card.innerHTML = \`
                    <div class="metric-title">\${metric.title}</div>
                    <div class="metric-value">
                        \${typeof value === 'number' ? value.toFixed(2) : value}
                        <span class="metric-unit">\${metric.unit}</span>
                    </div>
                \`;
                grid.appendChild(card);
            });
        }
        
        function updateAlerts(_alerts) {
            const container = document.getElementById('alertsContainer');
            
            if (alerts.length === 0) {
                container.innerHTML = '<p>No active alerts</p>';
                return;
            }
            
            container.innerHTML = alerts.map(alert => \`
                <div class="alert \${alert.severity}">
                    <span class="status-indicator status-\${alert.severity}"></span>
                    <strong>\${alert.rule.id}</strong>: \${alert.message}
                </div>
            \`).join('');
        }
        
        // Initialize connection
        connectWebSocket();
        
        // Auto-refresh every 30 seconds
        setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'get_metrics' }));
            }
        }, 30000);
    </script>
</body>
</html>`;
    }
    
    async shutdown() {
        logger.info('Shutting down Performance Dashboard');
        
        this.isCollecting = false;
        
        if (this.collectionTimer) {
            clearInterval(this.collectionTimer);
        }
        
        if (this.wsServer) {
            this.wsServer.close();
        }
        
        // Close all client connections
        for (const client of this.connectedClients) {
            client.close();
        }
        
        // Clear all data
        this.timeSeries.clear();
        this.aggregators.clear();
        this.snapshots.length = 0;
        this.components.clear();
        this.connectedClients.clear();
        
        this.isInitialized = false;
        this.emit('shutdown');
    }
}

module.exports = {
    PerformanceDashboard,
    TimeSeriesBuffer,
    MetricAggregator,
    AlertSystem
};