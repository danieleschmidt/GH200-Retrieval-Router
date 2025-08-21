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
    this.performanceMetrics = {
      searchCount: 0,
      avgSearchLatency: 0
    };
    // Mock index for spying in tests
    this.index = {
      search: jest.fn().mockResolvedValue([])
    };
  }

  async initialize() {
    if (this.config.dimension < 0) {
      throw new Error('Invalid dimension');
    }
    this.isInitialized = true;
    return { success: true };
  }

  async cleanup() {
    this.vectors.clear();
    this.isInitialized = false;
    return true;
  }

  async addVector(vector) {
    // Validate vector input first
    if (!vector || typeof vector !== 'object') {
      throw new Error('Invalid vector object');
    }
    
    // Accept both 'data' and 'embedding' properties
    const vectorData = vector.data || vector.embedding;
    
    if (!vectorData || !Array.isArray(vectorData)) {
      throw new Error('Invalid vector data');
    }
    
    // Check if dimension is wrong
    if (vectorData.length !== this.config.dimension) {
      throw new Error(`Invalid vector dimension: expected ${this.config.dimension}, got ${vectorData.length}`);
    }
    
    const id = vector.id || Math.random().toString(36).substr(2, 9);
    
    if (this.vectors.has(id)) {
      throw new Error('Vector ID already exists');
    }
    
    this.vectors.set(id, { ...vector, id });
    return { success: true, id };
  }

  async addVectors(vectors) {
    // Check if _allocateMemory is mocked to throw
    try {
      await this._allocateMemory();
    } catch (error) {
      throw error;
    }
    
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
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Invalid embedding dimension');
    }
    
    if (k <= 0 || k > 1000) {
      throw new Error('Invalid k value');
    }
    
    // If index.search is mocked to throw, call it to trigger the error
    if (this.index && this.index.search) {
      try {
        this.index.search();
      } catch (error) {
        throw error;
      }
    }
    
    this.performanceMetrics.searchCount++;
    this.performanceMetrics.avgSearchLatency = 15; // Mock latency
    
    let allVectors = Array.from(this.vectors.values());
    
    // Apply filters if provided
    if (filters && Object.keys(filters).length > 0) {
      allVectors = allVectors.filter(vector => {
        if (!vector.metadata) return false;
        
        for (const [key, value] of Object.entries(filters)) {
          if (vector.metadata[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }
    
    // Return filtered results
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
      searchCount: this.performanceMetrics.searchCount,
      avgSearchLatency: this.performanceMetrics.avgSearchLatency,
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
    // Simulate loading vectors
    const mockVectors = [
      { id: 1, data: new Array(this.config.dimension).fill(0.1), metadata: { title: 'Test Document 1' } },
      { id: 2, data: new Array(this.config.dimension).fill(0.2), metadata: { title: 'Test Document 2' } },
      { id: 3, data: new Array(this.config.dimension).fill(0.3), metadata: { title: 'Test Document 3' } }
    ];
    
    for (const vector of mockVectors) {
      this.vectors.set(vector.id, vector);
    }
    
    return { success: true, vectorsLoaded: mockVectors.length };
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