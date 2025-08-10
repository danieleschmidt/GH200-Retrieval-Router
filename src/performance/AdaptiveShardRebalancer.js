/**
 * Adaptive Shard Rebalancing System for GH200
 * Dynamic load balancing and data redistribution across cluster nodes
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');

/**
 * Shard state and metadata
 */
class Shard {
    constructor(id, nodeId, options = {}) {
        this.id = id;
        this.nodeId = nodeId;
        this.config = {
            vectorCount: options.vectorCount || 0,
            sizeBytes: options.sizeBytes || 0,
            indexType: options.indexType || 'IVF_PQ',
            replicationFactor: options.replicationFactor || 1,
            ...options
        };
        
        this.metrics = {
            queryLoad: 0,
            avgResponseTime: 0,
            errorRate: 0,
            memoryUsage: 0,
            diskUsage: 0,
            lastAccessed: Date.now(),
            hotSpotScore: 0
        };
        
        this.status = 'active';
        this.replicationNodes = new Set();
        this.migrationHistory = [];
        this.created = Date.now();
        this.lastUpdated = Date.now();
    }
    
    updateMetrics(metrics) {
        this.metrics = {
            ...this.metrics,
            ...metrics,
            lastAccessed: Date.now()
        };
        
        this.lastUpdated = Date.now();
        this._calculateHotSpotScore();
    }
    
    _calculateHotSpotScore() {
        // Calculate hotspot score based on multiple factors
        const loadWeight = 0.4;
        const latencyWeight = 0.3;
        const errorWeight = 0.3;
        
        const normalizedLoad = Math.min(this.metrics.queryLoad / 1000, 1.0);
        const normalizedLatency = Math.min(this.metrics.avgResponseTime / 1000, 1.0);
        const normalizedError = Math.min(this.metrics.errorRate * 10, 1.0);
        
        this.metrics.hotSpotScore = 
            (normalizedLoad * loadWeight) +
            (normalizedLatency * latencyWeight) +
            (normalizedError * errorWeight);
    }
    
    addReplica(nodeId) {
        this.replicationNodes.add(nodeId);
        return this.replicationNodes.size;
    }
    
    removeReplica(nodeId) {
        this.replicationNodes.delete(nodeId);
        return this.replicationNodes.size;
    }
    
    recordMigration(fromNodeId, toNodeId, reason) {
        this.migrationHistory.push({
            from: fromNodeId,
            to: toNodeId,
            reason,
            timestamp: Date.now(),
            vectorCount: this.config.vectorCount,
            sizeBytes: this.config.sizeBytes
        });
        
        // Keep only recent migration history
        if (this.migrationHistory.length > 10) {
            this.migrationHistory = this.migrationHistory.slice(-10);
        }
        
        this.nodeId = toNodeId;
        this.lastUpdated = Date.now();
    }
    
    getStats() {
        return {
            id: this.id,
            nodeId: this.nodeId,
            config: { ...this.config },
            metrics: { ...this.metrics },
            status: this.status,
            replicationCount: this.replicationNodes.size,
            migrationCount: this.migrationHistory.length,
            age: Date.now() - this.created
        };
    }
}

/**
 * Node resource tracking
 */
class ClusterNode {
    constructor(id, config = {}) {
        this.id = id;
        this.config = {
            memoryCapacityGB: config.memoryCapacityGB || 480, // GH200 memory
            diskCapacityTB: config.diskCapacityTB || 10,
            maxShards: config.maxShards || 1000,
            region: config.region || 'default',
            zone: config.zone || 'default',
            nodeType: config.nodeType || 'gh200',
            ...config
        };
        
        this.resources = {
            memoryUsedGB: 0,
            diskUsedTB: 0,
            cpuUtilization: 0,
            gpuUtilization: 0,
            networkUtilization: 0,
            shardCount: 0
        };
        
        this.performance = {
            avgResponseTime: 0,
            queryThroughput: 0,
            errorRate: 0,
            availability: 1.0
        };
        
        this.shards = new Set();
        this.status = 'healthy';
        this.lastHealthCheck = Date.now();
        this.joinedAt = Date.now();
    }
    
    updateResources(resources) {
        this.resources = {
            ...this.resources,
            ...resources
        };
        
        this._updateCapacityScores();
    }
    
