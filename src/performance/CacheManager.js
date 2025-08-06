/**
 * CacheManager - Multi-level caching system optimized for GH200 Grace memory
 * Implements L1/L2/L3 cache hierarchy with Grace-optimized memory allocation
 */

const { LRUCache } = require('lru-cache');
const { logger } = require('../utils/logger');
const { GraceMemoryManager } = require('../memory/GraceMemoryManager');

/**
 * Cache levels with different characteristics
 */
const CACHE_LEVELS = {
    L1: {
        name: 'L1_CPU',
        maxSize: 10 * 1024 * 1024,    // 10MB - CPU cache
        ttl: 300000,                   // 5 minutes
        updateAgeOnGet: true
    },
    L2: {
        name: 'L2_GRACE',
        maxSize: 1024 * 1024 * 1024,  // 1GB - Grace unified memory
        ttl: 3600000,                  // 1 hour
        updateAgeOnGet: true
    },
    L3: {
        name: 'L3_DISK',
        maxSize: 10 * 1024 * 1024 * 1024, // 10GB - Disk cache
        ttl: 86400000,                 // 24 hours
        updateAgeOnGet: false
    }
};

/**
 * Cache entry metadata
 */
class CacheEntry {
    constructor(key, value, level, metadata = {}) {
        this.key = key;
        this.value = value;
        this.level = level;
        this.metadata = {
            size: this._calculateSize(value),
            created: Date.now(),
            accessed: Date.now(),
            accessCount: 0,
            ...metadata
        };
    }
    
    /**
     * Update access statistics
     */
    markAccessed() {
        this.metadata.accessed = Date.now();
        this.metadata.accessCount++;
    }
    
    /**
     * Calculate approximate size of value
     */
    _calculateSize(value) {
        if (typeof value === 'string') {
            return value.length * 2; // Unicode characters
        } else if (value instanceof ArrayBuffer) {
            return value.byteLength;
        } else if (Array.isArray(value)) {
            return value.length * 8; // Assume 8 bytes per element
        } else if (typeof value === 'object') {
            return JSON.stringify(value).length * 2;
        }
        return 64; // Default estimate
    }
}

/**
 * Multi-level cache implementation
 */
class MultiLevelCache {
    constructor(options = {}) {
        this.options = {
            enableL1: true,
            enableL2: true,
            enableL3: false, // Disk cache disabled by default
            graceMemoryManager: null,
            prefetchThreshold: 0.8, // Start prefetching when cache is 80% full
            ...options
        };
        
        // Initialize cache levels
        this.caches = new Map();
        this.stats = {
            hits: { L1: 0, L2: 0, L3: 0 },
            misses: { L1: 0, L2: 0, L3: 0 },
            evictions: { L1: 0, L2: 0, L3: 0 },
            promotions: { L1: 0, L2: 0, L3: 0 },
            totalRequests: 0
        };
        
        this.graceMemory = this.options.graceMemoryManager;
        this.prefetchQueue = new Set();
        
        this._initializeCaches();
        
        // Start background tasks
        this._startMaintenanceTasks();
        
        logger.info('MultiLevelCache initialized', {
            L1: this.options.enableL1,
            L2: this.options.enableL2,
            L3: this.options.enableL3
        });
    }
    
    /**
     * Get value from cache hierarchy
     * @param {string} key - Cache key
     * @returns {*} Cached value or null
     */
    async get(key) {
        this.stats.totalRequests++;
        
        // Check L1 first (fastest)
        if (this.options.enableL1) {
            const l1Value = this.caches.get('L1').get(key);
            if (l1Value) {
                this.stats.hits.L1++;
                l1Value.markAccessed();
                return l1Value.value;
            }
            this.stats.misses.L1++;
        }
        
        // Check L2 (Grace memory)
        if (this.options.enableL2) {
            const l2Value = this.caches.get('L2').get(key);
            if (l2Value) {
                this.stats.hits.L2++;
                l2Value.markAccessed();
                
                // Promote to L1
                if (this.options.enableL1) {
                    await this._promoteToL1(key, l2Value.value);
                }
                
                return l2Value.value;
            }
            this.stats.misses.L2++;
        }
        
        // Check L3 (disk cache)
        if (this.options.enableL3) {
            const l3Value = await this._getFromDisk(key);
            if (l3Value) {
                this.stats.hits.L3++;
                
                // Promote to higher levels
                await this._promoteValue(key, l3Value, 'L3');
                
                return l3Value;
            }
            this.stats.misses.L3++;
        }
        
        return null;
    }
    
