/**
 * LoadBalancer - Intelligent load balancing for GH200 nodes
 * Distributes queries across available shards and nodes
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');

class LoadBalancer extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            strategy: 'least_connections', // round_robin, least_connections, weighted_response_time
            healthCheckInterval: 30000, // 30 seconds
            maxRetries: 3,
            timeoutMs: 5000,
            ...options
        };
        
        this.shardManager = options.shardManager;
        
        // Load balancing state
        this.nodeStats = new Map();
        this.shardStats = new Map();
        this.currentIndex = 0; // For round robin
        
        // Health monitoring
        this.healthCheckInterval = null;
        this.initialized = false;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        logger.info('Initializing LoadBalancer', { strategy: this.options.strategy });
        
        try {
            // Initialize node and shard statistics
            await this._initializeStats();
            
            // Start health monitoring
            await this._startHealthMonitoring();
            
            this.initialized = true;
            logger.info('LoadBalancer initialized successfully');
            
        } catch (error) {
            logger.error('LoadBalancer initialization failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Select optimal shard for a query
     * @param {Array} availableShards - Available shard options
     * @param {Object} queryContext - Query context information
     * @returns {Object} Selected shard with routing decision
     */
    async selectShard(availableShards, queryContext = {}) {
        if (!this.initialized) {
            throw new Error('LoadBalancer not initialized');
        }
        
        if (!availableShards || availableShards.length === 0) {
            throw new Error('No available shards for load balancing');
        }
        
        // Filter healthy shards
        const healthyShards = availableShards.filter(shard => 
            this._isShardHealthy(shard.id)
        );
        
        if (healthyShards.length === 0) {
            logger.warn('No healthy shards available, using all shards');
            // Fallback to all shards if none are marked healthy
            healthyShards.push(...availableShards);
        }
        
        // Select shard based on strategy
        let selectedShard;
        
        switch (this.options.strategy) {
            case 'round_robin':
                selectedShard = this._roundRobinSelection(healthyShards);
                break;
            case 'least_connections':
                selectedShard = this._leastConnectionsSelection(healthyShards);
                break;
            case 'weighted_response_time':
                selectedShard = this._weightedResponseTimeSelection(healthyShards);
                break;
            default:
                selectedShard = this._leastConnectionsSelection(healthyShards);
        }
        
        // Update shard statistics
        this._updateShardStats(selectedShard.id, 'selected');
        
        return {
            shard: selectedShard,
            strategy: this.options.strategy,
            availableShards: healthyShards.length,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Select multiple shards for distributed query
     * @param {Array} availableShards - Available shard options
     * @param {number} count - Number of shards to select
     * @param {Object} queryContext - Query context
     * @returns {Array} Selected shards
     */
    async selectShards(availableShards, count, queryContext = {}) {
        if (count >= availableShards.length) {
            return availableShards.map(shard => ({
                shard,
                strategy: this.options.strategy,
                weight: 1.0 / availableShards.length
            }));
        }
        
        const selectedShards = [];
        const remainingShards = [...availableShards];
        
        for (let i = 0; i < count && remainingShards.length > 0; i++) {
            const selection = await this.selectShard(remainingShards, queryContext);
            selectedShards.push(selection);
            
            // Remove selected shard from remaining options
            const selectedIndex = remainingShards.findIndex(s => s.id === selection.shard.id);
            if (selectedIndex >= 0) {
                remainingShards.splice(selectedIndex, 1);
            }
        }
        
        return selectedShards;
    }
    
    /**
     * Report query completion for load balancing feedback
     * @param {string} shardId - Shard ID that handled the query
     * @param {Object} metrics - Query performance metrics
     */
    async reportQueryCompletion(shardId, metrics = {}) {
        const { responseTime, success, error } = metrics;
        
        // Update shard statistics
        this._updateShardStats(shardId, 'completed', {
            responseTime,
            success,
            error
        });
        
        // Update node statistics
        const shard = await this._getShardInfo(shardId);
        if (shard && shard.nodeId) {
            this._updateNodeStats(shard.nodeId, {
                responseTime,
                success,
                error
            });
        }
    }
    
    /**
     * Get load balancing statistics
     */
    getStats() {
        const nodeStatsArray = Array.from(this.nodeStats.entries()).map(([nodeId, stats]) => ({
            nodeId,
            ...stats
        }));
        
        const shardStatsArray = Array.from(this.shardStats.entries()).map(([shardId, stats]) => ({
            shardId,
            ...stats
        }));
        
        return {
            strategy: this.options.strategy,
            nodes: nodeStatsArray,
            shards: shardStatsArray,
            healthyNodes: nodeStatsArray.filter(n => n.healthy).length,
            healthyShards: shardStatsArray.filter(s => s.healthy).length
        };
    }
    
    /**
     * Round robin shard selection
     */
    _roundRobinSelection(shards) {
        const selected = shards[this.currentIndex % shards.length];
        this.currentIndex = (this.currentIndex + 1) % shards.length;
        return selected;
    }
    
    /**
     * Least connections shard selection
     */
    _leastConnectionsSelection(shards) {
        let selectedShard = shards[0];
        let minConnections = this._getShardConnections(shards[0].id);
        
        for (let i = 1; i < shards.length; i++) {
            const connections = this._getShardConnections(shards[i].id);
            if (connections < minConnections) {
                minConnections = connections;
                selectedShard = shards[i];
            }
        }
        
        return selectedShard;
    }
    
    /**
     * Weighted response time shard selection
     */
    _weightedResponseTimeSelection(shards) {
        // Calculate weights based on inverse response time
        const weights = shards.map(shard => {
            const avgResponseTime = this._getShardAverageResponseTime(shard.id);
            return avgResponseTime > 0 ? 1 / avgResponseTime : 1;
        });
        
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        
        if (totalWeight === 0) {
            return shards[0]; // Fallback to first shard
        }
        
        // Weighted random selection
        const randomValue = Math.random() * totalWeight;
        let cumulativeWeight = 0;
        
        for (let i = 0; i < shards.length; i++) {
            cumulativeWeight += weights[i];
            if (randomValue <= cumulativeWeight) {
                return shards[i];
            }
        }
        
        return shards[shards.length - 1]; // Fallback
    }
    
    /**
     * Initialize statistics tracking
     */
    async _initializeStats() {
        // Initialize node statistics
        if (this.shardManager) {
            const topology = this.shardManager.nodeTopology;
            
            for (const [nodeId, node] of topology) {
                this.nodeStats.set(nodeId, {
                    healthy: true,
                    connections: 0,
                    totalQueries: 0,
                    successfulQueries: 0,
                    failedQueries: 0,
                    totalResponseTime: 0,
                    averageResponseTime: 0,
                    lastHealthCheck: new Date().toISOString()
                });
            }
        }
        
        logger.info(`Initialized statistics for ${this.nodeStats.size} nodes`);
    }
    
    /**
     * Start health monitoring
     */
    async _startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(async () => {
            await this._performHealthChecks();
        }, this.options.healthCheckInterval);
        
        // Perform initial health check
        await this._performHealthChecks();
        
        logger.info('Health monitoring started');
    }
    
    /**
     * Perform health checks on all nodes and shards
     */
    async _performHealthChecks() {
        try {
            // Check node health
            for (const [nodeId, stats] of this.nodeStats) {
                const isHealthy = await this._checkNodeHealth(nodeId);
                stats.healthy = isHealthy;
                stats.lastHealthCheck = new Date().toISOString();
                
                if (!isHealthy) {
                    logger.warn(`Node ${nodeId} marked as unhealthy`);
                }
            }
            
            // Check shard health
            for (const [shardId, stats] of this.shardStats) {
                const isHealthy = await this._checkShardHealth(shardId);
                stats.healthy = isHealthy;
                stats.lastHealthCheck = new Date().toISOString();
                
                if (!isHealthy) {
                    logger.warn(`Shard ${shardId} marked as unhealthy`);
                }
            }
            
        } catch (error) {
            logger.error('Health check failed', { error: error.message });
        }
    }
    
    /**
     * Check node health
     */
    async _checkNodeHealth(nodeId) {
        // Mock health check - in real implementation would ping node
        const stats = this.nodeStats.get(nodeId);
        
        if (!stats) return false;
        
        // Consider node unhealthy if average response time is too high
        const isHealthy = stats.averageResponseTime < 5000; // 5 seconds
        
        return isHealthy;
    }
    
    /**
     * Check shard health
     */
    async _checkShardHealth(shardId) {
        // Mock health check
        const stats = this.shardStats.get(shardId);
        
        if (!stats) return true; // Unknown shards are considered healthy
        
        // Consider shard unhealthy if error rate is too high
        const errorRate = stats.totalQueries > 0 ? 
            stats.failedQueries / stats.totalQueries : 0;
        
        return errorRate < 0.1; // Less than 10% error rate
    }
    
    /**
     * Check if shard is healthy
     */
    _isShardHealthy(shardId) {
        const stats = this.shardStats.get(shardId);
        return stats ? stats.healthy !== false : true;
    }
    
    /**
     * Get shard connection count
     */
    _getShardConnections(shardId) {
        const stats = this.shardStats.get(shardId);
        return stats ? stats.connections || 0 : 0;
    }
    
    /**
     * Get shard average response time
     */
    _getShardAverageResponseTime(shardId) {
        const stats = this.shardStats.get(shardId);
        return stats ? stats.averageResponseTime || 100 : 100; // Default 100ms
    }
    
    /**
     * Update shard statistics
     */
    _updateShardStats(shardId, event, metrics = {}) {
        let stats = this.shardStats.get(shardId);
        
        if (!stats) {
            stats = {
                healthy: true,
                connections: 0,
                totalQueries: 0,
                successfulQueries: 0,
                failedQueries: 0,
                totalResponseTime: 0,
                averageResponseTime: 0,
                lastActivity: new Date().toISOString()
            };
            this.shardStats.set(shardId, stats);
        }
        
        switch (event) {
            case 'selected':
                stats.connections++;
                break;
            case 'completed':
                stats.connections = Math.max(0, stats.connections - 1);
                stats.totalQueries++;
                
                if (metrics.success !== false) {
                    stats.successfulQueries++;
                } else {
                    stats.failedQueries++;
                }
                
                if (metrics.responseTime) {
                    stats.totalResponseTime += metrics.responseTime;
                    stats.averageResponseTime = stats.totalResponseTime / stats.totalQueries;
                }
                
                stats.lastActivity = new Date().toISOString();
                break;
        }
    }
    
    /**
     * Update node statistics
     */
    _updateNodeStats(nodeId, metrics = {}) {
        let stats = this.nodeStats.get(nodeId);
        
        if (!stats) return;
        
        stats.totalQueries++;
        
        if (metrics.success !== false) {
            stats.successfulQueries++;
        } else {
            stats.failedQueries++;
        }
        
        if (metrics.responseTime) {
            stats.totalResponseTime += metrics.responseTime;
            stats.averageResponseTime = stats.totalResponseTime / stats.totalQueries;
        }
    }
    
    /**
     * Get shard information
     */
    async _getShardInfo(shardId) {
        if (!this.shardManager) return null;
        
        for (const shard of this.shardManager.shards.values()) {
            if (shard.id === shardId) {
                return shard;
            }
        }
        
        return null;
    }
    
    /**
     * Shutdown load balancer
     */
    async shutdown() {
        if (!this.initialized) return;
        
        logger.info('Shutting down LoadBalancer');
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        
        this.nodeStats.clear();
        this.shardStats.clear();
        this.initialized = false;
        
        logger.info('LoadBalancer shutdown complete');
    }
}

module.exports = { LoadBalancer };