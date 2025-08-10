/**
 * VectorDatabase - High-performance vector database for Grace Hopper architecture
 * Supports FAISS, ScaNN, and RAPIDS cuVS indices with Grace memory optimization
 */

const EventEmitter = require('events');
const { FaissIndex } = require('./indices/FaissIndex');
const { ScannIndex } = require('./indices/ScannIndex');
const { CuvsIndex } = require('./indices/CuvsIndex');
const { logger } = require('../utils/logger');
const { validateVectorConfig, validateSearchQuery } = require('../utils/validators');
const { circuitBreakerManager } = require('../middleware/circuitBreaker');
const { retry, RetryConditions, retryable } = require('../utils/retry');

class VectorDatabase extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            indexType: config.indexType || 'faiss',
            dimensions: config.dimensions || 1536,
            metric: config.metric || 'cosine',
            shardCount: config.shardCount || 1,
            graceMemory: config.graceMemory || true,
            compression: config.compression || 'pq',
            ...config
        };
        
        validateVectorConfig(this.config);
        
        // Index instances
        this.indices = new Map();
        this.activeIndex = null;
        
        // Metadata
        this.metadata = {
            vectorCount: 0,
            dimensions: this.config.dimensions,
            indexType: this.config.indexType,
            shards: new Map()
        };
        
        // Performance tracking
        this.stats = {
            totalSearches: 0,
            averageSearchLatency: 0,
            indexBuildTime: 0,
            memoryUsage: 0,
            cacheHitRate: 0
        };
        
        this.initialized = false;
        
        // Circuit breakers for different operations
        this.searchBreaker = circuitBreakerManager.getBreaker('vector-search', {
            failureThreshold: 5,
            resetTimeout: 30000
        });
        
        this.indexBreaker = circuitBreakerManager.getBreaker('vector-index', {
            failureThreshold: 3,
            resetTimeout: 60000
        });
    }
    
    /**
     * Initialize vector database
     */
    async initialize() {
        if (this.initialized) {
            throw new Error('VectorDatabase already initialized');
        }
        
        logger.info('Initializing VectorDatabase', {
            indexType: this.config.indexType,
            dimensions: this.config.dimensions,
            metric: this.config.metric,
            shardCount: this.config.shardCount
        });
        
        try {
            // Create primary index based on configuration
            await this._createIndex();
            
            this.initialized = true;
            this.emit('initialized');
            
            logger.info('VectorDatabase initialized successfully', {
                indexType: this.activeIndex.getType(),
                memoryUsage: this.activeIndex.getMemoryUsage()
            });
            
        } catch (error) {
            logger.error('VectorDatabase initialization failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Load sharded vector database from multiple index files
     * @param {Object} options - Loading options
     * @returns {Promise<VectorDatabase>} Loaded database instance
     */
    static async loadSharded(options = {}) {
        const {
            indexPaths = [],
            metadataPath: _metadataPath,
            autoBalance = true,
            graceMemory = true
        } = options;
        
        if (indexPaths.length === 0) {
            throw new Error('At least one index path is required');
        }
        
        logger.info('Loading sharded vector database', {
            shardCount: indexPaths.length,
            autoBalance,
            graceMemory
        });
        
        const database = new VectorDatabase({
            shardCount: indexPaths.length,
            graceMemory
        });
        
        try {
            await database.initialize();
            
            // Load each shard
            const loadPromises = indexPaths.map(async (path, shardId) => {
                const index = await database._loadIndexShard(path, shardId);
                database.indices.set(shardId, index);
                
                return {
                    shardId,
                    vectorCount: index.getVectorCount(),
                    memoryUsage: index.getMemoryUsage()
                };
            });
            
            const shardStats = await Promise.all(loadPromises);
            
            // Update metadata
            database.metadata.vectorCount = shardStats.reduce((sum, shard) => sum + shard.vectorCount, 0);
            
            for (const shard of shardStats) {
                database.metadata.shards.set(shard.shardId, {
                    vectorCount: shard.vectorCount,
                    memoryUsage: shard.memoryUsage,
                    loadTime: Date.now()
                });
            }
            
            // Auto-balance shards if requested
            if (autoBalance) {
                await database._balanceShards();
            }
            
            logger.info('Sharded database loaded successfully', {
                totalVectors: database.metadata.vectorCount,
                shardCount: indexPaths.length,
                totalMemoryUsage: shardStats.reduce((sum, shard) => sum + shard.memoryUsage, 0)
            });
            
            return database;
            
        } catch (error) {
            logger.error('Failed to load sharded database', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Add vectors to the database
     * @param {Float32Array|Array} vectors - Vectors to add
     * @param {Array} metadata - Optional metadata for each vector
     * @returns {Promise<Array>} Vector IDs
     */
    async addVectors(vectors, metadata = []) {
        if (!this.initialized) {
            throw new Error('VectorDatabase not initialized');
        }
        
        if (!Array.isArray(vectors) && !(vectors instanceof Float32Array)) {
            throw new Error('Vectors must be an array or Float32Array');
        }
        
        const vectorCount = Array.isArray(vectors) ? vectors.length : vectors.length / this.config.dimensions;
        
        logger.debug('Adding vectors to database', {
            vectorCount,
            hasMetadata: metadata.length > 0
        });
        
        try {
            const vectorIds = await this.activeIndex.addVectors(vectors, metadata);
            
            this.metadata.vectorCount += vectorCount;
            this.emit('vectorsAdded', { vectorCount, vectorIds });
            
            logger.debug('Vectors added successfully', {
                addedCount: vectorCount,
                totalCount: this.metadata.vectorCount
            });
            
            return vectorIds;
            
        } catch (error) {
            logger.error('Failed to add vectors', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Search for similar vectors
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Search results
     */
    async search(options = {}) {
        if (!this.initialized) {
            throw new Error('VectorDatabase not initialized');
        }
        
        validateSearchQuery(options);
        
        const {
            embedding,
            k = 10,
            shardId = null,
            filters = null,
            includeMetadata = true
        } = options;
        
        const startTime = Date.now();
        
        try {
            // Wrap search operation with circuit breaker and retry logic
            const searchResults = await this.searchBreaker.execute(async () => {
                return await retry(async () => {
                    let results;
                    
                    if (shardId !== null && this.indices.has(shardId)) {
                        // Search specific shard
                        const index = this.indices.get(shardId);
                        results = await index.search(embedding, k, filters);
                    } else if (this.indices.size > 1) {
                        // Search across all shards
                        results = await this._searchAllShards(embedding, k, filters);
                    } else {
                        // Search primary index
                        results = await this.activeIndex.search(embedding, k, filters);
                    }
                    
                    return results;
                }, {
                    attempts: 3,
                    baseDelay: 100,
                    maxDelay: 2000,
                    retryCondition: (error) => {
                        // Retry on memory errors, timeouts, and temporary failures
                        return RetryConditions.memoryError(error) ||
                               RetryConditions.networkError(error) ||
                               error.message.includes('timeout') ||
                               error.message.includes('busy');
                    },
                    onRetry: (error, attempt) => {
                        logger.warn('Vector search retry', {
                            attempt,
                            error: error.message,
                            searchOptions: { k, shardId: shardId || 'all' }
                        });
                    }
                });
            });
            
            const latency = Date.now() - startTime;
            
            // Update statistics
            this._updateSearchStats(latency, searchResults.length);
            
            // Format results
            const formattedResults = searchResults.map(result => ({
                id: result.id,
                score: result.score,
                content: result.content || '',
                metadata: includeMetadata ? result.metadata : undefined
            }));
            
            this.emit('searchCompleted', {
                queryTime: latency,
                resultCount: formattedResults.length,
                k
            });
            
            return formattedResults;
            
        } catch (error) {
            logger.error('Vector search failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Get vector count
     */
    getVectorCount() {
        return this.metadata.vectorCount;
    }
    
    /**
     * Get vector dimensions
     */
    getDimensions() {
        return this.metadata.dimensions;
    }
    
    /**
     * Get database statistics
     */
    getStats() {
        return {
            ...this.stats,
            vectorCount: this.metadata.vectorCount,
            dimensions: this.metadata.dimensions,
            indexType: this.metadata.indexType,
            shardCount: this.indices.size,
            memoryUsage: this._getTotalMemoryUsage()
        };
    }
    
    /**
     * Build index from vectors
     * @param {Float32Array} vectors - Training vectors
     * @param {Object} buildOptions - Index building options
     */
    async buildIndex(vectors, buildOptions = {}) {
        if (!this.activeIndex) {
            throw new Error('No active index available');
        }
        
        const startTime = Date.now();
        
        logger.info('Building vector index', {
            vectorCount: vectors.length / this.config.dimensions,
            indexType: this.config.indexType,
            options: buildOptions
        });
        
        try {
            await this.activeIndex.build(vectors, buildOptions);
            
            this.stats.indexBuildTime = Date.now() - startTime;
            this.emit('indexBuilt', { buildTime: this.stats.indexBuildTime });
            
            logger.info('Index built successfully', {
                buildTime: this.stats.indexBuildTime,
                memoryUsage: this.activeIndex.getMemoryUsage()
            });
            
        } catch (error) {
            logger.error('Index building failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Save index to file
     * @param {string} filePath - Output file path
     */
    async saveIndex(filePath) {
        if (!this.activeIndex) {
            throw new Error('No active index to save');
        }
        
        logger.info(`Saving index to ${filePath}`);
        
        try {
            await this.activeIndex.save(filePath);
            
            logger.info('Index saved successfully', { filePath });
            
        } catch (error) {
            logger.error('Failed to save index', { error: error.message, filePath });
            throw error;
        }
    }
    
    /**
     * Load index from file
     * @param {string} filePath - Input file path
     */
    async loadIndex(filePath) {
        logger.info(`Loading index from ${filePath}`);
        
        try {
            if (!this.activeIndex) {
                await this._createIndex();
            }
            
            await this.activeIndex.load(filePath);
            
            // Update metadata
            this.metadata.vectorCount = this.activeIndex.getVectorCount();
            
            logger.info('Index loaded successfully', {
                filePath,
                vectorCount: this.metadata.vectorCount,
                memoryUsage: this.activeIndex.getMemoryUsage()
            });
            
        } catch (error) {
            logger.error('Failed to load index', { error: error.message, filePath });
            throw error;
        }
    }
    
    /**
     * Create index based on configuration
     */
    async _createIndex() {
        const indexConfig = {
            dimensions: this.config.dimensions,
            metric: this.config.metric,
            graceMemory: this.config.graceMemory,
            compression: this.config.compression
        };
        
        switch (this.config.indexType.toLowerCase()) {
            case 'faiss':
                this.activeIndex = new FaissIndex(indexConfig);
                break;
            case 'scann':
                this.activeIndex = new ScannIndex(indexConfig);
                break;
            case 'cuvs':
                this.activeIndex = new CuvsIndex(indexConfig);
                break;
            default:
                throw new Error(`Unsupported index type: ${this.config.indexType}`);
        }
        
        await this.activeIndex.initialize();
    }
    
    /**
     * Load a single index shard
     */
    async _loadIndexShard(indexPath, shardId) {
        const indexConfig = {
            dimensions: this.config.dimensions,
            metric: this.config.metric,
            graceMemory: this.config.graceMemory
        };
        
        let index;
        switch (this.config.indexType.toLowerCase()) {
            case 'faiss':
                index = new FaissIndex(indexConfig);
                break;
            case 'scann':
                index = new ScannIndex(indexConfig);
                break;
            case 'cuvs':
                index = new CuvsIndex(indexConfig);
                break;
            default:
                throw new Error(`Unsupported index type: ${this.config.indexType}`);
        }
        
        await index.initialize();
        await index.load(indexPath);
        
        return index;
    }
    
    /**
     * Search across all shards
     */
    async _searchAllShards(embedding, k, filters) {
        const searchPromises = Array.from(this.indices.values()).map(async (index) => {
            return await index.search(embedding, Math.ceil(k * 1.2), filters);
        });
        
        const shardResults = await Promise.all(searchPromises);
        
        // Merge and sort results
        const allResults = shardResults.flat();
        return allResults
            .sort((a, b) => b.score - a.score)
            .slice(0, k);
    }
    
    /**
     * Balance vectors across shards
     */
    async _balanceShards() {
        if (this.indices.size <= 1) return;
        
        logger.info('Balancing shards for optimal performance');
        
        // Simplified balancing logic
        // In real implementation, this would redistribute vectors based on usage patterns
        const totalVectors = this.metadata.vectorCount;
        const targetVectorsPerShard = Math.ceil(totalVectors / this.indices.size);
        
        logger.debug('Shard balancing completed', {
            shardCount: this.indices.size,
            targetVectorsPerShard
        });
    }
    
    /**
     * Update search statistics
     */
    _updateSearchStats(latency, resultCount) {
        this.stats.totalSearches++;
        this.stats.averageSearchLatency = (
            (this.stats.averageSearchLatency * (this.stats.totalSearches - 1) + latency) /
            this.stats.totalSearches
        );
    }
    
    /**
     * Get total memory usage across all indices
     */
    _getTotalMemoryUsage() {
        let totalMemory = 0;
        
        if (this.activeIndex) {
            totalMemory += this.activeIndex.getMemoryUsage();
        }
        
        for (const index of this.indices.values()) {
            totalMemory += index.getMemoryUsage();
        }
        
        return totalMemory;
    }
    
    /**
     * Gracefully shutdown the database
     */
    async shutdown() {
        if (!this.initialized) {
            return;
        }
        
        logger.info('Shutting down VectorDatabase');
        
        try {
            // Shutdown all indices
            if (this.activeIndex) {
                await this.activeIndex.shutdown();
            }
            
            for (const index of this.indices.values()) {
                await index.shutdown();
            }
            
            this.indices.clear();
            this.initialized = false;
            
            this.emit('shutdown');
            
            logger.info('VectorDatabase shutdown complete');
            
        } catch (error) {
            logger.error('Error during VectorDatabase shutdown', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Health check for the vector database
     * @returns {Object} Health status information
     */
    async healthCheck() {
        const healthStatus = {
            healthy: true,
            timestamp: new Date().toISOString(),
            initialized: this.initialized,
            indexType: this.config.indexType,
            dimensions: this.config.dimensions,
            errors: []
        };

        try {
            // Check initialization status
            if (!this.initialized) {
                healthStatus.healthy = false;
                healthStatus.errors.push('Database not initialized');
                return healthStatus;
            }

            // Check active index
            if (!this.activeIndex) {
                healthStatus.healthy = false;
                healthStatus.errors.push('No active index available');
            } else {
                try {
                    // Try to get index status
                    const indexStatus = this.activeIndex.getStatus ? 
                        await this.activeIndex.getStatus() : 
                        { status: 'available', healthy: true };
                    
                    healthStatus.activeIndex = indexStatus;
                    if (indexStatus.healthy === false) {
                        healthStatus.healthy = false;
                        healthStatus.errors.push('Active index unhealthy');
                    }
                } catch (error) {
                    healthStatus.healthy = false;
                    healthStatus.errors.push(`Active index error: ${error.message}`);
                }
            }

            // Add metrics
            healthStatus.metrics = {
                vectorCount: this.metadata.vectorCount,
                totalSearches: this.stats.totalSearches,
                averageSearchLatency: this.stats.averageSearchLatency,
                indexBuildTime: this.stats.indexBuildTime,
                memoryUsage: this._getTotalMemoryUsage(),
                cacheHitRate: this.stats.cacheHitRate,
                activeIndices: this.indices.size
            };

        } catch (error) {
            healthStatus.healthy = false;
            healthStatus.errors.push(`Health check error: ${error.message}`);
            logger.error('VectorDatabase health check failed', { error: error.message });
        }

        return healthStatus;
    }

    /**
     * Check if database is ready to serve requests
     * @returns {boolean} Readiness status
     */
    async isReady() {
        try {
            return this.initialized && this.activeIndex !== null;
        } catch (error) {
            logger.error('VectorDatabase readiness check failed', { error: error.message });
            return false;
        }
    }

    /**
     * Get basic status information
     * @returns {Object} Status information
     */
    async getStatus() {
        return {
            status: this.initialized ? 'ready' : 'not_initialized',
            indexType: this.config.indexType,
            dimensions: this.config.dimensions,
            vectorCount: this.metadata.vectorCount,
            activeIndices: this.indices.size,
            memoryUsage: this._getTotalMemoryUsage()
        };
    }
}

module.exports = { VectorDatabase };
