/**
 * Predictive Cache Manager with Machine Learning-based Usage Pattern Analysis
 * Leverages historical query patterns to predict future cache needs
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');

/**
 * Query pattern analyzer
 */
class QueryPatternAnalyzer {
    constructor(options = {}) {
        this.config = {
            windowSize: options.windowSize || 1000, // Number of queries to analyze
            timeWindow: options.timeWindow || 3600000, // 1 hour time window
            minPatternSupport: options.minPatternSupport || 3,
            maxPatterns: options.maxPatterns || 100,
            temporalWeight: options.temporalWeight || 0.3,
            ...options
        };
        
        this.queryHistory = [];
        this.patterns = new Map();
        this.temporalPatterns = new Map();
        this.sequentialPatterns = new Map();
        this.lastAnalysis = 0;
    }
    
    addQuery(queryVector, metadata = {}) {
        const queryEntry = {
            vector: this._vectorToSignature(queryVector),
            metadata: {
                ...metadata,
                timestamp: Date.now(),
                hour: new Date().getHours(),
                dayOfWeek: new Date().getDay()
            },
            similarity: null
        };
        
        // Calculate similarity to recent queries
        if (this.queryHistory.length > 0) {
            const recentQueries = this.queryHistory.slice(-10);
            queryEntry.similarity = this._calculateAverageSimilarity(queryVector, recentQueries);
        }
        
        this.queryHistory.push(queryEntry);
        
        // Maintain sliding window
        if (this.queryHistory.length > this.config.windowSize) {
            this.queryHistory.shift();
        }
        
        // Trigger analysis periodically
        if (this.queryHistory.length % 100 === 0) {
            this.analyzePatterns();
        }
    }
    
    analyzePatterns() {
        const now = Date.now();
        
        if (now - this.lastAnalysis < 60000) return; // Analyze at most once per minute
        
        try {
            this._analyzeTemporalPatterns();
            this._analyzeSequentialPatterns();
            this._analyzeSemanticPatterns();
            
            this.lastAnalysis = now;
            
            logger.debug('Pattern analysis completed', {
                totalPatterns: this.patterns.size,
                temporalPatterns: this.temporalPatterns.size,
                sequentialPatterns: this.sequentialPatterns.size
            });
            
        } catch (error) {
            logger.error('Pattern analysis failed', { error: error.message });
        }
    }
    
    _analyzeTemporalPatterns() {
        const hourlyPatterns = new Map();
        const dailyPatterns = new Map();
        
        for (const query of this.queryHistory) {
            const hour = query.metadata.hour;
            const dayOfWeek = query.metadata.dayOfWeek;
            const signature = query.vector;
            
            // Hourly patterns
            if (!hourlyPatterns.has(hour)) {
                hourlyPatterns.set(hour, new Map());
            }
            const hourlyMap = hourlyPatterns.get(hour);
            hourlyMap.set(signature, (hourlyMap.get(signature) || 0) + 1);
            
            // Daily patterns
            if (!dailyPatterns.has(dayOfWeek)) {
                dailyPatterns.set(dayOfWeek, new Map());
            }
            const dailyMap = dailyPatterns.get(dayOfWeek);
            dailyMap.set(signature, (dailyMap.get(signature) || 0) + 1);
        }
        
        // Store significant temporal patterns
        for (const [hour, patterns] of hourlyPatterns) {
            for (const [signature, count] of patterns) {
                if (count >= this.config.minPatternSupport) {
                    this.temporalPatterns.set(`hourly_${hour}_${signature}`, {
                        type: 'hourly',
                        hour,
                        signature,
                        count,
                        confidence: count / this.queryHistory.length
                    });
                }
            }
        }
        
        for (const [day, patterns] of dailyPatterns) {
            for (const [signature, count] of patterns) {
                if (count >= this.config.minPatternSupport) {
                    this.temporalPatterns.set(`daily_${day}_${signature}`, {
                        type: 'daily',
                        dayOfWeek: day,
                        signature,
                        count,
                        confidence: count / this.queryHistory.length
                    });
                }
            }
        }
    }
    