    updatePerformance(performance) {
        this.performance = {
            ...this.performance,
            ...performance
        };
    }
    
    _updateCapacityScores() {
        this.capacityScores = {
            memory: 1 - (this.resources.memoryUsedGB / this.config.memoryCapacityGB),
            disk: 1 - (this.resources.diskUsedTB / this.config.diskCapacityTB),
            shard: 1 - (this.resources.shardCount / this.config.maxShards),
            cpu: 1 - (this.resources.cpuUtilization / 100),
            gpu: 1 - (this.resources.gpuUtilization / 100)
        };
        
        this.overallCapacity = Object.values(this.capacityScores).reduce((a, b) => a + b, 0) / 5;
    }
    
    addShard(shardId) {
        this.shards.add(shardId);
        this.resources.shardCount = this.shards.size;
        this._updateCapacityScores();
    }
    
    removeShard(shardId) {
        this.shards.delete(shardId);
        this.resources.shardCount = this.shards.size;
        this._updateCapacityScores();
    }
    
    canAcceptShard(shard) {
        // Check if node can accommodate the shard
        const memoryNeeded = shard.config.sizeBytes / (1024 * 1024 * 1024); // Convert to GB
        const memoryAvailable = this.config.memoryCapacityGB - this.resources.memoryUsedGB;
        
        return memoryAvailable >= memoryNeeded &&
               this.resources.shardCount < this.config.maxShards &&
               this.status === 'healthy';
    }
    
    getScore(shardCharacteristics = {}) {
        // Calculate placement score for a shard
        let score = this.overallCapacity * 0.5;
        
        // Performance factor
        const performanceScore = (this.performance.availability * 0.4) +
                               ((1000 / (this.performance.avgResponseTime + 1)) * 0.3) +
                               ((1 - this.performance.errorRate) * 0.3);
        
        score += performanceScore * 0.3;
        
        // Zone diversity bonus
        if (shardCharacteristics.preferredZones &&
            !shardCharacteristics.preferredZones.includes(this.config.zone)) {
            score += 0.1;
        }
        
        // Load balancing factor
        const avgShardCount = shardCharacteristics.avgShardCount || 100;
        if (this.resources.shardCount < avgShardCount) {
            score += 0.1;
        }
        
        return Math.max(0, Math.min(1, score));
    }
    
    getStats() {
        return {
            id: this.id,
            config: { ...this.config },
            resources: { ...this.resources },
            performance: { ...this.performance },
            capacityScores: { ...this.capacityScores },
            overallCapacity: this.overallCapacity,
            status: this.status,
            shardCount: this.shards.size,
            age: Date.now() - this.joinedAt
        };
    }
}

/**
 * Adaptive Shard Rebalancer
 */
