/**
 * MetricsCollector - Real-time performance metrics collection for GH200
 * Optimized for high-frequency data collection with minimal overhead
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');

/**
 * Metric types
 */
const METRIC_TYPE = {
    COUNTER: 'counter',
    GAUGE: 'gauge',
    HISTOGRAM: 'histogram',
    TIMER: 'timer'
};

/**
 * High-performance metric storage
 */
class Metric {
    constructor(name, type, help = '', labels = []) {
        this.name = name;
        this.type = type;
        this.help = help;
        this.labels = labels;
        this.values = new Map();
        this.created = Date.now();
        this.updated = Date.now();
    }
    
    /**
     * Record a value for the metric
     * @param {number} value - Value to record
     * @param {Object} labelValues - Label values
     */
    record(value, labelValues = {}) {
        const key = this._generateKey(labelValues);
        
        switch (this.type) {
            case METRIC_TYPE.COUNTER:
                this._recordCounter(key, value);
                break;
            case METRIC_TYPE.GAUGE:
                this._recordGauge(key, value);
                break;
            case METRIC_TYPE.HISTOGRAM:
                this._recordHistogram(key, value);
                break;
            case METRIC_TYPE.TIMER:
                this._recordTimer(key, value);
                break;
        }
        
        this.updated = Date.now();
    }
    
    /**
     * Get current values
     * @returns {Array} Array of metric values
     */
    getValues() {
        const values = [];
        
        for (const [key, data] of this.values) {
            const labelValues = this._parseKey(key);
            
            switch (this.type) {
                case METRIC_TYPE.COUNTER:
                case METRIC_TYPE.GAUGE:
                    values.push({
                        labels: labelValues,
                        value: data.value,
                        timestamp: data.timestamp
                    });
                    break;
                case METRIC_TYPE.HISTOGRAM:
                    values.push({
                        labels: labelValues,
                        ...this._getHistogramValues(data),
                        timestamp: data.timestamp
                    });
                    break;
                case METRIC_TYPE.TIMER:
                    values.push({
                        labels: labelValues,
                        ...this._getTimerValues(data),
                        timestamp: data.timestamp
                    });
                    break;
            }
        }
        
        return values;
    }
    
    /**
     * Reset metric values
     */
    reset() {
        this.values.clear();
        this.updated = Date.now();
    }
    
    /**
     * Record counter value
     */
    _recordCounter(key, value) {
        const existing = this.values.get(key) || { value: 0, timestamp: Date.now() };
        existing.value += value;
        existing.timestamp = Date.now();
        this.values.set(key, existing);
    }
    
    /**
     * Record gauge value
     */
    _recordGauge(key, value) {
        this.values.set(key, {
            value,
            timestamp: Date.now()
        });
    }
    
    /**
     * Record histogram value
     */
    _recordHistogram(key, value) {
        let data = this.values.get(key);
        
        if (!data) {
            data = {
                values: [],
                sum: 0,
                count: 0,
                buckets: new Map(),
                timestamp: Date.now()
            };
        }
        
        data.values.push(value);
        data.sum += value;
        data.count++;
        data.timestamp = Date.now();
        
        // Keep only last 1000 values for performance
        if (data.values.length > 1000) {
            data.values = data.values.slice(-1000);
        }
        
        // Update buckets
        this._updateHistogramBuckets(data, value);
        
        this.values.set(key, data);
    }
    
    /**
     * Record timer value
     */
    _recordTimer(key, value) {
        let data = this.values.get(key);
        
        if (!data) {
            data = {
                values: [],
                sum: 0,
                count: 0,
                min: value,
                max: value,
                timestamp: Date.now()
            };
        }
        
        data.values.push(value);
        data.sum += value;
        data.count++;
        data.min = Math.min(data.min, value);
        data.max = Math.max(data.max, value);
        data.timestamp = Date.now();
        
        // Keep only last 1000 values
        if (data.values.length > 1000) {
            const removed = data.values.splice(0, data.values.length - 1000);
            // Recalculate min/max if we removed values
            if (removed.some(v => v === data.min || v === data.max)) {
                data.min = Math.min(...data.values);
                data.max = Math.max(...data.values);
            }
        }
        
        this.values.set(key, data);
    }
    
