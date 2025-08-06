/**
 * Integration tests for health check API endpoints
 */

const request = require('supertest');
const express = require('express');
const healthRoutes = require('../../../src/routes/health');
const testData = require('../../fixtures/testData');

describe('Health API Integration Tests', () => {
  let app;
  let mockGraceMemoryManager;
  let mockVectorDatabase;
  let mockRetrievalRouter;

  beforeEach(() => {
    // Create Express app for testing
    app = express();
    app.use(express.json());

    // Mock components
    mockGraceMemoryManager = {
      getStatus: jest.fn(),
      healthCheck: jest.fn(),
      isReady: jest.fn()
    };

    mockVectorDatabase = {
      getStatus: jest.fn(),
      healthCheck: jest.fn(),
      isReady: jest.fn()
    };

    mockRetrievalRouter = {
      healthCheck: jest.fn()
    };

    // Set up app locals
    app.locals.graceMemoryManager = mockGraceMemoryManager;
    app.locals.vectorDatabase = mockVectorDatabase;
    app.locals.retrievalRouter = mockRetrievalRouter;

    // Use health routes
    app.use('/health', healthRoutes);

    // Error handling
    app.use((error, req, res, next) => {
      res.status(error.statusCode || 500).json({
        error: error.code || 'INTERNAL_ERROR',
        message: error.message
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    test('should return basic health status', async () => {
      const mockGraceStatus = {
        total: 480 * 1024 * 1024 * 1024,
        used: 100 * 1024 * 1024 * 1024,
        free: 380 * 1024 * 1024 * 1024
      };

      const mockDbStatus = {
        vectorCount: 1000000,
        indexType: 'flat',
        ready: true
      };

      mockGraceMemoryManager.getStatus.mockResolvedValue(mockGraceStatus);
      mockVectorDatabase.getStatus.mockResolvedValue(mockDbStatus);

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.version).toBeDefined();
      expect(response.body.uptime).toBeGreaterThan(0);
      expect(response.body.memory).toBeDefined();
      expect(response.body.system).toBeDefined();
      expect(response.body.graceMemory).toEqual(mockGraceStatus);
      expect(response.body.vectorDatabase).toEqual(mockDbStatus);
    });

    test('should handle missing Grace memory manager', async () => {
      app.locals.graceMemoryManager = null;

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.graceMemory).toBeUndefined();
    });

    test('should handle missing vector database', async () => {
      app.locals.vectorDatabase = null;

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.vectorDatabase).toBeUndefined();
    });

    test('should handle Grace memory manager errors', async () => {
      mockGraceMemoryManager.getStatus.mockRejectedValue(new Error('Grace memory unavailable'));

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.graceMemory.status).toBe('unavailable');
    });

    test('should handle vector database errors', async () => {
      mockVectorDatabase.getStatus.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.vectorDatabase.status).toBe('unavailable');
    });

    test('should handle internal health check errors', async () => {
      // Mock process methods to throw errors
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockImplementation(() => {
        throw new Error('Memory check failed');
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.error).toBe('Internal service error');

      // Restore original method
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('GET /health/detailed', () => {
    test('should return detailed component health status', async () => {
      const mockVectorDbHealth = {
        healthy: true,
        vectorCount: 1000000,
        indexSize: 2048000000,
        lastIndexUpdate: new Date().toISOString()
      };

      const mockGraceMemoryHealth = {
        healthy: true,
        totalMemory: 480 * 1024 * 1024 * 1024,
        usedMemory: 100 * 1024 * 1024 * 1024,
        poolUtilization: 0.75
      };

      const mockRouterHealth = {
        healthy: true,
        activeShards: 1,
        averageLatency: 45.2
      };

      mockVectorDatabase.healthCheck.mockResolvedValue(mockVectorDbHealth);
      mockGraceMemoryManager.healthCheck.mockResolvedValue(mockGraceMemoryHealth);
      mockRetrievalRouter.healthCheck.mockResolvedValue(mockRouterHealth);

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.components.vectorDatabase.status).toBe('healthy');
      expect(response.body.components.vectorDatabase.details).toEqual(mockVectorDbHealth);
      expect(response.body.components.graceMemory.status).toBe('healthy');
      expect(response.body.components.graceMemory.details).toEqual(mockGraceMemoryHealth);
      expect(response.body.components.retrievalRouter.status).toBe('healthy');
      expect(response.body.components.retrievalRouter.details).toEqual(mockRouterHealth);
    });

    test('should return degraded status when some components are unhealthy', async () => {
      const mockVectorDbHealth = {
        healthy: false,
        error: 'Index corruption detected'
      };

      const mockGraceMemoryHealth = {
        healthy: true,
        totalMemory: 480 * 1024 * 1024 * 1024
      };

      const mockRouterHealth = {
        healthy: true
      };

      mockVectorDatabase.healthCheck.mockResolvedValue(mockVectorDbHealth);
      mockGraceMemoryManager.healthCheck.mockResolvedValue(mockGraceMemoryHealth);
      mockRetrievalRouter.healthCheck.mockResolvedValue(mockRouterHealth);

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('degraded');
      expect(response.body.components.vectorDatabase.status).toBe('unhealthy');
      expect(response.body.components.graceMemory.status).toBe('healthy');
    });

    test('should return unhealthy status when critical components fail', async () => {
      mockVectorDatabase.healthCheck.mockRejectedValue(new Error('Database unavailable'));
      mockGraceMemoryManager.healthCheck.mockRejectedValue(new Error('Memory system failure'));

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.components.vectorDatabase.status).toBe('unhealthy');
      expect(response.body.components.graceMemory.status).toBe('unhealthy');
    });

    test('should handle missing components gracefully', async () => {
      app.locals.vectorDatabase = null;
      app.locals.graceMemoryManager = null;
      app.locals.retrievalRouter = null;

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.components).toEqual({});
    });

    test('should handle health check system failure', async () => {
      // Test the catch block by making all components throw and verifying response
      mockVectorDatabase.healthCheck.mockRejectedValue(new Error('Database failure'));
      mockGraceMemoryManager.healthCheck.mockRejectedValue(new Error('Memory failure'));
      mockRetrievalRouter.healthCheck.mockRejectedValue(new Error('Router failure'));

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      // Verify that all components are marked unhealthy
      expect(response.body.components.vectorDatabase.status).toBe('unhealthy');
      expect(response.body.components.graceMemory.status).toBe('unhealthy');
      expect(response.body.components.retrievalRouter.status).toBe('unhealthy');
    });
  });

  describe('GET /health/ready', () => {
    test('should return ready when all components are ready', async () => {
      mockVectorDatabase.isReady.mockResolvedValue(true);
      mockGraceMemoryManager.isReady.mockResolvedValue(true);

      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.timestamp).toBeDefined();
    });

    test('should return not ready when components are not ready', async () => {
      mockVectorDatabase.isReady.mockResolvedValue(false);
      mockGraceMemoryManager.isReady.mockResolvedValue(true);

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      expect(response.body.status).toBe('not_ready');
    });

    test('should handle readiness check errors', async () => {
      mockVectorDatabase.isReady.mockRejectedValue(new Error('Readiness check failed'));

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      expect(response.body.status).toBe('not_ready');
      expect(response.body.error).toBe('Readiness check failed');
    });

    test('should handle missing components in readiness check', async () => {
      app.locals.vectorDatabase = null;
      app.locals.graceMemoryManager = null;

      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
    });
  });

  describe('GET /health/live', () => {
    test('should always return alive for liveness probe', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body.status).toBe('alive');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeGreaterThan(0);
    });

    test('should return alive even when other components fail', async () => {
      mockVectorDatabase.healthCheck.mockRejectedValue(new Error('Database down'));
      mockGraceMemoryManager.healthCheck.mockRejectedValue(new Error('Memory failure'));

      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body.status).toBe('alive');
    });
  });

  describe('Error Scenarios', () => {
    test('should handle malformed requests gracefully', async () => {
      const response = await request(app)
        .get('/health/invalid-endpoint')
        .expect(404);

      expect(response.status).toBe(404);
    });

    test('should handle high load scenarios', async () => {
      // Simulate high load by making multiple concurrent requests
      const concurrentRequests = Array(20).fill().map(() =>
        request(app).get('/health')
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
      });
    });

    test('should handle timeout scenarios', async () => {
      // Mock a slow health check
      mockVectorDatabase.getStatus.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ status: 'healthy' }), 100))
      );

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });
  });

  describe('Response Format Validation', () => {
    test('should include all required fields in basic health response', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('system');

      expect(response.body.memory).toHaveProperty('used');
      expect(response.body.memory).toHaveProperty('total');
      expect(response.body.system).toHaveProperty('nodeVersion');
      expect(response.body.system).toHaveProperty('platform');
    });

    test('should include timestamp in ISO format', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });

    test('should include numeric uptime', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThan(0);
    });
  });

  describe('Performance Tests', () => {
    test('should respond quickly to health checks', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(100); // Should respond within 100ms
      expect(response.body.status).toBe('healthy');
    });

    test('should handle burst of health check requests', async () => {
      const startTime = Date.now();
      
      const burstRequests = Array(50).fill().map(() =>
        request(app).get('/health')
      );

      const responses = await Promise.all(burstRequests);
      const totalTime = Date.now() - startTime;

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
      });

      expect(totalTime).toBeLessThan(2000); // All 50 requests should complete within 2 seconds
    });
  });
});