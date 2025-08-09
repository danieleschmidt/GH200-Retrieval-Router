/**
 * Advanced Caching Engine for High-Performance RAG
 * Multi-tier caching with Grace memory optimization and predictive prefetching
 */

const { GraceMemoryManager } = require('../memory/GraceMemoryManager');
const { logger } = require('../utils/logger');

class AdvancedCachingEngine {
    constructor(config = {}) {
        this.config = {
            l1Size: config.l1Size || 100 * 1024 * 1024, // 100MB L1 cache
            l2Size: config.l2Size || 1024 * 1024 * 1024, // 1GB L2 cache
            l3Size: config.l3Size || 10 * 1024 * 1024 * 1024, // 10GB L3 cache
            ttl: config.ttl || 3600000, // 1 hour default TTL
            maxMemoryRatio: config.maxMemoryRatio || 0.8,
            compressionEnabled: config.compressionEnabled !== false,
            prefetchingEnabled: config.prefetchingEnabled !== false,
            analyticsEnabled: config.analyticsEnabled !== false,
            ...config
        };
        
        // Multi-tier cache structure
        this.l1Cache = new Map(); // In-memory fast cache
        this.l2Cache = new Map(); // Compressed cache
        this.l3Cache = new Map(); // Persistent cache with Grace memory
        
        // Cache analytics and optimization
        this.hitStats = {
            l1: { hits: 0, misses: 0 },
            l2: { hits: 0, misses: 0 },
            l3: { hits: 0, misses: 0 },
            total: { hits: 0, misses: 0 }
        };
        
        this.accessPatterns = new Map(); // Track access patterns for prefetching
        this.queryFrequency = new Map(); // Track query frequency
        this.compressionRatios = new Map(); // Track compression effectiveness
        
        this.graceMemoryManager = null;
        this.prefetchQueue = [];
        this.compressionWorkers = [];
        
        this._initializeCache();
    }
    
    async _initializeCache() {
        try {
            // Initialize Grace Memory Manager for L3 cache
            this.graceMemoryManager = new GraceMemoryManager({
                totalMemoryGB: Math.floor(this.config.l3Size / (1024 * 1024 * 1024)),
                enableZeroCopy: true
            });
            await this.graceMemoryManager.initialize();
            
            // Start background tasks
            this._startMaintenanceTasks();
            this._startPrefetchingEngine();
            
            logger.info('Advanced caching engine initialized', {
                l1Size: this.config.l1Size,
                l2Size: this.config.l2Size,
                l3Size: this.config.l3Size,
                graceMemoryEnabled: !!this.graceMemoryManager
            });
            
        } catch (error) {
            logger.error('Failed to initialize caching engine', { error: error.message });
            throw error;
        }
    }
    
    async get(key, options = {}) {
        const startTime = Date.now();
        const { skipPrefetch = false, tier = 'auto' } = options;
        
        try {
            // Record access pattern for analytics
            this._recordAccess(key);
            
            let result = null;
            let hitTier = null;
            
            // L1 Cache lookup (fastest)
            if (tier === 'auto' || tier === 'l1') {
                result = this._getFromL1(key);
                if (result) {
                    hitTier = 'l1';
                    this.hitStats.l1.hits++;
                }
            }
            
            // L2 Cache lookup (compressed)
            if (!result && (tier === 'auto' || tier === 'l2')) {
                result = await this._getFromL2(key);
                if (result) {
                    hitTier = 'l2';
                    this.hitStats.l2.hits++;
                    // Promote to L1 for faster future access
                    this._setToL1(key, result, options);
                }
            }
            
            // L3 Cache lookup (Grace memory)
            if (!result && (tier === 'auto' || tier === 'l3')) {
                result = await this._getFromL3(key);
                if (result) {
                    hitTier = 'l3';
                    this.hitStats.l3.hits++;
                    // Promote to higher tiers
                    this._setToL1(key, result, options);
                    await this._setToL2(key, result, options);
                }
            }
            
            const responseTime = Date.now() - startTime;
            
            if (result) {
                this.hitStats.total.hits++;
                
                // Trigger prefetching for related queries
                if (!skipPrefetch && this.config.prefetchingEnabled) {
                    this._triggerPrefetch(key, result);
                }
                
                logger.debug('Cache hit', { key, tier: hitTier, responseTime });
                
                return {
                    data: result.data,
                    metadata: {
                        ...result.metadata,
                        cacheHit: true,
                        hitTier,
                        responseTime
                    }
                };
            } else {
                this._recordMiss(key);
                this.hitStats.total.misses++;
                
                logger.debug('Cache miss', { key, responseTime });
                return null;
            }
            
        } catch (error) {
            logger.error('Cache get error', { key, error: error.message });
            return null;
        }
    }
    