    /**
     * Set value in cache hierarchy
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {Object} options - Cache options
     */
    async set(key, value, options = {}) {
        const {
            ttl,
            level = 'auto',
            priority = 'normal',
            metadata = {}
        } = options;
        
        // Determine optimal cache level
        const targetLevel = level === 'auto' ? 
            this._determineOptimalLevel(value, priority) : level;
        
        const entry = new CacheEntry(key, value, targetLevel, {
            ...metadata,
            priority,
            setTime: Date.now()
        });
        
        // Store in target level
        await this._storeInLevel(key, entry, targetLevel, ttl);
        
        // Prefetch related items if needed
        if (this._shouldPrefetch(targetLevel)) {
            this._schedulePrefetch(key);
        }
    }
    
    /**
     * Delete from all cache levels
     * @param {string} key - Cache key
     */
    async delete(key) {
        let deleted = false;
        
        for (const [level, cache] of this.caches) {
            if (cache.delete(key)) {
                deleted = true;
            }
        }
        
        if (this.options.enableL3) {
            await this._deleteFromDisk(key);
        }
        
        return deleted;
    }
    
    /**
     * Clear all cache levels
     */
    async clear() {
        for (const cache of this.caches.values()) {
            cache.clear();
        }
        
        if (this.options.enableL3) {
            await this._clearDiskCache();
        }
        
        // Reset statistics
        this.stats = {
            hits: { L1: 0, L2: 0, L3: 0 },
            misses: { L1: 0, L2: 0, L3: 0 },
            evictions: { L1: 0, L2: 0, L3: 0 },
            promotions: { L1: 0, L2: 0, L3: 0 },
            totalRequests: 0
        };
        
        logger.info('All cache levels cleared');
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        const levelStats = {};
        
        for (const [level, cache] of this.caches) {
            levelStats[level] = {
                size: cache.size,
                maxSize: cache.max,
                hitRate: this.stats.hits[level] / (this.stats.hits[level] + this.stats.misses[level] || 1),
                hits: this.stats.hits[level],
                misses: this.stats.misses[level],
                evictions: this.stats.evictions[level],
                promotions: this.stats.promotions[level]
            };
        }
        
        return {
            levels: levelStats,
            overall: {
                totalRequests: this.stats.totalRequests,
                overallHitRate: this._calculateOverallHitRate(),
                prefetchQueueSize: this.prefetchQueue.size
            }
        };
    }
    
    /**
     * Initialize cache levels
     */
    _initializeCaches() {
        if (this.options.enableL1) {
            this.caches.set('L1', new LRUCache({
                max: CACHE_LEVELS.L1.maxSize,
                ttl: CACHE_LEVELS.L1.ttl,
                updateAgeOnGet: CACHE_LEVELS.L1.updateAgeOnGet,
                dispose: (value, key) => {
                    this.stats.evictions.L1++;
                    // Try to demote to L2
                    if (this.options.enableL2) {
                        this._demoteToL2(key, value);
                    }
                }
            }));
        }
        
        if (this.options.enableL2) {
            this.caches.set('L2', new LRUCache({
                max: CACHE_LEVELS.L2.maxSize,
                ttl: CACHE_LEVELS.L2.ttl,
                updateAgeOnGet: CACHE_LEVELS.L2.updateAgeOnGet,
                dispose: (value, key) => {
                    this.stats.evictions.L2++;
                    // Try to demote to L3
                    if (this.options.enableL3) {
                        this._demoteToL3(key, value);
                    }
                }
            }));
        }
        
        if (this.options.enableL3) {
            this.caches.set('L3', new Map()); // Simple Map for L3 (disk-backed)
        }
    }
    
    /**
     * Determine optimal cache level for value
     */
    _determineOptimalLevel(value, priority) {
        const size = new CacheEntry('', value, '').metadata.size;
        
        // Small, frequently accessed items go to L1
        if (size < 1024 && priority === 'high') {
            return 'L1';
        }
        
        // Medium items go to L2 (Grace memory)
        if (size < 1024 * 1024) {
            return 'L2';
        }
        
        // Large items go to L3 (disk)
        return 'L3';
    }
    
    /**
     * Store entry in specific cache level
     */
    async _storeInLevel(key, entry, level, ttl) {
        if (!this.caches.has(level)) {
            return false;
        }
        
        const cache = this.caches.get(level);
        
        if (level === 'L2' && this.graceMemory) {
            // Pin important data to Grace memory
            try {
                const allocation = await this.graceMemory.pinToGrace(
                    Buffer.from(JSON.stringify(entry.value)), 
                    'cache'
                );
                entry.metadata.graceAllocation = allocation.id;
            } catch (error) {
                logger.warn('Failed to pin to Grace memory', { 
                    key, 
                    error: error.message 
                });
            }
        }
        
        cache.set(key, entry, { ttl });
        return true;
    }
    
    /**
     * Promote value to L1 cache
     */
    async _promoteToL1(key, value) {
        if (!this.options.enableL1) return;
        
        const entry = new CacheEntry(key, value, 'L1');
        const l1Cache = this.caches.get('L1');
        
        l1Cache.set(key, entry);
        this.stats.promotions.L1++;
    }
    
