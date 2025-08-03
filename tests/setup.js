/**
 * Jest test setup configuration
 * Sets up global test environment for GH200 Retrieval Router
 */

const path = require('path');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.REDIS_URL = 'redis://localhost:6379/15'; // Use test database
process.env.VECTOR_DB_PATH = path.join(__dirname, 'fixtures', 'test_vectors');
process.env.GRACE_MEMORY_SIZE = '1GB'; // Smaller for tests
process.env.NVLINK_ENABLED = 'false'; // Disable for unit tests

// Global test timeout
jest.setTimeout(30000);

// Optional dependencies are mocked via Jest moduleNameMapper

// Global test utilities
global.testHelpers = {
  createMockEmbedding: (dimension = 512) => {
    return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
  },
  
  createMockVectorData: (count = 100, dimension = 512) => {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      embedding: global.testHelpers.createMockEmbedding(dimension),
      metadata: {
        source: `document_${i + 1}`,
        timestamp: new Date().toISOString(),
        category: `category_${(i % 5) + 1}`
      }
    }));
  },
  
  waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  mockGraceMemory: () => ({
    total: 480 * 1024 * 1024 * 1024,
    used: 100 * 1024 * 1024 * 1024,
    free: 380 * 1024 * 1024 * 1024,
    pools: {
      embeddings: 300 * 1024 * 1024 * 1024,
      cache: 100 * 1024 * 1024 * 1024,
      workspace: 80 * 1024 * 1024 * 1024
    }
  })
};

// Clean up after tests
afterEach(() => {
  // Clear any test-specific mocks
  jest.clearAllMocks();
});

afterAll(() => {
  // Cleanup resources
  jest.restoreAllMocks();
});