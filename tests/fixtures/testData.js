/**
 * Test fixtures and mock data for GH200 Retrieval Router tests
 */

const testData = {
  // Sample embeddings for testing
  sampleEmbeddings: [
    {
      id: 1,
      embedding: Array.from({ length: 512 }, () => Math.random() * 2 - 1),
      metadata: {
        source: 'test_document_1.pdf',
        title: 'Introduction to Quantum Computing',
        author: 'Dr. Jane Smith',
        timestamp: '2025-01-01T00:00:00.000Z',
        category: 'quantum_physics'
      }
    },
    {
      id: 2,
      embedding: Array.from({ length: 512 }, () => Math.random() * 2 - 1),
      metadata: {
        source: 'test_document_2.pdf',
        title: 'Machine Learning Fundamentals',
        author: 'Prof. John Doe',
        timestamp: '2025-01-02T00:00:00.000Z',
        category: 'machine_learning'
      }
    },
    {
      id: 3,
      embedding: Array.from({ length: 512 }, () => Math.random() * 2 - 1),
      metadata: {
        source: 'test_document_3.pdf',
        title: 'Grace Hopper Architecture Guide',
        author: 'NVIDIA Technical Team',
        timestamp: '2025-01-03T00:00:00.000Z',
        category: 'hardware'
      }
    }
  ],

  // Mock queries for testing
  sampleQueries: [
    {
      text: 'What are the applications of quantum computing?',
      embedding: Array.from({ length: 512 }, () => Math.random() * 2 - 1),
      expectedCategories: ['quantum_physics']
    },
    {
      text: 'How does machine learning work?',
      embedding: Array.from({ length: 512 }, () => Math.random() * 2 - 1),
      expectedCategories: ['machine_learning']
    },
    {
      text: 'Grace Hopper unified memory architecture benefits',
      embedding: Array.from({ length: 512 }, () => Math.random() * 2 - 1),
      expectedCategories: ['hardware']
    }
  ],

  // Mock configuration for testing
  testConfig: {
    server: {
      port: 3001, // Different port for testing
      host: 'localhost'
    },
    vectorDatabase: {
      dimension: 512,
      metric: 'cosine',
      indexType: 'flat',
      memoryPoolSize: '1GB'
    },
    graceMemory: {
      enabled: false, // Disable for unit tests
      poolSize: '1GB',
      pools: {
        embeddings: '500MB',
        cache: '300MB',
        workspace: '200MB'
      }
    },
    nvlink: {
      enabled: false, // Disable for unit tests
      topology: 'single_node'
    },
    logging: {
      level: 'silent',
      format: 'json'
    }
  },

  // Mock API responses
  apiResponses: {
    health: {
      status: 'healthy',
      timestamp: '2025-01-01T00:00:00.000Z',
      version: '0.1.0',
      uptime: 3600,
      memory: {
        used: 100 * 1024 * 1024 * 1024,
        total: 480 * 1024 * 1024 * 1024
      },
      shards: {
        active: 1,
        total: 1,
        healthy: 1
      }
    },
    
    search: {
      query: 'quantum computing applications',
      results: [
        {
          id: 1,
          score: 0.95,
          metadata: {
            source: 'test_document_1.pdf',
            title: 'Introduction to Quantum Computing',
            author: 'Dr. Jane Smith'
          }
        },
        {
          id: 3,
          score: 0.87,
          metadata: {
            source: 'test_document_3.pdf',
            title: 'Grace Hopper Architecture Guide',
            author: 'NVIDIA Technical Team'
          }
        }
      ],
      totalResults: 2,
      processingTime: 45,
      retrievalMethod: 'cosine_similarity'
    },

    metrics: {
      timestamp: '2025-01-01T00:00:00.000Z',
      performance: {
        avgLatency: 45.2,
        throughput: 1250,
        memoryUtilization: 0.21,
        cacheHitRatio: 0.85
      },
      system: {
        graceMemory: {
          used: 100 * 1024 * 1024 * 1024,
          total: 480 * 1024 * 1024 * 1024,
          poolUtilization: {
            embeddings: 0.75,
            cache: 0.60,
            workspace: 0.25
          }
        },
        nvlink: {
          enabled: false,
          bandwidth: 0,
          utilization: 0
        }
      },
      database: {
        totalVectors: 1000000,
        dimensions: 512,
        shards: 1,
        indexType: 'flat'
      }
    }
  },

  // Error scenarios for testing
  errorScenarios: {
    invalidQuery: {
      error: 'INVALID_QUERY',
      message: 'Query text cannot be empty',
      statusCode: 400
    },
    
    vectorNotFound: {
      error: 'VECTOR_NOT_FOUND',
      message: 'Vector with ID 999999 not found',
      statusCode: 404
    },
    
    memoryExhausted: {
      error: 'MEMORY_EXHAUSTED',
      message: 'Grace memory pool exhausted',
      statusCode: 503
    },
    
    invalidEmbedding: {
      error: 'INVALID_EMBEDDING',
      message: 'Embedding dimension must be 512',
      statusCode: 400
    }
  },

  // Performance test data
  performanceTestData: {
    largeBatchQueries: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      text: `Performance test query ${i + 1}`,
      embedding: Array.from({ length: 512 }, () => Math.random() * 2 - 1)
    })),
    
    largeVectorSet: Array.from({ length: 10000 }, (_, i) => ({
      id: i + 1,
      embedding: Array.from({ length: 512 }, () => Math.random() * 2 - 1),
      metadata: {
        source: `perf_document_${i + 1}.pdf`,
        category: `category_${(i % 10) + 1}`,
        timestamp: new Date().toISOString()
      }
    }))
  }
};

module.exports = testData;