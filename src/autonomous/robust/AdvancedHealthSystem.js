/**
 * Advanced Health Monitoring System for GH200 Retrieval Router
 * Generation 2: Robustness and Reliability
 */

const { logger } = require('../../utils/logger');
const { EventEmitter } = require('events');

class AdvancedHealthSystem extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      checkInterval: options.checkInterval || 30000, // 30 seconds
      maxFailureCount: options.maxFailureCount || 3,
      criticalMetrics: options.criticalMetrics || [
        'memory_usage',
        'cpu_usage',
        'response_time',
        'error_rate'
      ],
      thresholds: {
        memoryUsage: options.thresholds?.memoryUsage || 0.85, // 85%
        cpuUsage: options.thresholds?.cpuUsage || 0.80, // 80%
        responseTime: options.thresholds?.responseTime || 1000, // 1 second
        errorRate: options.thresholds?.errorRate || 0.05, // 5%
        ...options.thresholds
      }
    };

    this.healthData = {
      overall: 'unknown',
      components: new Map(),
      metrics: {},
      lastCheck: null,
      uptime: Date.now(),
      checks: 0,
      failures: 0
    };

    this.components = new Map();
    this.healthCheckInterval = null;
    this.isRunning = false;
  }

  /**
   * Initialize the health monitoring system
   */
  async initialize() {
    logger.info('Initializing Advanced Health System...');
    
    try {
      this.isRunning = true;
      this.startPeriodicChecks();
      
      // Perform initial health check
      await this.performHealthCheck();
      
      logger.info('Advanced Health System initialized successfully');
      this.emit('health:system:initialized');
      
      return { success: true, status: 'initialized' };
    } catch (error) {
      logger.error('Failed to initialize Advanced Health System', { error: error.message });
      throw error;
    }
  }

  /**
   * Register a component for health monitoring
   */
  registerComponent(name, component, options = {}) {
    const componentConfig = {
      name,
      component,
      checkMethod: options.checkMethod || 'healthCheck',
      critical: options.critical !== false, // Default to critical
      timeout: options.timeout || 5000, // 5 seconds
      failureCount: 0,
      lastStatus: 'unknown',
      lastCheck: null,
      enabled: options.enabled !== false
    };

    this.components.set(name, componentConfig);
    this.healthData.components.set(name, {
      status: 'unknown',
      lastCheck: null,
      failureCount: 0
    });

    logger.info('Registered health component', { 
      name, 
      critical: componentConfig.critical,
      enabled: componentConfig.enabled
    });

    this.emit('health:component:registered', { name, config: componentConfig });
  }

  /**
   * Unregister a component
   */
  unregisterComponent(name) {
    this.components.delete(name);
    this.healthData.components.delete(name);
    
    logger.info('Unregistered health component', { name });
    this.emit('health:component:unregistered', { name });
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Error during periodic health check', { error: error.message });
      }
    }, this.config.checkInterval);

    logger.info('Started periodic health checks', { 
      interval: this.config.checkInterval 
    });
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    logger.info('Stopped periodic health checks');
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    this.healthData.checks++;
    
    try {
      // Check system metrics
      const systemMetrics = await this.checkSystemMetrics();
      
      // Check all registered components
      const componentResults = await this.checkAllComponents();
      
      // Evaluate overall health
      const overallHealth = this.evaluateOverallHealth(systemMetrics, componentResults);
      
      // Update health data
      this.updateHealthData(systemMetrics, componentResults, overallHealth);
      
      const checkDuration = Date.now() - startTime;
      
      logger.debug('Health check completed', {
        duration: checkDuration,
        overall: overallHealth.status,
        componentsChecked: componentResults.length,
        healthy: componentResults.filter(r => r.status === 'healthy').length
      });

      this.emit('health:check:completed', {
        overall: overallHealth,
        components: componentResults,
        metrics: systemMetrics,
        duration: checkDuration
      });

      return {
        status: overallHealth.status,
        timestamp: new Date().toISOString(),
        checks: this.healthData.checks,
        uptime: Date.now() - this.healthData.uptime,
        components: this.getComponentSummary(),
        metrics: systemMetrics
      };

    } catch (error) {
      this.healthData.failures++;
      logger.error('Health check failed', { 
        error: error.message,
        checks: this.healthData.checks,
        failures: this.healthData.failures
      });

      this.emit('health:check:failed', { error });
      throw error;
    }
  }

  /**
   * Check system-level metrics
   */
  async checkSystemMetrics() {
    const metrics = {};

    try {
      // Memory usage
      const memUsage = process.memoryUsage();
      metrics.memory = {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        utilization: memUsage.heapUsed / memUsage.heapTotal
      };

      // CPU usage (simplified)
      const cpuUsage = process.cpuUsage();
      metrics.cpu = {
        user: cpuUsage.user,
        system: cpuUsage.system,
        // Note: This is a simplified metric, real CPU percentage would need more complex calculation
        utilization: Math.min((cpuUsage.user + cpuUsage.system) / 1000000 / 1, 1)
      };

      // Process uptime
      metrics.uptime = process.uptime();

      // Node.js version and platform
      metrics.platform = {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      };

      return metrics;

    } catch (error) {
      logger.warn('Failed to collect system metrics', { error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Check all registered components
   */
  async checkAllComponents() {
    const results = [];
    const promises = [];

    for (const [name, config] of this.components.entries()) {
      if (!config.enabled) {
        continue;
      }

      const promise = this.checkComponent(name, config)
        .then(result => ({ name, ...result }))
        .catch(error => ({
          name,
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        }));

      promises.push(promise);
    }

    const componentResults = await Promise.all(promises);
    
    return componentResults;
  }

  /**
   * Check individual component health
   */
  async checkComponent(name, config) {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), config.timeout);
      });

      let healthResult;
      
      if (typeof config.component[config.checkMethod] === 'function') {
        const healthPromise = config.component[config.checkMethod]();
        healthResult = await Promise.race([healthPromise, timeoutPromise]);
      } else {
        // Fallback: check if component has basic properties
        healthResult = {
          healthy: true,
          message: 'Component exists and is accessible'
        };
      }

      const duration = Date.now() - startTime;
      const isHealthy = healthResult && (healthResult.healthy === true || healthResult.status === 'healthy');

      // Update component state
      config.lastCheck = new Date().toISOString();
      config.lastStatus = isHealthy ? 'healthy' : 'unhealthy';
      
      if (isHealthy) {
        config.failureCount = 0;
      } else {
        config.failureCount++;
      }

      // Update health data
      this.healthData.components.set(name, {
        status: config.lastStatus,
        lastCheck: config.lastCheck,
        failureCount: config.failureCount,
        message: healthResult?.message,
        details: healthResult?.details
      });

      return {
        status: config.lastStatus,
        duration,
        failureCount: config.failureCount,
        message: healthResult?.message,
        details: healthResult?.details,
        timestamp: config.lastCheck
      };

    } catch (error) {
      config.failureCount++;
      config.lastStatus = 'unhealthy';
      config.lastCheck = new Date().toISOString();

      this.healthData.components.set(name, {
        status: 'unhealthy',
        lastCheck: config.lastCheck,
        failureCount: config.failureCount,
        error: error.message
      });

      return {
        status: 'unhealthy',
        duration: Date.now() - startTime,
        failureCount: config.failureCount,
        error: error.message,
        timestamp: config.lastCheck
      };
    }
  }

  /**
   * Evaluate overall system health
   */
  evaluateOverallHealth(systemMetrics, componentResults) {
    const criticalComponents = Array.from(this.components.entries())
      .filter(([, config]) => config.critical && config.enabled);

    const criticalFailures = componentResults.filter(result => {
      const config = this.components.get(result.name);
      return config?.critical && result.status === 'unhealthy';
    });

    const nonCriticalFailures = componentResults.filter(result => {
      const config = this.components.get(result.name);
      return !config?.critical && result.status === 'unhealthy';
    });

    // Check system metric thresholds
    const metricViolations = this.checkMetricThresholds(systemMetrics);

    let status = 'healthy';
    let message = 'All systems operational';
    const issues = [];

    // Critical component failures make system unhealthy
    if (criticalFailures.length > 0) {
      status = 'unhealthy';
      message = `Critical component failures: ${criticalFailures.map(f => f.name).join(', ')}`;
      issues.push(...criticalFailures.map(f => ({
        type: 'critical_component_failure',
        component: f.name,
        error: f.error || f.message
      })));
    }

    // System metric violations
    if (metricViolations.length > 0) {
      if (status === 'healthy') {
        status = 'degraded';
        message = 'System metrics above thresholds';
      }
      issues.push(...metricViolations);
    }

    // Non-critical failures cause degraded status if system is otherwise healthy
    if (nonCriticalFailures.length > 0 && status === 'healthy') {
      status = 'degraded';
      message = `Non-critical component issues: ${nonCriticalFailures.map(f => f.name).join(', ')}`;
      issues.push(...nonCriticalFailures.map(f => ({
        type: 'component_degradation',
        component: f.name,
        error: f.error || f.message
      })));
    }

    return {
      status,
      message,
      issues,
      criticalComponents: criticalComponents.length,
      healthyComponents: componentResults.filter(r => r.status === 'healthy').length,
      totalComponents: componentResults.length
    };
  }

  /**
   * Check if system metrics violate thresholds
   */
  checkMetricThresholds(metrics) {
    const violations = [];

    try {
      // Memory usage check
      if (metrics.memory?.utilization > this.config.thresholds.memoryUsage) {
        violations.push({
          type: 'memory_threshold_violation',
          metric: 'memory_utilization',
          value: metrics.memory.utilization,
          threshold: this.config.thresholds.memoryUsage
        });
      }

      // CPU usage check
      if (metrics.cpu?.utilization > this.config.thresholds.cpuUsage) {
        violations.push({
          type: 'cpu_threshold_violation',
          metric: 'cpu_utilization',
          value: metrics.cpu.utilization,
          threshold: this.config.thresholds.cpuUsage
        });
      }

    } catch (error) {
      logger.warn('Error checking metric thresholds', { error: error.message });
    }

    return violations;
  }

  /**
   * Update internal health data
   */
  updateHealthData(systemMetrics, componentResults, overallHealth) {
    this.healthData.overall = overallHealth.status;
    this.healthData.metrics = systemMetrics;
    this.healthData.lastCheck = new Date().toISOString();

    // Emit status change events
    if (this.healthData.overall !== overallHealth.status) {
      this.emit('health:status:changed', {
        previous: this.healthData.overall,
        current: overallHealth.status,
        timestamp: this.healthData.lastCheck
      });
    }
  }

  /**
   * Get component health summary
   */
  getComponentSummary() {
    const summary = {};
    
    for (const [name, data] of this.healthData.components.entries()) {
      summary[name] = {
        status: data.status,
        lastCheck: data.lastCheck,
        failureCount: data.failureCount
      };
    }

    return summary;
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return {
      overall: this.healthData.overall,
      timestamp: this.healthData.lastCheck,
      uptime: Date.now() - this.healthData.uptime,
      checks: this.healthData.checks,
      failures: this.healthData.failures,
      components: this.getComponentSummary(),
      metrics: this.healthData.metrics
    };
  }

  /**
   * Check if system is healthy
   */
  isHealthy() {
    return this.healthData.overall === 'healthy';
  }

  /**
   * Check if system is ready to serve requests
   */
  isReady() {
    return this.isRunning && (this.healthData.overall === 'healthy' || this.healthData.overall === 'degraded');
  }

  /**
   * Shutdown the health monitoring system
   */
  async shutdown() {
    logger.info('Shutting down Advanced Health System...');
    
    this.isRunning = false;
    this.stopPeriodicChecks();
    
    this.emit('health:system:shutdown');
    
    logger.info('Advanced Health System shutdown complete');
    return { success: true, status: 'shutdown' };
  }
}

module.exports = AdvancedHealthSystem;