/**
 * Health check routes for GH200 Retrieval Router
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * Basic health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external,
        rss: process.memoryUsage().rss
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cpus: require('os').cpus().length,
        loadAverage: require('os').loadavg()
      }
    };

    // Add Grace memory status if available
    if (req.app.locals.graceMemoryManager) {
      try {
        healthStatus.graceMemory = await req.app.locals.graceMemoryManager.getStatus();
      } catch (error) {
        logger.warn('Failed to get Grace memory status', { error: error.message });
        healthStatus.graceMemory = { status: 'unavailable' };
      }
    }

    // Add vector database status if available
    if (req.app.locals.vectorDatabase) {
      try {
        healthStatus.vectorDatabase = await req.app.locals.vectorDatabase.getStatus();
      } catch (error) {
        logger.warn('Failed to get vector database status', { error: error.message });
        healthStatus.vectorDatabase = { status: 'unavailable' };
      }
    }

    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', { error: error.message, stack: error.stack });
    res.status(503).json({
      status: 'unhealthy',
      error: 'Internal service error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Detailed health check with component status
 */
router.get('/detailed', async (req, res) => {
  try {
    const components = {};
    let overallStatus = 'healthy';

    // Check vector database
    if (req.app.locals.vectorDatabase) {
      try {
        const dbStatus = await req.app.locals.vectorDatabase.healthCheck();
        components.vectorDatabase = {
          status: dbStatus.healthy ? 'healthy' : 'unhealthy',
          details: dbStatus
        };
        if (!dbStatus.healthy) overallStatus = 'degraded';
      } catch (error) {
        components.vectorDatabase = {
          status: 'unhealthy',
          error: error.message
        };
        overallStatus = 'unhealthy';
      }
    }

    // Check Grace memory manager
    if (req.app.locals.graceMemoryManager) {
      try {
        const memStatus = await req.app.locals.graceMemoryManager.healthCheck();
        components.graceMemory = {
          status: memStatus.healthy ? 'healthy' : 'unhealthy',
          details: memStatus
        };
        if (!memStatus.healthy) overallStatus = 'degraded';
      } catch (error) {
        components.graceMemory = {
          status: 'unhealthy',
          error: error.message
        };
        overallStatus = 'unhealthy';
      }
    }

    // Check retrieval router
    if (req.app.locals.retrievalRouter) {
      try {
        const routerStatus = await req.app.locals.retrievalRouter.healthCheck();
        components.retrievalRouter = {
          status: routerStatus.healthy ? 'healthy' : 'unhealthy',
          details: routerStatus
        };
        if (!routerStatus.healthy) overallStatus = 'degraded';
      } catch (error) {
        components.retrievalRouter = {
          status: 'unhealthy',
          error: error.message
        };
        overallStatus = 'unhealthy';
      }
    }

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      components
    };

    const statusCode = overallStatus === 'unhealthy' ? 503 : 
                      overallStatus === 'degraded' ? 200 : 200;

    res.status(statusCode).json(response);
  } catch (error) {
    logger.error('Detailed health check failed', { error: error.message, stack: error.stack });
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check system failure',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Readiness probe for Kubernetes
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if all critical components are ready
    const readyChecks = [];

    if (req.app.locals.vectorDatabase) {
      readyChecks.push(req.app.locals.vectorDatabase.isReady());
    }

    if (req.app.locals.graceMemoryManager) {
      readyChecks.push(req.app.locals.graceMemoryManager.isReady());
    }

    const results = await Promise.all(readyChecks);
    const allReady = results.every(ready => ready === true);

    if (allReady) {
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', { error: error.message });
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness probe for Kubernetes
 */
router.get('/live', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;