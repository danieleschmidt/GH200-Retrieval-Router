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
            strategy: 'adaptive', // round_robin, least_connections, weighted_response_time, adaptive, ml_based
            healthCheckInterval: 30000, // 30 seconds
            maxRetries: 3,
            timeoutMs: 5000,
            autoScalingEnabled: true,
            predictiveScaling: true,
            minShards: 2,
            maxShards: 20,
            targetUtilization: 0.7,
            scaleUpThreshold: 0.8,
            scaleDownThreshold: 0.3,
            cooldownPeriod: 300000, // 5 minutes
            ...options
        };
        
        this.shardManager = options.shardManager;
        
        // Load balancing state
        this.nodeStats = new Map();
        this.shardStats = new Map();
        this.currentIndex = 0; // For round robin
        
        // Advanced load balancing features
        this.requestQueue = [];
        this.loadPredictions = new Map();
        this.scalingHistory = [];
        this.routingMetrics = {
            totalRequests: 0,
            routingDecisions: new Map(),
            strategyPerformance: new Map(),
            adaptiveWeights: new Map()
        };
        
        // Auto-scaling state
        this.lastScaleAction = 0;
        this.pendingScaleActions = [];
        this.capacityReservations = new Map();
        
        // Health monitoring
        this.healthCheckInterval = null;
        this.metricsCollectionInterval = null;
        this.loadPredictionInterval = null;
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
            
            // Start advanced monitoring and prediction
            await this._startAdvancedMonitoring();
            
            // Initialize auto-scaling if enabled
            if (this.options.autoScalingEnabled) {
                await this._initializeAutoScaling();
            }
            
            this.initialized = true;
            logger.info('LoadBalancer initialized successfully', {
                strategy: this.options.strategy,
                autoScaling: this.options.autoScalingEnabled,
                predictiveScaling: this.options.predictiveScaling
            });
            
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
        let routingDecision;
        
        switch (this.options.strategy) {
            case 'round_robin':
                selectedShard = this._roundRobinSelection(healthyShards);
                routingDecision = { strategy: 'round_robin', reason: 'sequential_distribution' };
                break;
            case 'least_connections':
                selectedShard = this._leastConnectionsSelection(healthyShards);
                routingDecision = { strategy: 'least_connections', reason: 'connection_based' };
                break;
            case 'weighted_response_time':
                selectedShard = this._weightedResponseTimeSelection(healthyShards);
                routingDecision = { strategy: 'weighted_response_time', reason: 'performance_based' };
                break;
            case 'adaptive': {
                const adaptiveResult = this._adaptiveSelection(healthyShards, queryContext);
                selectedShard = adaptiveResult.shard;
                routingDecision = adaptiveResult.decision;
                break;
            }
            case 'ml_based': {
                const mlResult = await this._mlBasedSelection(healthyShards, queryContext);
                selectedShard = mlResult.shard;
                routingDecision = mlResult.decision;
                break;
            }
            case 'predictive': {
                const predictiveResult = this._predictiveSelection(healthyShards, queryContext);
                selectedShard = predictiveResult.shard;
                routingDecision = predictiveResult.decision;
                break;
            }
            default:
                selectedShard = this._adaptiveSelection(healthyShards, queryContext).shard;
                routingDecision = { strategy: 'adaptive', reason: 'fallback_default' };
        }
        
        // Update shard statistics
        this._updateShardStats(selectedShard.id, 'selected');
        
        // Track routing metrics
        this.routingMetrics.totalRequests++;
        const decisionKey = routingDecision.strategy;
        this.routingMetrics.routingDecisions.set(
            decisionKey, 
            (this.routingMetrics.routingDecisions.get(decisionKey) || 0) + 1
        );
        
        return {
            shard: selectedShard,
            strategy: this.options.strategy,
            decision: routingDecision,
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
     * Adaptive shard selection based on multiple factors
     * @private
     */
    _adaptiveSelection(shards, queryContext = {}) {
        const weights = shards.map(shard => {
            const stats = this.shardStats.get(shard.id);
            if (!stats) return 1.0;
            
            // Combine multiple factors
            const responseTimeFactor = stats.averageResponseTime > 0 ? 1000 / stats.averageResponseTime : 1;
            const loadFactor = stats.connections > 0 ? 10 / stats.connections : 10;
            const successFactor = stats.totalQueries > 0 ? stats.successfulQueries / stats.totalQueries : 1;
            const healthFactor = stats.healthy ? 1 : 0.1;
            
            // Query context factors
            const contextFactor = this._calculateContextFactor(shard, queryContext);
            
            return responseTimeFactor * loadFactor * successFactor * healthFactor * contextFactor;
        });
        
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        
        if (totalWeight === 0) {
            return {
                shard: shards[0],
                decision: { strategy: 'adaptive', reason: 'fallback_no_weights' }
            };
        }
        
        // Weighted random selection
        const randomValue = Math.random() * totalWeight;
        let cumulativeWeight = 0;
        
        for (let i = 0; i < shards.length; i++) {
            cumulativeWeight += weights[i];
            if (randomValue <= cumulativeWeight) {
                return {
                    shard: shards[i],
                    decision: { 
                        strategy: 'adaptive', 
                        reason: 'multi_factor_weighted',
                        weight: weights[i] / totalWeight,
                        factors: {
                            responseTime: this.shardStats.get(shards[i].id)?.averageResponseTime || 0,
                            connections: this.shardStats.get(shards[i].id)?.connections || 0,
                            successRate: this._getShardSuccessRate(shards[i].id)
                        }
                    }
                };
            }
        }
        
        return {
            shard: shards[shards.length - 1],
            decision: { strategy: 'adaptive', reason: 'fallback_last' }
        };
    }
    
    /**
     * ML-based shard selection using simple prediction
     * @private
     */
    async _mlBasedSelection(shards, queryContext = {}) {
        // Simplified ML prediction - in production would use actual ML models
        const predictions = await Promise.all(
            shards.map(async shard => {
                const features = this._extractShardFeatures(shard, queryContext);
                const prediction = this._predictShardPerformance(features);
                
                return {
                    shard,
                    prediction,
                    confidence: prediction.confidence || 0.5
                };
            })
        );
        
        // Select shard with best predicted performance
        const bestPrediction = predictions.reduce((best, current) => 
            current.prediction.score > best.prediction.score ? current : best
        );
        
        return {
            shard: bestPrediction.shard,
            decision: {
                strategy: 'ml_based',
                reason: 'ml_prediction',
                prediction: bestPrediction.prediction,
                confidence: bestPrediction.confidence
            }
        };
    }
    
    /**
     * Predictive shard selection based on load forecasting
     * @private
     */
    _predictiveSelection(shards, queryContext = {}) {
        const currentTime = Date.now();
        
        // Get load predictions for each shard
        const predictedLoads = shards.map(shard => {
            const prediction = this.loadPredictions.get(shard.id) || {
                expectedLoad: 0.5,
                confidence: 0.3,
                trend: 'stable'
            };
            
            return {
                shard,
                predictedLoad: prediction.expectedLoad,
                confidence: prediction.confidence,
                trend: prediction.trend
            };
        });
        
        // Select shard with lowest predicted load and high confidence
        const bestChoice = predictedLoads.reduce((best, current) => {
            const currentScore = (1 - current.predictedLoad) * current.confidence;
            const bestScore = (1 - best.predictedLoad) * best.confidence;
            return currentScore > bestScore ? current : best;
        });
        
        return {
            shard: bestChoice.shard,
            decision: {
                strategy: 'predictive',
                reason: 'load_prediction',
                predictedLoad: bestChoice.predictedLoad,
                confidence: bestChoice.confidence,
                trend: bestChoice.trend
            }
        };
    }
    
    /**
     * Calculate context factor for adaptive selection
     * @private
     */
    _calculateContextFactor(shard, queryContext) {
        let factor = 1.0;
        
        // Query complexity factor
        if (queryContext.complexity) {
            const shardCapability = this._getShardCapability(shard.id);
            factor *= queryContext.complexity <= shardCapability ? 1.0 : 0.5;
        }
        
        // Data locality factor
        if (queryContext.dataAffinity && queryContext.dataAffinity.includes(shard.id)) {
            factor *= 1.5;
        }
        
        // Time-based factor (less load during peak hours)
        const hour = new Date().getHours();
        if (hour >= 9 && hour <= 17) { // Business hours
            factor *= 0.9;
        }
        
        return factor;
    }
    
    /**
     * Extract features for ML prediction
     * @private
     */
    _extractShardFeatures(shard, queryContext) {
        const stats = this.shardStats.get(shard.id) || {};
        
        return {
            averageResponseTime: stats.averageResponseTime || 100,
            currentConnections: stats.connections || 0,
            successRate: this._getShardSuccessRate(shard.id),
            totalQueries: stats.totalQueries || 0,
            queryComplexity: queryContext.complexity || 1,
            timeOfDay: new Date().getHours(),
            dayOfWeek: new Date().getDay(),
            recentErrors: stats.failedQueries || 0
        };
    }
    
    /**
     * Simple ML prediction model
     * @private
     */
    _predictShardPerformance(features) {
        // Simplified linear model - in production would use trained models
        let score = 1000;
        
        score -= features.averageResponseTime * 0.5;
        score -= features.currentConnections * 10;
        score += features.successRate * 500;
        score -= features.recentErrors * 50;
        
        // Normalize to 0-1
        score = Math.max(0, Math.min(1, score / 1000));
        
        return {
            score,
            confidence: 0.7,
            model: 'simple_linear',
            features: Object.keys(features)
        };
    }
    
    /**
     * Get shard success rate
     * @private
     */
    _getShardSuccessRate(shardId) {
        const stats = this.shardStats.get(shardId);
        if (!stats || stats.totalQueries === 0) return 1.0;
        
        return stats.successfulQueries / stats.totalQueries;
    }
    
    /**
     * Get shard capability score
     * @private
     */
    _getShardCapability(shardId) {
        // Mock capability - in real implementation would query shard specs
        return Math.random() * 10; // Capability score 0-10
    }
    
    /**
     * Start advanced monitoring and prediction
     * @private
     */
    async _startAdvancedMonitoring() {
        // Metrics collection
        this.metricsCollectionInterval = setInterval(() => {
            this._collectAdvancedMetrics();
        }, 60000); // Every minute
        
        // Load prediction
        if (this.options.predictiveScaling) {
            this.loadPredictionInterval = setInterval(() => {
                this._updateLoadPredictions();
            }, 300000); // Every 5 minutes
        }
        
        logger.info('Advanced monitoring started');
    }
    
    /**
     * Collect advanced metrics
     * @private
     */
    _collectAdvancedMetrics() {
        // Update strategy performance metrics
        for (const [strategy, count] of this.routingMetrics.routingDecisions) {
            if (!this.routingMetrics.strategyPerformance.has(strategy)) {
                this.routingMetrics.strategyPerformance.set(strategy, {
                    totalRequests: 0,
                    successfulRequests: 0,
                    averageResponseTime: 0
                });
            }
        }
        
        // Analyze shard utilization patterns
        const now = Date.now();
        for (const [shardId, stats] of this.shardStats) {
            const utilization = stats.connections / (stats.connections + 5); // Assume max 5 additional capacity
            
            if (!this.routingMetrics.adaptiveWeights.has(shardId)) {
                this.routingMetrics.adaptiveWeights.set(shardId, []);
            }
            
            const weights = this.routingMetrics.adaptiveWeights.get(shardId);
            weights.push({ timestamp: now, utilization, responseTime: stats.averageResponseTime });
            
            // Keep only last hour of data
            const oneHourAgo = now - 3600000;
            this.routingMetrics.adaptiveWeights.set(
                shardId,
                weights.filter(w => w.timestamp > oneHourAgo)
            );
        }
    }
    
    /**
     * Update load predictions
     * @private
     */
    _updateLoadPredictions() {
        for (const [shardId, stats] of this.shardStats) {
            // Simple trend analysis
            const weights = this.routingMetrics.adaptiveWeights.get(shardId) || [];
            
            if (weights.length < 5) continue;
            
            const recent = weights.slice(-5);
            const avgUtilization = recent.reduce((sum, w) => sum + w.utilization, 0) / recent.length;
            const trend = recent.length > 1 ? 
                (recent[recent.length - 1].utilization - recent[0].utilization) / recent.length : 0;
            
            // Predict next period load
            const predictedLoad = Math.max(0, Math.min(1, avgUtilization + trend * 5));
            
            this.loadPredictions.set(shardId, {
                expectedLoad: predictedLoad,
                confidence: Math.min(0.8, weights.length / 10),
                trend: trend > 0.1 ? 'increasing' : trend < -0.1 ? 'decreasing' : 'stable',
                timestamp: Date.now()
            });
        }
        
        // Trigger auto-scaling if needed
        if (this.options.autoScalingEnabled) {
            this._evaluateAutoScaling();
        }
    }
    
    /**
     * Initialize auto-scaling
     * @private
     */
    async _initializeAutoScaling() {
        logger.info('Initializing auto-scaling', {
            minShards: this.options.minShards,
            maxShards: this.options.maxShards,
            targetUtilization: this.options.targetUtilization
        });
        
        // Initial capacity assessment
        await this._assessCurrentCapacity();
    }
    
    /**
     * Evaluate auto-scaling decisions
     * @private
     */
    _evaluateAutoScaling() {
        const now = Date.now();
        
        // Check cooldown period
        if (now - this.lastScaleAction < this.options.cooldownPeriod) {
            return;
        }
        
        const currentShards = this.shardStats.size;
        const avgUtilization = this._calculateAverageUtilization();
        
        let scaleDecision = null;
        
        if (avgUtilization > this.options.scaleUpThreshold && currentShards < this.options.maxShards) {
            scaleDecision = {
                action: 'scale_up',
                currentShards,
                targetShards: Math.min(this.options.maxShards, currentShards + 1),
                reason: `High utilization: ${avgUtilization.toFixed(2)}`,
                utilization: avgUtilization
            };
        } else if (avgUtilization < this.options.scaleDownThreshold && currentShards > this.options.minShards) {
            scaleDecision = {
                action: 'scale_down',
                currentShards,
                targetShards: Math.max(this.options.minShards, currentShards - 1),
                reason: `Low utilization: ${avgUtilization.toFixed(2)}`,
                utilization: avgUtilization
            };
        }
        
        if (scaleDecision) {
            logger.info('Auto-scaling decision made', scaleDecision);
            this._executeScaleAction(scaleDecision);
        }
    }
    
    /**
     * Execute scaling action
     * @private
     */
    async _executeScaleAction(decision) {
        try {
            this.lastScaleAction = Date.now();
            
            if (decision.action === 'scale_up') {
                await this._scaleUp(decision.targetShards - decision.currentShards);
            } else if (decision.action === 'scale_down') {
                await this._scaleDown(decision.currentShards - decision.targetShards);
            }
            
            // Record scaling history
            this.scalingHistory.push({
                ...decision,
                timestamp: new Date().toISOString(),
                success: true
            });
            
            // Limit history size
            if (this.scalingHistory.length > 100) {
                this.scalingHistory = this.scalingHistory.slice(-50);
            }
            
            this.emit('scaled', decision);
            
        } catch (error) {
            logger.error('Auto-scaling failed', {
                decision,
                error: error.message
            });
            
            this.scalingHistory.push({
                ...decision,
                timestamp: new Date().toISOString(),
                success: false,
                error: error.message
            });
        }
    }
    
    /**
     * Scale up by adding shards
     * @private
     */
    async _scaleUp(count) {
        logger.info(`Scaling up: adding ${count} shards`);
        
        // This would integrate with the shard manager to add new shards
        for (let i = 0; i < count; i++) {
            if (this.shardManager && typeof this.shardManager.addShard === 'function') {
                await this.shardManager.addShard();
            } else {
                // Mock shard addition
                const newShardId = `shard_${Date.now()}_${i}`;
                this.shardStats.set(newShardId, {
                    healthy: true,
                    connections: 0,
                    totalQueries: 0,
                    successfulQueries: 0,
                    failedQueries: 0,
                    totalResponseTime: 0,
                    averageResponseTime: 0,
                    lastActivity: new Date().toISOString()
                });
                
                logger.info(`Mock shard added: ${newShardId}`);
            }
        }
    }
    
    /**
     * Scale down by removing shards
     * @private
     */
    async _scaleDown(count) {
        logger.info(`Scaling down: removing ${count} shards`);
        
        // Select shards to remove (least utilized)
        const shardsToRemove = this._selectShardsForRemoval(count);
        
        for (const shardId of shardsToRemove) {
            // Drain shard before removal
            await this._drainShard(shardId);
            
            if (this.shardManager && typeof this.shardManager.removeShard === 'function') {
                await this.shardManager.removeShard(shardId);
            }
            
            this.shardStats.delete(shardId);
            logger.info(`Shard removed: ${shardId}`);
        }
    }
    
    /**
     * Calculate average utilization
     * @private
     */
    _calculateAverageUtilization() {
        if (this.shardStats.size === 0) return 0;
        
        let totalUtilization = 0;
        let validShards = 0;
        
        for (const [shardId, stats] of this.shardStats) {
            if (stats.healthy) {
                const utilization = stats.connections / 10; // Assume max 10 connections per shard
                totalUtilization += Math.min(1, utilization);
                validShards++;
            }
        }
        
        return validShards > 0 ? totalUtilization / validShards : 0;
    }
    
    /**
     * Select shards for removal
     * @private
     */
    _selectShardsForRemoval(count) {
        const candidates = Array.from(this.shardStats.entries())
            .filter(([shardId, stats]) => stats.healthy)
            .sort((a, b) => a[1].connections - b[1].connections) // Least connections first
            .map(([shardId]) => shardId);
            
        return candidates.slice(0, count);
    }
    
    /**
     * Drain shard of active connections
     * @private
     */
    async _drainShard(shardId) {
        const stats = this.shardStats.get(shardId);
        if (!stats || stats.connections === 0) return;
        
        logger.info(`Draining shard: ${shardId}, active connections: ${stats.connections}`);
        
        // Wait for connections to drain naturally
        const maxWaitTime = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (stats.connections > 0 && Date.now() - startTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (stats.connections > 0) {
            logger.warn(`Shard ${shardId} still has ${stats.connections} active connections after drain timeout`);
        }
    }
    
    /**
     * Assess current capacity
     * @private
     */
    async _assessCurrentCapacity() {
        const totalCapacity = this.shardStats.size * 10; // Assume 10 requests per shard capacity
        const currentLoad = Array.from(this.shardStats.values())
            .reduce((sum, stats) => sum + stats.connections, 0);
            
        const utilization = totalCapacity > 0 ? currentLoad / totalCapacity : 0;
        
        logger.info('Current capacity assessment', {
            totalShards: this.shardStats.size,
            totalCapacity,
            currentLoad,
            utilization: utilization.toFixed(2)
        });
        
        return { totalCapacity, currentLoad, utilization };
    }
    
    /**
     * Get auto-scaling statistics
     */
    getAutoScalingStats() {
        return {
            enabled: this.options.autoScalingEnabled,
            currentShards: this.shardStats.size,
            minShards: this.options.minShards,
            maxShards: this.options.maxShards,
            targetUtilization: this.options.targetUtilization,
            currentUtilization: this._calculateAverageUtilization(),
            scalingHistory: this.scalingHistory.slice(-10), // Last 10 events
            lastScaleAction: this.lastScaleAction,
            cooldownRemaining: Math.max(0, this.options.cooldownPeriod - (Date.now() - this.lastScaleAction))
        };
    }
    
    /**
     * Health check for load balancer
     * @returns {Object} Health status information
     */
    async healthCheck() {
        const healthStatus = {
            healthy: this.initialized,
            timestamp: new Date().toISOString(),
            initialized: this.initialized,
            strategy: this.strategy,
            errors: []
        };

        if (!this.initialized) {
            healthStatus.errors.push('LoadBalancer not initialized');
            return healthStatus;
        }

        // Check node health
        let healthyNodes = 0;
        let totalNodes = 0;
        
        for (const [nodeId, stats] of this.nodeStats.entries()) {
            totalNodes++;
            if (stats.healthy) {
                healthyNodes++;
            }
        }

        // Check shard health
        let healthyShards = 0;
        let totalShards = 0;
        
        for (const [shardId, stats] of this.shardStats.entries()) {
            totalShards++;
            if (stats.healthy) {
                healthyShards++;
            }
        }

        healthStatus.metrics = {
            totalNodes,
            healthyNodes,
            nodeHealthRate: totalNodes > 0 ? healthyNodes / totalNodes : 0,
            totalShards,
            healthyShards,
            shardHealthRate: totalShards > 0 ? healthyShards / totalShards : 0,
            healthCheckInterval: this.options.healthCheckInterval
        };

        // Consider unhealthy if less than 50% nodes/shards are healthy
        if (healthStatus.metrics.nodeHealthRate < 0.5 || healthStatus.metrics.shardHealthRate < 0.5) {
            healthStatus.healthy = false;
            healthStatus.errors.push('Insufficient healthy nodes or shards');
        }

        return healthStatus;
    }

    /**
     * Check if load balancer is ready
     * @returns {boolean} Readiness status
     */
    async isReady() {
        return this.initialized && this.nodeStats.size > 0;
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
        
        if (this.metricsCollectionInterval) {
            clearInterval(this.metricsCollectionInterval);
            this.metricsCollectionInterval = null;
        }
        
        if (this.loadPredictionInterval) {
            clearInterval(this.loadPredictionInterval);
            this.loadPredictionInterval = null;
        }
        
        this.nodeStats.clear();
        this.shardStats.clear();
        this.loadPredictions.clear();
        this.routingMetrics.routingDecisions.clear();
        this.routingMetrics.strategyPerformance.clear();
        this.routingMetrics.adaptiveWeights.clear();
        this.initialized = false;
        
        logger.info('LoadBalancer shutdown complete');
    }
}

module.exports = { LoadBalancer };