    /**
     * Update histogram buckets
     */
    _updateHistogramBuckets(data, value) {
        const buckets = [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
        
        for (const bucket of buckets) {
            if (value <= bucket) {
                const count = data.buckets.get(bucket) || 0;
                data.buckets.set(bucket, count + 1);
            }
        }
    }
    
    /**
     * Get histogram values
     */
    _getHistogramValues(data) {
        const sorted = [...data.values].sort((a, b) => a - b);
        const p50 = this._percentile(sorted, 0.5);
        const p95 = this._percentile(sorted, 0.95);
        const p99 = this._percentile(sorted, 0.99);
        
        return {
            count: data.count,
            sum: data.sum,
            avg: data.sum / data.count,
            p50,
            p95,
            p99,
            buckets: Object.fromEntries(data.buckets)
        };
    }
    
    /**
     * Get timer values
     */
    _getTimerValues(data) {
        const sorted = [...data.values].sort((a, b) => a - b);
        
        return {
            count: data.count,
            sum: data.sum,
            avg: data.sum / data.count,
            min: data.min,
            max: data.max,
            p50: this._percentile(sorted, 0.5),
            p95: this._percentile(sorted, 0.95),
            p99: this._percentile(sorted, 0.99)
        };
    }
    
    /**
     * Calculate percentile
     */
    _percentile(sorted, p) {
        if (sorted.length === 0) return 0;
        
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, index)];
    }
    
    /**
     * Generate key from label values
     */
    _generateKey(labelValues) {
        const pairs = [];
        
        for (const label of this.labels) {
            const value = labelValues[label] || '';
            pairs.push(`${label}=${value}`);
        }
        
        return pairs.join(',');
    }
    
    /**
     * Parse key to label values
     */
    _parseKey(key) {
        const labelValues = {};
        
        if (!key) return labelValues;
        
        const pairs = key.split(',');
        for (const pair of pairs) {
            const [label, value] = pair.split('=');
            labelValues[label] = value;
        }
        
        return labelValues;
    }
}

/**
 * High-performance metrics collector
 */
