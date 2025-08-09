/**
 * Load Balancing Orchestrator for Multi-Node GH200 Deployments
 * Intelligent request distribution with NVLink-aware routing
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');

class LoadBalancingOrchestrator extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            algorithm: config.algorithm || 'weighted_round_robin',
            healthCheckInterval: config.healthCheckInterval || 5000,
            maxRetries: config.maxRetries || 3,
            circuitBreakerThreshold: config.circuitBreakerThreshold || 0.5,
            sessionAffinity: config.sessionAffinity || false,
            nvlinkOptimization: config.nvlinkOptimization !== false,
            gracePeriod: config.gracePeriod || 30000,
            adaptiveWeighting: config.adaptiveWeighting !== false,
            ...config
        };
        
        // Node management
        this.nodes = new Map();
        this.nodeMetrics = new Map();
        this.nodeHealth = new Map();
        this.circuitBreakers = new Map();
        
        // Load balancing state
        this.roundRobinIndex = 0;
        this.sessionMap = new Map();
        this.requestQueue = [];
        
        // Performance tracking
        this.globalMetrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            avgResponseTime: 0,
            throughput: 0
        };
        
        // NVLink topology for optimization
        this.nvlinkTopology = new Map();
        this.memoryAffinityMap = new Map();
        
        this._initialize();
    }
    
    _initialize() {
        this.startTime = Date.now();
        
        // Start health checking
        this._startHealthChecking();
        
        // Start metrics collection
        this._startMetricsCollection();
        
        // Initialize NVLink optimization if enabled
        if (this.config.nvlinkOptimization) {
            this._initializeNVLinkOptimization();
        }
        
        logger.info('Load balancing orchestrator initialized', {
            algorithm: this.config.algorithm,
            nvlinkOptimization: this.config.nvlinkOptimization
        });
    }
    
    _initializeNVLinkOptimization() {
        // Initialize NVLink topology mapping
        // In a real implementation, this would query the actual hardware topology
        const nodeCount = 4; // Example: 4-node NVL32 cluster
        
        for (let i = 0; i < nodeCount; i++) {
            this.nvlinkTopology.set(`node_${i}`, {
                localGPUs: 4,
                nvlinkBandwidth: 900, // GB/s
                connectedNodes: Array.from({ length: nodeCount - 1 }, (_, idx) => 
                    idx >= i ? `node_${idx + 1}` : `node_${idx}`
                ),
                memoryCapacity: 480 * 1024 * 1024 * 1024, // 480GB
                availableMemory: 480 * 1024 * 1024 * 1024
            });
        }
        
        logger.info('NVLink topology initialized', {
            nodeCount,
            totalBandwidth: nodeCount * 900
        });
    }
    
    // Node management
    addNode(nodeId, config) {
        const node = {
            id: nodeId,
            endpoint: config.endpoint,
            weight: config.weight || 1,
            capacity: config.capacity || 100,
            region: config.region || 'default',
            tags: config.tags || [],
            graceHopperEnabled: config.graceHopperEnabled || false,
            nvlinkNodes: config.nvlinkNodes || [],
            createdAt: Date.now(),
            status: 'active'
        };
        
        this.nodes.set(nodeId, node);
        
        // Initialize metrics
        this.nodeMetrics.set(nodeId, {
            requests: 0,
            successCount: 0,
            errorCount: 0,
            avgResponseTime: 0,
            currentLoad: 0,
            memoryUtilization: 0,
            cpuUtilization: 0,
            lastUpdateTime: Date.now()
        });
        
        // Initialize health status
        this.nodeHealth.set(nodeId, {
            healthy: true,
            lastHealthCheck: Date.now(),
            consecutiveFailures: 0,
            lastError: null
        });
        
        // Initialize circuit breaker
        this.circuitBreakers.set(nodeId, {
            state: 'closed', // closed, open, half-open
            failureCount: 0,
            lastFailureTime: 0,
            nextAttemptTime: 0
        });
        
        logger.info('Node added to load balancer', { nodeId, endpoint: node.endpoint });
        this.emit('nodeAdded', { nodeId, node });
        
        return node;
    }
    
    removeNode(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        
        // Graceful removal - mark as draining first
        node.status = 'draining';
        
        setTimeout(() => {
            this.nodes.delete(nodeId);
            this.nodeMetrics.delete(nodeId);
            this.nodeHealth.delete(nodeId);
            this.circuitBreakers.delete(nodeId);
            
            logger.info('Node removed from load balancer', { nodeId });
            this.emit('nodeRemoved', { nodeId });
        }, this.config.gracePeriod);
        
        return true;
    }
    
    // Main load balancing logic
    async selectNode(request) {
        const availableNodes = this._getAvailableNodes();
        
        if (availableNodes.length === 0) {
            throw new Error('No available nodes for load balancing');
        }
        
        let selectedNode;
        
        // Session affinity check
        if (this.config.sessionAffinity && request.sessionId) {
            const affinityNode = this.sessionMap.get(request.sessionId);
            if (affinityNode && availableNodes.includes(affinityNode)) {
                selectedNode = affinityNode;
            }
        }
        
        // Select node based on algorithm
        if (!selectedNode) {
            selectedNode = await this._selectByAlgorithm(availableNodes, request);
        }
        
        // Record session affinity if enabled
        if (this.config.sessionAffinity && request.sessionId) {
            this.sessionMap.set(request.sessionId, selectedNode);
        }
        
        // Update metrics
        this._updateNodeSelection(selectedNode, request);
        
        return selectedNode;
    }
    
    async _selectByAlgorithm(availableNodes, request) {
        switch (this.config.algorithm) {
            case 'round_robin':
                return this._selectRoundRobin(availableNodes);
            
            case 'weighted_round_robin':
                return this._selectWeightedRoundRobin(availableNodes);
            
            case 'least_connections':
                return this._selectLeastConnections(availableNodes);
            
            case 'least_response_time':
                return this._selectLeastResponseTime(availableNodes);
            
            case 'resource_based':
                return this._selectResourceBased(availableNodes);
            
            case 'nvlink_optimized':
                return await this._selectNVLinkOptimized(availableNodes, request);
            
            case 'grace_hopper_optimized':
                return await this._selectGraceHopperOptimized(availableNodes, request);
            
            default:
                return this._selectRoundRobin(availableNodes);
        }
    }
    
    _selectRoundRobin(availableNodes) {
        const node = availableNodes[this.roundRobinIndex % availableNodes.length];
        this.roundRobinIndex++;
        return node;
    }
    
    _selectWeightedRoundRobin(availableNodes) {
        // Calculate total weight
        const totalWeight = availableNodes.reduce((sum, nodeId) => {
            const node = this.nodes.get(nodeId);
            return sum + (node ? node.weight : 1);
        }, 0);
        
        // Select based on weight
        let randomWeight = Math.random() * totalWeight;
        
        for (const nodeId of availableNodes) {
            const node = this.nodes.get(nodeId);
            const weight = node ? node.weight : 1;
            randomWeight -= weight;
            
            if (randomWeight <= 0) {
                return nodeId;
            }
        }
        
        return availableNodes[0]; // Fallback
    }
    
    _selectLeastConnections(availableNodes) {
        let minConnections = Infinity;
        let selectedNode = availableNodes[0];
        
        for (const nodeId of availableNodes) {
            const metrics = this.nodeMetrics.get(nodeId);
            if (metrics && metrics.currentLoad < minConnections) {
                minConnections = metrics.currentLoad;
                selectedNode = nodeId;
            }
        }
        
        return selectedNode;
    }
    
    _selectLeastResponseTime(availableNodes) {
        let minResponseTime = Infinity;
        let selectedNode = availableNodes[0];
        
        for (const nodeId of availableNodes) {
            const metrics = this.nodeMetrics.get(nodeId);
            if (metrics && metrics.avgResponseTime < minResponseTime) {
                minResponseTime = metrics.avgResponseTime;
                selectedNode = nodeId;
            }
        }
        
        return selectedNode;
    }
    
    _selectResourceBased(availableNodes) {
        let bestScore = -1;
        let selectedNode = availableNodes[0];
        
        for (const nodeId of availableNodes) {
            const metrics = this.nodeMetrics.get(nodeId);
            if (!metrics) continue;
            
            // Calculate resource score (higher is better)
            const memoryScore = (1 - metrics.memoryUtilization) * 0.4;
            const cpuScore = (1 - metrics.cpuUtilization) * 0.3;
            const loadScore = (1 - metrics.currentLoad / 100) * 0.3;
            
            const totalScore = memoryScore + cpuScore + loadScore;
            
            if (totalScore > bestScore) {
                bestScore = totalScore;
                selectedNode = nodeId;
            }
        }
        
        return selectedNode;
    }
    
    async _selectNVLinkOptimized(availableNodes, request) {
        if (!this.config.nvlinkOptimization) {
            return this._selectLeastConnections(availableNodes);
        }
        
        const requestType = request.type || 'default';
        const dataSize = request.dataSize || 0;
        
        let bestNode = availableNodes[0];
        let bestScore = -1;
        
        for (const nodeId of availableNodes) {
            const topology = this.nvlinkTopology.get(nodeId);
            const metrics = this.nodeMetrics.get(nodeId);
            
            if (!topology || !metrics) continue;
            
            // Calculate NVLink optimization score
            let score = 0;
            
            // Memory availability score
            const memoryScore = topology.availableMemory / topology.memoryCapacity;
            score += memoryScore * 0.4;
            
            // Load balancing score
            const loadScore = 1 - (metrics.currentLoad / 100);
            score += loadScore * 0.3;
            
            // NVLink bandwidth optimization for large data transfers
            if (dataSize > 1024 * 1024) { // > 1MB
                const bandwidthScore = topology.nvlinkBandwidth / 900; // Normalize to max
                score += bandwidthScore * 0.3;
            } else {
                // For small requests, prioritize low latency
                const responseScore = metrics.avgResponseTime > 0 ? 1000 / metrics.avgResponseTime : 1;
                score += Math.min(responseScore / 100, 1) * 0.3;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestNode = nodeId;
            }
        }
        
        return bestNode;
    }
    
    async _selectGraceHopperOptimized(availableNodes, request) {
        const graceNodes = availableNodes.filter(nodeId => {
            const node = this.nodes.get(nodeId);
            return node && node.graceHopperEnabled;
        });
        
        // If no Grace Hopper nodes available, fall back to regular selection
        if (graceNodes.length === 0) {
            return this._selectResourceBased(availableNodes);
        }
        
        // Optimize for Grace Hopper unified memory architecture
        const requestSize = request.vectorCount || 1;
        const needsLargeMemory = requestSize > 1000000; // > 1M vectors
        
        let bestNode = graceNodes[0];
        let bestScore = -1;
        
        for (const nodeId of graceNodes) {
            const metrics = this.nodeMetrics.get(nodeId);
            if (!metrics) continue;
            
            let score = 0;
            
            // Memory utilization (Grace memory is unified CPU-GPU)
            const memoryScore = 1 - metrics.memoryUtilization;
            score += memoryScore * 0.5;
            
            // CPU utilization (Grace CPU efficiency)
            const cpuScore = 1 - metrics.cpuUtilization;
            score += cpuScore * 0.2;
            
            // Current load
            const loadScore = 1 - (metrics.currentLoad / 100);
            score += loadScore * 0.2;
            
            // Response time efficiency
            const responseScore = metrics.avgResponseTime > 0 ? 
                1000 / metrics.avgResponseTime : 1;
            score += Math.min(responseScore / 500, 1) * 0.1;
            
            if (score > bestScore) {
                bestScore = score;
                bestNode = nodeId;
            }
        }
        
        return bestNode;
    }
    
    _getAvailableNodes() {
        const availableNodes = [];
        
        for (const [nodeId, node] of this.nodes) {
            if (node.status !== 'active') continue;
            
            const health = this.nodeHealth.get(nodeId);
            const circuitBreaker = this.circuitBreakers.get(nodeId);
            
            if (health && health.healthy && circuitBreaker && circuitBreaker.state !== 'open') {
                availableNodes.push(nodeId);
            }
        }
        
        return availableNodes;
    }
    
    // Health checking
    _startHealthChecking() {
        setInterval(async () => {
            await this._performHealthChecks();
        }, this.config.healthCheckInterval);
    }
    
    async _performHealthChecks() {
        const healthCheckPromises = [];
        
        for (const nodeId of this.nodes.keys()) {
            healthCheckPromises.push(this._checkNodeHealth(nodeId));
        }
        
        await Promise.allSettled(healthCheckPromises);
    }
    
    async _checkNodeHealth(nodeId) {
        const node = this.nodes.get(nodeId);
        const health = this.nodeHealth.get(nodeId);
        
        if (!node || !health) return;
        
        try {
            // Simulate health check - in real implementation, this would be an HTTP request
            const isHealthy = await this._simulateHealthCheck(node);
            
            if (isHealthy) {
                health.healthy = true;
                health.consecutiveFailures = 0;
                health.lastError = null;
                
                // Reset circuit breaker if it was open
                const circuitBreaker = this.circuitBreakers.get(nodeId);
                if (circuitBreaker.state === 'half-open') {
                    circuitBreaker.state = 'closed';
                    circuitBreaker.failureCount = 0;
                }
            } else {
                throw new Error('Health check failed');
            }
            
        } catch (error) {
            health.healthy = false;
            health.consecutiveFailures++;
            health.lastError = error.message;
            
            // Update circuit breaker
            this._updateCircuitBreaker(nodeId, false);
            
            logger.warn('Node health check failed', {
                nodeId,
                consecutiveFailures: health.consecutiveFailures,
                error: error.message
            });
        }
        
        health.lastHealthCheck = Date.now();
    }
    
    async _simulateHealthCheck(node) {
        // Simulate network delay and potential failures
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        return Math.random() > 0.05; // 95% success rate
    }
    
    // Circuit breaker logic
    _updateCircuitBreaker(nodeId, success) {
        const circuitBreaker = this.circuitBreakers.get(nodeId);
        if (!circuitBreaker) return;
        
        const now = Date.now();
        
        if (success) {
            circuitBreaker.failureCount = 0;
            if (circuitBreaker.state === 'half-open') {
                circuitBreaker.state = 'closed';
            }
        } else {
            circuitBreaker.failureCount++;
            circuitBreaker.lastFailureTime = now;
            
            if (circuitBreaker.failureCount >= 5) { // Threshold
                circuitBreaker.state = 'open';
                circuitBreaker.nextAttemptTime = now + 30000; // 30s timeout
                
                logger.warn('Circuit breaker opened for node', { nodeId });
            }
        }
        
        // Check if we should try half-open
        if (circuitBreaker.state === 'open' && now >= circuitBreaker.nextAttemptTime) {
            circuitBreaker.state = 'half-open';
            logger.info('Circuit breaker half-open for node', { nodeId });
        }
    }
    
    // Request processing and metrics
    async processRequest(request, nodeId) {
        const startTime = Date.now();
        
        try {
            // Update current load
            const metrics = this.nodeMetrics.get(nodeId);
            if (metrics) {
                metrics.currentLoad++;
            }
            
            // Simulate request processing
            const result = await this._simulateRequest(nodeId, request);
            
            // Update success metrics
            const responseTime = Date.now() - startTime;
            this._updateRequestMetrics(nodeId, true, responseTime);
            
            return result;
            
        } catch (error) {
            // Update failure metrics
            const responseTime = Date.now() - startTime;
            this._updateRequestMetrics(nodeId, false, responseTime);
            
            throw error;
        } finally {
            // Decrease current load
            const metrics = this.nodeMetrics.get(nodeId);
            if (metrics && metrics.currentLoad > 0) {
                metrics.currentLoad--;
            }
        }
    }
    
    async _simulateRequest(nodeId, request) {
        // Simulate processing time based on node type
        const node = this.nodes.get(nodeId);
        const baseTime = node && node.graceHopperEnabled ? 50 : 100; // Grace Hopper is faster
        const processingTime = baseTime + Math.random() * 100;
        
        await new Promise(resolve => setTimeout(resolve, processingTime));
        
        // Simulate occasional failures
        if (Math.random() < 0.02) { // 2% failure rate
            throw new Error('Simulated request failure');
        }
        
        return {
            processed: true,
            nodeId,
            processingTime,
            timestamp: Date.now()
        };
    }
    
    _updateRequestMetrics(nodeId, success, responseTime) {
        const metrics = this.nodeMetrics.get(nodeId);
        if (!metrics) return;
        
        metrics.requests++;
        
        if (success) {
            metrics.successCount++;
            
            // Update average response time
            const totalRequests = metrics.successCount;
            metrics.avgResponseTime = (metrics.avgResponseTime * (totalRequests - 1) + responseTime) / totalRequests;
        } else {
            metrics.errorCount++;
        }
        
        metrics.lastUpdateTime = Date.now();
        
        // Update global metrics
        this.globalMetrics.totalRequests++;
        if (success) {
            this.globalMetrics.successfulRequests++;
        } else {
            this.globalMetrics.failedRequests++;
        }
        
        // Update circuit breaker
        this._updateCircuitBreaker(nodeId, success);
    }
    
    _startMetricsCollection() {
        setInterval(() => {
            this._updateGlobalMetrics();
        }, 5000);
    }
    
    _updateGlobalMetrics() {
        const totalRequests = this.globalMetrics.totalRequests;
        if (totalRequests > 0) {
            const uptime = (Date.now() - this.startTime) / 1000;
            this.globalMetrics.throughput = totalRequests / uptime;
            
            // Calculate average response time across all nodes
            let totalResponseTime = 0;
            let nodeCount = 0;
            
            for (const metrics of this.nodeMetrics.values()) {
                if (metrics.avgResponseTime > 0) {
                    totalResponseTime += metrics.avgResponseTime;
                    nodeCount++;
                }
            }
            
            this.globalMetrics.avgResponseTime = nodeCount > 0 ? 
                totalResponseTime / nodeCount : 0;
        }
        
        this.emit('metricsUpdated', {
            global: this.globalMetrics,
            nodes: Array.from(this.nodeMetrics.entries()).map(([id, metrics]) => ({
                nodeId: id,
                ...metrics
            }))
        });
    }
    
    // Public API
    getStats() {
        return {
            nodes: Array.from(this.nodes.entries()).map(([id, node]) => ({
                id,
                ...node,
                health: this.nodeHealth.get(id),
                metrics: this.nodeMetrics.get(id),
                circuitBreaker: this.circuitBreakers.get(id)
            })),
            globalMetrics: this.globalMetrics,
            algorithm: this.config.algorithm,
            totalNodes: this.nodes.size,
            availableNodes: this._getAvailableNodes().length
        };
    }
    
    async shutdown() {
        logger.info('Shutting down load balancing orchestrator');
        
        // Mark all nodes as draining
        for (const node of this.nodes.values()) {
            node.status = 'draining';
        }
        
        // Wait for graceful shutdown period
        await new Promise(resolve => setTimeout(resolve, this.config.gracePeriod));
        
        // Clear all data
        this.nodes.clear();
        this.nodeMetrics.clear();
        this.nodeHealth.clear();
        this.circuitBreakers.clear();
        this.sessionMap.clear();
        
        this.emit('shutdown');
    }
}

module.exports = LoadBalancingOrchestrator;