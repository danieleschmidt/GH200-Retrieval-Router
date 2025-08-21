/**
 * Structured logging utility optimized for Grace Hopper environments
 * Provides performance-aware logging with minimal memory allocation
 */

const winston = require('winston');
const { format } = winston;
const crypto = require('crypto');
const os = require('os');

// Log levels with performance implications
const LOG_LEVELS = {
    critical: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5
};

// Environment-based configuration
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// System information for correlation
const SYSTEM_INFO = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    pid: process.pid,
    instance: process.env.INSTANCE_ID || crypto.randomBytes(4).toString('hex')
};

// Advanced correlation and distributed tracing support
class CorrelationContext {
    constructor() {
        this.contexts = new Map();
    }
    
    createContext(traceId = null, spanId = null) {
        const context = {
            traceId: traceId || crypto.randomUUID(),
            spanId: spanId || crypto.randomBytes(8).toString('hex'),
            parentSpanId: null,
            startTime: Date.now(),
            ...SYSTEM_INFO
        };
        
        return context;
    }
    
    getContext() {
        // In a real implementation, this would use async_hooks or similar
        // to maintain context across async operations
        return this.contexts.get('current') || this.createContext();
    }
    
    setContext(context) {
        this.contexts.set('current', context);
    }
    
    createChildContext(operation) {
        const parent = this.getContext();
        const child = {
            ...parent,
            spanId: crypto.randomBytes(8).toString('hex'),
            parentSpanId: parent.spanId,
            operation,
            startTime: Date.now()
        };
        
        return child;
    }
}

const correlationContext = new CorrelationContext();

// Enhanced format with correlation and system context
const graceHopperFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.printf(({ level, message, timestamp, ...metadata }) => {
        const context = correlationContext.getContext();
        const enhancedMetadata = {
            ...metadata,
            traceId: context.traceId,
            spanId: context.spanId,
            parentSpanId: context.parentSpanId,
            hostname: SYSTEM_INFO.hostname,
            instance: SYSTEM_INFO.instance,
            pid: SYSTEM_INFO.pid
        };
        
        const meta = Object.keys(enhancedMetadata).length ? JSON.stringify(enhancedMetadata) : '';
        return `${timestamp} [${level.toUpperCase()}] ${message} ${meta}`;
    })
);

// OpenTelemetry-compatible format for observability
const observabilityFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.json(),
    format.printf((info) => {
        const context = correlationContext.getContext();
        return JSON.stringify({
            ...info,
            trace: {
                traceId: context.traceId,
                spanId: context.spanId,
                parentSpanId: context.parentSpanId
            },
            system: SYSTEM_INFO,
            '@timestamp': info.timestamp,
            '@version': '1'
        });
    })
);

// Transport configuration optimized for high-throughput logging
const transports = [];

// Console transport for development and fallback
if (isDevelopment || !isProduction) {
    transports.push(
        new winston.transports.Console({
            format: format.combine(
                format.colorize(),
                graceHopperFormat
            ),
            level: logLevel
        })
    );
}

// File transport for production with rotation
if (isProduction) {
    // Ensure logs directory exists
    const fs = require('fs');
    const path = require('path');
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    // Error logs
    transports.push(
        new winston.transports.File({
            filename: 'logs/gh200-router-error.log',
            level: 'error',
            format: graceHopperFormat,
            maxsize: 100 * 1024 * 1024, // 100MB
            maxFiles: 10,
            tailable: true
        })
    );
    
    // Combined logs
    transports.push(
        new winston.transports.File({
            filename: 'logs/gh200-router-combined.log',
            format: graceHopperFormat,
            maxsize: 500 * 1024 * 1024, // 500MB
            maxFiles: 20,
            tailable: true
        })
    );
    
    // Observability logs (structured JSON for log aggregators)
    transports.push(
        new winston.transports.File({
            filename: 'logs/gh200-router-observability.log',
            format: observabilityFormat,
            maxsize: 500 * 1024 * 1024, // 500MB
            maxFiles: 15,
            tailable: true
        })
    );
    
    // Performance metrics logs
    transports.push(
        new winston.transports.File({
            filename: 'logs/gh200-router-metrics.log',
            level: 'info',
            format: observabilityFormat,
            maxsize: 200 * 1024 * 1024, // 200MB
            maxFiles: 10,
            tailable: true,
            // Only log performance-related entries
            filter: (info) => {
                return info.category === 'performance' || 
                       info.type === 'metrics' ||
                       info.message.includes('Performance') ||
                       info.message.includes('metrics');
            }
        })
    );
    
    // Security audit logs
    transports.push(
        new winston.transports.File({
            filename: 'logs/gh200-router-security.log',
            level: 'warn',
            format: observabilityFormat,
            maxsize: 100 * 1024 * 1024, // 100MB
            maxFiles: 20,
            tailable: true,
            // Only log security-related entries
            filter: (info) => {
                return info.category === 'security' || 
                       info.type === 'security' ||
                       info.message.includes('Security') ||
                       info.message.includes('threat') ||
                       info.message.includes('Alert');
            }
        })
    );
}