    async set(key, data, options = {}) {
        const {
            ttl = this.config.ttl,
            tier = 'all',
            compress = this.config.compressionEnabled,
            priority = 'normal'
        } = options;
        
        try {
            const timestamp = Date.now();
            const cacheEntry = {
                data,
                metadata: {
                    timestamp,
                    ttl,
                    priority,
                    accessCount: 0,
                    size: this._calculateSize(data)
                }
            };
            
            // Set to appropriate tiers
            if (tier === 'all' || tier === 'l1') {
                this._setToL1(key, cacheEntry, options);
            }
            
            if (tier === 'all' || tier === 'l2') {
                await this._setToL2(key, cacheEntry, { ...options, compress });
            }
            
            if (tier === 'all' || tier === 'l3') {
                await this._setToL3(key, cacheEntry, options);
            }
            
            // Update analytics
            this._updateSetAnalytics(key, cacheEntry);
            
            logger.debug('Cache set completed', { 
                key, 
                size: cacheEntry.metadata.size, 
                tier 
            });
            
        } catch (error) {
            logger.error('Cache set error', { key, error: error.message });
        }
    }
    
    async evict(key, options = {}) {
        const { tier = 'all' } = options;
        
        if (tier === 'all' || tier === 'l1') {
            this.l1Cache.delete(key);
        }
        
        if (tier === 'all' || tier === 'l2') {
            this.l2Cache.delete(key);
        }
        
        if (tier === 'all' || tier === 'l3') {
            this.l3Cache.delete(key);
            if (this.graceMemoryManager) {
                await this.graceMemoryManager.deallocate(key);
            }
        }
        
        // Clean up analytics
        this.accessPatterns.delete(key);
        this.queryFrequency.delete(key);
        
        logger.debug('Cache entry evicted', { key, tier });
    }
    
    async invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        const keysToEvict = [];
        
        // Find matching keys across all tiers
        for (const key of this.l1Cache.keys()) {
            if (regex.test(key)) keysToEvict.push(key);
        }
        
        for (const key of this.l2Cache.keys()) {
            if (regex.test(key)) keysToEvict.push(key);
        }
        
        for (const key of this.l3Cache.keys()) {
            if (regex.test(key)) keysToEvict.push(key);
        }
        
        // Evict all matching keys
        for (const key of keysToEvict) {
            await this.evict(key);
        }
        
        logger.info('Pattern invalidation completed', { 
            pattern, 
            evictedKeys: keysToEvict.length 
        });
        