class MetricsCollector extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            bufferSize: 10000,
            flushInterval: 10000, // 10 seconds
            enableSystemMetrics: true,
            enableProcessMetrics: true,
            enableGCMetrics: true,
            ...options
        };
        
        this.metrics = new Map();
        this.buffer = [];
        this.flushTimer = null;
        this.systemCollector = null;
        
        // GC metrics tracking
        if (this.options.enableGCMetrics && global.gc) {
            this._setupGCMetrics();
        }
        
        // Start collectors
        this._startCollectors();
        
        logger.info('MetricsCollector initialized', {
            bufferSize: this.options.bufferSize,
            flushInterval: this.options.flushInterval
        });
    }
    
    /**
     * Register a new metric
     * @param {string} name - Metric name
     * @param {string} type - Metric type
     * @param {string} help - Help text
     * @param {Array} labels - Label names
     * @returns {Metric} Created metric
     */
    registerMetric(name, type, help = '', labels = []) {
        if (this.metrics.has(name)) {
            return this.metrics.get(name);
        }
        
        const metric = new Metric(name, type, help, labels);
        this.metrics.set(name, metric);
        
        logger.debug('Metric registered', { name, type, labels });
        
        return metric;
    }
    
    /**
     * Record a counter value
     * @param {string} name - Metric name
     * @param {number} value - Value to add
     * @param {Object} labels - Label values
     */
    recordCounter(name, value = 1, labels = {}) {
        let metric = this.metrics.get(name);
        if (!metric) {
            metric = this.registerMetric(name, METRIC_TYPE.COUNTER, '', Object.keys(labels));
        }
        
        metric.record(value, labels);
        this._buffer({ name, type: 'counter', value, labels, timestamp: Date.now() });
    }
    
    /**
     * Record a gauge value
     * @param {string} name - Metric name
     * @param {number} value - Current value
     * @param {Object} labels - Label values
     */
    recordGauge(name, value, labels = {}) {
        let metric = this.metrics.get(name);
        if (!metric) {
            metric = this.registerMetric(name, METRIC_TYPE.GAUGE, '', Object.keys(labels));
        }
        
        metric.record(value, labels);
        this._buffer({ name, type: 'gauge', value, labels, timestamp: Date.now() });
    }
    
    /**
     * Record a histogram value
     * @param {string} name - Metric name
     * @param {number} value - Value to record
     * @param {Object} labels - Label values
     */
    recordHistogram(name, value, labels = {}) {
        let metric = this.metrics.get(name);
        if (!metric) {
            metric = this.registerMetric(name, METRIC_TYPE.HISTOGRAM, '', Object.keys(labels));
        }
        
        metric.record(value, labels);
        this._buffer({ name, type: 'histogram', value, labels, timestamp: Date.now() });
    }
    
    /**
     * Record a timer value
     * @param {string} name - Metric name
     * @param {number} value - Duration in milliseconds
     * @param {Object} labels - Label values
     */
    recordTimer(name, value, labels = {}) {
        let metric = this.metrics.get(name);
        if (!metric) {
            metric = this.registerMetric(name, METRIC_TYPE.TIMER, '', Object.keys(labels));
        }
        
        metric.record(value, labels);
        this._buffer({ name, type: 'timer', value, labels, timestamp: Date.now() });
    }
    
    /**
     * Start a timer
     * @param {string} name - Metric name
     * @param {Object} labels - Label values
     * @returns {Function} Function to end the timer
     */
    startTimer(name, labels = {}) {
        const start = process.hrtime.bigint();
        
        return () => {
            const end = process.hrtime.bigint();
            const duration = Number(end - start) / 1000000; // Convert to milliseconds
            this.recordTimer(name, duration, labels);
            return duration;
        };
    }
    
    /**
     * Get all metric values
     * @returns {Object} All metric values
     */
    getAllMetrics() {
        const result = {};
        
        for (const [name, metric] of this.metrics) {
            result[name] = {
                type: metric.type,
                help: metric.help,
                values: metric.getValues(),
                created: metric.created,
                updated: metric.updated
            };
        }
        
        return result;
    }
    
    /**
     * Get specific metric
     * @param {string} name - Metric name
     * @returns {Object|null} Metric data or null
     */
    getMetric(name) {
        const metric = this.metrics.get(name);
        if (!metric) return null;
        
        return {
            name,
            type: metric.type,
            help: metric.help,
            values: metric.getValues(),
            created: metric.created,
            updated: metric.updated
        };
    }
    
    /**
     * Reset all metrics
     */
    resetAll() {
        for (const metric of this.metrics.values()) {
            metric.reset();
        }
        
        logger.info('All metrics reset');
    }
    
    /**
     * Export metrics in Prometheus format
     * @returns {string} Prometheus format metrics
     */
    exportPrometheus() {
        const lines = [];
        
        for (const [name, metric] of this.metrics) {
            if (metric.help) {
                lines.push(`# HELP ${name} ${metric.help}`);
            }
            lines.push(`# TYPE ${name} ${metric.type}`);
            
            const values = metric.getValues();
            for (const value of values) {
                const labelStr = this._formatPrometheusLabels(value.labels);
                
                switch (metric.type) {
                    case METRIC_TYPE.COUNTER:
                    case METRIC_TYPE.GAUGE:
                        lines.push(`${name}${labelStr} ${value.value} ${value.timestamp}`);
                        break;
                    case METRIC_TYPE.HISTOGRAM:
                        lines.push(`${name}_count${labelStr} ${value.count} ${value.timestamp}`);
                        lines.push(`${name}_sum${labelStr} ${value.sum} ${value.timestamp}`);
                        for (const [bucket, count] of Object.entries(value.buckets)) {
                            const bucketLabels = { ...value.labels, le: bucket };
                            const bucketLabelStr = this._formatPrometheusLabels(bucketLabels);
                            lines.push(`${name}_bucket${bucketLabelStr} ${count} ${value.timestamp}`);
                        }
                        break;
                    case METRIC_TYPE.TIMER:
                        lines.push(`${name}_count${labelStr} ${value.count} ${value.timestamp}`);
                        lines.push(`${name}_sum${labelStr} ${value.sum} ${value.timestamp}`);
                        lines.push(`${name}_avg${labelStr} ${value.avg} ${value.timestamp}`);
                        break;
                }
            }
        }
        
        return lines.join('\n') + '\n';
    }
    
    /**
     * Buffer metric for batch processing
     */
    _buffer(data) {
        this.buffer.push(data);
        
        if (this.buffer.length >= this.options.bufferSize) {
            this._flush();
        }
    }
    
    /**
     * Flush buffered metrics
     */
    _flush() {
        if (this.buffer.length === 0) return;
        
        const batch = this.buffer.splice(0, this.buffer.length);
        this.emit('metricsBatch', batch);
        
        logger.debug('Metrics batch flushed', { count: batch.length });
    }
    
    /**
     * Format Prometheus labels
     */
    _formatPrometheusLabels(labels) {
        const pairs = [];
        
        for (const [key, value] of Object.entries(labels)) {
            pairs.push(`${key}="${value}"`);
        }
        
        return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
    }
    
    /**
     * Start metric collectors
     */
    _startCollectors() {
        // Start flush timer
        this.flushTimer = setInterval(() => {
            this._flush();
        }, this.options.flushInterval);
        
        // System metrics collector
        if (this.options.enableSystemMetrics) {
            this.systemCollector = setInterval(() => {
                this._collectSystemMetrics();
            }, 5000); // Every 5 seconds
        }
        
        // Process metrics collector
        if (this.options.enableProcessMetrics) {
            setInterval(() => {
                this._collectProcessMetrics();
            }, 5000);
        }
    }
    
    /**
     * Collect system metrics
     */
    _collectSystemMetrics() {
        // Memory usage
        const memUsage = process.memoryUsage();
        this.recordGauge('nodejs_memory_usage_bytes', memUsage.rss, { type: 'rss' });
        this.recordGauge('nodejs_memory_usage_bytes', memUsage.heapTotal, { type: 'heap_total' });
        this.recordGauge('nodejs_memory_usage_bytes', memUsage.heapUsed, { type: 'heap_used' });
        this.recordGauge('nodejs_memory_usage_bytes', memUsage.external, { type: 'external' });
        
        // CPU usage
        const cpuUsage = process.cpuUsage();
        this.recordGauge('nodejs_cpu_usage_seconds', cpuUsage.user / 1000000, { type: 'user' });
        this.recordGauge('nodejs_cpu_usage_seconds', cpuUsage.system / 1000000, { type: 'system' });
        
        // Event loop lag
        const start = process.hrtime.bigint();
        setImmediate(() => {
            const lag = Number(process.hrtime.bigint() - start) / 1000000;
            this.recordGauge('nodejs_eventloop_lag_milliseconds', lag);
        });
    }
    
    /**
     * Collect process metrics
     */
    _collectProcessMetrics() {
        this.recordGauge('nodejs_process_uptime_seconds', process.uptime());
        this.recordGauge('nodejs_process_start_time_seconds', Date.now() / 1000 - process.uptime());
    }
    
    /**
     * Setup GC metrics
     */
    _setupGCMetrics() {
        // This would require additional setup for GC metrics
        // For now, it's a placeholder
        logger.debug('GC metrics setup (placeholder)');
    }
}

// Create singleton instance
const metricsCollector = new MetricsCollector();

module.exports = {
    MetricsCollector,
    Metric,
    METRIC_TYPE,
    metricsCollector
};