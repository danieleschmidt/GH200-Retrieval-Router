/**
 * ConnectionPool - High-performance connection pooling for GH200
 * Optimized for Grace Hopper architecture with intelligent load balancing
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');

/**
 * Connection states
 */
const CONNECTION_STATE = {
    IDLE: 'idle',
    ACTIVE: 'active',
    CONNECTING: 'connecting',
    ERROR: 'error',
    CLOSED: 'closed'
};

/**
 * Individual connection wrapper
 */
class PooledConnection extends EventEmitter {
    constructor(factory, options = {}) {
        super();
        
        this.factory = factory;
        this.options = options;
        this.connection = null;
        this.state = CONNECTION_STATE.IDLE;
        this.created = Date.now();
        this.lastUsed = Date.now();
        this.useCount = 0;
        this.errors = 0;
        this.id = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Health check interval
        this.healthCheckInterval = null;
        
        this._startHealthChecks();
    }
    
    /**
     * Create the actual connection
     */
    async connect() {
        if (this.state === CONNECTION_STATE.CONNECTING || 
            this.state === CONNECTION_STATE.ACTIVE) {
            return this.connection;
        }
        
        this.state = CONNECTION_STATE.CONNECTING;
        
        try {
            this.connection = await this.factory.create();
            this.state = CONNECTION_STATE.ACTIVE;
            this.emit('connected');
            
            logger.debug('Connection established', { id: this.id });
            
            return this.connection;
            
        } catch (error) {
            this.state = CONNECTION_STATE.ERROR;
            this.errors++;
            this.emit('error', error);
            
            logger.error('Connection failed', { 
                id: this.id, 
                error: error.message 
            });
            
            throw error;
        }
    }
    
    /**
     * Use the connection
     */
    async use() {
        if (this.state !== CONNECTION_STATE.ACTIVE) {
            await this.connect();
        }
        
        this.lastUsed = Date.now();
        this.useCount++;
        this.state = CONNECTION_STATE.ACTIVE;
        
        return this.connection;
    }
    
    /**
     * Release the connection back to idle state
     */
    release() {
        if (this.state === CONNECTION_STATE.ACTIVE) {
            this.state = CONNECTION_STATE.IDLE;
            this.emit('released');
        }
    }
    
    /**
     * Close the connection
     */
    async close() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        if (this.connection && this.factory.destroy) {
            try {
                await this.factory.destroy(this.connection);
            } catch (error) {
                logger.warn('Error destroying connection', { 
                    id: this.id, 
                    error: error.message 
                });
            }
        }
        
        this.state = CONNECTION_STATE.CLOSED;
        this.connection = null;
        this.emit('closed');
        
