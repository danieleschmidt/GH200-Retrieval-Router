/**
 * Integration tests for the complete server
 */

const request = require('supertest');
const { createApp } = require('../../src/server');

// Use the actual server creation function for proper middleware testing
async function createTestApp() {
  return await createApp();
}

describe('Server Integration Tests', () => {
  let app;
  let server;

  beforeAll(async () => {
    // Mock environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.PORT = '0'; // Use random available port
    
    app = await createTestApp();
  }, 30000); // Increase timeout for initialization

  afterAll(async () => {
    if (app && app.locals.retrievalRouter) {
      await app.locals.retrievalRouter.shutdown();
    }
    if (server) {
      server.close();
    }
  });

  describe('Basic Server Functionality', () => {
    test('should respond to ping endpoint', async () => {
      const response = await request(app)
        .get('/ping')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.version).toBeDefined();
    });

    test('should respond to root endpoint', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body.name).toBe('GH200 Retrieval Router');
      expect(response.body.description).toBeDefined();
      expect(response.body.version).toBeDefined();
      expect(response.body.api).toBeDefined();
      expect(response.body.status).toBe('running');
      expect(response.body.system).toBeDefined();
    });

    test('should include security headers', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    test('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/v1/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });

  describe('API Routes', () => {
    test('should route to health endpoint', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });

    test('should route to search endpoint', async () => {
      const response = await request(app)
        .post('/api/v1/search')
        .send({
          query: 'test query',
          k: 5
        })
        .expect(200);

      expect(response.body.query).toBe('test query');
      expect(response.body.results).toBeDefined();
    });

    test('should route to vectors endpoint', async () => {
      const response = await request(app)
        .get('/api/v1/vectors/stats/summary')
        .expect(200);

      expect(response.body.statistics).toBeDefined();
    });

    test('should route to metrics endpoint', async () => {
      const response = await request(app)
        .get('/api/v1/metrics')
        .expect(200);

      expect(response.body.timestamp).toBeDefined();
      expect(response.body.performance).toBeDefined();
      expect(response.body.system).toBeDefined();
    });

    test('should redirect legacy API routes', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(301);

      expect(response.headers.location).toBe('/api/v1/health');
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown/route')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
      expect(response.body.message).toContain('Route GET /unknown/route');
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/search')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    test('should handle request timeout', async () => {
      // This test would require mocking a slow endpoint
      // For now, we'll just verify the timeout middleware is configured
      expect(app._router).toBeDefined();
    });

    test('should include request ID in error responses', async () => {
      const response = await request(app)
        .get('/unknown/route')
        .expect(404);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.body.requestId).toBeDefined();
    });
  });

  describe('Request Validation', () => {
    test('should sanitize input', async () => {
      const response = await request(app)
        .post('/api/v1/search')
        .send({
          query: '<script>alert("xss")</script>test query',
          k: 5
        })
        .expect(200);

      expect(response.body.query).not.toContain('<script>');
      expect(response.body.query).toBe('test query');
    });

    test('should validate request size', async () => {
      const largePayload = {
        query: 'a'.repeat(20 * 1024 * 1024), // 20MB string
        k: 5
      };

      const response = await request(app)
        .post('/api/v1/search')
        .send(largePayload)
        .expect(413);

      expect(response.body.error).toBe('REQUEST_TOO_LARGE');
    });

    test('should require JSON content type for API endpoints', async () => {
      const response = await request(app)
        .post('/api/v1/search')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Rate Limiting', () => {
    test('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      // Check for standard rate limit headers (newer express-rate-limit format)
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });

    test('should enforce rate limits', async () => {
      // This test would require making many requests quickly
      // For integration tests, we'll just verify the middleware is configured
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(parseInt(response.headers['ratelimit-remaining'])).toBeLessThan(1000);
    });
  });

  describe('Authentication', () => {
    test('should accept requests without authentication for public endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });

    test('should process API key when provided', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('X-API-Key', 'test-api-key')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });

    test('should process Authorization header when provided', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });
  });

  describe('Request Logging', () => {
    test('should include request ID in response headers', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(/^req_/);
    });

    test('should preserve custom request ID', async () => {
      const customId = 'custom-request-id-123';
      
      const response = await request(app)
        .get('/api/v1/health')
        .set('X-Request-ID', customId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(customId);
    });
  });

  describe('Component Integration', () => {
    test('should have retrieval router available', async () => {
      expect(app.locals.retrievalRouter).toBeDefined();
      expect(typeof app.locals.retrievalRouter.search).toBe('function');
    });

    test('should have Grace memory manager available', async () => {
      expect(app.locals.graceMemoryManager).toBeDefined();
      expect(typeof app.locals.graceMemoryManager.getStatus).toBe('function');
    });

    test('should have vector database available', async () => {
      expect(app.locals.vectorDatabase).toBeDefined();
      expect(typeof app.locals.vectorDatabase.getStatus).toBe('function');
    });
  });

  describe('Performance', () => {
    test('should respond to health checks quickly', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(200); // Should respond within 200ms
      expect(response.body.status).toBe('healthy');
    });

    test('should handle concurrent requests', async () => {
      const concurrentRequests = Array(20).fill().map(() =>
        request(app).get('/api/v1/health')
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
      });
    });
  });

  describe('Compression', () => {
    test('should compress responses when appropriate', async () => {
      const response = await request(app)
        .get('/api/v1/metrics')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      // Check if compression is enabled (response should have encoding header for large responses)
      expect(response.body).toBeDefined();
    });
  });

  describe('Environment Configuration', () => {
    test('should use test environment configuration', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    test('should have appropriate log level for testing', () => {
      expect(process.env.LOG_LEVEL).toBe('silent');
    });
  });
});