    /**
     * Promote value from lower level
     */
    async _promoteValue(key, value, fromLevel) {
        if (fromLevel === 'L3' && this.options.enableL2) {
            await this._storeInLevel(key, new CacheEntry(key, value, 'L2'), 'L2');
            this.stats.promotions.L2++;
        }
        
        if (this.options.enableL1) {
            await this._promoteToL1(key, value);
        }
    }
    
    /**
     * Demote value to L2
     */
    async _demoteToL2(key, entry) {
        if (!this.options.enableL2) return;
        
        const l2Cache = this.caches.get('L2');
        l2Cache.set(key, entry);
    }
    
    /**
     * Demote value to L3
     */
    async _demoteToL3(key, entry) {
        if (!this.options.enableL3) return;
        
        await this._saveToDisk(key, entry.value);
    }
    
    /**
     * Check if prefetching should be triggered
     */
    _shouldPrefetch(level) {
        const cache = this.caches.get(level);
        if (!cache) return false;
        
        const utilizationRatio = cache.size / cache.max;
        return utilizationRatio > this.options.prefetchThreshold;
    }
    
    /**
     * Schedule prefetch operation
     */
    _schedulePrefetch(key) {
        this.prefetchQueue.add(key);
        
        // Process prefetch queue asynchronously
        setImmediate(() => this._processPrefetchQueue());
    }
    
    /**
     * Process prefetch queue
     */
    async _processPrefetchQueue() {
        // Implementation would prefetch related items
        // For now, just clear the queue
        this.prefetchQueue.clear();
    }
    
    /**
     * Calculate overall hit rate across all levels
     */
    _calculateOverallHitRate() {
        const totalHits = Object.values(this.stats.hits).reduce((a, b) => a + b, 0);
        const totalMisses = Object.values(this.stats.misses).reduce((a, b) => a + b, 0);
        
        return totalHits / (totalHits + totalMisses || 1);
    }
    
    /**
     * Start maintenance tasks
     */
    _startMaintenanceTasks() {
        // Cleanup expired entries every 5 minutes
        setInterval(() => {
            this._performMaintenance();
        }, 300000);
        
        // Log statistics every 10 minutes
        setInterval(() => {
            logger.debug('Cache statistics', this.getStats());
        }, 600000);
    }
    
    /**
     * Perform cache maintenance
     */
    _performMaintenance() {
        // Maintenance tasks like cleanup and optimization
        logger.debug('Performing cache maintenance');
    }
    
    // Disk cache operations (mock implementations)
    async _getFromDisk(key) {
        // Mock disk cache lookup
        return null;
    }
    
    async _saveToDisk(key, value) {
        // Mock disk cache save
        return true;
    }
    
    async _deleteFromDisk(key) {
        // Mock disk cache delete
        return true;
    }
    
    async _clearDiskCache() {
        // Mock disk cache clear
        return true;
    }
}

/**
 * Cache manager for the entire system
 */
class CacheManager {
    constructor(options = {}) {
        this.caches = new Map();
        this.defaultOptions = {
            enableL1: true,
            enableL2: true,
            enableL3: false,
            ...options
        };
        
        // Create default caches
        this.createCache('query', { ...this.defaultOptions });
        this.createCache('embedding', { ...this.defaultOptions });
        this.createCache('metadata', { ...this.defaultOptions });
        
        logger.info('CacheManager initialized with default caches');
    }
    
    /**
     * Create named cache
     * @param {string} name - Cache name
     * @param {Object} options - Cache options
     * @returns {MultiLevelCache} Created cache
     */
    createCache(name, options = {}) {
        const cacheOptions = { ...this.defaultOptions, ...options };
        const cache = new MultiLevelCache(cacheOptions);
        
        this.caches.set(name, cache);
        
        logger.info('Cache created', { name, options: cacheOptions });
        
        return cache;
    }
    
    /**
     * Get cache by name
     * @param {string} name - Cache name
     * @returns {MultiLevelCache|null} Cache instance or null
     */
    getCache(name) {
        return this.caches.get(name) || null;
    }
    
    /**
     * Get all cache statistics
     * @returns {Object} Statistics for all caches
     */
    getAllStats() {
        const stats = {};
        
        for (const [name, cache] of this.caches) {
            stats[name] = cache.getStats();
        }
        
        return stats;
    }
    
    /**
     * Clear all caches
     */
    async clearAll() {
        for (const cache of this.caches.values()) {
            await cache.clear();
        }
        
        logger.info('All caches cleared');
    }
}

// Export singleton instance
const cacheManager = new CacheManager();

module.exports = {
    MultiLevelCache,
    CacheManager,
    CacheEntry,
    CACHE_LEVELS,
    cacheManager
};