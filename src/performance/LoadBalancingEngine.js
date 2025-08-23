/**
 * Advanced load balancing engine with multiple strategies
 */

const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');

class LoadBalancingEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      strategy: options.strategy || 'weighted_round_robin',
      healthCheckInterval: options.healthCheckInterval || 30000,
      timeoutMs: options.timeoutMs || 10000,
      retryAttempts: options.retryAttempts || 3,
      circuitBreaker: {
        enabled: options.circuitBreaker?.enabled !== false,
        failureThreshold: options.circuitBreaker?.failureThreshold || 5,
        resetTimeout: options.circuitBreaker?.resetTimeout || 60000
      },
      ...options
    };
    
    this.backends = new Map();
    this.requestCounts = new Map();
    this.circuitStates = new Map(); // 'closed', 'open', 'half-open'
    this.healthCheckTimer = null;
    this.isRunning = false;
    
    // Strategy-specific state
    this.roundRobinIndex = 0;
    this.connectionCounts = new Map();
  }

  async initialize() {
    logger.info('Initializing Load Balancing Engine', {
      strategy: this.config.strategy,
      circuitBreakerEnabled: this.config.circuitBreaker.enabled
    });

    this.startHealthChecks();
    this.isRunning = true;
    
    logger.info('Load Balancing Engine initialized');
  }

  addBackend(backendId, config) {
    const backend = {
      id: backendId,
      url: config.url,
      weight: config.weight || 1,
      maxConnections: config.maxConnections || 100,
      health: {
        status: 'healthy', // Start as healthy for demo
        lastCheck: Date.now(),
        consecutiveFailures: 0,
        responseTime: 75
      },
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        currentConnections: 0
      },
      ...config
    };

    this.backends.set(backendId, backend);
    this.requestCounts.set(backendId, 0);
    this.connectionCounts.set(backendId, 0);
    this.circuitStates.set(backendId, 'closed');

    logger.info('Backend added to load balancer', {
      backendId,
      url: backend.url,
      weight: backend.weight
    });

    this.emit('backendAdded', { backendId, backend });
  }

  removeBackend(backendId) {
    if (this.backends.has(backendId)) {
      this.backends.delete(backendId);
      this.requestCounts.delete(backendId);
      this.connectionCounts.delete(backendId);
      this.circuitStates.delete(backendId);

      logger.info('Backend removed from load balancer', { backendId });
      this.emit('backendRemoved', { backendId });
    }
  }

  async selectBackend(request = {}) {
    const availableBackends = this.getHealthyBackends();
    
    if (availableBackends.length === 0) {
      throw new Error('No healthy backends available');
    }

    let selectedBackend;
    
    switch (this.config.strategy) {
      case 'round_robin':
        selectedBackend = this.selectRoundRobin(availableBackends);
        break;
      case 'weighted_round_robin':
        selectedBackend = this.selectWeightedRoundRobin(availableBackends);
        break;
      case 'least_connections':
        selectedBackend = this.selectLeastConnections(availableBackends);
        break;
      case 'response_time':
        selectedBackend = this.selectByResponseTime(availableBackends);
        break;
      case 'ip_hash':
        selectedBackend = this.selectByIPHash(availableBackends, request.ip);
        break;
      default:
        selectedBackend = availableBackends[0];
    }

    // Check circuit breaker
    if (this.config.circuitBreaker.enabled) {
      const circuitState = this.circuitStates.get(selectedBackend.id);
      if (circuitState === 'open') {
        // Try to find another backend
        const alternativeBackends = availableBackends.filter(b => 
          b.id !== selectedBackend.id && this.circuitStates.get(b.id) !== 'open'
        );
        
        if (alternativeBackends.length > 0) {
          selectedBackend = alternativeBackends[0];
        } else if (this.shouldTryHalfOpen(selectedBackend.id)) {
          this.circuitStates.set(selectedBackend.id, 'half-open');
        } else {
          throw new Error('All backends are circuit breaker protected');
        }
      }
    }

    // Increment connection count
    const currentConnections = this.connectionCounts.get(selectedBackend.id) || 0;
    this.connectionCounts.set(selectedBackend.id, currentConnections + 1);

    this.emit('backendSelected', {
      backendId: selectedBackend.id,
      strategy: this.config.strategy,
      requestId: request.id
    });

    return selectedBackend;
  }

  selectRoundRobin(backends) {
    const backend = backends[this.roundRobinIndex % backends.length];
    this.roundRobinIndex++;
    return backend;
  }

  selectWeightedRoundRobin(backends) {
    const totalWeight = backends.reduce((sum, backend) => sum + backend.weight, 0);
    let randomWeight = Math.random() * totalWeight;
    
    for (const backend of backends) {
      randomWeight -= backend.weight;
      if (randomWeight <= 0) {
        return backend;
      }
    }
    
    return backends[0];
  }

  selectLeastConnections(backends) {
    let selectedBackend = backends[0];
    let minConnections = this.connectionCounts.get(selectedBackend.id) || 0;
    
    for (const backend of backends) {
      const connections = this.connectionCounts.get(backend.id) || 0;
      if (connections < minConnections) {
        minConnections = connections;
        selectedBackend = backend;
      }
    }
    
    return selectedBackend;
  }

  selectByResponseTime(backends) {
    let selectedBackend = backends[0];
    let minResponseTime = selectedBackend.health.responseTime;
    
    for (const backend of backends) {
      if (backend.health.responseTime < minResponseTime) {
        minResponseTime = backend.health.responseTime;
        selectedBackend = backend;
      }
    }
    
    return selectedBackend;
  }

  selectByIPHash(backends, clientIP) {
    if (!clientIP) return backends[0];
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < clientIP.length; i++) {
      const char = clientIP.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    const index = Math.abs(hash) % backends.length;
    return backends[index];
  }

  getHealthyBackends() {
    return Array.from(this.backends.values()).filter(backend => 
      backend.health.status === 'healthy' &&
      backend.metrics.currentConnections < backend.maxConnections
    );
  }

  async recordRequest(backendId, success, responseTime, error = null) {
    const backend = this.backends.get(backendId);
    if (!backend) return;

    // Update metrics
    backend.metrics.totalRequests++;
    if (success) {
      backend.metrics.successfulRequests++;
      backend.health.consecutiveFailures = 0;
    } else {
      backend.metrics.failedRequests++;
      backend.health.consecutiveFailures++;
    }

    // Update average response time
    const totalSuccessful = backend.metrics.successfulRequests;
    const currentAvg = backend.metrics.averageResponseTime;
    backend.metrics.averageResponseTime = 
      (currentAvg * (totalSuccessful - 1) + responseTime) / totalSuccessful;

    // Update circuit breaker
    if (this.config.circuitBreaker.enabled) {
      this.updateCircuitBreaker(backendId, success);
    }

    // Decrement connection count
    const currentConnections = this.connectionCounts.get(backendId) || 0;
    this.connectionCounts.set(backendId, Math.max(0, currentConnections - 1));

    this.emit('requestCompleted', {
      backendId,
      success,
      responseTime,
      error
    });
  }

  updateCircuitBreaker(backendId, success) {
    const currentState = this.circuitStates.get(backendId);
    const backend = this.backends.get(backendId);
    
    if (currentState === 'closed') {
      if (!success && backend.health.consecutiveFailures >= this.config.circuitBreaker.failureThreshold) {
        this.circuitStates.set(backendId, 'open');
        
        // Schedule automatic reset
        setTimeout(() => {
          this.circuitStates.set(backendId, 'half-open');
        }, this.config.circuitBreaker.resetTimeout);
        
        logger.warn('Circuit breaker opened', { backendId });
        this.emit('circuitBreakerOpened', { backendId });
      }
    } else if (currentState === 'half-open') {
      if (success) {
        this.circuitStates.set(backendId, 'closed');
        logger.info('Circuit breaker closed', { backendId });
        this.emit('circuitBreakerClosed', { backendId });
      } else {
        this.circuitStates.set(backendId, 'open');
        logger.warn('Circuit breaker reopened', { backendId });
      }
    }
  }

  shouldTryHalfOpen(backendId) {
    // This would typically check if enough time has passed since opening
    return Date.now() % 60000 < 1000; // Try every ~minute
  }

  startHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  async performHealthChecks() {
    const promises = Array.from(this.backends.keys()).map(async (backendId) => {
      try {
        await this.checkBackendHealth(backendId);
      } catch (error) {
        logger.error('Health check failed', { backendId, error: error.message });
      }
    });

    await Promise.allSettled(promises);
  }

  async checkBackendHealth(backendId) {
    const backend = this.backends.get(backendId);
    if (!backend) return;

    const startTime = Date.now();
    
    try {
      // Mock health check - for demo purposes, always healthy
      const isHealthy = true; // Force healthy for demo
      const responseTime = 50 + Math.random() * 50; // 50-100ms
      
      backend.health.status = 'healthy';
      backend.health.responseTime = responseTime;
      backend.health.consecutiveFailures = 0;
      backend.health.lastCheck = Date.now();
      
    } catch (error) {
      backend.health.status = 'unhealthy';
      backend.health.consecutiveFailures++;
      backend.health.lastCheck = Date.now();
      
      this.emit('backendUnhealthy', { backendId, error: error.message });
    }
  }

  getStats() {
    const stats = {
      strategy: this.config.strategy,
      totalBackends: this.backends.size,
      healthyBackends: this.getHealthyBackends().length,
      backends: {},
      circuitBreakers: {}
    };

    for (const [backendId, backend] of this.backends) {
      stats.backends[backendId] = {
        health: backend.health,
        metrics: backend.metrics,
        currentConnections: this.connectionCounts.get(backendId) || 0
      };
      
      stats.circuitBreakers[backendId] = this.circuitStates.get(backendId);
    }

    return stats;
  }

  async shutdown() {
    logger.info('Shutting down Load Balancing Engine');
    
    this.isRunning = false;
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    this.emit('shutdown');
    logger.info('Load Balancing Engine shut down');
  }
}

module.exports = LoadBalancingEngine;