class AdaptiveShardRebalancer extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Rebalancing Thresholds
            loadImbalanceThreshold: options.loadImbalanceThreshold || 0.3,
            hotspotThreshold: options.hotspotThreshold || 0.7,
            capacityThreshold: options.capacityThreshold || 0.8,
            
            // Rebalancing Strategy
            strategy: options.strategy || 'adaptive', // adaptive, load_based, capacity_based
            rebalanceInterval: options.rebalanceInterval || 300000, // 5 minutes
            maxConcurrentMigrations: options.maxConcurrentMigrations || 5,
            
            // Performance Targets
            targetLoadBalance: options.targetLoadBalance || 0.9,
            targetResponseTime: options.targetResponseTime || 100,
            targetAvailability: options.targetAvailability || 0.999,
            
            // Safety Settings
            minMigrationInterval: options.minMigrationInterval || 60000, // 1 minute
            maxMigrationsPerHour: options.maxMigrationsPerHour || 50,
            enableEmergencyRebalancing: options.emergencyRebalancing !== false,
            
            ...options
        };
        
        this.nodes = new Map();
        this.shards = new Map();
        this.activeTransfers = new Map();
        this.rebalanceHistory = [];
        
        // Global metrics
        this.clusterMetrics = {
            totalNodes: 0,
            healthyNodes: 0,
            totalShards: 0,
            avgLoadBalance: 0,
            avgResponseTime: 0,
            hotspotCount: 0,
            migrationCount: 0
        };
        
        // Rebalancing state
        this.isRebalancing = false;
        this.lastRebalance = 0;
        this.migrationQueue = [];
        this.rebalanceTimer = null;
        
        this.isInitialized = false;
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            logger.info('Initializing Adaptive Shard Rebalancer', {
                strategy: this.config.strategy,
                rebalanceInterval: this.config.rebalanceInterval,
                maxConcurrentMigrations: this.config.maxConcurrentMigrations
            });
            
            // Start background tasks
            this._startRebalancingLoop();
            this._startMetricsCollection();
            this._startHealthMonitoring();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            logger.info('Adaptive Shard Rebalancer initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize Adaptive Shard Rebalancer', {
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Register a cluster node
     */
    addNode(nodeId, config = {}) {
        if (this.nodes.has(nodeId)) {
            logger.warn('Node already exists, updating configuration', { nodeId });
        }
        
        const node = new ClusterNode(nodeId, config);
        this.nodes.set(nodeId, node);
        
        this.clusterMetrics.totalNodes++;
        this.clusterMetrics.healthyNodes++;
        
        logger.info('Added cluster node', {
            nodeId,
            memoryCapacity: config.memoryCapacityGB,
            region: config.region,
            zone: config.zone
        });
        
        this.emit('nodeAdded', { nodeId, node: node.getStats() });
        
        // Trigger rebalancing evaluation
        this._scheduleRebalanceCheck();
        
        return node;
    }
    
    /**
     * Remove cluster node
     */
    async removeNode(nodeId, drainFirst = true) {
        const node = this.nodes.get(nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }
        
        logger.info('Removing cluster node', { nodeId, drainFirst });
        
        if (drainFirst && node.shards.size > 0) {
            // Drain shards from the node
            await this._drainNode(nodeId);
        }
        
        this.nodes.delete(nodeId);
        this.clusterMetrics.totalNodes--;
        
        if (node.status === 'healthy') {
            this.clusterMetrics.healthyNodes--;
        }
        
        this.emit('nodeRemoved', { nodeId });
        
        // Trigger immediate rebalancing
        this._scheduleRebalanceCheck(true);
    }
    
    /**
     * Register a shard
     */
    addShard(shardId, nodeId, config = {}) {
        const node = this.nodes.get(nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }
        
        const shard = new Shard(shardId, nodeId, config);
        this.shards.set(shardId, shard);
        
        node.addShard(shardId);
        this.clusterMetrics.totalShards++;
        
        logger.debug('Added shard', {
            shardId,
            nodeId,
            vectorCount: config.vectorCount,
            sizeBytes: config.sizeBytes
        });
        
        this.emit('shardAdded', { shardId, nodeId, shard: shard.getStats() });
        
        return shard;
    }
    
    /**
     * Update shard metrics
     */
    updateShardMetrics(shardId, metrics) {
        const shard = this.shards.get(shardId);
        if (!shard) {
            logger.warn('Attempted to update metrics for unknown shard', { shardId });
            return;
        }
        
        shard.updateMetrics(metrics);
        
        // Check for hotspot
        if (shard.metrics.hotSpotScore > this.config.hotspotThreshold) {
            this._handleHotspot(shard);
        }
    }
    
    /**
     * Update node resource metrics
     */
    updateNodeMetrics(nodeId, resources, performance) {
        const node = this.nodes.get(nodeId);
        if (!node) {
            logger.warn('Attempted to update metrics for unknown node', { nodeId });
            return;
        }
        
        if (resources) {
            node.updateResources(resources);
        }
        
        if (performance) {
            node.updatePerformance(performance);
        }
        
        node.lastHealthCheck = Date.now();
        
        // Check for capacity issues
        if (node.overallCapacity < (1 - this.config.capacityThreshold)) {
            this._handleCapacityIssue(node);
        }
    }
    
    /**
     * Perform cluster rebalancing
     */
    async rebalanceCluster(force = false) {
        if (this.isRebalancing && !force) {
            logger.debug('Rebalancing already in progress');
            return;
        }
        
        const now = Date.now();
        if (!force && now - this.lastRebalance < this.config.minMigrationInterval) {
            logger.debug('Minimum migration interval not met');
            return;
        }
        
        this.isRebalancing = true;
        this.lastRebalance = now;
        
        try {
            logger.info('Starting cluster rebalancing', {
                strategy: this.config.strategy,
                totalShards: this.shards.size,
                totalNodes: this.nodes.size
            });
            
            // Analyze cluster state
            const analysis = this._analyzeClusterState();
            
            if (!this._shouldRebalance(analysis)) {
                logger.debug('Cluster is well balanced, skipping rebalancing');
                return;
            }
            
            // Generate migration plan
            const migrationPlan = this._generateMigrationPlan(analysis);
            
            if (migrationPlan.length === 0) {
                logger.debug('No beneficial migrations found');
                return;
            }
            
            // Execute migration plan
            await this._executeMigrationPlan(migrationPlan);
            
            // Record rebalancing operation
            this._recordRebalanceOperation(analysis, migrationPlan);
            
            logger.info('Cluster rebalancing completed', {
                migrationsPlanned: migrationPlan.length,
                duration: Date.now() - now
            });
            
            this.emit('rebalanceCompleted', {
                analysis,
                migrationPlan,
                duration: Date.now() - now
            });
            
        } catch (error) {
            logger.error('Cluster rebalancing failed', {
                error: error.message
            });
            
            this.emit('rebalanceFailed', { error });
            
        } finally {
            this.isRebalancing = false;
        }
    }
    
    _analyzeClusterState() {
        const nodeStats = Array.from(this.nodes.values()).map(node => node.getStats());
        const shardStats = Array.from(this.shards.values()).map(shard => shard.getStats());
        
        // Calculate load distribution
        const loadDistribution = nodeStats.map(node => ({
            nodeId: node.id,
            shardCount: node.shardCount,
            capacity: node.overallCapacity,
            performance: node.performance,
            hotShards: shardStats.filter(shard => 
                shard.nodeId === node.id && shard.metrics.hotSpotScore > this.config.hotspotThreshold
            ).length
        }));
        
        // Calculate imbalance metrics
        const shardCounts = loadDistribution.map(n => n.shardCount);
        const avgShardCount = shardCounts.reduce((a, b) => a + b, 0) / shardCounts.length;
        const maxShardCount = Math.max(...shardCounts);
        const minShardCount = Math.min(...shardCounts);
        
        const loadImbalance = maxShardCount > 0 ? (maxShardCount - minShardCount) / maxShardCount : 0;
        
        // Find hotspots
        const hotspots = shardStats.filter(shard => 
            shard.metrics.hotSpotScore > this.config.hotspotThreshold
        );
        
        // Find overloaded nodes
        const overloadedNodes = loadDistribution.filter(node => 
            node.capacity < (1 - this.config.capacityThreshold)
        );
        
        return {
            loadDistribution,
            avgShardCount,
            loadImbalance,
            hotspots,
            overloadedNodes,
            totalShards: this.shards.size,
            totalNodes: this.nodes.size,
            healthyNodes: nodeStats.filter(n => n.status === 'healthy').length
        };
    }
    
    _shouldRebalance(analysis) {
        // Check if rebalancing is needed
        const needsRebalancing = 
            analysis.loadImbalance > this.config.loadImbalanceThreshold ||
            analysis.hotspots.length > 0 ||
            analysis.overloadedNodes.length > 0;
        
        return needsRebalancing;
    }
    
    _generateMigrationPlan(analysis) {
        const migrationPlan = [];
        
        switch (this.config.strategy) {
            case 'load_based':
                migrationPlan.push(...this._generateLoadBasedPlan(analysis));
                break;
            case 'capacity_based':
                migrationPlan.push(...this._generateCapacityBasedPlan(analysis));
                break;
            case 'adaptive':
            default:
                migrationPlan.push(...this._generateAdaptivePlan(analysis));
                break;
        }
        
        // Limit concurrent migrations
        return migrationPlan.slice(0, this.config.maxConcurrentMigrations);
    }
    
    _generateLoadBasedPlan(analysis) {
        const plan = [];
        
        // Find overloaded and underloaded nodes
        const sortedNodes = analysis.loadDistribution.sort((a, b) => b.shardCount - a.shardCount);
        const overloaded = sortedNodes.slice(0, Math.ceil(sortedNodes.length * 0.3));
        const underloaded = sortedNodes.slice(-Math.ceil(sortedNodes.length * 0.3)).reverse();
        
        // Move shards from overloaded to underloaded nodes
        for (const overloadedNode of overloaded) {
            if (overloadedNode.shardCount <= analysis.avgShardCount) break;
            
            const shardsToMove = Math.floor((overloadedNode.shardCount - analysis.avgShardCount) / 2);
            const candidateShards = this._getCandidateShards(overloadedNode.nodeId, shardsToMove);
            
            for (const shard of candidateShards) {
                const targetNode = this._findBestTargetNode(shard, underloaded);
                
                if (targetNode && targetNode.nodeId !== shard.nodeId) {
                    plan.push({
                        shardId: shard.id,
                        fromNodeId: shard.nodeId,
                        toNodeId: targetNode.nodeId,
                        reason: 'load_balancing',
                        priority: 'normal',
                        estimatedCost: this._estimateMigrationCost(shard)
                    });
                }
            }
        }
        
        return plan;
    }
    
    _generateCapacityBasedPlan(analysis) {
        const plan = [];
        
        // Handle overloaded nodes first
        for (const overloadedNode of analysis.overloadedNodes) {
            const node = this.nodes.get(overloadedNode.nodeId);
            const shardsToMove = Math.ceil(node.shards.size * 0.2); // Move 20% of shards
            
            const candidateShards = this._getCandidateShards(overloadedNode.nodeId, shardsToMove);
            
            for (const shard of candidateShards) {
                const availableNodes = Array.from(this.nodes.values())
                    .filter(n => n.id !== shard.nodeId && n.canAcceptShard(shard))
                    .sort((a, b) => b.overallCapacity - a.overallCapacity);
                
                if (availableNodes.length > 0) {
                    plan.push({
                        shardId: shard.id,
                        fromNodeId: shard.nodeId,
                        toNodeId: availableNodes[0].id,
                        reason: 'capacity_relief',
                        priority: 'high',
                        estimatedCost: this._estimateMigrationCost(shard)
                    });
                }
            }
        }
        
        return plan;
    }
    
    _generateAdaptivePlan(analysis) {
        const plan = [];
        
        // Handle hotspots with highest priority
        for (const hotspot of analysis.hotspots) {
            const shard = this.shards.get(hotspot.id);
            if (!shard) continue;
            
            // Find nodes with better performance characteristics
            const betterNodes = Array.from(this.nodes.values())
                .filter(n => n.id !== shard.nodeId && n.canAcceptShard(shard))
                .filter(n => n.performance.avgResponseTime < shard.metrics.avgResponseTime * 0.8)
                .sort((a, b) => a.performance.avgResponseTime - b.performance.avgResponseTime);
            
            if (betterNodes.length > 0) {
                plan.push({
                    shardId: shard.id,
                    fromNodeId: shard.nodeId,
                    toNodeId: betterNodes[0].id,
                    reason: 'hotspot_mitigation',
                    priority: 'urgent',
                    estimatedCost: this._estimateMigrationCost(shard)
                });
            }
        }
        
        // Handle capacity issues
        plan.push(...this._generateCapacityBasedPlan(analysis));
        
        // Handle load imbalance if no urgent issues
        if (plan.length === 0) {
            plan.push(...this._generateLoadBasedPlan(analysis));
        }
        
        return plan.sort((a, b) => {
            const priorities = { urgent: 3, high: 2, normal: 1 };
            return priorities[b.priority] - priorities[a.priority];
        });
    }
    
    _getCandidateShards(nodeId, count) {
        const nodeShards = Array.from(this.shards.values())
            .filter(shard => shard.nodeId === nodeId);
        
        // Prefer shards that are:
        // 1. Not hotspots
        // 2. Smaller in size
        // 3. Less frequently accessed
        
        return nodeShards
            .filter(shard => shard.metrics.hotSpotScore <= this.config.hotspotThreshold)
            .sort((a, b) => {
                const scoreA = (a.config.sizeBytes / 1000000) + (a.metrics.queryLoad / 100);
                const scoreB = (b.config.sizeBytes / 1000000) + (b.metrics.queryLoad / 100);
                return scoreA - scoreB;
            })
            .slice(0, count);
    }
    
    _findBestTargetNode(shard, candidateNodes) {
        if (candidateNodes.length === 0) {
            candidateNodes = Array.from(this.nodes.values());
        }
        
        const availableNodes = candidateNodes.filter(nodeInfo => {
            const node = this.nodes.get(nodeInfo.nodeId || nodeInfo.id);
            return node && node.canAcceptShard(shard);
        });
        
        if (availableNodes.length === 0) return null;
        
        // Score nodes based on multiple factors
        const avgShardCount = Array.from(this.nodes.values())
            .reduce((sum, n) => sum + n.shards.size, 0) / this.nodes.size;
        
        const scoredNodes = availableNodes.map(nodeInfo => {
            const node = this.nodes.get(nodeInfo.nodeId || nodeInfo.id);
            const score = node.getScore({
                avgShardCount,
                preferredZones: [shard.nodeId] // Avoid same zone if possible
            });
            
            return { node, score };
        });
        
        scoredNodes.sort((a, b) => b.score - a.score);
        
        return { nodeId: scoredNodes[0].node.id };
    }
    
    _estimateMigrationCost(shard) {
        // Estimate migration cost based on shard size and network conditions
        const baseCost = shard.config.sizeBytes / (1024 * 1024); // MB
        const networkFactor = 1.0; // Could be adjusted based on network conditions
        const replicationFactor = shard.config.replicationFactor || 1;
        
        return baseCost * networkFactor * replicationFactor;
    }
    
    async _executeMigrationPlan(migrationPlan) {
        const migrationPromises = [];
        
        for (const migration of migrationPlan) {
            if (this.activeTransfers.size >= this.config.maxConcurrentMigrations) {
                break;
            }
            
            migrationPromises.push(this._executeMigration(migration));
        }
        
        const results = await Promise.allSettled(migrationPromises);
        
        let successful = 0;
        let failed = 0;
        
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const migration = migrationPlan[i];
            
            if (result.status === 'fulfilled') {
                successful++;
                logger.debug('Migration completed successfully', {
                    shardId: migration.shardId,
                    fromNodeId: migration.fromNodeId,
                    toNodeId: migration.toNodeId
                });
            } else {
                failed++;
                logger.error('Migration failed', {
                    shardId: migration.shardId,
                    fromNodeId: migration.fromNodeId,
                    toNodeId: migration.toNodeId,
                    error: result.reason?.message
                });
            }
        }
        
        logger.info('Migration batch completed', {
            planned: migrationPlan.length,
            successful,
            failed
        });
        
        return { successful, failed };
    }
    
    async _executeMigration(migration) {
        const { shardId, fromNodeId, toNodeId, reason } = migration;
        const transferId = `${shardId}_${Date.now()}`;
        
        try {
            this.activeTransfers.set(transferId, {
                ...migration,
                startTime: Date.now(),
                status: 'transferring'
            });
            
            logger.info('Starting shard migration', {
                transferId,
                shardId,
                fromNodeId,
                toNodeId,
                reason
            });
            
            // Simulate migration process
            const shard = this.shards.get(shardId);
            const estimatedDuration = this._estimateMigrationDuration(shard);
            
            await this._simulateMigration(shard, fromNodeId, toNodeId, estimatedDuration);
            
            // Update shard location
            const fromNode = this.nodes.get(fromNodeId);
            const toNode = this.nodes.get(toNodeId);
            
            if (fromNode) {
                fromNode.removeShard(shardId);
            }
            
            if (toNode) {
                toNode.addShard(shardId);
            }
            
            shard.recordMigration(fromNodeId, toNodeId, reason);
            
            const transfer = this.activeTransfers.get(transferId);
            transfer.status = 'completed';
            transfer.endTime = Date.now();
            transfer.duration = transfer.endTime - transfer.startTime;
            
            this.clusterMetrics.migrationCount++;
            
            this.emit('migrationCompleted', {
                transferId,
                shardId,
                fromNodeId,
                toNodeId,
                reason,
                duration: transfer.duration
            });
            
            // Clean up transfer record after a delay
            setTimeout(() => {
                this.activeTransfers.delete(transferId);
            }, 60000);
            
        } catch (error) {
            const transfer = this.activeTransfers.get(transferId);
            if (transfer) {
                transfer.status = 'failed';
                transfer.error = error.message;
                transfer.endTime = Date.now();
            }
            
            logger.error('Shard migration failed', {
                transferId,
                shardId,
                fromNodeId,
                toNodeId,
                error: error.message
            });
            
            this.emit('migrationFailed', {
                transferId,
                shardId,
                fromNodeId,
                toNodeId,
                error
            });
            
            throw error;
        }
    }
    
    _estimateMigrationDuration(shard) {
        const sizeGB = shard.config.sizeBytes / (1024 * 1024 * 1024);
        const networkSpeedGBps = 1.0; // Assume 1 GB/s network
        const baseDuration = (sizeGB / networkSpeedGBps) * 1000; // ms
        
        // Add overhead for index rebuilding
        const indexOverhead = baseDuration * 0.2;
        
        return baseDuration + indexOverhead;
    }
    
    async _simulateMigration(shard, fromNodeId, toNodeId, duration) {
        // Simulate migration process with progress updates
        const steps = 10;
        const stepDuration = duration / steps;
        
        for (let step = 0; step < steps; step++) {
            await new Promise(resolve => setTimeout(resolve, stepDuration));
            
            const progress = ((step + 1) / steps) * 100;
            
            this.emit('migrationProgress', {
                shardId: shard.id,
                fromNodeId,
                toNodeId,
                progress
            });
        }
    }
    
    async _drainNode(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node || node.shards.size === 0) return;
        
        logger.info('Draining node', {
            nodeId,
            shardsToMove: node.shards.size
        });
        
        const drainMigrations = [];
        
        for (const shardId of node.shards) {
            const shard = this.shards.get(shardId);
            if (!shard) continue;
            
            const availableNodes = Array.from(this.nodes.values())
                .filter(n => n.id !== nodeId && n.canAcceptShard(shard))
                .sort((a, b) => b.overallCapacity - a.overallCapacity);
            
            if (availableNodes.length > 0) {
                drainMigrations.push({
                    shardId: shard.id,
                    fromNodeId: nodeId,
                    toNodeId: availableNodes[0].id,
                    reason: 'node_drain',
                    priority: 'high',
                    estimatedCost: this._estimateMigrationCost(shard)
                });
            }
        }
        
        await this._executeMigrationPlan(drainMigrations);
        
        logger.info('Node drained successfully', {
            nodeId,
            migratedShards: drainMigrations.length
        });
    }
    
    _handleHotspot(shard) {
        logger.info('Hotspot detected', {
            shardId: shard.id,
            nodeId: shard.nodeId,
            hotspotScore: shard.metrics.hotSpotScore
        });
        
        // Schedule immediate rebalancing if not already in progress
        if (!this.isRebalancing) {
            this._scheduleRebalanceCheck(true);
        }
        
        this.emit('hotspotDetected', {
            shardId: shard.id,
            nodeId: shard.nodeId,
            hotspotScore: shard.metrics.hotSpotScore
        });
    }
    
    _handleCapacityIssue(node) {
        logger.warn('Node capacity issue detected', {
            nodeId: node.id,
            overallCapacity: node.overallCapacity,
            shardCount: node.shards.size
        });
        
        // Schedule rebalancing to move some shards off this node
        this._scheduleRebalanceCheck(true);
        
        this.emit('capacityIssue', {
            nodeId: node.id,
            capacityScore: node.overallCapacity,
            shardCount: node.shards.size
        });
    }
    
    _scheduleRebalanceCheck(immediate = false) {
        if (immediate) {
            setImmediate(() => {
                this.rebalanceCluster();
            });
        } else {
            // Schedule for next rebalance interval
            clearTimeout(this.rebalanceTimer);
            this.rebalanceTimer = setTimeout(() => {
                this.rebalanceCluster();
            }, this.config.rebalanceInterval);
        }
    }
    
    _recordRebalanceOperation(analysis, migrationPlan) {
        const operation = {
            timestamp: Date.now(),
            trigger: analysis.hotspots.length > 0 ? 'hotspot' : 
                    analysis.overloadedNodes.length > 0 ? 'capacity' : 'load_balance',
            analysis: {
                loadImbalance: analysis.loadImbalance,
                hotspotCount: analysis.hotspots.length,
                overloadedNodeCount: analysis.overloadedNodes.length
            },
            migrationCount: migrationPlan.length,
            estimatedCost: migrationPlan.reduce((sum, m) => sum + m.estimatedCost, 0)
        };
        
        this.rebalanceHistory.push(operation);
        
        // Keep only recent history
        if (this.rebalanceHistory.length > 100) {
            this.rebalanceHistory = this.rebalanceHistory.slice(-100);
        }
    }
    
    // Background tasks
    _startRebalancingLoop() {
        this.rebalanceTimer = setInterval(() => {
            this.rebalanceCluster();
        }, this.config.rebalanceInterval);
    }
    
    _startMetricsCollection() {
        setInterval(() => {
            this._updateClusterMetrics();
        }, 30000); // Every 30 seconds
    }
    
    _startHealthMonitoring() {
        setInterval(() => {
            this._checkNodeHealth();
        }, 60000); // Every minute
    }
    
    _updateClusterMetrics() {
        const nodeStats = Array.from(this.nodes.values());
        const shardStats = Array.from(this.shards.values());
        
        // Update global metrics
        this.clusterMetrics.totalNodes = this.nodes.size;
        this.clusterMetrics.healthyNodes = nodeStats.filter(n => n.status === 'healthy').length;
        this.clusterMetrics.totalShards = this.shards.size;
        
        // Calculate load balance
        const shardCounts = nodeStats.map(n => n.shards.size);
        const avgShardCount = shardCounts.reduce((a, b) => a + b, 0) / shardCounts.length;
        const maxShardCount = Math.max(...shardCounts);
        this.clusterMetrics.avgLoadBalance = maxShardCount > 0 ? avgShardCount / maxShardCount : 1;
        
        // Calculate average response time
        const responseTimes = nodeStats.map(n => n.performance.avgResponseTime);
        this.clusterMetrics.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        
        // Count hotspots
        this.clusterMetrics.hotspotCount = shardStats.filter(s => 
            s.metrics.hotSpotScore > this.config.hotspotThreshold
        ).length;
    }
    
    _checkNodeHealth() {
        const now = Date.now();
        const healthTimeout = 300000; // 5 minutes
        
        for (const [nodeId, node] of this.nodes) {
            if (now - node.lastHealthCheck > healthTimeout && node.status === 'healthy') {
                logger.warn('Node health check timeout', { nodeId });
                node.status = 'unhealthy';
                this.clusterMetrics.healthyNodes--;
                
                this.emit('nodeUnhealthy', { nodeId });
                
                // Consider emergency rebalancing
                if (this.config.enableEmergencyRebalancing && node.shards.size > 0) {
                    this._scheduleRebalanceCheck(true);
                }
            }
        }
    }
    
    // Public API
    getClusterStats() {
        return {
            clusterMetrics: { ...this.clusterMetrics },
            nodes: Array.from(this.nodes.values()).map(node => node.getStats()),
            shards: Array.from(this.shards.values()).map(shard => shard.getStats()),
            activeTransfers: Array.from(this.activeTransfers.values()),
            rebalanceHistory: this.rebalanceHistory.slice(-10),
            isRebalancing: this.isRebalancing,
            lastRebalance: this.lastRebalance
        };
    }
    
    getNodeStats(nodeId) {
        const node = this.nodes.get(nodeId);
        return node ? node.getStats() : null;
    }
    
    getShardStats(shardId) {
        const shard = this.shards.get(shardId);
        return shard ? shard.getStats() : null;
    }
    
    getActiveTransfers() {
        return Array.from(this.activeTransfers.values());
    }
    
    async shutdown() {
        logger.info('Shutting down Adaptive Shard Rebalancer');
        
        // Clear timers
        if (this.rebalanceTimer) {
            clearTimeout(this.rebalanceTimer);
        }
        
        // Wait for active transfers to complete or cancel them
        if (this.activeTransfers.size > 0) {
            logger.info('Waiting for active transfers to complete', {
                activeTransfers: this.activeTransfers.size
            });
            
            // Wait up to 2 minutes for transfers to complete
            const waitStart = Date.now();
            while (this.activeTransfers.size > 0 && Date.now() - waitStart < 120000) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Clear all data
        this.nodes.clear();
        this.shards.clear();
        this.activeTransfers.clear();
        this.rebalanceHistory.length = 0;
        this.migrationQueue.length = 0;
        
        this.isInitialized = false;
        this.emit('shutdown');
    }
}

module.exports = AdaptiveShardRebalancer;