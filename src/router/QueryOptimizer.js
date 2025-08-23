/**
 * QueryOptimizer - Intelligent query optimization for retrieval
 * Includes caching, query rewriting, and performance optimization
 */

const { LRUCache } = require('lru-cache');
const { logger } = require('../utils/logger');

class QueryOptimizer {
    constructor(options = {}) {
        this.options = {
            cacheSize: 10000,
            cacheTTL: 3600000, // 1 hour
            enableQueryRewriting: true,
            enableSemanticCaching: true,
            ...options
        };
        
        this.memoryManager = options.memoryManager;
        
        // Query cache
        this.queryCache = new LRUCache({
            max: this.options.cacheSize,
            ttl: this.options.cacheTTL
        });
        
        // Semantic cache for similar queries
        this.semanticCache = new LRUCache({
            max: Math.floor(this.options.cacheSize / 2),
            ttl: this.options.cacheTTL
        });
        
        // Query statistics
        this.queryStats = new Map();
        
        // Error recovery and resilience
        this.errorStats = {
            embeddingGenerationFailures: 0,
            cacheFailures: 0,
            rewritingFailures: 0,
            fallbackUsed: 0
        };
        
        // Adaptive caching metrics
        this.adaptiveMetrics = {
            cacheAccessPattern: new Map(),
            lastOptimizationReview: Date.now(),
            optimizationInterval: 300000 // 5 minutes
        };
        
        // Fallback embeddings cache
        this.fallbackEmbeddings = new Map();
        
        this.initialized = false;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        logger.info('Initializing QueryOptimizer');
        
        try {
            // Initialize query rewriting patterns
            await this._loadQueryRewritingRules();
            
            // Initialize semantic similarity models
            if (this.options.enableSemanticCaching) {
                await this._initializeSemanticSimilarity();
            }
            
            // Start adaptive optimization monitoring
            this._startAdaptiveOptimization();
            
            this.initialized = true;
            logger.info('QueryOptimizer initialized successfully', {
                cacheSize: this.options.cacheSize,
                semanticCaching: this.options.enableSemanticCaching,
                queryRewriting: this.options.enableQueryRewriting
            });
            
        } catch (error) {
            logger.error('QueryOptimizer initialization failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Optimize query for retrieval with enhanced error recovery
     * @param {string} query - Original query text
     * @param {Object} options - Query options
     * @returns {Object} Optimized query with embedding and metadata
     */
    async optimize(query, options = {}) {
        if (!this.initialized) {
            throw new Error('QueryOptimizer not initialized');
        }
        
        const startTime = Date.now();
        const { k, database, cacheKey } = options;
        let fallbackUsed = false;
        let optimizationErrors = [];
        
        try {
            // Track cache access patterns for adaptive optimization
            this._trackCacheAccess(query, options);
            
            // Check exact cache first with error handling
            let cachedResult;
            try {
                cachedResult = await this._checkExactCacheWithRecovery(query, options);
                if (cachedResult) {
                    logger.debug('Query cache hit', { query: query.substring(0, 50) });
                    this._recordCacheHit('exact');
                    return { ...cachedResult, fromCache: true, processingTime: Date.now() - startTime };
                }
            } catch (error) {
                this.errorStats.cacheFailures++;
                optimizationErrors.push(`Cache check failed: ${error.message}`);
                logger.warn('Cache check failed, continuing with optimization', { error: error.message });
            }
            
            // Check semantic cache with recovery
            if (this.options.enableSemanticCaching) {
                try {
                    const semanticResult = await this._checkSemanticCacheWithRecovery(query, options);
                    if (semanticResult) {
                        logger.debug('Semantic cache hit', { query: query.substring(0, 50) });
                        this._recordCacheHit('semantic');
                        return { ...semanticResult, fromCache: true, semanticCache: true, processingTime: Date.now() - startTime };
                    }
                } catch (error) {
                    this.errorStats.cacheFailures++;
                    optimizationErrors.push(`Semantic cache failed: ${error.message}`);
                    logger.warn('Semantic cache failed, continuing with optimization', { error: error.message });
                }
            }
            
            // Optimize query text with fallback
            let optimizedText = query;
            try {
                optimizedText = await this._optimizeQueryTextWithRecovery(query);
            } catch (error) {
                this.errorStats.rewritingFailures++;
                optimizationErrors.push(`Query rewriting failed: ${error.message}`);
                logger.warn('Query rewriting failed, using original text', { error: error.message });
                fallbackUsed = true;
            }
            
            // Generate embedding with multiple fallback strategies
            let embedding;
            try {
                embedding = await this._generateEmbeddingWithRecovery(optimizedText);
            } catch (error) {
                this.errorStats.embeddingGenerationFailures++;
                optimizationErrors.push(`Embedding generation failed: ${error.message}`);
                
                // Try fallback embedding
                embedding = await this._getFallbackEmbedding(query);
                if (!embedding) {
                    throw new Error('All embedding generation strategies failed');
                }
                fallbackUsed = true;
            }
            
            // Create optimized query object with enhanced metadata
            const optimizedQuery = {
                original: query,
                text: optimizedText,
                embedding,
                k,
                database,
                processingTime: Date.now() - startTime,
                optimizationMetadata: {
                    rewritten: optimizedText !== query,
                    embeddingGeneration: Date.now() - startTime,
                    cacheKey,
                    fallbackUsed,
                    errors: optimizationErrors,
                    strategy: fallbackUsed ? 'fallback' : 'full',
                    embeddingDimensions: embedding.length
                }
            };
            
            // Cache the result with error handling
            try {
                await this._cacheQueryWithRecovery(query, options, optimizedQuery);
            } catch (error) {
                this.errorStats.cacheFailures++;
                logger.warn('Failed to cache optimized query', { error: error.message });
            }
            
            // Update statistics
            this._updateQueryStats(query, Date.now() - startTime, false, fallbackUsed);
            
            if (fallbackUsed) {
                this.errorStats.fallbackUsed++;
                logger.info('Query optimization completed with fallback', {
                    query: query.substring(0, 50),
                    fallbackUsed,
                    errors: optimizationErrors
                });
            }
            
            return optimizedQuery;
            
        } catch (error) {
            this.errorStats.fallbackUsed++;
            logger.error('Query optimization failed completely, using emergency fallback', { 
                query: query.substring(0, 50),
                error: error.message,
                stack: error.stack
            });
            
            // Emergency fallback - return minimal viable optimization
            const fallbackEmbedding = await this._getEmergencyFallbackEmbedding(query);
            
            return {
                original: query,
                text: query,
                embedding: fallbackEmbedding,
                k,
                database,
                processingTime: Date.now() - startTime,
                optimizationMetadata: {
                    fallback: true,
                    emergencyFallback: true,
                    error: error.message,
                    strategy: 'emergency'
                }
            };
        }
    }
    
    
    /**
     * Clear all caches
     */
    clearCache() {
        this.queryCache.clear();
        this.semanticCache.clear();
        logger.info('Query caches cleared');
    }
    
    /**
     * Check exact query cache
     */
    _checkExactCache(query, options) {
        const cacheKey = this._generateCacheKey(query, options);
        return this.queryCache.get(cacheKey);
    }
    
    /**
     * Check semantic cache for similar queries
     */
    async _checkSemanticCache(query, options) {
        // Generate embedding for similarity check
        const queryEmbedding = await this._generateEmbedding(query);
        
        // Check against cached queries
        for (const [cacheKey, cachedQuery] of this.semanticCache.entries()) {
            if (cachedQuery.database !== options.database) continue;
            
            const similarity = this._cosineSimilarity(queryEmbedding, cachedQuery.embedding);
            
            // Use cached result if similarity is high
            if (similarity > 0.95) {
                return cachedQuery;
            }
        }
        
        return null;
    }
    
    /**
     * Optimize query text
     */
    async _optimizeQueryText(query) {
        if (!this.options.enableQueryRewriting) {
            return query;
        }
        
        let optimizedQuery = query.trim();
        
        // Apply query rewriting rules
        optimizedQuery = this._applyRewritingRules(optimizedQuery);
        
        // Expand abbreviations
        optimizedQuery = this._expandAbbreviations(optimizedQuery);
        
        // Normalize punctuation
        optimizedQuery = this._normalizePunctuation(optimizedQuery);
        
        return optimizedQuery;
    }
    
    /**
     * Generate embedding for text
     */
    async _generateEmbedding(text) {
        // Mock embedding generation - would use actual model in real implementation
        const dimensions = 384;
        const embedding = new Array(dimensions);
        
        // Generate deterministic embedding based on text hash
        const hash = require('crypto').createHash('sha256').update(text).digest('hex');
        let seed = parseInt(hash.substring(0, 8), 16);
        
        for (let i = 0; i < dimensions; i++) {
            seed = (seed * 9301 + 49297) % 233280;
            embedding[i] = (seed / 233280) * 2 - 1;
        }
        
        // Normalize
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        if (norm > 0) {
            for (let i = 0; i < dimensions; i++) {
                embedding[i] /= norm;
            }
        }
        
        return embedding;
    }
    
    /**
     * Cache query result
     */
    _cacheQuery(query, options, optimizedQuery) {
        const cacheKey = this._generateCacheKey(query, options);
        
        // Cache in exact cache
        this.queryCache.set(cacheKey, optimizedQuery);
        
        // Cache in semantic cache
        if (this.options.enableSemanticCaching) {
            const semanticKey = `semantic_${cacheKey}`;
            this.semanticCache.set(semanticKey, optimizedQuery);
        }
    }
    
    /**
     * Generate cache key
     */
    _generateCacheKey(query, options) {
        const keyData = {
            query: query.trim().toLowerCase(),
            k: options.k,
            database: options.database
        };
        
        return require('crypto')
            .createHash('sha256')
            .update(JSON.stringify(keyData))
            .digest('hex')
            .substring(0, 16);
    }
    
    
    /**
     * Calculate cache hit rate
     */
    _calculateCacheHitRate() {
        let totalQueries = 0;
        let totalCacheHits = 0;
        
        for (const stats of this.queryStats.values()) {
            totalQueries += stats.count;
            totalCacheHits += stats.cacheHits;
        }
        
        return totalQueries > 0 ? totalCacheHits / totalQueries : 0;
    }
    
    /**
     * Calculate average optimization time
     */
    _calculateAverageOptimizationTime() {
        let totalTime = 0;
        let totalQueries = 0;
        
        for (const stats of this.queryStats.values()) {
            totalTime += stats.totalOptimizationTime;
            totalQueries += stats.count;
        }
        
        return totalQueries > 0 ? totalTime / totalQueries : 0;
    }
    
    /**
     * Load query rewriting rules
     */
    async _loadQueryRewritingRules() {
        // Mock loading of query rewriting rules
        this.rewritingRules = [
            { pattern: /what is/gi, replacement: 'define' },
            { pattern: /how to/gi, replacement: 'guide for' },
            { pattern: /tell me about/gi, replacement: 'information about' }
        ];
        
        logger.info(`Loaded ${this.rewritingRules.length} query rewriting rules`);
    }
    
    /**
     * Initialize semantic similarity
     */
    async _initializeSemanticSimilarity() {
        // Mock initialization
        logger.info('Semantic similarity initialized');
    }
    
    /**
     * Apply rewriting rules
     */
    _applyRewritingRules(query) {
        let rewritten = query;
        
        for (const rule of this.rewritingRules || []) {
            rewritten = rewritten.replace(rule.pattern, rule.replacement);
        }
        
        return rewritten;
    }
    
    /**
     * Expand abbreviations
     */
    _expandAbbreviations(query) {
        const abbreviations = {
            'AI': 'artificial intelligence',
            'ML': 'machine learning',
            'NLP': 'natural language processing',
            'GPU': 'graphics processing unit'
        };
        
        let expanded = query;
        
        for (const [abbrev, expansion] of Object.entries(abbreviations)) {
            const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
            expanded = expanded.replace(regex, expansion);
        }
        
        return expanded;
    }
    
    /**
     * Normalize punctuation
     */
    _normalizePunctuation(query) {
        return query
            .replace(/[^\w\s]/g, ' ')  // Remove punctuation
            .replace(/\s+/g, ' ')      // Normalize spaces
            .trim();
    }
    
    /**
     * Calculate cosine similarity
     */
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
        
        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);
        
        if (normA === 0 || normB === 0) return 0;
        
        return dotProduct / (normA * normB);
    }
    
    /**
     * Health check for query optimizer
     * @returns {Object} Health status information
     */
    async healthCheck() {
        return {
            healthy: this.initialized,
            timestamp: new Date().toISOString(),
            initialized: this.initialized,
            cacheSize: this.queryCache.size,
            semanticCacheSize: this.semanticCache.size,
            queryStatsSize: this.queryStats.size,
            cacheHitRate: this._calculateCacheHitRate(),
            averageOptimizationTime: this._calculateAverageOptimizationTime(),
            rewritingRulesCount: this.rewritingRules?.length || 0,
            errors: this.initialized ? [] : ['QueryOptimizer not initialized']
        };
    }

    /**
     * Check if query optimizer is ready
     * @returns {boolean} Readiness status
     */
    async isReady() {
        return this.initialized;
    }

    /**
     * Start adaptive optimization monitoring
     * @private
     */
    _startAdaptiveOptimization() {
        // Review and optimize cache patterns periodically
        setInterval(() => {
            this._reviewCacheOptimization();
        }, this.adaptiveMetrics.optimizationInterval);
        
        logger.debug('Adaptive optimization monitoring started');
    }
    
    /**
     * Track cache access patterns
     * @private
     */
    _trackCacheAccess(query, options) {
        const pattern = {
            queryLength: query.length,
            database: options.database || 'default',
            k: options.k || 10,
            timestamp: Date.now()
        };
        
        const patternKey = `${pattern.database}_${pattern.k}`;
        const currentCount = this.adaptiveMetrics.cacheAccessPattern.get(patternKey) || 0;
        this.adaptiveMetrics.cacheAccessPattern.set(patternKey, currentCount + 1);
    }
    
    /**
     * Record cache hit statistics
     * @private
     */
    _recordCacheHit(cacheType) {
        // This could be expanded to track different cache hit patterns
        logger.debug(`Cache hit recorded: ${cacheType}`);
    }
    
    /**
     * Check exact cache with recovery mechanisms
     * @private
     */
    async _checkExactCacheWithRecovery(query, options) {
        try {
            const cacheKey = this._generateCacheKey(query, options);
            const result = this.queryCache.get(cacheKey);
            
            // Validate cached result
            if (result && this._validateCachedResult(result)) {
                return result;
            } else if (result) {
                // Invalid result found, remove from cache
                this.queryCache.delete(cacheKey);
                logger.warn('Invalid cached result removed', { cacheKey: cacheKey.substring(0, 8) });
            }
            
            return null;
        } catch (error) {
            logger.error('Exact cache check failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Check semantic cache with recovery mechanisms
     * @private
     */
    async _checkSemanticCacheWithRecovery(query, options) {
        try {
            // Generate embedding for similarity check with timeout
            const embeddingPromise = this._generateEmbedding(query);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Embedding generation timeout')), 5000);
            });
            
            const queryEmbedding = await Promise.race([embeddingPromise, timeoutPromise]);
            
            // Check against cached queries with similarity threshold
            for (const [cacheKey, cachedQuery] of this.semanticCache.entries()) {
                if (cachedQuery.database !== options.database) continue;
                
                try {
                    const similarity = this._cosineSimilarity(queryEmbedding, cachedQuery.embedding);
                    
                    // Use cached result if similarity is high
                    if (similarity > 0.95 && this._validateCachedResult(cachedQuery)) {
                        return cachedQuery;
                    }
                } catch (error) {
                    logger.warn('Similarity calculation failed for cached query', {
                        cacheKey: cacheKey.substring(0, 8),
                        error: error.message
                    });
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            logger.error('Semantic cache check failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Optimize query text with recovery mechanisms
     * @private
     */
    async _optimizeQueryTextWithRecovery(query) {
        if (!this.options.enableQueryRewriting) {
            return query;
        }
        
        try {
            let optimizedQuery = query.trim();
            
            // Apply each optimization step with individual error handling
            try {
                optimizedQuery = this._applyRewritingRules(optimizedQuery);
            } catch (error) {
                logger.warn('Query rewriting rules failed', { error: error.message });
                // Continue with original query
            }
            
            try {
                optimizedQuery = this._expandAbbreviations(optimizedQuery);
            } catch (error) {
                logger.warn('Abbreviation expansion failed', { error: error.message });
                // Continue with current state
            }
            
            try {
                optimizedQuery = this._normalizePunctuation(optimizedQuery);
            } catch (error) {
                logger.warn('Punctuation normalization failed', { error: error.message });
                // Continue with current state
            }
            
            return optimizedQuery;
            
        } catch (error) {
            logger.error('Query text optimization failed completely', { error: error.message });
            return query; // Return original query as fallback
        }
    }
    
    /**
     * Generate embedding with recovery mechanisms
     * @private
     */
    async _generateEmbeddingWithRecovery(text) {
        try {
            // Try primary embedding generation with timeout
            const embeddingPromise = this._generateEmbedding(text);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Embedding generation timeout')), 10000);
            });
            
            return await Promise.race([embeddingPromise, timeoutPromise]);
            
        } catch (error) {
            logger.warn('Primary embedding generation failed', { error: error.message });
            throw error; // Let caller handle fallback
        }
    }
    
    /**
     * Get fallback embedding from cache or generate simple one
     * @private
     */
    async _getFallbackEmbedding(query) {
        const fallbackKey = query.trim().toLowerCase();
        
        // Check if we have a cached fallback
        if (this.fallbackEmbeddings.has(fallbackKey)) {
            logger.debug('Using cached fallback embedding');
            return this.fallbackEmbeddings.get(fallbackKey);
        }
        
        // Generate simple fallback embedding
        try {
            const simpleEmbedding = this._generateSimpleEmbedding(query);
            this.fallbackEmbeddings.set(fallbackKey, simpleEmbedding);
            
            // Limit fallback cache size
            if (this.fallbackEmbeddings.size > 1000) {
                const firstKey = this.fallbackEmbeddings.keys().next().value;
                this.fallbackEmbeddings.delete(firstKey);
            }
            
            return simpleEmbedding;
        } catch (error) {
            logger.error('Fallback embedding generation failed', { error: error.message });
            return null;
        }
    }
    
    /**
     * Get emergency fallback embedding (last resort)
     * @private
     */
    async _getEmergencyFallbackEmbedding(query) {
        // Generate zero vector as absolute fallback
        const dimensions = 384;
        const embedding = new Array(dimensions).fill(0);
        
        // Add some variation based on query length
        embedding[0] = query.length / 1000;
        embedding[1] = query.split(' ').length / 100;
        
        logger.warn('Using emergency zero embedding as fallback');
        return embedding;
    }
    
    /**
     * Generate simple embedding based on character frequencies
     * @private
     */
    _generateSimpleEmbedding(text) {
        const dimensions = 384;
        const embedding = new Array(dimensions).fill(0);
        
        // Simple character frequency-based embedding
        const chars = text.toLowerCase().split('');
        for (let i = 0; i < chars.length && i < dimensions; i++) {
            const charCode = chars[i].charCodeAt(0);
            embedding[i % dimensions] += charCode / 1000;
        }
        
        // Normalize
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        if (norm > 0) {
            for (let i = 0; i < dimensions; i++) {
                embedding[i] /= norm;
            }
        }
        
        return embedding;
    }
    
    /**
     * Cache query with recovery mechanisms
     * @private
     */
    async _cacheQueryWithRecovery(query, options, optimizedQuery) {
        try {
            const cacheKey = this._generateCacheKey(query, options);
            
            // Cache in exact cache
            this.queryCache.set(cacheKey, optimizedQuery);
            
            // Cache in semantic cache
            if (this.options.enableSemanticCaching) {
                const semanticKey = `semantic_${cacheKey}`;
                this.semanticCache.set(semanticKey, optimizedQuery);
            }
            
        } catch (error) {
            logger.error('Query caching failed', { error: error.message });
            // Don't throw - caching is not critical
        }
    }
    
    /**
     * Validate cached result integrity
     * @private
     */
    _validateCachedResult(result) {
        if (!result || typeof result !== 'object') return false;
        if (!result.embedding || !Array.isArray(result.embedding)) return false;
        if (!result.text || typeof result.text !== 'string') return false;
        
        // Check embedding dimensions
        if (result.embedding.length !== 384) return false;
        
        // Check for NaN values in embedding
        if (result.embedding.some(val => isNaN(val))) return false;
        
        return true;
    }
    
    /**
     * Review and optimize cache patterns
     * @private
     */
    _reviewCacheOptimization() {
        const now = Date.now();
        
        if (now - this.adaptiveMetrics.lastOptimizationReview < this.adaptiveMetrics.optimizationInterval) {
            return;
        }
        
        logger.debug('Reviewing cache optimization patterns');
        
        // Analyze access patterns
        const totalAccess = Array.from(this.adaptiveMetrics.cacheAccessPattern.values())
            .reduce((sum, count) => sum + count, 0);
            
        if (totalAccess > 100) {
            // Find most common patterns
            const sortedPatterns = Array.from(this.adaptiveMetrics.cacheAccessPattern.entries())
                .sort((a, b) => b[1] - a[1]);
                
            logger.info('Cache access pattern analysis', {
                totalAccess,
                mostCommonPattern: sortedPatterns[0],
                patternCount: sortedPatterns.length
            });
            
            // Suggest optimizations
            if (this.queryCache.size > this.options.cacheSize * 0.9) {
                logger.warn('Cache approaching capacity, consider increasing size', {
                    currentSize: this.queryCache.size,
                    maxSize: this.options.cacheSize
                });
            }
        }
        
        this.adaptiveMetrics.lastOptimizationReview = now;
    }
    
    /**
     * Update query statistics with enhanced tracking
     * @private
     */
    _updateQueryStats(query, optimizationTime, cacheHit, fallbackUsed = false) {
        const queryHash = require('crypto').createHash('sha256').update(query).digest('hex').substring(0, 8);
        
        const stats = this.queryStats.get(queryHash) || {
            count: 0,
            totalOptimizationTime: 0,
            cacheHits: 0,
            fallbackUsed: 0,
            lastSeen: Date.now()
        };
        
        stats.count++;
        stats.totalOptimizationTime += optimizationTime;
        stats.lastSeen = Date.now();
        if (cacheHit) stats.cacheHits++;
        if (fallbackUsed) stats.fallbackUsed++;
        
        this.queryStats.set(queryHash, stats);
    }
    
    /**
     * Get enhanced optimization statistics
     */
    getStats() {
        return {
            cacheSize: this.queryCache.size,
            semanticCacheSize: this.semanticCache.size,
            fallbackEmbeddingsSize: this.fallbackEmbeddings.size,
            cacheHitRate: this._calculateCacheHitRate(),
            averageOptimizationTime: this._calculateAverageOptimizationTime(),
            queryCount: this.queryStats.size,
            errorStats: { ...this.errorStats },
            adaptiveMetrics: {
                accessPatternCount: this.adaptiveMetrics.cacheAccessPattern.size,
                lastReview: new Date(this.adaptiveMetrics.lastOptimizationReview).toISOString()
            }
        };
    }
    
    /**
     * Shutdown query optimizer
     */
    async shutdown() {
        if (!this.initialized) return;
        
        logger.info('Shutting down QueryOptimizer');
        
        this.queryCache.clear();
        this.semanticCache.clear();
        this.queryStats.clear();
        this.fallbackEmbeddings.clear();
        this.adaptiveMetrics.cacheAccessPattern.clear();
        this.initialized = false;
        
        logger.info('QueryOptimizer shutdown complete');
    }
}

module.exports = { QueryOptimizer };