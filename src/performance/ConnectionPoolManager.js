/**
 * Connection Pool Manager
 * High-performance connection pooling with auto-scaling and load balancing
 */

const { logger } = require('../utils/logger');
const { EventEmitter } = require('events');

class ConnectionPoolManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Pool sizing
            minConnections: options.minConnections || 5,
            maxConnections: options.maxConnections || 100,
            acquireTimeoutMs: options.acquireTimeoutMs || 10000,
            idleTimeoutMs: options.idleTimeoutMs || 300000, // 5 minutes
            
            // Auto-scaling
            autoScale: options.autoScale !== false,
            scaleUpThreshold: options.scaleUpThreshold || 0.8, // 80% utilization
            scaleDownThreshold: options.scaleDownThreshold || 0.3, // 30% utilization
            scalingCooldownMs: options.scalingCooldownMs || 60000, // 1 minute
            
            // Health monitoring
            healthCheckInterval: options.healthCheckInterval || 30000,
            maxConnectionAge: options.maxConnectionAge || 3600000, // 1 hour
            
            // Performance optimization
            connectionWarmup: options.connectionWarmup !== false,
            circuitBreakerEnabled: options.circuitBreakerEnabled !== false,
            
            ...options
        };
        
        this.pools = new Map(); // Database name -> pool
        this.connectionFactories = new Map(); // Database name -> factory function
        this.metrics = {
            totalConnections: 0,
            activeConnections: 0,
            waitingRequests: 0,
            connectionErrors: 0,
            averageAcquireTime: 0,
            hitRate: 0
        };
        
        this.scalingHistory = [];
        this.lastScalingAction = 0;
        this.isRunning = false;
        this.healthCheckTimer = null;
    }
    
    async initialize() {
        if (this.isRunning) return;
        
        logger.info('Initializing Connection Pool Manager', {
            minConnections: this.config.minConnections,
            maxConnections: this.config.maxConnections,
            autoScale: this.config.autoScale
        });
        
        // Start health check timer
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck().catch(error => {
                logger.error('Connection pool health check failed', { error: error.message });
            });
        }, this.config.healthCheckInterval);
        
        this.isRunning = true;
        this.emit('initialized');
    }
    
    registerDatabase(dbName, connectionFactory, options = {}) {
        if (this.pools.has(dbName)) {
            throw new Error(`Database pool already registered: ${dbName}`);
        }
        
        logger.info(`Registering database pool: ${dbName}`);
        
        const poolConfig = { ...this.config, ...options };
        const pool = new DatabasePool(dbName, connectionFactory, poolConfig);
        
        this.pools.set(dbName, pool);
        this.connectionFactories.set(dbName, connectionFactory);
        
        // Initialize pool with minimum connections
        if (poolConfig.connectionWarmup) {
            this.warmupPool(dbName).catch(error => {
                logger.error(`Failed to warmup pool ${dbName}`, { error: error.message });
            });
        }
        
        return pool;
    }
    
    async warmupPool(dbName) {
        const pool = this.pools.get(dbName);
        if (!pool) {
            throw new Error(`Unknown database pool: ${dbName}`);
        }
        
        logger.info(`Warming up connection pool: ${dbName}`);
        
        // Pre-create minimum connections
        const warmupPromises = [];
        for (let i = 0; i < this.config.minConnections; i++) {
            warmupPromises.push(
                pool.createConnection().catch(error => {
                    logger.warn(`Failed to create warmup connection for ${dbName}`, { error: error.message });
                })
            );
        }
        
        await Promise.allSettled(warmupPromises);
        logger.info(`Pool warmup completed for ${dbName}`, { 
            connections: pool.getMetrics().totalConnections 
        });
    }
    
    async acquireConnection(dbName, priority = 'normal') {
        const pool = this.pools.get(dbName);
        if (!pool) {
            throw new Error(`Unknown database pool: ${dbName}`);
        }
        
        const startTime = Date.now();
        this.metrics.waitingRequests++;
        
        try {
            const connection = await pool.acquire(priority);
            
            // Update metrics
            const acquireTime = Date.now() - startTime;
            this.updateAcquireTime(acquireTime);
            this.metrics.waitingRequests--;
            this.metrics.activeConnections++;
            
            // Check if scaling is needed
            if (this.config.autoScale) {
                this.checkScaling(dbName);
            }
            
            return connection;
            
        } catch (error) {
            this.metrics.waitingRequests--;
            this.metrics.connectionErrors++;
            
            logger.error(`Failed to acquire connection from ${dbName}`, { 
                error: error.message,
                acquireTime: Date.now() - startTime
            });
            
            throw error;
        }
    }
    
    async releaseConnection(dbName, connection) {
        const pool = this.pools.get(dbName);
        if (!pool) {
            logger.warn(`Cannot release connection to unknown pool: ${dbName}`);
            return;
        }
        
        try {
            await pool.release(connection);
            this.metrics.activeConnections--;
            
        } catch (error) {
            logger.error(`Failed to release connection to ${dbName}`, { 
                error: error.message 
            });
        }
    }
    
    checkScaling(dbName) {
        const now = Date.now();
        if (now - this.lastScalingAction < this.config.scalingCooldownMs) {
            return; // Still in cooldown period
        }
        
        const pool = this.pools.get(dbName);
        const metrics = pool.getMetrics();
        const utilization = metrics.activeConnections / metrics.totalConnections;
        
        if (utilization > this.config.scaleUpThreshold && 
            metrics.totalConnections < this.config.maxConnections) {
            this.scaleUp(dbName, pool);
        } else if (utilization < this.config.scaleDownThreshold && 
                   metrics.totalConnections > this.config.minConnections) {
            this.scaleDown(dbName, pool);
        }
    }
    
    async scaleUp(dbName, pool) {
        const currentSize = pool.getMetrics().totalConnections;
        const targetSize = Math.min(
            this.config.maxConnections,
            Math.ceil(currentSize * 1.5) // Scale up by 50%
        );
        
        logger.info(`Scaling up connection pool ${dbName}`, {
            from: currentSize,
            to: targetSize
        });
        
        try {
            await pool.scale(targetSize);
            this.lastScalingAction = Date.now();
            this.scalingHistory.push({
                timestamp: Date.now(),
                dbName,
                action: 'scale_up',
                from: currentSize,
                to: targetSize
            });
            
            this.emit('poolScaled', { dbName, action: 'up', size: targetSize });
            
        } catch (error) {
            logger.error(`Failed to scale up pool ${dbName}`, { error: error.message });
        }
    }
    
    async scaleDown(dbName, pool) {
        const currentSize = pool.getMetrics().totalConnections;
        const targetSize = Math.max(
            this.config.minConnections,
            Math.floor(currentSize * 0.8) // Scale down by 20%
        );
        
        logger.info(`Scaling down connection pool ${dbName}`, {
            from: currentSize,
            to: targetSize
        });
        
        try {
            await pool.scale(targetSize);
            this.lastScalingAction = Date.now();
            this.scalingHistory.push({
                timestamp: Date.now(),
                dbName,
                action: 'scale_down',
                from: currentSize,
                to: targetSize
            });
            
            this.emit('poolScaled', { dbName, action: 'down', size: targetSize });
            
        } catch (error) {
            logger.error(`Failed to scale down pool ${dbName}`, { error: error.message });
        }
    }
    
    async performHealthCheck() {
        for (const [dbName, pool] of this.pools) {
            try {
                await pool.healthCheck();
                
                // Update overall metrics
                const poolMetrics = pool.getMetrics();
                this.metrics.totalConnections += poolMetrics.totalConnections;
                
            } catch (error) {
                logger.warn(`Health check failed for pool ${dbName}`, { 
                    error: error.message 
                });
            }
        }
    }
    
    updateAcquireTime(acquireTime) {
        // Update rolling average
        const alpha = 0.1; // Smoothing factor
        this.metrics.averageAcquireTime = this.metrics.averageAcquireTime * (1 - alpha) + 
                                         acquireTime * alpha;
    }
    
    getMetrics() {
        const poolMetrics = {};
        
        for (const [dbName, pool] of this.pools) {
            poolMetrics[dbName] = pool.getMetrics();
        }
        
        return {
            overall: this.metrics,
            pools: poolMetrics,
            scalingHistory: this.scalingHistory.slice(-10) // Last 10 scaling events
        };
    }
    
    async shutdown() {
        if (!this.isRunning) return;
        
        logger.info('Shutting down Connection Pool Manager');
        
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        
        // Close all pools
        const shutdownPromises = [];
        for (const [dbName, pool] of this.pools) {
            shutdownPromises.push(
                pool.shutdown().catch(error => {
                    logger.error(`Failed to shutdown pool ${dbName}`, { error: error.message });
                })
            );
        }
        
        await Promise.allSettled(shutdownPromises);
        
        this.isRunning = false;
        this.emit('shutdown');
    }
}

