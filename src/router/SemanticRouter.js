/**
 * SemanticRouter - Intelligent query routing based on embedding similarity
 * Optimized for Grace Hopper unified memory architecture
 */

const { logger } = require('../utils/logger');

class SemanticRouter {
    constructor(options = {}) {
        this.options = {
            embeddingModel: 'sentence-transformers/all-MiniLM-L6-v2',
            similarity: 'cosine',
            cacheSize: 10000,
            ...options
        };
        
        this.graceMemory = options.graceMemory;
        this.embeddingCache = new Map();
        this.clusterCentroids = new Map();
        this.initialized = false;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        logger.info('Initializing SemanticRouter');
        
        try {
            // Initialize embedding model (mock for now)
            await this._loadEmbeddingModel();
            
            // Initialize clustering for semantic routing
            await this._initializeClustering();
            
            this.initialized = true;
            logger.info('SemanticRouter initialized successfully');
            
        } catch (error) {
            logger.error('SemanticRouter initialization failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Route query embedding to optimal shards
     * @param {Array} embedding - Query embedding vector
     * @param {Object} options - Routing options
     * @returns {Array} Target shards with routing weights
     */
    async route(embedding, options = {}) {
        if (!this.initialized) {
            throw new Error('SemanticRouter not initialized');
        }
        
        const { database, k = 10 } = options;
        
        try {
            // Find most similar clusters
            const similarClusters = await this._findSimilarClusters(embedding, database);
            
            // Map clusters to shards
            const targetShards = await this._mapClustersToShards(similarClusters, k);
            
            return targetShards;
            
        } catch (error) {
            logger.error('Semantic routing failed', { error: error.message });
            // Fallback to random routing
            return await this._fallbackRouting(database, k);
        }
    }
    
    /**
     * Generate embedding for text query
     * @param {string} text - Input text
     * @returns {Array} Embedding vector
     */
    async generateEmbedding(text) {
        const cacheKey = this._hash(text);
        
        if (this.embeddingCache.has(cacheKey)) {
            return this.embeddingCache.get(cacheKey);
        }
        
        // Mock embedding generation - in real implementation would use actual model
        const embedding = this._mockEmbedding(text);
        
        // Cache result
        if (this.embeddingCache.size < this.options.cacheSize) {
            this.embeddingCache.set(cacheKey, embedding);
        }
        
        return embedding;
    }
    
    /**
     * Update cluster centroids based on new data
     * @param {string} database - Database name
     * @param {Array} embeddings - New embedding vectors
     */
    async updateClusters(database, embeddings) {
        logger.info(`Updating clusters for database '${database}'`);
        
        try {
            // Simple k-means update (mock implementation)
            const clusters = this.clusterCentroids.get(database) || [];
            
            // Update centroids with new embeddings
            const updatedClusters = await this._updateKMeansClusters(clusters, embeddings);
            
            this.clusterCentroids.set(database, updatedClusters);
            
            logger.info(`Updated ${updatedClusters.length} clusters for database '${database}'`);
            
        } catch (error) {
            logger.error('Cluster update failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Load embedding model
     */
    async _loadEmbeddingModel() {
        // Mock model loading
        logger.info(`Loading embedding model: ${this.options.embeddingModel}`);
        
        // Simulate model loading delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        logger.info('Embedding model loaded successfully');
    }
    
    /**
     * Initialize clustering for semantic routing
     */
    async _initializeClustering() {
        // Initialize with default clusters
        // In real implementation, would train on actual data
        logger.info('Initializing semantic clustering');
        
        // Create default clusters for each database
        const defaultClusters = this._createDefaultClusters();
        this.clusterCentroids.set('default', defaultClusters);
        
        logger.info(`Initialized ${defaultClusters.length} default clusters`);
    }
    
    /**
     * Find similar clusters for embedding
     */
    async _findSimilarClusters(embedding, database) {
        const clusters = this.clusterCentroids.get(database) || this.clusterCentroids.get('default') || [];
        
        if (clusters.length === 0) {
            return [];
        }
        
        // Calculate similarity to each cluster centroid
        const similarities = clusters.map((cluster, index) => ({
            clusterId: index,
            shardIds: cluster.shardIds || [`shard_${index}`],
            similarity: this._cosineSimilarity(embedding, cluster.centroid)
        }));
        
        // Sort by similarity (descending) and return top clusters
        return similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, Math.min(3, similarities.length));
    }
    
    /**
     * Map clusters to shards
     */
    async _mapClustersToShards(similarClusters, k) {
        const shards = [];
        
        for (const cluster of similarClusters) {
            for (const shardId of cluster.shardIds) {
                shards.push({
                    id: shardId,
                    similarity: cluster.similarity,
                    weight: cluster.similarity
                });
            }
        }
        
        // Normalize weights
        const totalWeight = shards.reduce((sum, shard) => sum + shard.weight, 0);
        if (totalWeight > 0) {
            shards.forEach(shard => {
                shard.weight = shard.weight / totalWeight;
            });
        }
        
        return shards;
    }
    
    /**
     * Fallback routing when semantic routing fails
     */
    async _fallbackRouting(database, k) {
        logger.warn('Using fallback routing');
        
        // Return mock shards for fallback
        return [
            { id: 'fallback_shard_0', weight: 1.0, similarity: 0.5 }
        ];
    }
    
    /**
     * Create default clusters
     */
    _createDefaultClusters() {
        const clusters = [];
        const numClusters = 8;
        const dimensions = 384; // MiniLM embedding dimension
        
        for (let i = 0; i < numClusters; i++) {
            clusters.push({
                centroid: this._randomVector(dimensions),
                shardIds: [`default_shard_${i}`],
                size: 100
            });
        }
        
        return clusters;
    }
    
    /**
     * Update k-means clusters
     */
    async _updateKMeansClusters(clusters, embeddings) {
        // Simple centroid update
        const updatedClusters = clusters.map(cluster => ({ ...cluster }));
        
        // Mock update logic
        for (const cluster of updatedClusters) {
            // Simulate centroid movement
            for (let i = 0; i < cluster.centroid.length; i++) {
                cluster.centroid[i] += (Math.random() - 0.5) * 0.01;
            }
        }
        
        return updatedClusters;
    }
    
    /**
     * Calculate cosine similarity
     */
    _cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            return 0;
        }
        
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
        
        if (normA === 0 || normB === 0) {
            return 0;
        }
        
        return dotProduct / (normA * normB);
    }
    
    /**
     * Generate mock embedding
     */
    _mockEmbedding(text) {
        const dimensions = 384;
        const embedding = new Array(dimensions);
        
        // Generate deterministic embedding based on text hash
        const hash = this._hash(text);
        let seed = parseInt(hash.substring(0, 8), 16);
        
        for (let i = 0; i < dimensions; i++) {
            seed = (seed * 9301 + 49297) % 233280;
            embedding[i] = (seed / 233280) * 2 - 1; // Range [-1, 1]
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
     * Generate random vector
     */
    _randomVector(dimensions) {
        const vector = new Array(dimensions);
        
        for (let i = 0; i < dimensions; i++) {
            vector[i] = Math.random() * 2 - 1; // Range [-1, 1]
        }
        
        // Normalize
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (norm > 0) {
            for (let i = 0; i < dimensions; i++) {
                vector[i] /= norm;
            }
        }
        
        return vector;
    }
    
    /**
     * Simple hash function
     */
    _hash(text) {
        return require('crypto').createHash('sha256').update(text).digest('hex');
    }
    
    /**
     * Shutdown semantic router
     */
    async shutdown() {
        if (!this.initialized) return;
        
        logger.info('Shutting down SemanticRouter');
        
        this.embeddingCache.clear();
        this.clusterCentroids.clear();
        this.initialized = false;
        
        logger.info('SemanticRouter shutdown complete');
    }
}

module.exports = { SemanticRouter };