/**
 * Advanced Rate Limiting for GH200 Retrieval Router
 * Implements multiple rate limiting strategies with Redis support
 */

const { logger } = require('../utils/logger');

/**
 * Token Bucket Rate Limiter
 */
class TokenBucket {
    constructor(capacity, refillRate, refillPeriod = 1000) {
        this.capacity = capacity;
        this.tokens = capacity;
        this.refillRate = refillRate;
        this.refillPeriod = refillPeriod;
        this.lastRefill = Date.now();
    }
    
    /**
     * Try to consume tokens
     * @param {number} tokensRequested - Number of tokens to consume
     * @returns {boolean} Whether tokens were successfully consumed
     */
    consume(tokensRequested = 1) {
        this._refill();
        
        if (this.tokens >= tokensRequested) {
            this.tokens -= tokensRequested;
            return true;
        }
        
        return false;
    }
    
    /**
     * Get current token count
     */
    getTokens() {
        this._refill();
        return this.tokens;
    }
    
    /**
     * Refill tokens based on time passed
     */
    _refill() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const tokensToAdd = (timePassed / this.refillPeriod) * this.refillRate;
        
        this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }
}

/**
 * Sliding Window Rate Limiter
 */
class SlidingWindow {
    constructor(windowSize, maxRequests) {
        this.windowSize = windowSize;
        this.maxRequests = maxRequests;
        this.requests = [];
    }
    
    /**
     * Check if request is allowed
     * @returns {boolean} Whether request is allowed
     */
    isAllowed() {
        const now = Date.now();
        const windowStart = now - this.windowSize;
        
        // Remove requests outside window
        this.requests = this.requests.filter(time => time > windowStart);
        
        if (this.requests.length < this.maxRequests) {
            this.requests.push(now);
            return true;
        }
        
        return false;
    }
    
    /**
     * Get current request count in window
     */
    getCurrentCount() {
        const now = Date.now();
        const windowStart = now - this.windowSize;
        this.requests = this.requests.filter(time => time > windowStart);
        return this.requests.length;
    }
}

/**
 * Adaptive Rate Limiter
 * Adjusts limits based on system performance
 */
class AdaptiveRateLimiter {
    constructor(options = {}) {
        this.options = {
            baseLimit: 1000,
            windowSize: 60000, // 1 minute
            adaptationFactor: 0.1,
            minLimit: 100,
            maxLimit: 10000,
            errorThreshold: 0.05, // 5% error rate
            latencyThreshold: 500, // 500ms
            ...options
        };
        
        this.currentLimit = this.options.baseLimit;
        this.window = new SlidingWindow(this.options.windowSize, this.currentLimit);
        this.metrics = {
            requests: 0,
            errors: 0,
            totalLatency: 0,
            lastAdaptation: Date.now()
        };
    }
    
    /**
     * Check if request is allowed and record metrics
     * @param {Object} requestMetrics - Request performance metrics
     * @returns {boolean} Whether request is allowed
     */
    isAllowed(requestMetrics = {}) {
        const allowed = this.window.isAllowed();
        
        if (allowed) {
            this._recordMetrics(requestMetrics);
            this._adaptIfNeeded();
        }
        
        return allowed;
    }
    
    /**
     * Record request metrics
     */
    _recordMetrics(metrics) {
        this.metrics.requests++;
        
        if (metrics.error) {
            this.metrics.errors++;
        }
        
        if (metrics.latency) {
            this.metrics.totalLatency += metrics.latency;
        }
    }
    
