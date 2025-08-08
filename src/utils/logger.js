/**
 * Structured logging utility optimized for Grace Hopper environments
 * Provides performance-aware logging with minimal memory allocation
 */

const winston = require('winston');
const { format } = winston;

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

// Custom format for Grace Hopper context
const graceHopperFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.printf(({ level, message, timestamp, ...metadata }) => {
        const meta = Object.keys(metadata).length ? JSON.stringify(metadata) : '';
        return `${timestamp} [${level.toUpperCase()}] ${message} ${meta}`;
    })
);

// Transport configuration optimized for high-throughput logging
const transports = [];

// Console transport for development
if (isDevelopment) {
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
    transports.push(
        new winston.transports.File({
            filename: 'logs/gh200-router-error.log',
            level: 'error',
            format: graceHopperFormat,
            maxsize: 100 * 1024 * 1024, // 100MB
            maxFiles: 10,
            tailable: true
        }),
        new winston.transports.File({
            filename: 'logs/gh200-router-combined.log',
            format: graceHopperFormat,
            maxsize: 500 * 1024 * 1024, // 500MB
            maxFiles: 20,
            tailable: true
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

// Performance-aware logging helpers
class PerformanceLogger {
    constructor(baseLogger) {
        this.logger = baseLogger;
        this.timers = new Map();
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
        this.logger.info('Query performance', {
            queryId: queryMetrics.queryId,
            latencyMs: queryMetrics.latencyMs,
            throughputQPS: queryMetrics.throughputQPS,
            vectorsSearched: queryMetrics.vectorsSearched,
            shardsQueried: queryMetrics.shardsQueried,
            cacheHit: queryMetrics.cacheHit,
            retrievalLatencyMs: queryMetrics.retrievalLatencyMs,
            generationLatencyMs: queryMetrics.generationLatencyMs
        });
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
    LOG_LEVELS
};