// Ensure we always have at least one transport
if (transports.length === 0) {
    transports.push(
        new winston.transports.Console({
            format: graceHopperFormat,
            level: logLevel
        })
    );
}

// Create logger instance
const logger = winston.createLogger({
    levels: LOG_LEVELS,
    level: logLevel,
    format: graceHopperFormat,
    transports,
    exitOnError: false,
    silent: process.env.NODE_ENV === 'test'
});

// Performance-aware logging helpers with distributed tracing
class PerformanceLogger {
    constructor(baseLogger) {
        this.logger = baseLogger;
        this.timers = new Map();
        this.spans = new Map();
        this.metricsBuffer = [];
        this.correlationContext = correlationContext;
        
        // Periodically flush metrics
        this.metricsFlushInterval = setInterval(() => {
            this.flushMetrics();
        }, 30000); // Flush every 30 seconds
    }
    
    /**
     * Start a performance timer
     * @param {string} label - Timer label
     * @param {Object} metadata - Additional context
     */
    startTimer(label, metadata = {}) {
        const timer = {
            label,
            startTime: process.hrtime.bigint(),
            metadata
        };
        
        this.timers.set(label, timer);
        
        this.logger.debug('Performance timer started', {
            label,
            ...metadata
        });
    }
    
    /**
     * End a performance timer and log duration
     * @param {string} label - Timer label
     * @param {Object} additionalMetadata - Additional context
     */
    endTimer(label, additionalMetadata = {}) {
        const timer = this.timers.get(label);
        
        if (!timer) {
            this.logger.warn('Performance timer not found', { label });
            return;
        }
        
        const endTime = process.hrtime.bigint();
        const durationNs = endTime - timer.startTime;
        const durationMs = Number(durationNs) / 1_000_000;
        
        this.timers.delete(label);
        
        this.logger.info('Performance timer completed', {
            label,
            durationMs,
            durationNs: Number(durationNs),
            ...timer.metadata,
            ...additionalMetadata
        });
        
        return durationMs;
    }
    
    /**
     * Log memory usage statistics
     * @param {string} context - Context description
     * @param {Object} additionalData - Additional data to log
     */
    logMemoryUsage(context, additionalData = {}) {
        const memUsage = process.memoryUsage();
        
        this.logger.debug('Memory usage', {
            context,
            rss: memUsage.rss,
            heapTotal: memUsage.heapTotal,
            heapUsed: memUsage.heapUsed,
            external: memUsage.external,
            arrayBuffers: memUsage.arrayBuffers,
            ...additionalData
        });
    }
    
    /**
     * Log Grace Hopper specific metrics
     * @param {Object} graceMetrics - Grace memory and bandwidth metrics
     */
    logGraceMetrics(graceMetrics) {
        this.logger.info('Grace Hopper metrics', {
            graceMemoryUsageGB: graceMetrics.memoryUsageGB,
            graceBandwidthGBps: graceMetrics.bandwidthGBps,
            nvlinkUtilization: graceMetrics.nvlinkUtilization,
            unifiedMemoryEnabled: graceMetrics.unifiedMemoryEnabled,
            zeroCopyOperations: graceMetrics.zeroCopyOperations
        });
    }
    
    /**
     * Log query performance metrics
     * @param {Object} queryMetrics - Query performance data
     */
    logQueryMetrics(queryMetrics) {
        const context = this.correlationContext.getContext();
        
        this.logger.info('Query performance', {
            category: 'performance',
            type: 'metrics',
            queryId: queryMetrics.queryId,
            latencyMs: queryMetrics.latencyMs,
            throughputQPS: queryMetrics.throughputQPS,
            vectorsSearched: queryMetrics.vectorsSearched,
            shardsQueried: queryMetrics.shardsQueried,
            cacheHit: queryMetrics.cacheHit,
            retrievalLatencyMs: queryMetrics.retrievalLatencyMs,
            generationLatencyMs: queryMetrics.generationLatencyMs,
            traceId: context.traceId,
            spanId: context.spanId
        });
        
        // Buffer for aggregated metrics
        this.metricsBuffer.push({
            timestamp: Date.now(),
            type: 'query_performance',
            metrics: queryMetrics
        });
    }
    
    /**
     * Start a distributed trace span
     */
    startSpan(operation, metadata = {}) {
        const context = this.correlationContext.createChildContext(operation);
        const spanId = context.spanId;
        
        const span = {
            spanId,
            operation,
            startTime: Date.now(),
            context,
            metadata,
            events: []
        };
        
        this.spans.set(spanId, span);
        this.correlationContext.setContext(context);
        
        this.logger.debug('Span started', {
            operation,
            spanId,
            traceId: context.traceId,
            parentSpanId: context.parentSpanId,
            ...metadata
        });
        
        return spanId;
    }
    