class DatabasePool {
    constructor(dbName, connectionFactory, config) {
        this.dbName = dbName;
        this.connectionFactory = connectionFactory;
        this.config = config;
        
        this.connections = [];
        this.available = [];
        this.waitingQueue = [];
        
        this.metrics = {
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            totalRequests: 0,
            errorCount: 0
        };
    }
    
    async createConnection() {
        try {
            const connection = await this.connectionFactory();
            connection.createdAt = Date.now();
            connection.lastUsed = Date.now();
            connection.id = `${this.dbName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            this.connections.push(connection);
            this.available.push(connection);
            this.metrics.totalConnections++;
            this.metrics.idleConnections++;
            
            return connection;
            
        } catch (error) {
            this.metrics.errorCount++;
            throw new Error(`Failed to create connection for ${this.dbName}: ${error.message}`);
        }
    }
    
    async acquire(priority = 'normal') {
        this.metrics.totalRequests++;
        
        // Try to get available connection
        if (this.available.length > 0) {
            const connection = this.available.shift();
            connection.lastUsed = Date.now();
            this.metrics.idleConnections--;
            this.metrics.activeConnections++;
            return connection;
        }
        
        // Create new connection if under limit
        if (this.connections.length < this.config.maxConnections) {
            try {
                const connection = await this.createConnection();
                connection.lastUsed = Date.now();
                this.available.splice(this.available.indexOf(connection), 1);
                this.metrics.idleConnections--;
                this.metrics.activeConnections++;
                return connection;
            } catch (error) {
                // Fall through to waiting queue
            }
        }
        
        // Wait for available connection
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const index = this.waitingQueue.findIndex(req => req.resolve === resolve);
                if (index !== -1) {
                    this.waitingQueue.splice(index, 1);
                }
                reject(new Error(`Connection acquire timeout for ${this.dbName}`));
            }, this.config.acquireTimeoutMs);
            
            this.waitingQueue.push({ resolve, reject, timeout, priority });
            
            // Sort by priority
            this.waitingQueue.sort((a, b) => {
                const priorityOrder = { high: 3, normal: 2, low: 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            });
        });
    }
    
    async release(connection) {
        if (!connection) return;
        
        const index = this.connections.indexOf(connection);
        if (index === -1) {
            logger.warn(`Unknown connection returned to pool ${this.dbName}`);
            return;
        }
        
        connection.lastUsed = Date.now();
        this.metrics.activeConnections--;
        
        // Check if waiting requests exist
        if (this.waitingQueue.length > 0) {
            const request = this.waitingQueue.shift();
            clearTimeout(request.timeout);
            this.metrics.activeConnections++;
            request.resolve(connection);
            return;
        }
        
        // Return to available pool
        this.available.push(connection);
        this.metrics.idleConnections++;
    }
    
    async scale(targetSize) {
        const currentSize = this.connections.length;
        
        if (targetSize > currentSize) {
            // Scale up
            const newConnections = targetSize - currentSize;
            const promises = [];
            
            for (let i = 0; i < newConnections; i++) {
                promises.push(this.createConnection());
            }
            
            await Promise.allSettled(promises);
            
        } else if (targetSize < currentSize) {
            // Scale down
            const connectionsToRemove = currentSize - targetSize;
            
            // Remove idle connections first
            for (let i = 0; i < connectionsToRemove && this.available.length > 0; i++) {
                const connection = this.available.shift();
                this.removeConnection(connection);
            }
        }
    }
    
    removeConnection(connection) {
        const index = this.connections.indexOf(connection);
        if (index !== -1) {
            this.connections.splice(index, 1);
            this.metrics.totalConnections--;
            this.metrics.idleConnections--;
            
            // Close connection if it has a close method
            if (connection.close) {
                connection.close().catch(() => {});
            }
        }
    }
    
    async healthCheck() {
        const now = Date.now();
        const connectionsToRemove = [];
        
        // Check for old connections
        for (const connection of this.connections) {
            if (now - connection.createdAt > this.config.maxConnectionAge) {
                connectionsToRemove.push(connection);
            }
        }
        
        // Remove old connections
        for (const connection of connectionsToRemove) {
            if (this.available.includes(connection)) {
                this.removeConnection(connection);
            }
        }
        
        // Ensure minimum connections
        while (this.connections.length < this.config.minConnections) {
            try {
                await this.createConnection();
            } catch (error) {
                logger.error(`Failed to maintain minimum connections for ${this.dbName}`, { 
                    error: error.message 
                });
                break;
            }
        }
    }
    
    getMetrics() {
        return { ...this.metrics };
    }
    
    async shutdown() {
        // Reject all waiting requests
        for (const request of this.waitingQueue) {
            clearTimeout(request.timeout);
            request.reject(new Error(`Pool ${this.dbName} is shutting down`));
        }
        this.waitingQueue = [];
        
        // Close all connections
        const closePromises = this.connections.map(connection => {
            if (connection.close) {
                return connection.close().catch(() => {});
            }
            return Promise.resolve();
        });
        
        await Promise.allSettled(closePromises);
        
        this.connections = [];
        this.available = [];
        this.metrics.totalConnections = 0;
        this.metrics.activeConnections = 0;
        this.metrics.idleConnections = 0;
    }
}

module.exports = { ConnectionPoolManager, DatabasePool };