    _analyzeSequentialPatterns() {
        // Analyze sequence patterns (A followed by B)
        for (let i = 0; i < this.queryHistory.length - 1; i++) {
            const current = this.queryHistory[i];
            const next = this.queryHistory[i + 1];
            
            // Only consider sequences within a reasonable time window
            if (next.metadata.timestamp - current.metadata.timestamp < 300000) { // 5 minutes
                const sequenceKey = `${current.vector}->${next.vector}`;
                
                if (!this.sequentialPatterns.has(sequenceKey)) {
                    this.sequentialPatterns.set(sequenceKey, {
                        from: current.vector,
                        to: next.vector,
                        count: 0,
                        avgTimeBetween: 0,
                        confidence: 0
                    });
                }
                
                const pattern = this.sequentialPatterns.get(sequenceKey);
                const timeBetween = next.metadata.timestamp - current.metadata.timestamp;
                
                pattern.count++;
                pattern.avgTimeBetween = 
                    (pattern.avgTimeBetween * (pattern.count - 1) + timeBetween) / pattern.count;
                pattern.confidence = pattern.count / this.queryHistory.length;
            }
        }
        
        // Remove patterns with low support
        for (const [key, pattern] of this.sequentialPatterns) {
            if (pattern.count < this.config.minPatternSupport) {
                this.sequentialPatterns.delete(key);
            }
        }
    }
    
    _analyzeSemanticPatterns() {
        // Group similar queries together
        const semanticGroups = new Map();
        
        for (const query of this.queryHistory) {
            let foundGroup = false;
            
            for (const [groupKey, group] of semanticGroups) {
                if (this._areSemanticallyRelated(query, group.representative)) {
                    group.queries.push(query);
                    foundGroup = true;
                    break;
                }
            }
            
            if (!foundGroup) {
                const groupKey = `semantic_${semanticGroups.size}`;
                semanticGroups.set(groupKey, {
                    representative: query,
                    queries: [query],
                    confidence: 0
                });
            }
        }
        
        // Store semantic patterns with sufficient support
        for (const [groupKey, group] of semanticGroups) {
            if (group.queries.length >= this.config.minPatternSupport) {
                this.patterns.set(groupKey, {
                    type: 'semantic',
                    representative: group.representative.vector,
                    count: group.queries.length,
                    confidence: group.queries.length / this.queryHistory.length,
                    avgSimilarity: this._calculateGroupSimilarity(group.queries)
                });
            }
        }
    }
    
    _vectorToSignature(vector) {
        // Create a compact signature of the vector for pattern matching
        const buckets = 8; // Divide vector into buckets
        const bucketSize = Math.ceil(vector.length / buckets);
        const signature = [];
        
        for (let i = 0; i < buckets; i++) {
            const start = i * bucketSize;
            const end = Math.min(start + bucketSize, vector.length);
            const sum = vector.slice(start, end).reduce((a, b) => a + b, 0);
            const avg = sum / (end - start);
            
            // Quantize to 3 levels: -1, 0, 1
            if (avg < -0.1) signature.push(-1);
            else if (avg > 0.1) signature.push(1);
            else signature.push(0);
        }
        
        return signature.join(',');
    }
    
    _calculateAverageSimilarity(vector, queries) {
        if (queries.length === 0) return 0;
        
        let totalSimilarity = 0;
        
        for (const query of queries) {
            const similarity = this._cosineSimilarity(
                vector,
                this._signatureToVector(query.vector)
            );
            totalSimilarity += similarity;
        }
        
        return totalSimilarity / queries.length;
    }
    