        return keysToEvict.length;
    }
    
    // L1 Cache operations (fast in-memory)
    _getFromL1(key) {
        const entry = this.l1Cache.get(key);
        if (!entry || this._isExpired(entry)) {
            this.l1Cache.delete(key);
            this.hitStats.l1.misses++;
            return null;
        }
        
        entry.metadata.accessCount++;
        entry.metadata.lastAccessed = Date.now();
        return entry;
    }
    
    _setToL1(key, entry, options = {}) {
        // Check L1 size limits
        if (this._getL1Size() > this.config.l1Size) {
            this._evictFromL1();
        }
        
        this.l1Cache.set(key, entry);
    }
    
    // L2 Cache operations (compressed)
    async _getFromL2(key) {
        const compressedEntry = this.l2Cache.get(key);
        if (!compressedEntry || this._isExpired(compressedEntry)) {
            this.l2Cache.delete(key);
            this.hitStats.l2.misses++;
            return null;
        }
        
        // Decompress entry
        const entry = await this._decompress(compressedEntry);
        entry.metadata.accessCount++;
        entry.metadata.lastAccessed = Date.now();
        
        return entry;
    }
    
    async _setToL2(key, entry, options = {}) {
        if (this._getL2Size() > this.config.l2Size) {
            this._evictFromL2();
        }
        
        let cacheEntry = entry;
        if (options.compress) {
            cacheEntry = await this._compress(entry);
        }
        
        this.l2Cache.set(key, cacheEntry);
    }
    
    // L3 Cache operations (Grace memory)
    async _getFromL3(key) {
        const entry = this.l3Cache.get(key);
        if (!entry || this._isExpired(entry)) {
            this.l3Cache.delete(key);
            this.hitStats.l3.misses++;
            return null;
        }
        
        // Load from Grace memory if needed
        if (entry.metadata.graceStored) {
            try {
                const graceData = await this.graceMemoryManager.read(key);
                entry.data = graceData;
            } catch (error) {
                logger.warn('Failed to read from Grace memory', { key, error: error.message });
                return null;
            }
        }
        
        entry.metadata.accessCount++;
        entry.metadata.lastAccessed = Date.now();
        
        return entry;
    }
    
    async _setToL3(key, entry, options = {}) {
        if (this._getL3Size() > this.config.l3Size) {
            await this._evictFromL3();
        }
        
        let cacheEntry = { ...entry };
        
        // Store large entries in Grace memory
        if (entry.metadata.size > 1024 * 1024 && this.graceMemoryManager) { // > 1MB
            try {
                await this.graceMemoryManager.write(key, entry.data);
                cacheEntry.data = null; // Reference only
                cacheEntry.metadata.graceStored = true;
            } catch (error) {
                logger.warn('Failed to store in Grace memory', { key, error: error.message });
            }
        }
        
        this.l3Cache.set(key, cacheEntry);
    }
    
    // Compression utilities
    async _compress(entry) {
        try {
            const zlib = require('zlib');
            const compressed = await new Promise((resolve, reject) => {
                zlib.gzip(JSON.stringify(entry), (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            
            const compressionRatio = compressed.length / JSON.stringify(entry).length;
            this.compressionRatios.set(entry.metadata.timestamp, compressionRatio);
            
            return {
                ...entry,
                data: compressed,
                metadata: {
                    ...entry.metadata,
                    compressed: true,
                    originalSize: entry.metadata.size,
                    compressedSize: compressed.length,
                    compressionRatio
                }
            };
        } catch (error) {
            logger.error('Compression failed', { error: error.message });
            return entry;
        }
    }
    
    async _decompress(compressedEntry) {
        if (!compressedEntry.metadata.compressed) {
            return compressedEntry;
        }
        
        try {
            const zlib = require('zlib');
            const decompressed = await new Promise((resolve, reject) => {
                zlib.gunzip(compressedEntry.data, (err, result) => {
                    if (err) reject(err);
                    else resolve(JSON.parse(result.toString()));
                });
            });
            
            return decompressed;
        } catch (error) {
            logger.error('Decompression failed', { error: error.message });
            return compressedEntry;
        }
    }
    
    // Analytics and monitoring
    _recordAccess(key) {
        const pattern = this.accessPatterns.get(key) || { count: 0, timestamps: [] };
        pattern.count++;
        pattern.timestamps.push(Date.now());
        
        // Keep only recent timestamps (last hour)
        const oneHourAgo = Date.now() - 3600000;
        pattern.timestamps = pattern.timestamps.filter(t => t > oneHourAgo);
        
        this.accessPatterns.set(key, pattern);
        
        // Update frequency
        const freq = this.queryFrequency.get(key) || 0;
        this.queryFrequency.set(key, freq + 1);
    }
    
    _recordMiss(key) {
        this.hitStats.l1.misses++;
        this.hitStats.l2.misses++;
        this.hitStats.l3.misses++;
    }
    
    // Prefetching engine
    _triggerPrefetch(key, result) {
        // Implement intelligent prefetching based on access patterns
        const relatedQueries = this._findRelatedQueries(key);
        
        for (const relatedKey of relatedQueries) {
            if (!this.l1Cache.has(relatedKey) && !this.prefetchQueue.includes(relatedKey)) {
                this.prefetchQueue.push(relatedKey);
            }
        }
    }
    
    _findRelatedQueries(key) {
        // Simple similarity-based prefetching
        const related = [];
        const keyWords = key.toLowerCase().split(/\\W+/);
        
        for (const [otherKey] of this.accessPatterns) {
            if (otherKey === key) continue;
            
            const otherWords = otherKey.toLowerCase().split(/\\W+/);
            const commonWords = keyWords.filter(word => otherWords.includes(word));
            
            if (commonWords.length >= Math.min(2, keyWords.length * 0.5)) {
                related.push(otherKey);
            }
        }
        
        return related.slice(0, 5); // Top 5 related queries
    }
    
    // Maintenance tasks
    _startMaintenanceTasks() {
        // Cache cleanup every 5 minutes
        setInterval(() => {
            this._performMaintenance();
        }, 5 * 60 * 1000);
    }
    
    async _performMaintenance() {
        try {
            // Remove expired entries
            await this._cleanupExpiredEntries();
            
            // Optimize cache sizes
            this._optimizeCacheSizes();
            
            // Generate analytics report
            if (this.config.analyticsEnabled) {
                this._generateAnalyticsReport();
            }
            
        } catch (error) {
            logger.error('Cache maintenance error', { error: error.message });
        }
    }
    
    async _cleanupExpiredEntries() {
        const now = Date.now();
        let cleanedCount = 0;
        
        // Cleanup L1
        for (const [key, entry] of this.l1Cache) {
            if (this._isExpired(entry, now)) {
                this.l1Cache.delete(key);
                cleanedCount++;
            }
        }
        
        // Cleanup L2
        for (const [key, entry] of this.l2Cache) {
            if (this._isExpired(entry, now)) {
                this.l2Cache.delete(key);
                cleanedCount++;
            }
        }
        
        // Cleanup L3
        for (const [key, entry] of this.l3Cache) {
            if (this._isExpired(entry, now)) {
                this.l3Cache.delete(key);
                if (entry.metadata.graceStored) {
                    await this.graceMemoryManager.deallocate(key);
                }
                cleanedCount++;
            }
        }
        
        logger.debug('Cache cleanup completed', { cleanedEntries: cleanedCount });
    }
    
    // Utility methods
    _isExpired(entry, now = Date.now()) {
        return entry.metadata.timestamp + entry.metadata.ttl < now;
    }
    
    _calculateSize(data) {
        return Buffer.byteLength(JSON.stringify(data), 'utf8');
    }
    
    _getL1Size() {
        let size = 0;
        for (const entry of this.l1Cache.values()) {
            size += entry.metadata.size;
        }
        return size;
    }
    
    _getL2Size() {
        let size = 0;
        for (const entry of this.l2Cache.values()) {
            size += entry.metadata.compressedSize || entry.metadata.size;
        }
        return size;
    }
    
    _getL3Size() {
        let size = 0;
        for (const entry of this.l3Cache.values()) {
            size += entry.metadata.size;
        }
        return size;
    }
    
    // Public API
    getStats() {
        const totalHits = this.hitStats.total.hits;
        const totalMisses = this.hitStats.total.misses;
        const totalRequests = totalHits + totalMisses;
        
        return {
            hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
            hitStats: this.hitStats,
            cacheSizes: {
                l1: this._getL1Size(),
                l2: this._getL2Size(),
                l3: this._getL3Size()
            },
            entrycounts: {
                l1: this.l1Cache.size,
                l2: this.l2Cache.size,
                l3: this.l3Cache.size
            }
        };
    }
    
    async shutdown() {
        logger.info('Shutting down advanced caching engine');
        
        if (this.graceMemoryManager) {
            await this.graceMemoryManager.shutdown();
        }
        
        this.l1Cache.clear();
        this.l2Cache.clear();
        this.l3Cache.clear();
        this.accessPatterns.clear();
        this.queryFrequency.clear();
    }
}

module.exports = AdvancedCachingEngine;