        logger.debug('Connection closed', { id: this.id });
    }
    
    /**
     * Check if connection is healthy
     */
    async isHealthy() {
        if (this.state === CONNECTION_STATE.CLOSED || 
            this.state === CONNECTION_STATE.ERROR) {
            return false;
        }
        
        if (this.factory.validate) {
            try {
                return await this.factory.validate(this.connection);
            } catch (error) {
                logger.warn('Connection validation failed', { 
                    id: this.id, 
                    error: error.message 
                });
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Get connection age in milliseconds
     */
    getAge() {
        return Date.now() - this.created;
    }
    
    /**
     * Get idle time in milliseconds
     */
    getIdleTime() {
        return Date.now() - this.lastUsed;
    }
    
    /**
     * Get connection statistics
     */
    getStats() {
        return {
            id: this.id,
            state: this.state,
            created: this.created,
            lastUsed: this.lastUsed,
            useCount: this.useCount,
            errors: this.errors,
            age: this.getAge(),
            idleTime: this.getIdleTime()
        };
    }
    
    /**
     * Start health checks
     */
    _startHealthChecks() {
        if (this.options.healthCheckInterval > 0) {
            this.healthCheckInterval = setInterval(async () => {
                if (this.state === CONNECTION_STATE.IDLE) {
                    const healthy = await this.isHealthy();
                    if (!healthy) {
                        this.emit('unhealthy');
                    }
                }
            }, this.options.healthCheckInterval);
        }
    }
}

/**
 * High-performance connection pool
 */
class ConnectionPool extends EventEmitter {
    constructor(factory, options = {}) {
        super();
        
        this.factory = factory;
        this.options = {
            min: 2,                    // Minimum connections
            max: 10,                   // Maximum connections
            acquireTimeout: 30000,     // 30 seconds
            idleTimeout: 300000,       // 5 minutes
            maxAge: 3600000,          // 1 hour
            healthCheckInterval: 60000, // 1 minute
            fifo: false,              // LIFO by default for better cache locality
            prioritizeRecentlyUsed: true,
            ...options
        };
        
        this.connections = new Set();
        this.idleConnections = [];
        this.pendingRequests = [];
        
        // Statistics
        this.stats = {
            created: 0,
            destroyed: 0,
            acquired: 0,
            released: 0,
            timeouts: 0,
            errors: 0
        };
        
        // State
        this.destroyed = false;
        
        // Initialize minimum connections
        this._initialize();
        
        // Start maintenance tasks
        this._startMaintenance();
        
        logger.info('ConnectionPool created', {
            min: this.options.min,
            max: this.options.max,
            factory: this.factory.name || 'unknown'
        });
    }
    
    /**
     * Acquire a connection from the pool
     * @param {Object} options - Acquisition options
     * @returns {Promise<*>} Connection instance
     */
    async acquire(options = {}) {
        if (this.destroyed) {
            throw new Error('Pool has been destroyed');
        }
        
        const timeout = options.timeout || this.options.acquireTimeout;
        const priority = options.priority || 'normal';
        
        return new Promise((resolve, reject) => {
            const request = {
                resolve,
                reject,
                priority,
                created: Date.now(),
                timeout: setTimeout(() => {
                    this.stats.timeouts++;
                    this._removeRequest(request);
                    reject(new Error('Connection acquisition timeout'));
                }, timeout)
            };
            
            // Add to pending requests
            if (priority === 'high') {
                this.pendingRequests.unshift(request);
            } else {
                this.pendingRequests.push(request);
            }
            
            // Try to fulfill immediately
            this._tryFulfillRequests();
        });
    }
    
    /**
     * Release a connection back to the pool
     * @param {*} connection - Connection to release
     */
    async release(connection) {
        if (this.destroyed) {
            return;
        }
        
        const pooledConn = this._findConnectionByInstance(connection);
        if (!pooledConn) {
            logger.warn('Attempted to release unknown connection');
            return;
        }
        
        pooledConn.release();
        this.stats.released++;
        
        // Add back to idle connections
        if (pooledConn.state === CONNECTION_STATE.IDLE) {
            if (this.options.prioritizeRecentlyUsed) {
                this.idleConnections.unshift(pooledConn);
            } else if (this.options.fifo) {
                this.idleConnections.push(pooledConn);
            } else {
                this.idleConnections.unshift(pooledConn); // LIFO
            }
        }
        
        this.emit('connectionReleased', pooledConn);
        
        // Try to fulfill pending requests
        this._tryFulfillRequests();
    }
    
    /**
     * Destroy the entire pool
     */
    async destroy() {
        if (this.destroyed) {
            return;
        }
        
        this.destroyed = true;
        
        // Reject all pending requests
        for (const request of this.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new Error('Pool destroyed'));
        }
        this.pendingRequests = [];
        
        // Close all connections
        const closePromises = [];
        for (const conn of this.connections) {
            closePromises.push(conn.close());
        }
        
        await Promise.all(closePromises);
        
        this.connections.clear();
        this.idleConnections = [];
        
        this.emit('destroyed');
        
        logger.info('ConnectionPool destroyed', {
            connectionsDestroyed: closePromises.length
        });
    }
    
    /**
     * Get pool statistics
     */
    getStats() {
        const connectionStats = {
            total: this.connections.size,
            idle: this.idleConnections.length,
            active: this.connections.size - this.idleConnections.length,
            pending: this.pendingRequests.length
        };
        
        const ageStats = this._calculateAgeStats();
        const healthStats = this._calculateHealthStats();
        
        return {
            connections: connectionStats,
            operations: { ...this.stats },
            ages: ageStats,
            health: healthStats,
            options: this.options
        };
    }
    
    /**
     * Get detailed connection information
     */
    getConnectionDetails() {
        return Array.from(this.connections).map(conn => conn.getStats());
    }
    
    /**
     * Initialize minimum connections
     */
    async _initialize() {
        const promises = [];
        
        for (let i = 0; i < this.options.min; i++) {
            promises.push(this._createConnection());
        }
        
        try {
            await Promise.all(promises);
            logger.info('Pool initialized with minimum connections', {
                created: this.options.min
            });
        } catch (error) {
            logger.error('Failed to initialize minimum connections', {
                error: error.message
            });
        }
    }
    
    /**
     * Create a new connection
     */
    async _createConnection() {
        if (this.connections.size >= this.options.max) {
            throw new Error('Maximum connection limit reached');
        }
        
        const conn = new PooledConnection(this.factory, {
            healthCheckInterval: this.options.healthCheckInterval
        });
        
        // Set up event listeners
        conn.on('error', (error) => {
            this.stats.errors++;
            this.emit('connectionError', conn, error);
            this._removeConnection(conn);
        });
        
        conn.on('unhealthy', () => {
            this._removeConnection(conn);
        });
        
        conn.on('closed', () => {
            this._removeConnection(conn);
        });
        
        this.connections.add(conn);
        this.idleConnections.push(conn);
        this.stats.created++;
        
        this.emit('connectionCreated', conn);
        
        return conn;
    }
    
    /**
     * Remove connection from pool
     */
    _removeConnection(conn) {
        this.connections.delete(conn);
        
        const idleIndex = this.idleConnections.indexOf(conn);
        if (idleIndex >= 0) {
            this.idleConnections.splice(idleIndex, 1);
        }
        
        this.stats.destroyed++;
        this.emit('connectionRemoved', conn);
        
        // Create replacement if below minimum
        if (this.connections.size < this.options.min && !this.destroyed) {
            setImmediate(() => this._createConnection().catch(() => {}));
        }
    }
    
    /**
     * Try to fulfill pending requests
     */
    async _tryFulfillRequests() {
        while (this.pendingRequests.length > 0 && this.idleConnections.length > 0) {
            const request = this.pendingRequests.shift();
            const conn = this.idleConnections.shift();
            
            clearTimeout(request.timeout);
            
            try {
                const connection = await conn.use();
                this.stats.acquired++;
                request.resolve(connection);
                this.emit('connectionAcquired', conn);
            } catch (error) {
                this.stats.errors++;
                request.reject(error);
                this._removeConnection(conn);
            }
        }
        
        // Create new connections if needed
        if (this.pendingRequests.length > 0 && 
            this.connections.size < this.options.max) {
            
            try {
                await this._createConnection();
                // Recursively try to fulfill more requests
                setImmediate(() => this._tryFulfillRequests());
            } catch (error) {
                logger.warn('Failed to create new connection', { 
                    error: error.message 
                });
            }
        }
    }
    
    /**
     * Find connection by instance
     */
    _findConnectionByInstance(instance) {
        for (const conn of this.connections) {
            if (conn.connection === instance) {
                return conn;
            }
        }
        return null;
    }
    
    /**
     * Remove request from pending list
     */
    _removeRequest(request) {
        const index = this.pendingRequests.indexOf(request);
        if (index >= 0) {
            this.pendingRequests.splice(index, 1);
        }
    }
    
    /**
     * Start maintenance tasks
     */
    _startMaintenance() {
        // Cleanup idle connections every minute
        setInterval(() => {
            this._cleanupIdleConnections();
        }, 60000);
        
        // Health checks every 5 minutes
        setInterval(() => {
            this._performHealthChecks();
        }, 300000);
        
        // Log statistics every 10 minutes
        setInterval(() => {
            logger.debug('ConnectionPool statistics', this.getStats());
        }, 600000);
    }
    
    /**
     * Cleanup idle connections
     */
    async _cleanupIdleConnections() {
        const now = Date.now();
        const toRemove = [];
        
        for (const conn of this.idleConnections) {
            const shouldRemove = (
                conn.getAge() > this.options.maxAge ||
                conn.getIdleTime() > this.options.idleTimeout ||
                !(await conn.isHealthy())
            );
            
            if (shouldRemove && this.connections.size > this.options.min) {
                toRemove.push(conn);
            }
        }
        
        // Remove old/unhealthy connections
        for (const conn of toRemove) {
            await conn.close();
            this._removeConnection(conn);
        }
        
        if (toRemove.length > 0) {
            logger.debug('Cleaned up idle connections', { 
                removed: toRemove.length 
            });
        }
    }
    
    /**
     * Perform health checks on all connections
     */
    async _performHealthChecks() {
        const healthPromises = [];
        
        for (const conn of this.connections) {
            if (conn.state === CONNECTION_STATE.IDLE) {
                healthPromises.push(
                    conn.isHealthy().then(healthy => ({ conn, healthy }))
                );
            }
        }
        
        const results = await Promise.all(healthPromises);
        const unhealthyConnections = results
            .filter(result => !result.healthy)
            .map(result => result.conn);
        
        // Remove unhealthy connections
        for (const conn of unhealthyConnections) {
            await conn.close();
            this._removeConnection(conn);
        }
        
        if (unhealthyConnections.length > 0) {
            logger.warn('Removed unhealthy connections', { 
                count: unhealthyConnections.length 
            });
        }
    }
    
    /**
     * Calculate age statistics
     */
    _calculateAgeStats() {
        const ages = Array.from(this.connections).map(conn => conn.getAge());
        
        if (ages.length === 0) {
            return { min: 0, max: 0, avg: 0 };
        }
        
        return {
            min: Math.min(...ages),
            max: Math.max(...ages),
            avg: ages.reduce((a, b) => a + b, 0) / ages.length
        };
    }
    
    /**
     * Calculate health statistics
     */
    _calculateHealthStats() {
        let healthy = 0;
        let unhealthy = 0;
        
        for (const conn of this.connections) {
            if (conn.state === CONNECTION_STATE.ACTIVE || 
                conn.state === CONNECTION_STATE.IDLE) {
                healthy++;
            } else {
                unhealthy++;
            }
        }
        
        return {
            healthy,
            unhealthy,
            healthyPercentage: (healthy + unhealthy) > 0 ? (healthy / (healthy + unhealthy)) * 100 : 100
        };
    }
}

/**
 * Pool manager for different types of connections
 */
class PoolManager {
    constructor() {
        this.pools = new Map();
    }
    
    /**
     * Create a connection pool
     * @param {string} name - Pool name
     * @param {Object} factory - Connection factory
     * @param {Object} options - Pool options
     * @returns {ConnectionPool} Created pool
     */
    createPool(name, factory, options = {}) {
        if (this.pools.has(name)) {
            throw new Error(`Pool '${name}' already exists`);
        }
        
        const pool = new ConnectionPool(factory, options);
        this.pools.set(name, pool);
        
        logger.info('Connection pool created', { name, options });
        
        return pool;
    }
    
    /**
     * Get pool by name
     * @param {string} name - Pool name
     * @returns {ConnectionPool|null} Pool instance or null
     */
    getPool(name) {
        return this.pools.get(name) || null;
    }
    
    /**
     * Destroy all pools
     */
    async destroyAll() {
        const destroyPromises = [];
        
        for (const pool of this.pools.values()) {
            destroyPromises.push(pool.destroy());
        }
        
        await Promise.all(destroyPromises);
        this.pools.clear();
        
        logger.info('All connection pools destroyed');
    }
    
    /**
     * Get statistics for all pools
     */
    getAllStats() {
        const stats = {};
        
        for (const [name, pool] of this.pools) {
            stats[name] = pool.getStats();
        }
        
        return stats;
    }
}

// Export singleton instance
const poolManager = new PoolManager();

module.exports = {
    ConnectionPool,
    PooledConnection,
    PoolManager,
    CONNECTION_STATE,
    poolManager
};