    _cosineSimilarity(a, b) {
        if (a.length !== b.length) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    
    _signatureToVector(signature) {
        // Convert signature back to approximate vector (for similarity calculation)
        return signature.split(',').map(x => parseFloat(x));
    }
    
    _areSemanticallyRelated(query1, query2) {
        const sig1 = query1.vector.split(',');
        const sig2 = query2.vector.split(',');
        
        if (sig1.length !== sig2.length) return false;
        
        let matches = 0;
        for (let i = 0; i < sig1.length; i++) {
            if (sig1[i] === sig2[i]) matches++;
        }
        
        return matches / sig1.length > 0.7; // 70% similarity threshold
    }
    
    _calculateGroupSimilarity(queries) {
        if (queries.length < 2) return 1.0;
        
        let totalSimilarity = 0;
        let comparisons = 0;
        
        for (let i = 0; i < queries.length - 1; i++) {
            for (let j = i + 1; j < queries.length; j++) {
                const sim = this._cosineSimilarity(
                    this._signatureToVector(queries[i].vector),
                    this._signatureToVector(queries[j].vector)
                );
                totalSimilarity += sim;
                comparisons++;
            }
        }
        
        return totalSimilarity / comparisons;
    }
    
    getPredictions(currentHour, currentDay) {
        const predictions = [];
        
        // Temporal predictions
        for (const [key, pattern] of this.temporalPatterns) {
            if (pattern.type === 'hourly' && pattern.hour === currentHour) {
                predictions.push({
                    type: 'temporal_hourly',
                    signature: pattern.signature,
                    confidence: pattern.confidence,
                    expectedTime: Date.now() + Math.random() * 3600000 // Within next hour
                });
            }
            
            if (pattern.type === 'daily' && pattern.dayOfWeek === currentDay) {
                predictions.push({
                    type: 'temporal_daily',
                    signature: pattern.signature,
                    confidence: pattern.confidence,
                    expectedTime: Date.now() + Math.random() * 86400000 // Within next day
                });
            }
        }
        
        // Sequential predictions based on recent queries
        if (this.queryHistory.length > 0) {
            const lastQuery = this.queryHistory[this.queryHistory.length - 1];
            
            for (const [key, pattern] of this.sequentialPatterns) {
                if (pattern.from === lastQuery.vector) {
                    predictions.push({
                        type: 'sequential',
                        signature: pattern.to,
                        confidence: pattern.confidence,
                        expectedTime: Date.now() + pattern.avgTimeBetween
                    });
                }
            }
        }
        
        // Sort by confidence and limit results
        return predictions
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 20); // Top 20 predictions
    }
    
    getStats() {
        return {
            totalQueries: this.queryHistory.length,
            totalPatterns: this.patterns.size,
            temporalPatterns: this.temporalPatterns.size,
            sequentialPatterns: this.sequentialPatterns.size,
            lastAnalysis: this.lastAnalysis,
            windowSize: this.config.windowSize,
            avgQueriesPerHour: this._calculateQueryRate()
        };
    }
    
    _calculateQueryRate() {
        if (this.queryHistory.length < 2) return 0;
        
        const timespan = this.queryHistory[this.queryHistory.length - 1].metadata.timestamp -
                        this.queryHistory[0].metadata.timestamp;
        
        return (this.queryHistory.length / timespan) * 3600000; // Queries per hour
    }
}

/**
 * Predictive Cache Manager
 */
class PredictiveCacheManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Cache Configuration
            maxCacheSize: options.maxCacheSize || 10 * 1024 * 1024 * 1024, // 10GB
            maxEntries: options.maxEntries || 1000000,
            ttl: options.ttl || 3600000, // 1 hour
            
            // Prediction Configuration
            predictionEnabled: options.predictionEnabled !== false,
            predictionThreshold: options.predictionThreshold || 0.3,
            prefetchEnabled: options.prefetchEnabled !== false,
            prefetchLimit: options.prefetchLimit || 100,
            
            // Learning Configuration
            learningEnabled: options.learningEnabled !== false,
            adaptationRate: options.adaptationRate || 0.1,
            minConfidence: options.minConfidence || 0.2,
            
            // Performance Configuration
            batchPrefetch: options.batchPrefetch !== false,
            asyncPrefetch: options.asyncPrefetch !== false,
            
            ...options
        };
        
        // Components
        this.patternAnalyzer = new QueryPatternAnalyzer(options.patternAnalyzer);
        this.cache = new Map();
        this.metadata = new Map();
        
        // Prediction state
        this.predictions = [];
        this.prefetchQueue = [];
        this.prefetchInProgress = false;
        
        // Statistics
        this.stats = {
            totalQueries: 0,
            cacheHits: 0,
            cacheMisses: 0,
            predictiveHits: 0,
            prefetchCount: 0,
            prefetchHitRate: 0,
            adaptationCount: 0,
            totalSize: 0,
            evictionCount: 0
        };
        
        this.isInitialized = false;
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            logger.info('Initializing Predictive Cache Manager', {
                maxCacheSize: this.config.maxCacheSize,
                predictionEnabled: this.config.predictionEnabled,
                prefetchEnabled: this.config.prefetchEnabled
            });
            
            // Start background tasks
            this._startPredictionEngine();
            this._startPrefetchEngine();
            this._startMaintenanceTasks();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            logger.info('Predictive Cache Manager initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize Predictive Cache Manager', {
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Get cached result or mark cache miss for prediction
     */
    async get(key, queryVector, options = {}) {
        this.stats.totalQueries++;
        
        // Record query for pattern analysis
        if (this.config.learningEnabled) {
            this.patternAnalyzer.addQuery(queryVector, {
                key,
                options,
                cached: this.cache.has(key)
            });
        }
        
        // Check cache
        if (this.cache.has(key)) {
            const entry = this.cache.get(key);
            const metadata = this.metadata.get(key);
            
            // Check if entry is still valid
            if (Date.now() - metadata.timestamp < this.config.ttl) {
                // Update access information
                metadata.accessCount++;
                metadata.lastAccessed = Date.now();
                
                this.stats.cacheHits++;
                
                // Check if this was a predictive hit
                if (metadata.predictive) {
                    this.stats.predictiveHits++;
                }
                
                this.emit('cacheHit', { key, predictive: metadata.predictive });
                
                return {
                    data: entry.data,
                    metadata: {
                        ...entry.metadata,
                        fromCache: true,
                        predictive: metadata.predictive
                    }
                };
            } else {
                // Remove expired entry
                this._removeEntry(key);
            }
        }
        
        this.stats.cacheMisses++;
        this.emit('cacheMiss', { key, queryVector });
        
        return null;
    }
    
    /**
     * Store result in cache
     */
    async set(key, data, queryVector, options = {}) {
        const size = this._calculateSize(data);
        const now = Date.now();
        
        // Check if we need to evict entries
        if (this._shouldEvict(size)) {
            await this._evictEntries(size);
        }
        
        // Store entry
        this.cache.set(key, {
            data,
            metadata: {
                ...options.metadata,
                cached: true,
                cacheTime: now
            }
        });
        
        this.metadata.set(key, {
            key,
            size,
            timestamp: now,
            lastAccessed: now,
            accessCount: 1,
            predictive: options.predictive || false,
            confidence: options.confidence || 0,
            queryVector: queryVector ? this._vectorToHash(queryVector) : null
        });
        
        this.stats.totalSize += size;
        
        this.emit('cacheSet', { key, size, predictive: options.predictive });
        
        // Trigger prediction update
        if (this.config.predictionEnabled) {
            this._updatePredictions();
        }
    }
    
    /**
     * Update predictions based on current patterns
     */
    _updatePredictions() {
        if (!this.config.predictionEnabled) return;
        
        const currentHour = new Date().getHours();
        const currentDay = new Date().getDay();
        
        this.predictions = this.patternAnalyzer.getPredictions(currentHour, currentDay);
        
        // Add high-confidence predictions to prefetch queue
        if (this.config.prefetchEnabled) {
            for (const prediction of this.predictions) {
                if (prediction.confidence >= this.config.predictionThreshold &&
                    !this._isPrefetchQueued(prediction)) {
                    
                    this.prefetchQueue.push({
                        ...prediction,
                        addedAt: Date.now(),
                        priority: prediction.confidence
                    });
                }
            }
            
            // Sort prefetch queue by priority
            this.prefetchQueue.sort((a, b) => b.priority - a.priority);
            
            // Limit queue size
            if (this.prefetchQueue.length > this.config.prefetchLimit) {
                this.prefetchQueue = this.prefetchQueue.slice(0, this.config.prefetchLimit);
            }
        }
        
        this.emit('predictionsUpdated', {
            predictionCount: this.predictions.length,
            prefetchQueueSize: this.prefetchQueue.length
        });
    }
    
    _isPrefetchQueued(prediction) {
        return this.prefetchQueue.some(item => 
            item.signature === prediction.signature &&
            item.type === prediction.type
        );
    }
    
    /**
     * Prefetch predicted queries
     */
    async prefetch(searchFunction) {
        if (!this.config.prefetchEnabled || 
            this.prefetchInProgress || 
            this.prefetchQueue.length === 0) {
            return;
        }
        
        this.prefetchInProgress = true;
        
        try {
            const batchSize = this.config.batchPrefetch ? 10 : 1;
            const batch = this.prefetchQueue.splice(0, batchSize);
            
            const prefetchPromises = batch.map(async (prediction) => {
                try {
                    // Convert signature back to approximate query vector
                    const queryVector = this._signatureToQueryVector(prediction.signature);
                    const key = this._generateCacheKey(queryVector, {});
                    
                    // Skip if already cached
                    if (this.cache.has(key)) return;
                    
                    // Perform search
                    const result = await searchFunction(queryVector, { prefetch: true });
                    
                    // Cache result with predictive flag
                    await this.set(key, result, queryVector, {
                        predictive: true,
                        confidence: prediction.confidence,
                        predictionType: prediction.type
                    });
                    
                    this.stats.prefetchCount++;
                    
                    logger.debug('Prefetched query result', {
                        type: prediction.type,
                        confidence: prediction.confidence,
                        signature: prediction.signature
                    });
                    
                } catch (error) {
                    logger.warn('Prefetch failed', {
                        signature: prediction.signature,
                        error: error.message
                    });
                }
            });
            
            if (this.config.asyncPrefetch) {
                // Don't wait for prefetch to complete
                Promise.allSettled(prefetchPromises).then(() => {
                    this._updatePrefetchStats();
                });
            } else {
                await Promise.allSettled(prefetchPromises);
                this._updatePrefetchStats();
            }
            
        } finally {
            this.prefetchInProgress = false;
        }
    }
    
    _updatePrefetchStats() {
        // Calculate prefetch hit rate
        const predictiveEntries = Array.from(this.metadata.values())
            .filter(meta => meta.predictive);
        
        const prefetchedAndAccessed = predictiveEntries.filter(meta => meta.accessCount > 1).length;
        
        this.stats.prefetchHitRate = predictiveEntries.length > 0 ?
            prefetchedAndAccessed / predictiveEntries.length : 0;
    }
    
    /**
     * Cache eviction based on LRU + prediction confidence
     */
    async _evictEntries(requiredSpace) {
        const entries = Array.from(this.metadata.entries())
            .map(([key, metadata]) => ({ key, ...metadata }))
            .sort((a, b) => {
                // Prioritize by: predictive confidence, access count, and recency
                const scoreA = (a.predictive ? a.confidence * 0.5 : 0) +
                              (a.accessCount * 0.3) +
                              ((Date.now() - a.lastAccessed) / 3600000 * -0.2);
                
                const scoreB = (b.predictive ? b.confidence * 0.5 : 0) +
                              (b.accessCount * 0.3) +
                              ((Date.now() - b.lastAccessed) / 3600000 * -0.2);
                
                return scoreA - scoreB; // Lower score gets evicted first
            });
        
        let freedSpace = 0;
        let evictedCount = 0;
        
        for (const entry of entries) {
            if (freedSpace >= requiredSpace) break;
            
            this._removeEntry(entry.key);
            freedSpace += entry.size;
            evictedCount++;
        }
        
        this.stats.evictionCount += evictedCount;
        
        logger.debug('Evicted cache entries', {
            evictedCount,
            freedSpace,
            requiredSpace
        });
    }
    
    _removeEntry(key) {
        const metadata = this.metadata.get(key);
        
        if (metadata) {
            this.stats.totalSize -= metadata.size;
        }
        
        this.cache.delete(key);
        this.metadata.delete(key);
    }
    
    _shouldEvict(newEntrySize) {
        return this.stats.totalSize + newEntrySize > this.config.maxCacheSize ||
               this.cache.size >= this.config.maxEntries;
    }
    
    _calculateSize(data) {
        // Rough size calculation
        const jsonString = JSON.stringify(data);
        return Buffer.byteLength(jsonString, 'utf8');
    }
    
    _vectorToHash(vector) {
        // Simple hash of vector for storage efficiency
        const sum = vector.reduce((a, b) => a + b, 0);
        const avg = sum / vector.length;
        return Math.floor(avg * 10000).toString(36);
    }
    
    _generateCacheKey(queryVector, options) {
        const vectorHash = this._vectorToHash(queryVector);
        const optionsHash = JSON.stringify(options);
        return `${vectorHash}_${Buffer.from(optionsHash).toString('base64').slice(0, 20)}`;
    }
    
    _signatureToQueryVector(signature) {
        // Convert signature back to a representative query vector
        const sig = signature.split(',').map(x => parseFloat(x));
        const dimensions = 768; // Standard dimension
        const bucketSize = Math.ceil(dimensions / sig.length);
        
        const vector = [];
        for (let i = 0; i < sig.length; i++) {
            const value = sig[i];
            for (let j = 0; j < bucketSize && vector.length < dimensions; j++) {
                vector.push(value + (Math.random() - 0.5) * 0.1); // Add slight variation
            }
        }
        
        return vector.slice(0, dimensions);
    }
    
    // Background tasks
    _startPredictionEngine() {
        setInterval(() => {
            this._updatePredictions();
        }, 60000); // Update predictions every minute
    }
    
    _startPrefetchEngine() {
        // This would be triggered by the main search system
        // For now, it's a placeholder that would be called externally
    }
    
    _startMaintenanceTasks() {
        // Cleanup expired entries
        setInterval(() => {
            this._cleanupExpiredEntries();
        }, 300000); // Every 5 minutes
        
        // Adaptive learning
        if (this.config.learningEnabled) {
            setInterval(() => {
                this._adaptCacheStrategy();
            }, 600000); // Every 10 minutes
        }
    }
    
    _cleanupExpiredEntries() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [key, metadata] of this.metadata) {
            if (now - metadata.timestamp > this.config.ttl) {
                this._removeEntry(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            logger.debug('Cleaned up expired cache entries', { cleanedCount });
        }
    }
    
    _adaptCacheStrategy() {
        const hitRate = this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses);
        const prefetchEffectiveness = this.stats.prefetchHitRate;
        
        // Adapt prediction threshold based on performance
        if (prefetchEffectiveness < 0.3 && this.config.predictionThreshold < 0.8) {
            this.config.predictionThreshold = Math.min(0.8, this.config.predictionThreshold + 0.1);
            logger.debug('Increased prediction threshold', {
                newThreshold: this.config.predictionThreshold,
                reason: 'Low prefetch effectiveness'
            });
        } else if (prefetchEffectiveness > 0.7 && this.config.predictionThreshold > 0.1) {
            this.config.predictionThreshold = Math.max(0.1, this.config.predictionThreshold - 0.05);
            logger.debug('Decreased prediction threshold', {
                newThreshold: this.config.predictionThreshold,
                reason: 'High prefetch effectiveness'
            });
        }
        
        this.stats.adaptationCount++;
    }
    
    // Public API
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            totalSizeMB: Math.round(this.stats.totalSize / (1024 * 1024) * 100) / 100,
            hitRate: this.stats.totalQueries > 0 ?
                this.stats.cacheHits / this.stats.totalQueries : 0,
            predictiveHitRate: this.stats.cacheHits > 0 ?
                this.stats.predictiveHits / this.stats.cacheHits : 0,
            prefetchQueueSize: this.prefetchQueue.length,
            predictionCount: this.predictions.length,
            patternStats: this.patternAnalyzer.getStats(),
            currentThreshold: this.config.predictionThreshold
        };
    }
    
    async invalidate(pattern) {
        const regex = new RegExp(pattern);
        const keysToRemove = [];
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keysToRemove.push(key);
            }
        }
        
        for (const key of keysToRemove) {
            this._removeEntry(key);
        }
        
        logger.debug('Invalidated cache entries', {
            pattern,
            removedCount: keysToRemove.length
        });
        
        return keysToRemove.length;
    }
    
    async shutdown() {
        logger.info('Shutting down Predictive Cache Manager');
        
        // Clear all caches and queues
        this.cache.clear();
        this.metadata.clear();
        this.predictions.length = 0;
        this.prefetchQueue.length = 0;
        
        this.isInitialized = false;
        this.emit('shutdown');
    }
}

module.exports = PredictiveCacheManager;