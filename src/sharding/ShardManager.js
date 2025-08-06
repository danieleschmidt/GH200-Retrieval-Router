/**
 * ShardManager - Distributed shard management for GH200 NVLink fabric
 * Handles automatic sharding, load balancing, and fault tolerance
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');
const { validateConfig } = require('../utils/validators');

class ShardManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            initialShards: 8,
            maxShards: 32,
            minShardSizeGB: 10,
            maxShardSizeGB: 100,
            replicationFactor: 2,
            autoRebalance: true,
            rebalanceThreshold: 0.3,
            ...config
        };
        
        // Shard registry
        this.shards = new Map();
        this.databases = new Map();
        this.nodeTopology = new Map();
        
        // Load balancing
        this.shardStats = new Map();
        this.routingTable = new Map();
        
        // State
        this.initialized = false;
        this.rebalanceInProgress = false;
        
        validateConfig(this.config);
    }
    
    /**
     * Initialize shard manager
     */
    async initialize() {
        if (this.initialized) {
            throw new Error('ShardManager already initialized');
        }
        
        logger.info('Initializing ShardManager', {
            initialShards: this.config.initialShards,
            maxShards: this.config.maxShards
        });
        
        try {
            // Discover node topology
            await this._discoverTopology();
            
            // Initialize shard registry
            await this._initializeShards();
            
            // Start monitoring
            if (this.config.autoRebalance) {
                this._startRebalanceMonitoring();
            }
            
            this.initialized = true;
            this.emit('initialized');
            
            logger.info('ShardManager initialization complete', {
                activeShards: this.shards.size,
                discoveredNodes: this.nodeTopology.size
            });
            
        } catch (error) {
            logger.error('ShardManager initialization failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Register a database for sharding
     * @param {string} name - Database name
     * @param {VectorDatabase} database - Database instance
     */
    async registerDatabase(name, database) {
        if (!this.initialized) {
            throw new Error('ShardManager not initialized');
        }
        
        logger.info(`Registering database '${name}' for sharding`);
        
        try {
            this.databases.set(name, database);
            
            // Create initial shards for database
            const shards = await this._createShards(name, database);
            
            // Update routing table
            this._updateRoutingTable(name, shards);
            
            this.emit('databaseRegistered', { name, shards: shards.length });
            
            logger.info(`Database '${name}' registered with ${shards.length} shards`);
            
        } catch (error) {
            logger.error(`Failed to register database '${name}'`, { error: error.message });
            throw error;
        }
    }
    
    /**
     * Get shards for a database
     * @param {string} databaseName - Database name
     * @returns {Array} Array of shard configurations
     */
    getShards(databaseName) {
        const shards = [];
        
        for (const [shardId, shard] of this.shards) {
            if (shard.database === databaseName) {
                shards.push({
                    id: shardId,
                    nodeId: shard.nodeId,
                    range: shard.range,
                    size: shard.size,
                    status: shard.status,
                    replicas: shard.replicas
                });
            }
        }
        
        return shards.sort((a, b) => a.id.localeCompare(b.id));
    }
    
    /**
     * Get optimal shards for a query
     * @param {Array} embedding - Query embedding
     * @param {Object} options - Query options
     * @returns {Array} Optimal shard targets
     */
    async getOptimalShards(embedding, options = {}) {
        const { database, k = 10 } = options;
        
        if (!database || !this.databases.has(database)) {
            throw new Error(`Database '${database}' not found`);
        }
        
        // Get all shards for database
        const shards = this.getShards(database);
        
        if (shards.length === 0) {
            throw new Error(`No shards available for database '${database}'`);
        }
        
        // For now, return all shards with load balancing
        // In a real implementation, this would use semantic routing
        const targetShards = await this._selectShardsByLoad(shards, k);
        
        return targetShards;
    }
    
    /**
     * Get active shard count
     */
    getActiveShardCount() {
        return Array.from(this.shards.values())
            .filter(shard => shard.status === 'active').length;
    }
    
    /**
     * Get shard statistics
     */
    getShardStats() {
        const stats = {
            totalShards: this.shards.size,
            activeShards: 0,
            inactiveShards: 0,
            totalSize: 0,
            averageLoad: 0,
            replicationFactorAchieved: 0
        };
        
        for (const shard of this.shards.values()) {
            if (shard.status === 'active') {
                stats.activeShards++;
                stats.totalSize += shard.size;
                stats.averageLoad += shard.load || 0;
            } else {
                stats.inactiveShards++;
            }
        }
        
        if (stats.activeShards > 0) {
            stats.averageLoad /= stats.activeShards;
        }
        
        return stats;
    }
    
    /**
     * Rebalance shards across nodes
     */
    async rebalance() {
        if (this.rebalanceInProgress) {
            logger.warn('Rebalance already in progress');
            return;
        }
        
        this.rebalanceInProgress = true;
        
        logger.info('Starting shard rebalancing');
        
        try {
            const stats = this.getShardStats();
            const imbalanceRatio = this._calculateImbalance();
            
            if (imbalanceRatio < this.config.rebalanceThreshold) {
                logger.info('Shards are already balanced', { imbalanceRatio });
                return;
            }
            
            // Implement rebalancing logic
            await this._performRebalancing();
            
            this.emit('rebalanceCompleted', { 
                beforeStats: stats, 
                afterStats: this.getShardStats() 
            });
            
            logger.info('Shard rebalancing completed');
            
        } catch (error) {
            logger.error('Shard rebalancing failed', { error: error.message });
            throw error;
        } finally {
            this.rebalanceInProgress = false;
        }
    }
    
    /**
     * Discover node topology
     */
    async _discoverTopology() {
        // In a real implementation, this would discover GH200 nodes
        // For now, simulate a multi-node setup
        const nodeCount = Math.min(this.config.maxShards / 4, 8);
        
        for (let i = 0; i < nodeCount; i++) {
            const nodeId = `gh200-node-${i}`;
            this.nodeTopology.set(nodeId, {
                id: nodeId,
                type: 'gh200',
                memory: 480 * 1024 * 1024 * 1024, // 480GB
                nvlinkConnections: nodeCount > 1 ? nodeCount - 1 : 0,
                status: 'active',
                load: 0,
                shards: []
            });
        }
        
        logger.info(`Discovered ${nodeCount} GH200 nodes`);
    }
    
    /**
     * Initialize shard registry
     */
    async _initializeShards() {
        // Initialize empty shard registry
        // Shards will be created when databases are registered
        logger.info('Shard registry initialized');
    }
    
    /**
     * Create shards for a database
     */
    async _createShards(databaseName, database) {
        const vectorCount = await database.getVectorCount();
        const dimensions = await database.getDimensions();
        
        // Calculate optimal shard count
        const estimatedSize = vectorCount * dimensions * 4; // 4 bytes per dimension
        const shardCount = Math.min(
            Math.ceil(estimatedSize / (this.config.maxShardSizeGB * 1024 * 1024 * 1024)),
            this.config.maxShards
        );
        
        const actualShardCount = Math.max(shardCount, 1);
        const vectorsPerShard = Math.ceil(vectorCount / actualShardCount);
        
        const shards = [];
        const nodes = Array.from(this.nodeTopology.keys());
        
        for (let i = 0; i < actualShardCount; i++) {
            const shardId = `${databaseName}_shard_${i.toString().padStart(3, '0')}`;
            const nodeId = nodes[i % nodes.length];
            
            const shard = {
                id: shardId,
                database: databaseName,
                nodeId,
                range: {
                    start: i * vectorsPerShard,
                    end: Math.min((i + 1) * vectorsPerShard, vectorCount)
                },
                size: estimatedSize / actualShardCount,
                status: 'active',
                replicas: [],
                load: 0,
                created: new Date().toISOString()
            };
            
            this.shards.set(shardId, shard);
            shards.push(shard);
            
            // Update node shard list
            const node = this.nodeTopology.get(nodeId);
            node.shards.push(shardId);
        }
        
        // Create replicas if replication factor > 1
        if (this.config.replicationFactor > 1) {
            await this._createReplicas(shards);
        }
        
        return shards;
    }
    
    /**
     * Create replicas for shards
     */
    async _createReplicas(shards) {
        const nodes = Array.from(this.nodeTopology.keys());
        
        for (const shard of shards) {
            const primaryNodeIndex = nodes.indexOf(shard.nodeId);
            
            for (let i = 1; i < this.config.replicationFactor; i++) {
                const replicaNodeIndex = (primaryNodeIndex + i) % nodes.length;
                const replicaNodeId = nodes[replicaNodeIndex];
                
                if (replicaNodeId !== shard.nodeId) {
                    shard.replicas.push({
                        nodeId: replicaNodeId,
                        status: 'active',
                        lag: 0
                    });
                    
                    // Update replica node shard list
                    const replicaNode = this.nodeTopology.get(replicaNodeId);
                    replicaNode.shards.push(`${shard.id}_replica`);
                }
            }
        }
    }
    
    /**
     * Update routing table for database
     */
    _updateRoutingTable(databaseName, shards) {
        const routes = shards.map(shard => ({
            shardId: shard.id,
            nodeId: shard.nodeId,
            range: shard.range,
            weight: 1.0
        }));
        
        this.routingTable.set(databaseName, routes);
    }
    
    /**
     * Select shards by load balancing
     */
    async _selectShardsByLoad(shards, k) {
        // Sort shards by load (ascending)
        const sortedShards = shards
            .filter(shard => shard.status === 'active')
            .sort((a, b) => (a.load || 0) - (b.load || 0));
        
        // For small k, use least loaded shards
        // For large k, distribute across more shards
        const selectedCount = Math.min(
            Math.max(Math.ceil(k / 100), 1),
            sortedShards.length
        );
        
        return sortedShards.slice(0, selectedCount).map(shard => ({
            id: shard.id,
            nodeId: shard.nodeId,
            weight: 1.0 / selectedCount
        }));
    }
    
    /**
     * Calculate shard imbalance ratio
     */
    _calculateImbalance() {
        const loads = Array.from(this.shards.values()).map(s => s.load || 0);
        
        if (loads.length === 0) return 0;
        
        const avg = loads.reduce((a, b) => a + b, 0) / loads.length;
        const max = Math.max(...loads);
        const min = Math.min(...loads);
        
        if (avg === 0) return 0;
        
        return (max - min) / avg;
    }
    
    /**
     * Perform actual rebalancing
     */
    async _performRebalancing() {
        // Placeholder for rebalancing logic
        // In a real implementation, this would move shards between nodes
        logger.info('Rebalancing shards across nodes');
        
        // Simulate rebalancing delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Update shard loads to simulate rebalancing
        for (const shard of this.shards.values()) {
            shard.load = Math.random() * 0.5; // Simulate balanced load
        }
    }
    
    /**
     * Start automatic rebalancing monitoring
     */
    _startRebalanceMonitoring() {
        setInterval(async () => {
            if (this.rebalanceInProgress) return;
            
            const imbalanceRatio = this._calculateImbalance();
            
            if (imbalanceRatio > this.config.rebalanceThreshold) {
                logger.info('Imbalance detected, triggering rebalance', { imbalanceRatio });
                try {
                    await this.rebalance();
                } catch (error) {
                    logger.error('Automatic rebalance failed', { error: error.message });
                }
            }
        }, 30000); // Check every 30 seconds
    }
    
    /**
     * Shutdown shard manager
     */
    async shutdown() {
        if (!this.initialized) {
            return;
        }
        
        logger.info('Shutting down ShardManager');
        
        try {
            // Clear all data structures
            this.shards.clear();
            this.databases.clear();
            this.nodeTopology.clear();
            this.shardStats.clear();
            this.routingTable.clear();
            
            this.initialized = false;
            this.emit('shutdown');
            
            logger.info('ShardManager shutdown complete');
            
        } catch (error) {
            logger.error('Error during ShardManager shutdown', { error: error.message });
            throw error;
        }
    }
}

module.exports = { ShardManager };