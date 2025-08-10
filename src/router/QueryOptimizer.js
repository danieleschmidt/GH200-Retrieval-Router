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
            
            this.initialized = true;
            logger.info('QueryOptimizer initialized successfully');
            
        } catch (error) {
            logger.error('QueryOptimizer initialization failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Optimize query for retrieval
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
        
        try {
            // Check exact cache first
            const cachedResult = this._checkExactCache(query, options);
            if (cachedResult) {
                logger.debug('Query cache hit', { query: query.substring(0, 50) });
                return { ...cachedResult, fromCache: true };
            }
            
            // Check semantic cache
            if (this.options.enableSemanticCaching) {
                const semanticResult = await this._checkSemanticCache(query, options);
                if (semanticResult) {
                    logger.debug('Semantic cache hit', { query: query.substring(0, 50) });
                    return { ...semanticResult, fromCache: true, semanticCache: true };
                }
            }
            
            // Optimize query text
            const optimizedText = await this._optimizeQueryText(query);
            
            // Generate embedding
            const embedding = await this._generateEmbedding(optimizedText);
            
            // Create optimized query object
            const optimizedQuery = {
                original: query,
                text: optimizedText,
                embedding,
                k,
                database,
                optimizationMetadata: {
                    rewritten: optimizedText !== query,
                    embeddingGeneration: Date.now() - startTime,
                    cacheKey
                }
            };
            
            // Cache the result
            this._cacheQuery(query, options, optimizedQuery);
            
            // Update statistics
            this._updateQueryStats(query, Date.now() - startTime, false);
            
            return optimizedQuery;
            
        } catch (error) {
            logger.error('Query optimization failed', { 
                query: query.substring(0, 50),
                error: error.message 
            });
            
            // Return fallback optimization
            return {
                original: query,
                text: query,
                embedding: await this._generateEmbedding(query),
                k,
                database,
                optimizationMetadata: {
                    fallback: true,
                    error: error.message
                }
            };
        }
    }
    
    /**
     * Get optimization statistics
     */
    getStats() {
        return {
            cacheSize: this.queryCache.size,
            semanticCacheSize: this.semanticCache.size,
            cacheHitRate: this._calculateCacheHitRate(),
            averageOptimizationTime: this._calculateAverageOptimizationTime(),
            queryCount: this.queryStats.size
        };
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
     * Update query statistics
     */
    _updateQueryStats(query, optimizationTime, cacheHit) {
        const queryHash = require('crypto').createHash('sha256').update(query).digest('hex').substring(0, 8);
        
        const stats = this.queryStats.get(queryHash) || {
            count: 0,
            totalOptimizationTime: 0,
            cacheHits: 0
        };
        
        stats.count++;
        stats.totalOptimizationTime += optimizationTime;
        if (cacheHit) stats.cacheHits++;
        
        this.queryStats.set(queryHash, stats);
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
     * Shutdown query optimizer
     */
    async shutdown() {
        if (!this.initialized) return;
        
        logger.info('Shutting down QueryOptimizer');
        
        this.queryCache.clear();
        this.semanticCache.clear();
        this.queryStats.clear();
        this.initialized = false;
        
        logger.info('QueryOptimizer shutdown complete');
    }
}

module.exports = { QueryOptimizer };