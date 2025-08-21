/**
 * Integration tests for search API endpoints
 */

const request = require('supertest');
const express = require('express');
const searchRoutes = require('../../../src/routes/search');
const testData = require('../../fixtures/testData');

describe('Search API Integration Tests', () => {
  let app;
  let mockRetrievalRouter;

  beforeEach(() => {
    // Create Express app for testing
    app = express();
    app.use(express.json());

    // Mock retrieval router
    mockRetrievalRouter = {
      search: jest.fn(),
      batchSearch: jest.fn(),
      hybridSearch: jest.fn(),
      retrieveAndGenerate: jest.fn()
    };

    // Set up app locals
    app.locals.retrievalRouter = mockRetrievalRouter;

    // Use search routes
    app.use('/search', searchRoutes);

    // Error handling middleware
    app.use((error, req, res, next) => {
      console.error('Test error handler:', error.message);
      res.status(error.statusCode || 500).json({
        error: error.code || 'INTERNAL_ERROR',
        message: error.message
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /search', () => {
    test('should perform successful text search', async () => {
      const mockResults = {
        results: testData.apiResponses.search.results,
        total: 2,
        method: 'cosine_similarity'
      };

      mockRetrievalRouter.search.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/search')
        .send({
          query: 'quantum computing applications',
          k: 2
        })
        .expect(200);

      expect(response.body.query).toBe('quantum computing applications');
      expect(response.body.results).toHaveLength(2);
      expect(response.body.totalResults).toBe(2);
      expect(response.body.processingTime).toBeDefined();
      expect(response.body.retrievalMethod).toBe('cosine_similarity');

      expect(mockRetrievalRouter.search).toHaveBeenCalledWith({
        query: 'quantum computing applications',
        k: 2,
        filters: {},
        options: {}
      });
    });

    test('should perform successful embedding search', async () => {
      const mockResults = {
        results: testData.apiResponses.search.results,
        total: 2,
        method: 'cosine_similarity'
      };

      mockRetrievalRouter.search.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/search')
        .send({
          query: testData.sampleQueries[0].embedding,
          k: 2
        })
        .expect(200);

      expect(response.body.results).toHaveLength(2);
      expect(mockRetrievalRouter.search).toHaveBeenCalled();
    });

    test('should apply filters correctly', async () => {
      const mockResults = {
        results: testData.apiResponses.search.results.filter(r => 
          r.metadata.category === 'quantum_physics'
        ),
        total: 1,
        method: 'cosine_similarity'
      };

      mockRetrievalRouter.search.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/search')
        .send({
          query: 'quantum computing',
          k: 10,
          filters: {
            category: 'quantum_physics'
          }
        })
        .expect(200);

      expect(mockRetrievalRouter.search).toHaveBeenCalledWith({
        query: 'quantum computing',
        k: 10,
        filters: { category: 'quantum_physics' },
        options: {}
      });
    });

    test('should validate query parameter', async () => {
      const response = await request(app)
        .post('/search')
        .send({
          k: 5
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should validate k parameter range', async () => {
      const response = await request(app)
        .post('/search')
        .send({
          query: 'test query',
          k: 2000 // Exceeds maximum
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should handle retrieval router unavailable', async () => {
      // Remove retrieval router
      app.locals.retrievalRouter = null;

      const response = await request(app)
        .post('/search')
        .send({
          query: 'test query',
          k: 5
        })
        .expect(503);

      expect(response.body.error).toBe('RETRIEVAL_SERVICE_UNAVAILABLE');
    });

    test('should handle search errors', async () => {
      mockRetrievalRouter.search.mockRejectedValue(new Error('Index unavailable'));

      const response = await request(app)
        .post('/search')
        .send({
          query: 'test query',
          k: 5
        })
        .expect(500);

      expect(response.body.error).toBe('SEARCH_ERROR');
      expect(response.body.message).toBe('Index unavailable');
    });

    test('should handle memory errors', async () => {
      const memoryError = new Error('Grace memory exhausted');
      memoryError.name = 'MemoryError';
      mockRetrievalRouter.search.mockRejectedValue(memoryError);

      const response = await request(app)
        .post('/search')
        .send({
          query: 'test query',
          k: 5
        })
        .expect(503);

      expect(response.body.error).toBe('MEMORY_EXHAUSTED');
    });
  });

  describe('POST /search/batch', () => {
    test('should perform successful batch search', async () => {
      const queries = ['query 1', 'query 2', 'query 3'];
      const mockResults = queries.map((query, index) => ({
        query,
        results: testData.apiResponses.search.results.slice(0, 2),
        total: 2
      }));

      mockRetrievalRouter.batchSearch.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/search/batch')
        .send({
          queries,
          k: 2
        })
        .expect(200);

      expect(response.body.results).toHaveLength(3);
      expect(response.body.totalQueries).toBe(3);
      expect(response.body.processingTime).toBeDefined();

      expect(mockRetrievalRouter.batchSearch).toHaveBeenCalledWith({
        queries,
        k: 2,
        filters: {},
        options: {}
      });
    });

    test('should validate batch size limits', async () => {
      const tooManyQueries = Array(150).fill('test query');

      const response = await request(app)
        .post('/search/batch')
        .send({
          queries: tooManyQueries,
          k: 5
        })
        .expect(400);

      expect(response.body.error).toBe('BATCH_SIZE_EXCEEDED');
    });

    test('should validate empty queries array', async () => {
      const response = await request(app)
        .post('/search/batch')
        .send({
          queries: [],
          k: 5
        })
        .expect(400);

      expect(response.body.error).toBe('INVALID_BATCH_REQUEST');
    });

    test('should handle batch search errors', async () => {
      mockRetrievalRouter.batchSearch.mockRejectedValue(new Error('Batch processing failed'));

      const response = await request(app)
        .post('/search/batch')
        .send({
          queries: ['query 1', 'query 2'],
          k: 5
        })
        .expect(500);

      expect(response.body.error).toBe('BATCH_SEARCH_ERROR');
    });
  });

  describe('POST /search/hybrid', () => {
    test('should perform successful hybrid search', async () => {
      const mockResults = {
        results: testData.apiResponses.search.results,
        total: 2,
        method: 'hybrid'
      };

      mockRetrievalRouter.hybridSearch.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/search/hybrid')
        .send({
          query: 'quantum computing',
          k: 2,
          alpha: 0.8
        })
        .expect(200);

      expect(response.body.retrievalMethod).toBe('hybrid');
      expect(response.body.hybridWeights.dense).toBe(0.8);
      expect(response.body.hybridWeights.sparse).toBe(0.2);

      expect(mockRetrievalRouter.hybridSearch).toHaveBeenCalledWith({
        query: 'quantum computing',
        k: 2,
        alpha: 0.8,
        filters: {},
        options: {}
      });
    });

    test('should use default alpha value', async () => {
      const mockResults = {
        results: testData.apiResponses.search.results,
        total: 2,
        method: 'hybrid'
      };

      mockRetrievalRouter.hybridSearch.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/search/hybrid')
        .send({
          query: 'test query',
          k: 5
        })
        .expect(200);

      expect(response.body.hybridWeights.dense).toBe(0.7);
      expect(response.body.hybridWeights.sparse).toBe(0.3);
    });

    test('should validate alpha parameter range', async () => {
      const response = await request(app)
        .post('/search/hybrid')
        .send({
          query: 'test query',
          k: 5,
          alpha: 1.5 // Invalid alpha > 1
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /search/rag', () => {
    test('should perform successful RAG search', async () => {
      const mockResults = {
        response: 'Generated response based on retrieved documents',
        retrievedDocuments: testData.apiResponses.search.results,
        citations: ['doc1', 'doc2']
      };

      mockRetrievalRouter.retrieveAndGenerate.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/search/rag')
        .send({
          query: 'What is quantum computing?',
          k: 3,
          model: 'llama3-70b',
          temperature: 0.7
        })
        .expect(200);

      expect(response.body.response).toBe('Generated response based on retrieved documents');
      expect(response.body.retrievedDocuments).toHaveLength(2);
      expect(response.body.citations).toEqual(['doc1', 'doc2']);

      expect(mockRetrievalRouter.retrieveAndGenerate).toHaveBeenCalledWith({
        query: 'What is quantum computing?',
        k: 3,
        model: 'llama3-70b',
        temperature: 0.7,
        maxTokens: 512,
        filters: {},
        options: {}
      });
    });

    test('should use default model parameters', async () => {
      const mockResults = {
        response: 'Generated response',
        retrievedDocuments: [],
        citations: []
      };

      mockRetrievalRouter.retrieveAndGenerate.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/search/rag')
        .send({
          query: 'test query'
        })
        .expect(200);

      expect(mockRetrievalRouter.retrieveAndGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'llama3-70b',
          temperature: 0.7,
          maxTokens: 512
        })
      );
    });

    test('should validate model parameter', async () => {
      const response = await request(app)
        .post('/search/rag')
        .send({
          query: 'test query',
          model: 'invalid-model'
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should validate temperature range', async () => {
      const response = await request(app)
        .post('/search/rag')
        .send({
          query: 'test query',
          temperature: 3.0 // Invalid temperature > 2
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should handle RAG generation errors', async () => {
      mockRetrievalRouter.retrieveAndGenerate.mockRejectedValue(new Error('Generation failed'));

      const response = await request(app)
        .post('/search/rag')
        .send({
          query: 'test query'
        })
        .expect(500);

      expect(response.body.error).toBe('RAG_ERROR');
    });
  });

  describe('Performance Tests', () => {
    test('should handle concurrent searches', async () => {
      const mockResults = {
        results: testData.apiResponses.search.results,
        total: 2,
        method: 'cosine_similarity'
      };

      mockRetrievalRouter.search.mockResolvedValue(mockResults);

      const concurrentRequests = Array(10).fill().map(() =>
        request(app)
          .post('/search')
          .send({
            query: 'concurrent test',
            k: 5
          })
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
      });

      expect(mockRetrievalRouter.search).toHaveBeenCalledTimes(10);
    });

    test('should include processing time in response', async () => {
      const mockResults = {
        results: testData.apiResponses.search.results,
        total: 2,
        method: 'cosine_similarity'
      };

      mockRetrievalRouter.search.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(mockResults), 50))
      );

      const response = await request(app)
        .post('/search')
        .send({
          query: 'performance test',
          k: 5
        })
        .expect(200);

      expect(response.body.processingTime).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Content Type Validation', () => {
    test('should require JSON content type', async () => {
      const response = await request(app)
        .post('/search')
        .set('Content-Type', 'text/plain')
        .send('invalid content')
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    test('should accept application/json', async () => {
      const mockResults = {
        results: [],
        total: 0,
        method: 'cosine_similarity'
      };

      mockRetrievalRouter.search.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/search')
        .set('Content-Type', 'application/json')
        .send({
          query: 'test',
          k: 1
        })
        .expect(200);

      expect(response.body.results).toBeDefined();
    });
  });
});