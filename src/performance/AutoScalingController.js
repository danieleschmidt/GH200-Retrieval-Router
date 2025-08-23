/**
 * Auto-scaling controller for dynamic resource management
 */

const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');

class AutoScalingController extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      minInstances: options.minInstances || 1,
      maxInstances: options.maxInstances || 32,
      targetCPUUtilization: options.targetCPUUtilization || 70,
      targetMemoryUtilization: options.targetMemoryUtilization || 80,
      scaleUpThreshold: options.scaleUpThreshold || 85,
      scaleDownThreshold: options.scaleDownThreshold || 30,
      evaluationPeriod: options.evaluationPeriod || 300000, // 5 minutes
      cooldownPeriod: options.cooldownPeriod || 600000, // 10 minutes
      ...options
    };
    
    this.instances = new Map();
    this.metrics = {
      cpuUtilization: [],
      memoryUtilization: [],
      throughput: [],
      responseTime: []
    };
    
    this.lastScalingAction = 0;
    this.evaluationTimer = null;
    this.isRunning = false;
  }

  async initialize() {
    logger.info('Initializing Auto-scaling Controller', {
      minInstances: this.config.minInstances,
      maxInstances: this.config.maxInstances,
      evaluationPeriod: this.config.evaluationPeriod
    });

    // Start with minimum instances
    for (let i = 0; i < this.config.minInstances; i++) {
      await this.addInstance(`instance-${i}`);
    }

    this.startEvaluationLoop();
    this.isRunning = true;
    
    logger.info('Auto-scaling Controller initialized', {
      activeInstances: this.instances.size
    });
  }

  startEvaluationLoop() {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
    }

    this.evaluationTimer = setInterval(async () => {
      await this.evaluateScaling();
    }, this.config.evaluationPeriod);
  }

  async evaluateScaling() {
    if (!this.isRunning) return;

    const now = Date.now();
    const timeSinceLastAction = now - this.lastScalingAction;

    // Don't scale if we're in cooldown period
    if (timeSinceLastAction < this.config.cooldownPeriod) {
      logger.debug('Auto-scaling in cooldown period', {
        timeRemaining: this.config.cooldownPeriod - timeSinceLastAction
      });
      return;
    }

    const currentMetrics = this.getAverageMetrics();
    const decision = this.makeScalingDecision(currentMetrics);

    if (decision.action !== 'none') {
      await this.executeScalingDecision(decision);
      this.lastScalingAction = now;
    }
  }

  makeScalingDecision(metrics) {
    const currentInstances = this.instances.size;
    
    // Scale up if CPU or memory utilization is high
    if (metrics.cpuUtilization > this.config.scaleUpThreshold || 
        metrics.memoryUtilization > this.config.scaleUpThreshold) {
      
      if (currentInstances < this.config.maxInstances) {
        const recommendedInstances = Math.min(
          this.config.maxInstances,
          Math.ceil(currentInstances * (metrics.cpuUtilization / this.config.targetCPUUtilization))
        );
        
        return {
          action: 'scale_up',
          targetInstances: recommendedInstances,
          reason: 'High resource utilization',
          metrics
        };
      }
    }
    
    // Scale down if utilization is consistently low
    if (metrics.cpuUtilization < this.config.scaleDownThreshold && 
        metrics.memoryUtilization < this.config.scaleDownThreshold) {
      
      if (currentInstances > this.config.minInstances) {
        const recommendedInstances = Math.max(
          this.config.minInstances,
          Math.floor(currentInstances * (metrics.cpuUtilization / this.config.targetCPUUtilization))
        );
        
        return {
          action: 'scale_down',
          targetInstances: recommendedInstances,
          reason: 'Low resource utilization',
          metrics
        };
      }
    }

    return {
      action: 'none',
      targetInstances: currentInstances,
      reason: 'Optimal resource utilization',
      metrics
    };
  }

  async executeScalingDecision(decision) {
    const currentInstances = this.instances.size;
    const targetInstances = decision.targetInstances;

    logger.info('Executing scaling decision', {
      action: decision.action,
      currentInstances,
      targetInstances,
      reason: decision.reason,
      metrics: decision.metrics
    });

    if (decision.action === 'scale_up') {
      const instancesToAdd = targetInstances - currentInstances;
      for (let i = 0; i < instancesToAdd; i++) {
        const instanceId = `instance-${Date.now()}-${i}`;
        await this.addInstance(instanceId);
      }
    } else if (decision.action === 'scale_down') {
      const instancesToRemove = currentInstances - targetInstances;
      const instanceIds = Array.from(this.instances.keys()).slice(-instancesToRemove);
      
      for (const instanceId of instanceIds) {
        await this.removeInstance(instanceId);
      }
    }

    this.emit('scalingCompleted', {
      action: decision.action,
      previousInstances: currentInstances,
      currentInstances: this.instances.size,
      reason: decision.reason
    });
  }

  async addInstance(instanceId) {
    logger.info('Adding new instance', { instanceId });
    
    const instance = {
      id: instanceId,
      status: 'initializing',
      createdAt: Date.now(),
      metrics: {
        cpuUtilization: 0,
        memoryUtilization: 0,
        requestCount: 0,
        errorCount: 0
      }
    };

    this.instances.set(instanceId, instance);

    // Simulate instance startup
    setTimeout(() => {
      instance.status = 'running';
      this.emit('instanceAdded', { instanceId, instance });
      logger.info('Instance ready', { instanceId });
    }, 2000);

    return instance;
  }

  async removeInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    logger.info('Removing instance', { instanceId });
    
    instance.status = 'terminating';
    
    // Simulate graceful shutdown
    setTimeout(() => {
      this.instances.delete(instanceId);
      this.emit('instanceRemoved', { instanceId });
      logger.info('Instance terminated', { instanceId });
    }, 5000);
  }

  recordMetric(metric, value, instanceId = null) {
    const timestamp = Date.now();
    
    // Record global metrics
    if (this.metrics[metric]) {
      this.metrics[metric].push({ value, timestamp });
      
      // Keep only last 10 minutes of metrics
      const cutoffTime = timestamp - 600000;
      this.metrics[metric] = this.metrics[metric].filter(m => m.timestamp > cutoffTime);
    }

    // Record instance-specific metrics
    if (instanceId && this.instances.has(instanceId)) {
      const instance = this.instances.get(instanceId);
      instance.metrics[metric] = value;
    }
  }

  getAverageMetrics(timeWindow = 300000) { // 5 minutes
    const now = Date.now();
    const cutoff = now - timeWindow;
    
    const result = {};
    
    for (const [metric, values] of Object.entries(this.metrics)) {
      const recentValues = values
        .filter(v => v.timestamp > cutoff)
        .map(v => v.value);
      
      result[metric] = recentValues.length > 0 
        ? recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length
        : 0;
    }
    
    return result;
  }

  getInstanceStats() {
    const stats = {
      total: this.instances.size,
      byStatus: {},
      metrics: {}
    };

    for (const [instanceId, instance] of this.instances) {
      // Count by status
      stats.byStatus[instance.status] = (stats.byStatus[instance.status] || 0) + 1;
      
      // Aggregate metrics
      for (const [metric, value] of Object.entries(instance.metrics)) {
        if (!stats.metrics[metric]) {
          stats.metrics[metric] = [];
        }
        stats.metrics[metric].push(value);
      }
    }

    // Calculate averages
    for (const [metric, values] of Object.entries(stats.metrics)) {
      stats.metrics[metric] = {
        average: values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0,
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
        count: values.length
      };
    }

    return stats;
  }

  async shutdown() {
    logger.info('Shutting down Auto-scaling Controller');
    
    this.isRunning = false;
    
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
    }

    // Gracefully terminate all instances
    const instanceIds = Array.from(this.instances.keys());
    for (const instanceId of instanceIds) {
      await this.removeInstance(instanceId);
    }

    this.emit('shutdown');
    logger.info('Auto-scaling Controller shut down');
  }
}

module.exports = AutoScalingController;