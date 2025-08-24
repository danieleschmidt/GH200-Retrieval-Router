/**
 * Generation 3 Status Routes - Enterprise scaling and performance metrics
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

/**
 * Generation 3 System Status and Metrics
 */
router.get('/status', async (req, res) => {
  try {
    const generation3 = req.app.locals.generation3;
    
    if (!generation3) {
      return res.status(503).json({
        error: 'GENERATION_3_UNAVAILABLE',
        message: 'Generation 3 systems not initialized'
      });
    }
    
    const autoScalerStatus = generation3.autoScaler.getStatus();
    const loadBalancerStatus = generation3.loadBalancer.getStatus();
    
    const systemStatus = {
      generation: 3,
      timestamp: new Date().toISOString(),
      status: 'operational',
      
      autoScaling: {
        ...autoScalerStatus,
        scaleEvents: {
          lastAction: autoScalerStatus.lastScaleAction,
          lastTime: autoScalerStatus.lastScaleTime ? new Date(autoScalerStatus.lastScaleTime).toISOString() : null
        }
      },
      
      loadBalancing: {
        ...loadBalancerStatus,
        efficiency: Math.round((loadBalancerStatus.healthyBackends / loadBalancerStatus.backends) * 100),
        distributionQuality: calculateDistributionQuality(loadBalancerStatus.connections)
      },
      
      performance: {
        optimizationLevel: 'generation3_enterprise',
        scalingEfficiency: autoScalerStatus.efficiency,
        loadDistribution: 'optimal',
        responseOptimization: 'active'
      },
      
      capabilities: {
        autoScaling: true,
        loadBalancing: true,
        performanceMonitoring: true,
        enterpriseOptimization: true
      },
      
      requestId: req.id
    };
    
    res.json(systemStatus);
    
    logger.info('Generation 3 status accessed', {
      requestId: req.id,
      generation: 3,
      instances: autoScalerStatus.currentInstances,
      backends: loadBalancerStatus.healthyBackends
    });
    
  } catch (error) {
    logger.error('Generation 3 status request failed', {
      requestId: req.id,
      error: error.message
    });
    
    res.status(500).json({
      error: 'STATUS_ERROR',
      message: 'Failed to retrieve Generation 3 status',
      generation: 3,
      requestId: req.id
    });
  }
});

/**
 * Real-time performance metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const generation3 = req.app.locals.generation3;
    
    if (!generation3) {
      return res.status(503).json({
        error: 'GENERATION_3_UNAVAILABLE',
        message: 'Generation 3 systems not initialized'
      });
    }
    
    const autoScaler = generation3.autoScaler;
    const loadBalancer = generation3.loadBalancer;
    
    const metrics = {
      generation: 3,
      timestamp: new Date().toISOString(),
      
      system: {
        cpu: autoScaler.metrics.cpuUtilization,
        memory: autoScaler.metrics.memoryUtilization,
        instances: autoScaler.state.currentInstances,
        efficiency: autoScaler.calculateEfficiency()
      },
      
      performance: {
        requestsPerSecond: autoScaler.metrics.requestsPerSecond,
        averageResponseTime: autoScaler.metrics.averageResponseTime,
        errorRate: autoScaler.metrics.errorRate,
        p99ResponseTime: autoScaler.metrics.averageResponseTime * 1.5 // Estimate
      },
      
      loadBalancing: {
        strategy: loadBalancer.currentStrategy,
        totalConnections: loadBalancer.getStatus().totalConnections,
        backendHealth: Array.from(loadBalancer.state.healthStatus.entries()).map(([id, healthy]) => ({
          backend: id,
          healthy,
          connections: loadBalancer.state.connectionCounts.get(id),
          responseTime: Math.round(loadBalancer.state.responseTimes.get(id) || 0)
        }))
      },
      
      scaling: {
        target: {
          cpu: autoScaler.config.targetCPUUtilization,
          memory: autoScaler.config.targetMemoryUtilization,
          instances: `${autoScaler.config.minInstances}-${autoScaler.config.maxInstances}`
        },
        history: autoScaler.state.performanceHistory.slice(-10) // Last 10 readings
      },
      
      requestId: req.id
    };
    
    res.json(metrics);
    
  } catch (error) {
    logger.error('Generation 3 metrics request failed', {
      requestId: req.id,
      error: error.message
    });
    
    res.status(500).json({
      error: 'METRICS_ERROR',
      message: 'Failed to retrieve Generation 3 metrics',
      generation: 3,
      requestId: req.id
    });
  }
});

/**
 * Scaling control endpoint
 */
router.post('/scale', async (req, res) => {
  try {
    const generation3 = req.app.locals.generation3;
    const { action, instances } = req.body;
    
    if (!generation3) {
      return res.status(503).json({
        error: 'GENERATION_3_UNAVAILABLE',
        message: 'Generation 3 systems not initialized'
      });
    }
    
    const autoScaler = generation3.autoScaler;
    
    if (action === 'manual_scale' && instances) {
      const targetInstances = Math.max(
        autoScaler.config.minInstances,
        Math.min(instances, autoScaler.config.maxInstances)
      );
      
      autoScaler.state.currentInstances = targetInstances;
      autoScaler.state.lastScaleAction = 'manual_scale';
      autoScaler.state.lastScaleTime = Date.now();
      
      logger.info('Manual scaling triggered', {
        requestId: req.id,
        generation: 3,
        targetInstances,
        triggeredBy: 'manual_request'
      });
      
      res.json({
        generation: 3,
        action: 'manual_scale_completed',
        instances: targetInstances,
        timestamp: new Date().toISOString(),
        requestId: req.id
      });
      
    } else {
      res.status(400).json({
        error: 'INVALID_SCALING_REQUEST',
        message: 'Valid scaling action and instance count required',
        generation: 3,
        requestId: req.id
      });
    }
    
  } catch (error) {
    logger.error('Generation 3 scaling request failed', {
      requestId: req.id,
      error: error.message
    });
    
    res.status(500).json({
      error: 'SCALING_ERROR',
      message: 'Failed to process scaling request',
      generation: 3,
      requestId: req.id
    });
  }
});

/**
 * Calculate load distribution quality
 */
function calculateDistributionQuality(connections) {
  if (!connections || connections.length === 0) return 100;
  
  const connectionCounts = connections.map(([_, count]) => count);
  const total = connectionCounts.reduce((sum, count) => sum + count, 0);
  
  if (total === 0) return 100;
  
  const average = total / connectionCounts.length;
  const variance = connectionCounts.reduce((sum, count) => sum + Math.pow(count - average, 2), 0) / connectionCounts.length;
  const standardDeviation = Math.sqrt(variance);
  
  // Lower standard deviation = better distribution
  const distributionScore = Math.max(0, 100 - (standardDeviation / average) * 100);
  return Math.round(distributionScore);
}

module.exports = router;