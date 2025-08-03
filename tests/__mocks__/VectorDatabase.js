/**
 * Mock VectorDatabase for testing
 */

class VectorDatabase {
  constructor(config = {}) {
    this.config = {
      dimension: 512,
      metric: 'cosine',
      indexType: 'flat',
      ...config
    };
    this.vectors = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    this.isInitialized = true;
    return { success: true };
  }

  async cleanup() {
    this.vectors.clear();
    this.isInitialized = false;
    return true;
  }

  async addVector(vector) {
    const id = vector.id || Math.random().toString(36).substr(2, 9);
    this.vectors.set(id, { ...vector, id });
    return { success: true, id };
  }

  async addVectors(vectors) {
    for (const vector of vectors) {
      await this.addVector(vector);
    }
    return { success: true, added: vectors.length, totalVectors: this.vectors.size };
  }

  async getVector(id) {
    return this.vectors.get(id) || null;
  }

  async updateMetadata(id, metadata) {
    const vector = this.vectors.get(id);
    if (!vector) return { success: false };
    
    this.vectors.set(id, { ...vector, metadata: { ...vector.metadata, ...metadata } });
    return { success: true };
  }

  async deleteVector(id) {
    const existed = this.vectors.delete(id);
    return { success: existed, totalVectors: this.vectors.size };
  }

  async search({ embedding, k = 10, filters = {} }) {
    const allVectors = Array.from(this.vectors.values());
    
    // Simple mock search - return first k vectors
    const results = allVectors.slice(0, k).map((vector, index) => ({
      id: vector.id,
      score: 0.9 - (index * 0.1),
      metadata: vector.metadata
    }));

    return {
      results,
      total: results.length,
      method: 'mock_search'
    };
  }

  async buildIndex() {
    return { success: true, indexType: this.config.indexType };
  }

  async reindex({ force = false } = {}) {
    return { 
      success: true, 
      vectorsProcessed: this.vectors.size,
      newVersion: '1.0.0'
    };
  }

  async optimizeIndex() {
    return { success: true };
  }

  async getIndexStats() {
    return {
      vectorCount: this.vectors.size,
      indexType: this.config.indexType,
      dimension: this.config.dimension
    };
  }

  async getStatistics() {
    return {
      totalVectors: this.vectors.size,
      dimension: this.config.dimension,
      indexSize: this.vectors.size * this.config.dimension * 4, // 4 bytes per float
      metric: this.config.metric
    };
  }

  async getMetrics() {
    return {
      searchCount: 0,
      avgSearchLatency: 45.2,
      indexSize: this.vectors.size * this.config.dimension * 4
    };
  }

  async getMemoryUsage() {
    return {
      used: this.vectors.size * this.config.dimension * 4,
      allocated: this.vectors.size * this.config.dimension * 4
    };
  }

  async healthCheck() {
    return {
      healthy: this.isInitialized,
      timestamp: new Date().toISOString(),
      vectorCount: this.vectors.size
    };
  }

  async isReady() {
    return this.isInitialized;
  }

  async getStatus() {
    return {
      state: this.isInitialized ? 'ready' : 'initializing',
      vectorCount: this.vectors.size,
      indexType: this.config.indexType
    };
  }

  async save(path) {
    return { success: true, path };
  }

  async load(path) {
    return { success: true, vectorsLoaded: 0 };
  }

  async createBackup(path) {
    return { success: true, backupPath: path };
  }

  // Mock private method for tests
  async _allocateMemory() {
    return true;
  }
}

module.exports = VectorDatabase;