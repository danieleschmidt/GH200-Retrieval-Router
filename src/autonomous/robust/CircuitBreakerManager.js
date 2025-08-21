/**
 * Circuit Breaker Manager for GH200 Retrieval Router
 * Generation 2: Robustness and Reliability
 */

const { logger } = require('../../utils/logger');
const { EventEmitter } = require('events');

/**
 * Circuit Breaker States
 */
const STATES = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Failing, reject all requests
  HALF_OPEN: 'half_open' // Testing if service has recovered
};

/**
 * Individual Circuit Breaker
 */
class CircuitBreaker extends EventEmitter {
  constructor(name, options = {}) {
    super();
    
    this.name = name;
    this.config = {
      failureThreshold: options.failureThreshold || 5,
      recoveryTimeout: options.recoveryTimeout || 60000, // 1 minute
      monitoringPeriod: options.monitoringPeriod || 10000, // 10 seconds
      halfOpenMaxCalls: options.halfOpenMaxCalls || 3,
      successThreshold: options.successThreshold || 2,
      volumeThreshold: options.volumeThreshold || 10,
      errorRate: options.errorRate || 0.50, // 50%
      timeout: options.timeout || 30000, // 30 seconds
      ...options
    };

    this.state = STATES.CLOSED;
    this.stats = {
      totalCalls: 0,
      successCalls: 0,
      failureCalls: 0,
      timeouts: 0,
      rejectedCalls: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      halfOpenCalls: 0,
      halfOpenSuccesses: 0
    };

    this.nextAttempt = 0;
    this.resetTimeout = null;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, ...args) {
    // Check if circuit breaker should reject the call
    if (this.shouldReject()) {
      this.stats.rejectedCalls++;
      this.emit('rejected', { name: this.name, state: this.state });
      
      const error = new Error(`Circuit breaker '${this.name}' is ${this.state}`);
      error.code = 'CIRCUIT_BREAKER_OPEN';
      throw error;
    }

    const startTime = Date.now();
    this.stats.totalCalls++;

    // Track half-open calls
    if (this.state === STATES.HALF_OPEN) {
      this.stats.halfOpenCalls++;
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn, args);
      
      // Record success
      this.onSuccess(Date.now() - startTime);
      
      return result;

    } catch (error) {
      // Record failure
      this.onFailure(error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn, args) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stats.timeouts++;
        reject(new Error(`Circuit breaker timeout: ${this.config.timeout}ms`));
      }, this.config.timeout);

      Promise.resolve(fn(...args))
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Check if the circuit breaker should reject calls
   */
  shouldReject() {
    const now = Date.now();

    switch (this.state) {
      case STATES.CLOSED:
        return false;
        
      case STATES.OPEN:
        // Check if recovery timeout has passed
        if (now >= this.nextAttempt) {
          this.toHalfOpen();
          return false;
        }
        return true;
        
      case STATES.HALF_OPEN:
        // Limit calls in half-open state
        return this.stats.halfOpenCalls >= this.config.halfOpenMaxCalls;
        
      default:
        return false;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess(duration) {
    this.stats.successCalls++;
    this.stats.lastSuccessTime = Date.now();

    if (this.state === STATES.HALF_OPEN) {
      this.stats.halfOpenSuccesses++;
      
      // Check if enough successes to close circuit
      if (this.stats.halfOpenSuccesses >= this.config.successThreshold) {
        this.toClosed();
      }
    }

    this.emit('success', { 
      name: this.name, 
      state: this.state, 
      duration,
      stats: this.getStats()
    });
  }

  /**
   * Handle failed execution
   */
  onFailure(error, duration) {
    this.stats.failureCalls++;
    this.stats.lastFailureTime = Date.now();

    // Check if circuit should open
    if (this.shouldOpen()) {
      this.toOpen();
    }

    this.emit('failure', { 
      name: this.name, 
      state: this.state, 
      error: error.message,
      duration,
      stats: this.getStats()
    });
  }

  /**
   * Check if circuit should open based on failure criteria
   */
  shouldOpen() {
    const { totalCalls, failureCalls, volumeThreshold, failureThreshold, errorRate } = this.config;
    const stats = this.stats;

    // Need minimum volume
    if (stats.totalCalls < volumeThreshold) {
      return false;
    }

    // Check failure count threshold
    if (stats.failureCalls >= failureThreshold) {
      return true;
    }

    // Check error rate threshold
    const currentErrorRate = stats.failureCalls / stats.totalCalls;
    if (currentErrorRate >= errorRate) {
      return true;
    }

    return false;
  }

  /**
   * Transition to OPEN state
   */
  toOpen() {
    if (this.state === STATES.OPEN) return;

    this.state = STATES.OPEN;
    this.nextAttempt = Date.now() + this.config.recoveryTimeout;
    
    logger.warn(`Circuit breaker '${this.name}' opened`, {
      failureCalls: this.stats.failureCalls,
      totalCalls: this.stats.totalCalls,
      errorRate: this.stats.failureCalls / this.stats.totalCalls
    });

    this.emit('stateChange', { 
      name: this.name, 
      state: this.state, 
      previousState: STATES.CLOSED,
      stats: this.getStats()
    });
  }

  /**
   * Transition to HALF_OPEN state
   */
  toHalfOpen() {
    if (this.state === STATES.HALF_OPEN) return;

    this.state = STATES.HALF_OPEN;
    this.stats.halfOpenCalls = 0;
    this.stats.halfOpenSuccesses = 0;
    
    logger.info(`Circuit breaker '${this.name}' half-opened`, {
      recoveryAttempt: true
    });

    this.emit('stateChange', { 
      name: this.name, 
      state: this.state, 
      previousState: STATES.OPEN,
      stats: this.getStats()
    });
  }

  /**
   * Transition to CLOSED state
   */
  toClosed() {
    if (this.state === STATES.CLOSED) return;

    const previousState = this.state;
    this.state = STATES.CLOSED;
    
    // Reset stats for new monitoring period
    this.resetStats();
    
    logger.info(`Circuit breaker '${this.name}' closed`, {
      recovered: previousState === STATES.HALF_OPEN
    });

    this.emit('stateChange', { 
      name: this.name, 
      state: this.state, 
      previousState,
      stats: this.getStats()
    });
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats.totalCalls = 0;
    this.stats.successCalls = 0;
    this.stats.failureCalls = 0;
    this.stats.timeouts = 0;
    this.stats.rejectedCalls = 0;
    this.stats.halfOpenCalls = 0;
    this.stats.halfOpenSuccesses = 0;
  }

  /**
   * Get current statistics
   */
  getStats() {
    const errorRate = this.stats.totalCalls > 0 
      ? this.stats.failureCalls / this.stats.totalCalls 
      : 0;

    return {
      ...this.stats,
      errorRate,
      state: this.state,
      config: this.config
    };
  }

  /**
   * Force circuit to open (for testing)
   */
  forceOpen() {
    this.toOpen();
  }

  /**
   * Force circuit to close (for testing)
   */
  forceClose() {
    this.toClosed();
  }

  /**
   * Get circuit breaker health
   */
  isHealthy() {
    return this.state === STATES.CLOSED || this.state === STATES.HALF_OPEN;
  }
}

/**
 * Circuit Breaker Manager
 */
class CircuitBreakerManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      defaultFailureThreshold: options.defaultFailureThreshold || 5,
      defaultRecoveryTimeout: options.defaultRecoveryTimeout || 60000,
      defaultMonitoringPeriod: options.defaultMonitoringPeriod || 10000,
      ...options
    };

    this.breakers = new Map();
    this.globalStats = {
      totalBreakers: 0,
      openBreakers: 0,
      halfOpenBreakers: 0,
      closedBreakers: 0,
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0
    };
  }

  /**
   * Create or get a circuit breaker
   */
  getBreaker(name, options = {}) {
    if (this.breakers.has(name)) {
      return this.breakers.get(name);
    }

    const breakerOptions = {
      ...this.config,
      ...options
    };

    const breaker = new CircuitBreaker(name, breakerOptions);
    
    // Subscribe to breaker events
    breaker.on('stateChange', (event) => {
      this.updateGlobalStats();
      this.emit('breakerStateChange', event);
    });

    breaker.on('success', (event) => {
      this.globalStats.totalCalls++;
      this.globalStats.totalSuccesses++;
      this.emit('breakerSuccess', event);
    });

    breaker.on('failure', (event) => {
      this.globalStats.totalCalls++;
      this.globalStats.totalFailures++;
      this.emit('breakerFailure', event);
    });

    breaker.on('rejected', (event) => {
      this.emit('breakerRejected', event);
    });

    this.breakers.set(name, breaker);
    this.globalStats.totalBreakers++;
    this.globalStats.closedBreakers++;

    logger.info(`Created circuit breaker '${name}'`, {
      options: breakerOptions
    });

    return breaker;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(breakerName, fn, ...args) {
    const breaker = this.getBreaker(breakerName);
    return breaker.execute(fn, ...args);
  }

  /**
   * Get all circuit breakers
   */
  getAllBreakers() {
    const breakers = {};
    
    for (const [name, breaker] of this.breakers.entries()) {
      breakers[name] = breaker.getStats();
    }

    return breakers;
  }

  /**
   * Update global statistics
   */
  updateGlobalStats() {
    this.globalStats.openBreakers = 0;
    this.globalStats.halfOpenBreakers = 0;
    this.globalStats.closedBreakers = 0;

    for (const breaker of this.breakers.values()) {
      switch (breaker.state) {
        case STATES.OPEN:
          this.globalStats.openBreakers++;
          break;
        case STATES.HALF_OPEN:
          this.globalStats.halfOpenBreakers++;
          break;
        case STATES.CLOSED:
          this.globalStats.closedBreakers++;
          break;
      }
    }
  }

  /**
   * Get global statistics
   */
  getGlobalStats() {
    this.updateGlobalStats();
    
    return {
      ...this.globalStats,
      errorRate: this.globalStats.totalCalls > 0 
        ? this.globalStats.totalFailures / this.globalStats.totalCalls 
        : 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Health check for circuit breaker manager
   */
  async healthCheck() {
    const stats = this.getGlobalStats();
    const unhealthyBreakers = [];

    for (const [name, breaker] of this.breakers.entries()) {
      if (!breaker.isHealthy()) {
        unhealthyBreakers.push({
          name,
          state: breaker.state,
          stats: breaker.getStats()
        });
      }
    }

    const healthy = unhealthyBreakers.length === 0;

    return {
      healthy,
      message: healthy 
        ? 'All circuit breakers operational' 
        : `${unhealthyBreakers.length} circuit breakers not healthy`,
      stats,
      unhealthyBreakers,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.forceClose();
    }
    
    this.globalStats.totalCalls = 0;
    this.globalStats.totalFailures = 0;
    this.globalStats.totalSuccesses = 0;
    
    logger.info('Reset all circuit breakers');
    this.emit('allBreakersReset');
  }

  /**
   * Remove a circuit breaker
   */
  removeBreaker(name) {
    if (this.breakers.has(name)) {
      this.breakers.delete(name);
      this.globalStats.totalBreakers--;
      this.updateGlobalStats();
      
      logger.info(`Removed circuit breaker '${name}'`);
      this.emit('breakerRemoved', { name });
    }
  }

  /**
   * Shutdown all circuit breakers
   */
  async shutdown() {
    logger.info('Shutting down Circuit Breaker Manager...');
    
    this.breakers.clear();
    this.globalStats = {
      totalBreakers: 0,
      openBreakers: 0,
      halfOpenBreakers: 0,
      closedBreakers: 0,
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0
    };

    this.emit('shutdown');
    logger.info('Circuit Breaker Manager shutdown complete');
  }
}

module.exports = {
  CircuitBreakerManager,
  CircuitBreaker,
  STATES
};