    /**
     * Finish a distributed trace span
     */
    finishSpan(spanId, result = {}, error = null) {
        const span = this.spans.get(spanId);
        if (!span) {
            this.logger.warn('Span not found', { spanId });
            return;
        }
        
        const endTime = Date.now();
        const duration = endTime - span.startTime;
        
        span.endTime = endTime;
        span.duration = duration;
        span.result = result;
        span.error = error;
        
        this.logger.info('Span completed', {
            operation: span.operation,
            spanId: span.spanId,
            traceId: span.context.traceId,
            duration,
            success: !error,
            error: error ? error.message : undefined,
            ...span.metadata,
            ...result
        });
        
        this.spans.delete(spanId);
    }
    
    /**
     * Add event to current span
     */
    addSpanEvent(spanId, event, data = {}) {
        const span = this.spans.get(spanId);
        if (!span) return;
        
        span.events.push({
            timestamp: Date.now(),
            event,
            data
        });
        
        this.logger.debug('Span event', {
            spanId,
            event,
            operation: span.operation,
            ...data
        });
    }
    
    /**
     * Log structured error with correlation
     */
    logError(error, context = {}) {
        const correlationCtx = this.correlationContext.getContext();
        
        this.logger.error(error.message || 'Unknown error', {
            error: {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: error.stack
            },
            traceId: correlationCtx.traceId,
            spanId: correlationCtx.spanId,
            ...context
        });
    }
    
    /**
     * Log business metrics
     */
    logBusinessMetric(name, value, dimensions = {}) {
        const context = this.correlationContext.getContext();
        
        this.logger.info('Business metric', {
            category: 'business',
            type: 'metric',
            metric: {
                name,
                value,
                dimensions,
                timestamp: Date.now()
            },
            traceId: context.traceId,
            spanId: context.spanId
        });
        
        this.metricsBuffer.push({
            timestamp: Date.now(),
            type: 'business_metric',
            name,
            value,
            dimensions
        });
    }
    
    /**
     * Log security event with correlation
     */
    logSecurityEvent(event, details = {}) {
        const context = this.correlationContext.getContext();
        
        this.logger.warn('Security event', {
            category: 'security',
            type: 'security_event',
            event,
            details,
            traceId: context.traceId,
            spanId: context.spanId,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Flush accumulated metrics
     */
    flushMetrics() {
        if (this.metricsBuffer.length === 0) return;
        
        const metrics = [...this.metricsBuffer];
        this.metricsBuffer = [];
        
        // Aggregate metrics by type
        const aggregated = {};
        metrics.forEach(metric => {
            if (!aggregated[metric.type]) {
                aggregated[metric.type] = [];
            }
            aggregated[metric.type].push(metric);
        });
        
        // Log aggregated metrics
        for (const [type, metricList] of Object.entries(aggregated)) {
            this.logger.info('Metrics flush', {
                category: 'metrics',
                type: 'aggregated_metrics',
                metricType: type,
                count: metricList.length,
                timeWindow: '30s',
                metrics: metricList.slice(0, 100) // Limit to prevent huge logs
            });
        }
    }
    
    /**
     * Get trace context for external systems
     */
    getTraceContext() {
        const context = this.correlationContext.getContext();
        return {
            traceId: context.traceId,
            spanId: context.spanId,
            traceParent: `00-${context.traceId}-${context.spanId}-01`
        };
    }
    
    /**
     * Set trace context from external system
     */
    setTraceContext(traceId, spanId) {
        const context = this.correlationContext.createContext(traceId, spanId);
        this.correlationContext.setContext(context);
        
        this.logger.debug('Trace context set', {
            traceId,
            spanId,
            source: 'external'
        });
    }
    
    /**
     * Create operation wrapper with automatic tracing
     */
    traced(operation, fn) {
        return async (...args) => {
            const spanId = this.startSpan(operation);
            
            try {
                const result = await fn(...args);
                this.finishSpan(spanId, { result });
                return result;
            } catch (error) {
                this.finishSpan(spanId, {}, error);
                throw error;
            }
        };
    }
    
    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.metricsFlushInterval) {
            clearInterval(this.metricsFlushInterval);
        }
        this.flushMetrics();
    }
}

// Create performance logger instance
const perfLogger = new PerformanceLogger(logger);

// Error handling for logger
logger.on('error', (error) => {
    console.error('Logger error:', error);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, closing logger');
    logger.end();
});

process.on('SIGINT', () => {
    logger.info('Received SIGINT, closing logger');
    logger.end();
});

// Add critical method to logger
logger.critical = (message, metadata = {}) => {
    logger.log('critical', message, metadata);
};

// Export logger and utilities
module.exports = {
    logger,
    perfLogger,
    PerformanceLogger,
    CorrelationContext,
    correlationContext,
    LOG_LEVELS,
    SYSTEM_INFO
};
