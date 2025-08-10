/**
 * Metrics and monitoring routes for GH200 Retrieval Router
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

/**
 * Get current system metrics
 */
router.get('/', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      performance: {},
      system: {},
      database: {}
    };

    // Get performance metrics
    if (req.app.locals.retrievalRouter) {
      try {
        metrics.performance = await req.app.locals.retrievalRouter.getPerformanceMetrics();
      } catch (error) {
        logger.warn('Failed to get performance metrics', { error: error.message });
        metrics.performance = { status: 'unavailable' };
      }
    }

    // Get system metrics
    metrics.system = {
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external,
        rss: process.memoryUsage().rss
      },
      uptime: process.uptime(),
      loadAverage: require('os').loadavg(),
      cpuUsage: process.cpuUsage()
    };

    // Get Grace memory metrics if available
    if (req.app.locals.graceMemoryManager) {
      try {
        metrics.system.graceMemory = await req.app.locals.graceMemoryManager.getMetrics();
      } catch (error) {
        logger.warn('Failed to get Grace memory metrics', { error: error.message });
        metrics.system.graceMemory = { status: 'unavailable' };
      }
    }

    // Get vector database metrics
    if (req.app.locals.vectorDatabase) {
      try {
        metrics.database = await req.app.locals.vectorDatabase.getMetrics();
      } catch (error) {
        logger.warn('Failed to get database metrics', { error: error.message });
        metrics.database = { status: 'unavailable' };
      }
    }

    res.json(metrics);

  } catch (error) {
    logger.error('Failed to collect metrics', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'METRICS_COLLECTION_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get Prometheus-format metrics
 */
router.get('/prometheus', async (req, res) => {
  try {
    // Set appropriate content type for Prometheus
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');

    let prometheusMetrics = '';

    // System metrics
    const memUsage = process.memoryUsage();
    prometheusMetrics += `# HELP gh200_memory_usage_bytes Memory usage in bytes\n`;
    prometheusMetrics += `# TYPE gh200_memory_usage_bytes gauge\n`;
    prometheusMetrics += `gh200_memory_usage_bytes{type="heap_used"} ${memUsage.heapUsed}\n`;
    prometheusMetrics += `gh200_memory_usage_bytes{type="heap_total"} ${memUsage.heapTotal}\n`;
    prometheusMetrics += `gh200_memory_usage_bytes{type="external"} ${memUsage.external}\n`;
    prometheusMetrics += `gh200_memory_usage_bytes{type="rss"} ${memUsage.rss}\n`;

    prometheusMetrics += `# HELP gh200_uptime_seconds Process uptime in seconds\n`;
    prometheusMetrics += `# TYPE gh200_uptime_seconds counter\n`;
    prometheusMetrics += `gh200_uptime_seconds ${process.uptime()}\n`;

    // Performance metrics from retrieval router
    if (req.app.locals.retrievalRouter) {
      try {
        const perfMetrics = await req.app.locals.retrievalRouter.getPerformanceMetrics();
        
        if (perfMetrics.avgLatency !== undefined) {
          prometheusMetrics += `# HELP gh200_query_latency_ms Average query latency in milliseconds\n`;
          prometheusMetrics += `# TYPE gh200_query_latency_ms gauge\n`;
          prometheusMetrics += `gh200_query_latency_ms ${perfMetrics.avgLatency}\n`;
        }

        if (perfMetrics.throughput !== undefined) {
          prometheusMetrics += `# HELP gh200_throughput_qps Queries per second throughput\n`;
          prometheusMetrics += `# TYPE gh200_throughput_qps gauge\n`;
          prometheusMetrics += `gh200_throughput_qps ${perfMetrics.throughput}\n`;
        }

        if (perfMetrics.cacheHitRatio !== undefined) {
          prometheusMetrics += `# HELP gh200_cache_hit_ratio Cache hit ratio (0-1)\n`;
          prometheusMetrics += `# TYPE gh200_cache_hit_ratio gauge\n`;
          prometheusMetrics += `gh200_cache_hit_ratio ${perfMetrics.cacheHitRatio}\n`;
        }
      } catch (error) {
        logger.warn('Failed to get performance metrics for Prometheus', { error: error.message });
      }
    }

    // Grace memory metrics
    if (req.app.locals.graceMemoryManager) {
      try {
        const graceMetrics = await req.app.locals.graceMemoryManager.getMetrics();
        
        if (graceMetrics.used !== undefined && graceMetrics.total !== undefined) {
          prometheusMetrics += `# HELP gh200_grace_memory_bytes Grace memory usage in bytes\n`;
          prometheusMetrics += `# TYPE gh200_grace_memory_bytes gauge\n`;
          prometheusMetrics += `gh200_grace_memory_bytes{type="used"} ${graceMetrics.used}\n`;
          prometheusMetrics += `gh200_grace_memory_bytes{type="total"} ${graceMetrics.total}\n`;
          prometheusMetrics += `gh200_grace_memory_bytes{type="free"} ${graceMetrics.total - graceMetrics.used}\n`;
        }

        if (graceMetrics.poolUtilization) {
          Object.entries(graceMetrics.poolUtilization).forEach(([pool, utilization]) => {
            prometheusMetrics += `# HELP gh200_grace_pool_utilization Grace memory pool utilization ratio\n`;
            prometheusMetrics += `# TYPE gh200_grace_pool_utilization gauge\n`;
            prometheusMetrics += `gh200_grace_pool_utilization{pool="${pool}"} ${utilization}\n`;
          });
        }
      } catch (error) {
        logger.warn('Failed to get Grace memory metrics for Prometheus', { error: error.message });
      }
    }

    // Vector database metrics
    if (req.app.locals.vectorDatabase) {
      try {
        const dbMetrics = await req.app.locals.vectorDatabase.getMetrics();
        
        if (dbMetrics.totalVectors !== undefined) {
          prometheusMetrics += `# HELP gh200_vector_count Total number of vectors in database\n`;
          prometheusMetrics += `# TYPE gh200_vector_count gauge\n`;
          prometheusMetrics += `gh200_vector_count ${dbMetrics.totalVectors}\n`;
        }

        if (dbMetrics.indexSize !== undefined) {
          prometheusMetrics += `# HELP gh200_index_size_bytes Vector index size in bytes\n`;
          prometheusMetrics += `# TYPE gh200_index_size_bytes gauge\n`;
          prometheusMetrics += `gh200_index_size_bytes ${dbMetrics.indexSize}\n`;
        }

        if (dbMetrics.shardCount !== undefined) {
          prometheusMetrics += `# HELP gh200_shard_count Number of database shards\n`;
          prometheusMetrics += `# TYPE gh200_shard_count gauge\n`;
          prometheusMetrics += `gh200_shard_count ${dbMetrics.shardCount}\n`;
        }
      } catch (error) {
        logger.warn('Failed to get database metrics for Prometheus', { error: error.message });
      }
    }

    res.send(prometheusMetrics);

  } catch (error) {
    logger.error('Failed to generate Prometheus metrics', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).send('# Error generating metrics\n');
  }
});

/**
 * Get performance analytics
 */
router.get('/performance', async (req, res) => {
  try {
    const { timeRange = '1h', granularity = '1m' } = req.query;

    if (!req.app.locals.retrievalRouter) {
      return res.status(503).json({
        error: 'RETRIEVAL_SERVICE_UNAVAILABLE',
        message: 'Retrieval router not initialized'
      });
    }

    const analytics = await req.app.locals.retrievalRouter.getPerformanceAnalytics({
      timeRange,
      granularity
    });

    res.json({
      timeRange,
      granularity,
      analytics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get performance analytics', {
      error: error.message,
      stack: error.stack,
      timeRange: req.query.timeRange,
      granularity: req.query.granularity
    });

    res.status(500).json({
      error: 'ANALYTICS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get Grace memory detailed metrics
 */
router.get('/grace-memory', async (req, res) => {
  try {
    if (!req.app.locals.graceMemoryManager) {
      return res.status(503).json({
        error: 'GRACE_MEMORY_UNAVAILABLE',
        message: 'Grace memory manager not initialized'
      });
    }

    const graceMetrics = await req.app.locals.graceMemoryManager.getDetailedMetrics();

    res.json({
      graceMemory: graceMetrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get Grace memory metrics', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'GRACE_MEMORY_METRICS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get NVLink metrics
 */
router.get('/nvlink', async (req, res) => {
  try {
    if (!req.app.locals.retrievalRouter) {
      return res.status(503).json({
        error: 'RETRIEVAL_SERVICE_UNAVAILABLE',
        message: 'Retrieval router not initialized'
      });
    }

    const nvlinkMetrics = await req.app.locals.retrievalRouter.getNVLinkMetrics();

    res.json({
      nvlink: nvlinkMetrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get NVLink metrics', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'NVLINK_METRICS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;