    /**
     * Adapt rate limit based on performance
     */
    _adaptIfNeeded() {
        const now = Date.now();
        const timeSinceLastAdaptation = now - this.metrics.lastAdaptation;
        
        // Adapt every 10 seconds
        if (timeSinceLastAdaptation < 10000) {
            return;
        }
        
        if (this.metrics.requests === 0) {
            return;
        }
        
        const errorRate = this.metrics.errors / this.metrics.requests;
        const avgLatency = this.metrics.totalLatency / this.metrics.requests;
        
        let adaptationMultiplier = 1;
        
        // Reduce limit if error rate or latency is high
        if (errorRate > this.options.errorThreshold || avgLatency > this.options.latencyThreshold) {
            adaptationMultiplier = 1 - this.options.adaptationFactor;
            logger.warn('Reducing rate limit due to performance issues', {
                errorRate,
                avgLatency,
                currentLimit: this.currentLimit
            });
        } else if (errorRate < this.options.errorThreshold / 2 && avgLatency < this.options.latencyThreshold / 2) {
            // Increase limit if performance is good
            adaptationMultiplier = 1 + this.options.adaptationFactor;
            logger.debug('Increasing rate limit due to good performance', {
                errorRate,
                avgLatency,
                currentLimit: this.currentLimit
            });
        }
        
        // Apply adaptation
        this.currentLimit = Math.max(
            this.options.minLimit,
            Math.min(this.options.maxLimit, Math.round(this.currentLimit * adaptationMultiplier))
        );
        
        // Update sliding window with new limit
        this.window = new SlidingWindow(this.options.windowSize, this.currentLimit);
        
        // Reset metrics
        this.metrics = {
            requests: 0,
            errors: 0,
            totalLatency: 0,
            lastAdaptation: now
        };
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            currentLimit: this.currentLimit,
            baseLimit: this.options.baseLimit,
            currentCount: this.window.getCurrentCount(),
            errorRate: this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0,
            avgLatency: this.metrics.requests > 0 ? this.metrics.totalLatency / this.metrics.requests : 0
        };
    }
}

/**
 * Rate Limiter Manager
 */
class RateLimiterManager {
    constructor() {
        this.limiters = new Map();
    }
    
    /**
     * Get or create rate limiter for key
     * @param {string} key - Limiter key (IP, user, etc.)
     * @param {Object} options - Rate limiter options
     * @returns {AdaptiveRateLimiter} Rate limiter instance
     */
    getLimiter(key, options = {}) {
        if (!this.limiters.has(key)) {
            this.limiters.set(key, new AdaptiveRateLimiter(options));
        }
        
        return this.limiters.get(key);
    }
    
    /**
     * Express middleware factory
     * @param {Object} options - Middleware options
     * @returns {Function} Express middleware
     */
    middleware(options = {}) {
        const {
            keyGenerator = (req) => req.ip,
            skipSuccessfulRequests = false,
            skipFailedRequests = false,
            ...limiterOptions
        } = options;
        
        return (req, res, next) => {
            const key = keyGenerator(req);
            const limiter = this.getLimiter(key, limiterOptions);
            
            const allowed = limiter.isAllowed();
            
            if (!allowed) {
                const status = limiter.getStatus();
                
                res.status(429).json({
                    error: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests',
                    retryAfter: Math.ceil(options.windowSize / 1000),
                    limit: status.currentLimit,
                    remaining: Math.max(0, status.currentLimit - status.currentCount)
                });
                
                logger.warn('Rate limit exceeded', {
                    key,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path,
                    ...status
                });
                
                return;
            }
            
            // Track response metrics
            const startTime = Date.now();
            
            res.on('finish', () => {
                const latency = Date.now() - startTime;
                const error = res.statusCode >= 400;
                
                if (!((skipSuccessfulRequests && !error) || (skipFailedRequests && error))) {
                    limiter._recordMetrics({ latency, error });
                }
            });
            
            next();
        };
    }
    
    /**
     * Get all limiter statuses
     */
    getAllStatus() {
        const status = {};
        
        for (const [key, limiter] of this.limiters) {
            status[key] = limiter.getStatus();
        }
        
        return status;
    }
    
    /**
     * Clear old limiters to prevent memory leaks
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 3600000; // 1 hour
        
        for (const [key, limiter] of this.limiters) {
            if (now - limiter.metrics.lastAdaptation > maxAge) {
                this.limiters.delete(key);
            }
        }
    }
}

// Create global rate limiter manager
const rateLimiterManager = new RateLimiterManager();

// Cleanup old limiters every hour
setInterval(() => {
    rateLimiterManager.cleanup();
}, 3600000);

module.exports = {
    TokenBucket,
    SlidingWindow,
    AdaptiveRateLimiter,
    RateLimiterManager,
    rateLimiterManager
};