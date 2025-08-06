/**
 * FaissIndex - FAISS vector index implementation for Grace Hopper
 * Mock implementation for development and testing
 */

const { logger } = require('../../utils/logger');

class FaissIndex {
    constructor(config = {}) {
        this.config = {
            dimensions: 1536,
            metric: 'cosine',
            graceMemory: true,
            compression: 'pq',
            ...config
        };
        
        this.vectors = [];
        this.metadata = [];
        this.vectorCount = 0;
        this.memoryUsage = 0;
        this.initialized = false;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        logger.info('Initializing FAISS index', {
            dimensions: this.config.dimensions,
            metric: this.config.metric,
            graceMemory: this.config.graceMemory
        });
        
        // Mock initialization
        this.initialized = true;
        
        logger.info('FAISS index initialized successfully');
    }
    
    async addVectors(vectors, metadata = []) {
        if (!this.initialized) {
            throw new Error('Index not initialized');
        }
        
        const vectorsToAdd = Array.isArray(vectors) ? vectors : [vectors];
        const vectorIds = [];
        
        for (let i = 0; i < vectorsToAdd.length; i++) {
            const vectorId = this.vectorCount++;
            this.vectors.push(vectorsToAdd[i]);
            this.metadata.push(metadata[i] || {});
            vectorIds.push(vectorId);
        }
        
        // Update memory usage estimate
        this.memoryUsage += vectorsToAdd.length * this.config.dimensions * 4; // 4 bytes per float
        
        return vectorIds;
    }
    
    async search(embedding, k = 10, filters = null) {
        if (!this.initialized) {
            throw new Error('Index not initialized');
        }
        
        if (this.vectors.length === 0) {
            return [];
        }
        
        // Mock search - calculate cosine similarity
        const similarities = this.vectors.map((vector, index) => {
            const similarity = this._cosineSimilarity(embedding, vector);
            return {
                id: index,
                score: similarity,
                content: this.metadata[index].content || `Document ${index}`,
                metadata: this.metadata[index]
            };
        });
        
        // Sort by similarity and return top k
        return similarities
            .sort((a, b) => b.score - a.score)
            .slice(0, k);
    }
    
    async build(vectors, options = {}) {
        logger.info('Building FAISS index', { 
            vectorCount: vectors.length / this.config.dimensions,
            options 
        });
        
        // Mock build process
        await new Promise(resolve => setTimeout(resolve, 100));
        
        logger.info('FAISS index build completed');
    }
    
    async save(filePath) {
        logger.info(`Saving FAISS index to ${filePath}`);
        
        // Mock save operation
        await new Promise(resolve => setTimeout(resolve, 50));
        
        logger.info('FAISS index saved successfully');
    }
    
    async load(filePath) {
        logger.info(`Loading FAISS index from ${filePath}`);
        
        // Mock load operation
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Simulate loaded data
        this.vectorCount = Math.floor(Math.random() * 1000000) + 10000;
        this.memoryUsage = this.vectorCount * this.config.dimensions * 4;
        
        // Create mock vectors for search
        for (let i = 0; i < Math.min(this.vectorCount, 100); i++) {
            this.vectors.push(this._randomVector(this.config.dimensions));
            this.metadata.push({
                content: `Mock document ${i}`,
                id: i
            });
        }
        
        logger.info('FAISS index loaded successfully', {
            vectorCount: this.vectorCount,
            memoryUsage: this.memoryUsage
        });
    }
    
    getVectorCount() {
        return this.vectorCount;
    }
    
    getMemoryUsage() {
        return this.memoryUsage;
    }
    
    getType() {
        return 'faiss';
    }
    
    _cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) {
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
    
    async shutdown() {
        if (!this.initialized) return;
        
        logger.info('Shutting down FAISS index');
        
        this.vectors = [];
        this.metadata = [];
        this.vectorCount = 0;
        this.memoryUsage = 0;
        this.initialized = false;
        
        logger.info('FAISS index shutdown complete');
    }
}

module.exports = { FaissIndex };