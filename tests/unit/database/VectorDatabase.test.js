/**
 * Unit tests for VectorDatabase
 */

const VectorDatabase = require('../../__mocks__/VectorDatabase');
const testData = require('../../fixtures/testData');

describe('VectorDatabase', () => {
  let vectorDB;

  beforeEach(async () => {
    vectorDB = new VectorDatabase({
      dimension: 512,
      metric: 'cosine',
      indexType: 'flat',
      memoryPool: 'test_pool'
    });

    await vectorDB.initialize();
  });

  afterEach(async () => {
    if (vectorDB) {
      await vectorDB.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', async () => {
      const defaultDB = new VectorDatabase();
      await defaultDB.initialize();
      
      expect(defaultDB.config).toBeDefined();
      expect(defaultDB.config.dimension).toBe(512);
      expect(defaultDB.config.metric).toBe('cosine');
      
      await defaultDB.cleanup();
    });

    test('should initialize with custom configuration', () => {
      expect(vectorDB.config.dimension).toBe(512);
      expect(vectorDB.config.metric).toBe('cosine');
      expect(vectorDB.config.indexType).toBe('flat');
    });

    test('should throw error for invalid dimension', async () => {
      const invalidDB = new VectorDatabase({ dimension: -1 });
      
      await expect(invalidDB.initialize()).rejects.toThrow('Invalid dimension');
    });
  });

  describe('Vector Operations', () => {
    test('should add single vector', async () => {
      const vector = testData.sampleEmbeddings[0];
      
      const result = await vectorDB.addVector(vector);
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
    });

    test('should add multiple vectors', async () => {
      const vectors = testData.sampleEmbeddings.slice(0, 3);
      
      const result = await vectorDB.addVectors(vectors);
      expect(result.success).toBe(true);
      expect(result.added).toBe(3);
      expect(result.totalVectors).toBe(3);
    });

    test('should retrieve vector by ID', async () => {
      const vector = testData.sampleEmbeddings[0];
      const addResult = await vectorDB.addVector(vector);
      
      const retrieved = await vectorDB.getVector(addResult.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(addResult.id);
      expect(retrieved.embedding).toEqual(vector.embedding);
    });

    test('should update vector metadata', async () => {
      const vector = testData.sampleEmbeddings[0];
      const addResult = await vectorDB.addVector(vector);
      
      const newMetadata = { ...vector.metadata, updated: true };
      const updateResult = await vectorDB.updateMetadata(addResult.id, newMetadata);
      
      expect(updateResult.success).toBe(true);
      
      const retrieved = await vectorDB.getVector(addResult.id);
      expect(retrieved.metadata.updated).toBe(true);
    });

    test('should delete vector', async () => {
      const vector = testData.sampleEmbeddings[0];
      const addResult = await vectorDB.addVector(vector);
      
      const deleteResult = await vectorDB.deleteVector(addResult.id);
      expect(deleteResult.success).toBe(true);
      
      const retrieved = await vectorDB.getVector(addResult.id);
      expect(retrieved).toBeNull();
    });

    test('should handle duplicate vector IDs', async () => {
      const vector1 = { ...testData.sampleEmbeddings[0], id: 'test_id' };
      const vector2 = { ...testData.sampleEmbeddings[1], id: 'test_id' };
      
      await vectorDB.addVector(vector1);
      
      await expect(vectorDB.addVector(vector2)).rejects.toThrow('Vector ID already exists');
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      // Add test vectors
      await vectorDB.addVectors(testData.sampleEmbeddings);
    });

    test('should perform basic similarity search', async () => {
      const query = testData.sampleQueries[0];
      
      const results = await vectorDB.search({
        embedding: query.embedding,
        k: 2
      });
      
      expect(results).toBeDefined();
      expect(results.results).toHaveLength(2);
      expect(results.results[0].score).toBeGreaterThan(0);
      expect(results.results[0].id).toBeDefined();
    });

    test('should respect k parameter', async () => {
      const query = testData.sampleQueries[0];
      
      const results = await vectorDB.search({
        embedding: query.embedding,
        k: 1
      });
      
      expect(results.results).toHaveLength(1);
    });

    test('should apply metadata filters', async () => {
      const query = testData.sampleQueries[0];
      
      const results = await vectorDB.search({
        embedding: query.embedding,
        k: 10,
        filters: {
          category: 'quantum_physics'
        }
      });
      
      expect(results.results.length).toBeGreaterThan(0);
      results.results.forEach(result => {
        expect(result.metadata.category).toBe('quantum_physics');
      });
    });

    test('should handle empty search results', async () => {
      const query = testData.sampleQueries[0];
      
      const results = await vectorDB.search({
        embedding: query.embedding,
        k: 10,
        filters: {
          category: 'nonexistent_category'
        }
      });
      
      expect(results.results).toHaveLength(0);
      expect(results.total).toBe(0);
    });

    test('should validate search parameters', async () => {
      await expect(
        vectorDB.search({ embedding: [], k: 5 })
      ).rejects.toThrow('Invalid embedding dimension');

      await expect(
        vectorDB.search({ embedding: testData.sampleQueries[0].embedding, k: 0 })
      ).rejects.toThrow('Invalid k value');
    });
  });

  describe('Index Management', () => {
    test('should build index', async () => {
      await vectorDB.addVectors(testData.performanceTestData.largeVectorSet.slice(0, 100));
      
      const result = await vectorDB.buildIndex();
      expect(result.success).toBe(true);
      expect(result.indexType).toBeDefined();
    });

    test('should reindex vectors', async () => {
      await vectorDB.addVectors(testData.sampleEmbeddings);
      
      const result = await vectorDB.reindex({ force: true });
      expect(result.success).toBe(true);
      expect(result.vectorsProcessed).toBe(testData.sampleEmbeddings.length);
    });

    test('should optimize index', async () => {
      await vectorDB.addVectors(testData.sampleEmbeddings);
      
      const result = await vectorDB.optimizeIndex();
      expect(result.success).toBe(true);
    });

    test('should get index statistics', async () => {
      await vectorDB.addVectors(testData.sampleEmbeddings);
      
      const stats = await vectorDB.getIndexStats();
      expect(stats).toBeDefined();
      expect(stats.vectorCount).toBe(testData.sampleEmbeddings.length);
      expect(stats.indexType).toBe('flat');
    });
  });

  describe('Statistics and Metrics', () => {
    beforeEach(async () => {
      await vectorDB.addVectors(testData.sampleEmbeddings);
    });

    test('should return database statistics', async () => {
      const stats = await vectorDB.getStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.totalVectors).toBe(testData.sampleEmbeddings.length);
      expect(stats.dimension).toBe(512);
      expect(stats.indexSize).toBeGreaterThan(0);
    });

    test('should return performance metrics', async () => {
      // Perform some searches to generate metrics
      for (let i = 0; i < 5; i++) {
        await vectorDB.search({
          embedding: testData.sampleQueries[0].embedding,
          k: 3
        });
      }
      
      const metrics = await vectorDB.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.searchCount).toBeGreaterThan(0);
      expect(metrics.avgSearchLatency).toBeGreaterThan(0);
    });

    test('should track memory usage', async () => {
      const memUsage = await vectorDB.getMemoryUsage();
      
      expect(memUsage).toBeDefined();
      expect(memUsage.used).toBeGreaterThan(0);
      expect(memUsage.allocated).toBeGreaterThan(0);
    });
  });

  describe('Health and Status', () => {
    test('should return health status', async () => {
      const health = await vectorDB.healthCheck();
      
      expect(health).toBeDefined();
      expect(health.healthy).toBe(true);
      expect(health.timestamp).toBeDefined();
    });

    test('should check if ready', async () => {
      const ready = await vectorDB.isReady();
      expect(ready).toBe(true);
    });

    test('should return current status', async () => {
      const status = await vectorDB.getStatus();
      
      expect(status).toBeDefined();
      expect(status.state).toBe('ready');
      expect(status.vectorCount).toBeDefined();
    });
  });

  describe('Persistence', () => {
    test('should save to disk', async () => {
      await vectorDB.addVectors(testData.sampleEmbeddings);
      
      const result = await vectorDB.save('/tmp/test_vector_db');
      expect(result.success).toBe(true);
      expect(result.path).toBeDefined();
    });

    test('should load from disk', async () => {
      await vectorDB.addVectors(testData.sampleEmbeddings);
      await vectorDB.save('/tmp/test_vector_db_load');
      
      const newDB = new VectorDatabase({
        dimension: 512,
        metric: 'cosine'
      });
      
      const result = await newDB.load('/tmp/test_vector_db_load');
      expect(result.success).toBe(true);
      
      const stats = await newDB.getStatistics();
      expect(stats.totalVectors).toBe(testData.sampleEmbeddings.length);
      
      await newDB.cleanup();
    });

    test('should create backup', async () => {
      await vectorDB.addVectors(testData.sampleEmbeddings);
      
      const result = await vectorDB.createBackup('/tmp/test_backup');
      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle memory allocation failures', async () => {
      // Mock memory allocation failure
      jest.spyOn(vectorDB, '_allocateMemory').mockRejectedValue(new Error('Memory allocation failed'));
      
      await expect(
        vectorDB.addVectors(testData.performanceTestData.largeVectorSet)
      ).rejects.toThrow('Memory allocation failed');
    });

    test('should handle invalid vector data', async () => {
      const invalidVector = {
        id: 'invalid',
        embedding: [1, 2, 3], // Wrong dimension
        metadata: {}
      };
      
      await expect(vectorDB.addVector(invalidVector)).rejects.toThrow();
    });

    test('should handle index corruption', async () => {
      await vectorDB.addVectors(testData.sampleEmbeddings);
      
      // Simulate index corruption
      jest.spyOn(vectorDB.index, 'search').mockImplementation(() => {
        throw new Error('Index corrupted');
      });
      
      await expect(
        vectorDB.search({
          embedding: testData.sampleQueries[0].embedding,
          k: 5
        })
      ).rejects.toThrow('Index corrupted');
    });
  });

  describe('Performance Tests', () => {
    test('should handle large batch insertions', async () => {
      const largeSet = testData.performanceTestData.largeVectorSet.slice(0, 1000);
      
      const startTime = Date.now();
      const result = await vectorDB.addVectors(largeSet);
      const insertTime = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(result.added).toBe(1000);
      expect(insertTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should maintain search performance with large dataset', async () => {
      const largeSet = testData.performanceTestData.largeVectorSet.slice(0, 1000);
      await vectorDB.addVectors(largeSet);
      
      const searchTimes = [];
      
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await vectorDB.search({
          embedding: testData.sampleQueries[0].embedding,
          k: 10
        });
        searchTimes.push(Date.now() - startTime);
      }
      
      const avgSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
      expect(avgSearchTime).toBeLessThan(100); // Average search should be under 100ms
    });
  });
});