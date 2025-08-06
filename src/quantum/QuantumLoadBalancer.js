/**
 * Quantum Load Balancer
 * Intelligent load distribution using quantum superposition principles
 */

const EventEmitter = require('eventemitter3');
const { logger } = require('../utils/logger');

class QuantumLoadBalancer extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            maxNodes: options.maxNodes || 32,
            balancingStrategy: options.balancingStrategy || 'quantum_coherent',
            healthCheckInterval: options.healthCheckInterval || 10000,
            rebalanceThreshold: options.rebalanceThreshold || 0.3,
            quantumWeightDecay: options.quantumWeightDecay || 0.95,
            entanglementFactor: options.entanglementFactor || 0.2,
            adaptiveLearning: options.adaptiveLearning !== false,
            gracePeriod: options.gracePeriod || 30000,
            ...options
        };
        
        this.nodes = new Map();
        this.quantumStates = new Map();
        this.loadHistory = [];
        this.routingTable = new Map();
        this.entanglements = new Set();
        this.metrics = {
            totalRequests: 0,
            balancedRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            nodeUtilization: new Map()
        };
        
        this.isRunning = false;
        this.healthCheckTimer = null;
        this.rebalanceTimer = null;
        
        this.initializeBalancingStrategies();
    }

    initializeBalancingStrategies() {
        this.strategies = {
            'round_robin': this.roundRobinStrategy.bind(this),
            'least_connections': this.leastConnectionsStrategy.bind(this),
            'weighted_round_robin': this.weightedRoundRobinStrategy.bind(this),
            'response_time': this.responseTimeStrategy.bind(this),
            'quantum_coherent': this.quantumCoherentStrategy.bind(this),
            'quantum_entangled': this.quantumEntangledStrategy.bind(this),
            'adaptive_quantum': this.adaptiveQuantumStrategy.bind(this)
        };
    }

    async initialize() {
        if (this.isRunning) return;

        logger.info('Initializing Quantum Load Balancer', {
            maxNodes: this.config.maxNodes,
            strategy: this.config.balancingStrategy,
            healthCheckInterval: this.config.healthCheckInterval
        });

        this.healthCheckTimer = setInterval(() => {
            this.performHealthChecks();
        }, this.config.healthCheckInterval);

        this.rebalanceTimer = setInterval(() => {
            this.performRebalancing();
        }, this.config.healthCheckInterval * 2);

        this.isRunning = true;
        this.emit('initialized');
    }

    async registerNode(nodeId, nodeInfo) {
        const node = {
            id: nodeId,
            address: nodeInfo.address,
            port: nodeInfo.port,
            weight: nodeInfo.weight || 1.0,
            capacity: nodeInfo.capacity || 100,
            currentLoad: 0,
            activeConnections: 0,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            status: 'healthy',
            lastHealthCheck: Date.now(),
            metadata: nodeInfo.metadata || {},
            quantumProperties: {
                coherence: 1.0,
                phase: Math.random() * 2 * Math.PI,
                entanglements: [],
                superpositionWeight: 1.0
            }
        };

        this.nodes.set(nodeId, node);
        this.initializeQuantumState(nodeId, node);
        
        logger.info('Node registered with quantum properties', { 
            nodeId, 
            address: node.address, 
            weight: node.weight 
        });
        
        this.emit('nodeRegistered', node);
        return node;
    }

    initializeQuantumState(nodeId, node) {
        const quantumState = {
            nodeId: nodeId,
            superposition: this.generateNodeSuperposition(node),
            coherence: 1.0,
            lastMeasurement: Date.now(),
            measurements: [],
            entanglements: []
        };

        this.quantumStates.set(nodeId, quantumState);
        this.updateQuantumEntanglements(nodeId);
    }

    generateNodeSuperposition(node) {
        const states = [];
        const baseStates = ['idle', 'light', 'moderate', 'heavy', 'overloaded'];
        
        for (let i = 0; i < baseStates.length; i++) {
            const loadLevel = i / (baseStates.length - 1);
            const capacity = node.capacity || 100;
            const probability = this.calculateStateProbability(loadLevel, node.currentLoad, capacity);
            
            states.push({
                id: i,
                name: baseStates[i],
                loadLevel: loadLevel,
                probability: probability,
                weight: node.weight * (1 - loadLevel * 0.5),
                responseTimeMultiplier: 1 + loadLevel * 2
            });
        }

        return this.normalizeStateProbabilities(states);
    }

    calculateStateProbability(targetLoad, currentLoad, capacity) {
        const currentLoadRatio = currentLoad / capacity;
        const distance = Math.abs(targetLoad - currentLoadRatio);
        const probability = Math.exp(-distance * 5);
        return probability;
    }

    normalizeStateProbabilities(states) {
        const totalProbability = states.reduce((sum, state) => sum + state.probability, 0);
        
        return states.map(state => ({
            ...state,
            probability: state.probability / Math.max(totalProbability, 0.001)
        }));
    }

    updateQuantumEntanglements(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        for (const [otherNodeId, otherNode] of this.nodes) {
            if (otherNodeId === nodeId) continue;

            const correlation = this.calculateNodeCorrelation(node, otherNode);
            
            if (correlation > 0.7) {
                this.createQuantumEntanglement(nodeId, otherNodeId, correlation);
            }
        }
    }

    calculateNodeCorrelation(node1, node2) {
        let correlation = 0;
        let factors = 0;

        if (node1.metadata?.datacenter === node2.metadata?.datacenter) {
            correlation += 0.4;
            factors++;
        }

        if (node1.metadata?.region === node2.metadata?.region) {
            correlation += 0.3;
            factors++;
        }

        const loadDiff = Math.abs(node1.currentLoad - node2.currentLoad);
        const maxCapacity = Math.max(node1.capacity, node2.capacity);
        const loadCorrelation = 1 - (loadDiff / maxCapacity);
        correlation += loadCorrelation * 0.3;
        factors++;

        return factors > 0 ? correlation / factors : 0;
    }

    createQuantumEntanglement(nodeId1, nodeId2, correlation) {
        const entanglement = {
            id: `${nodeId1}-${nodeId2}`,
            nodes: [nodeId1, nodeId2],
            correlation: correlation,
            strength: correlation,
            createdAt: Date.now(),
            type: correlation > 0.8 ? 'strong' : 'weak'
        };

        this.entanglements.add(entanglement);

        const state1 = this.quantumStates.get(nodeId1);
        const state2 = this.quantumStates.get(nodeId2);
        
        if (state1) state1.entanglements.push(entanglement.id);
        if (state2) state2.entanglements.push(entanglement.id);

        logger.debug('Created quantum entanglement between nodes', {
            nodeId1, nodeId2, correlation: correlation.toFixed(3)
        });
    }

    async selectNode(request = {}) {
        if (this.nodes.size === 0) {
            throw new Error('No nodes available for load balancing');
        }

        const strategy = this.strategies[this.config.balancingStrategy];
        if (!strategy) {
            throw new Error(`Unknown balancing strategy: ${this.config.balancingStrategy}`);
        }

        const selectedNode = await strategy(request);
        
        if (!selectedNode) {
            throw new Error('No healthy nodes available');
        }

        this.updateNodeLoad(selectedNode.id, 'request_start');
        this.metrics.totalRequests++;
        this.metrics.balancedRequests++;

        logger.debug('Node selected for request', { 
            nodeId: selectedNode.id, 
            strategy: this.config.balancingStrategy,
            currentLoad: selectedNode.currentLoad 
        });

        this.emit('nodeSelected', { node: selectedNode, request });
        return selectedNode;
    }

    async roundRobinStrategy(request) {
        const healthyNodes = Array.from(this.nodes.values())
            .filter(node => node.status === 'healthy');
        
        if (healthyNodes.length === 0) return null;

        const requestCount = this.metrics.totalRequests;
        const selectedIndex = requestCount % healthyNodes.length;
        
        return healthyNodes[selectedIndex];
    }

    async leastConnectionsStrategy(request) {
        const healthyNodes = Array.from(this.nodes.values())
            .filter(node => node.status === 'healthy');
        
        if (healthyNodes.length === 0) return null;

        return healthyNodes.reduce((least, node) => 
            node.activeConnections < least.activeConnections ? node : least
        );
    }

    async weightedRoundRobinStrategy(request) {
        const healthyNodes = Array.from(this.nodes.values())
            .filter(node => node.status === 'healthy');
        
        if (healthyNodes.length === 0) return null;

        const totalWeight = healthyNodes.reduce((sum, node) => sum + node.weight, 0);
        const randomWeight = Math.random() * totalWeight;
        
        let currentWeight = 0;
        for (const node of healthyNodes) {
            currentWeight += node.weight;
            if (randomWeight <= currentWeight) {
                return node;
            }
        }

        return healthyNodes[0];
    }

    async responseTimeStrategy(request) {
        const healthyNodes = Array.from(this.nodes.values())
            .filter(node => node.status === 'healthy');
        
        if (healthyNodes.length === 0) return null;

        return healthyNodes.reduce((fastest, node) =>
            node.averageResponseTime < fastest.averageResponseTime ? node : fastest
        );
    }

    async quantumCoherentStrategy(request) {
        const healthyNodes = Array.from(this.nodes.values())
            .filter(node => node.status === 'healthy');
        
        if (healthyNodes.length === 0) return null;

        const nodeScores = healthyNodes.map(node => {
            const quantumState = this.quantumStates.get(node.id);
            const coherence = quantumState ? quantumState.coherence : 0.5;
            
            const loadRatio = node.currentLoad / node.capacity;
            const availabilityScore = 1 - loadRatio;
            const weightScore = node.weight;
            
            const quantumScore = coherence * availabilityScore * weightScore;
            
            return { node, score: quantumScore };
        });

        const selectedNodeInfo = nodeScores.reduce((best, current) =>
            current.score > best.score ? current : best
        );

        await this.performQuantumMeasurement(selectedNodeInfo.node.id);
        
        return selectedNodeInfo.node;
    }

    async quantumEntangledStrategy(request) {
        const healthyNodes = Array.from(this.nodes.values())
            .filter(node => node.status === 'healthy');
        
        if (healthyNodes.length === 0) return null;

        let bestNode = null;
        let bestScore = -1;

        for (const node of healthyNodes) {
            const quantumState = this.quantumStates.get(node.id);
            let score = node.weight * (1 - node.currentLoad / node.capacity);
            
            if (quantumState && quantumState.entanglements.length > 0) {
                let entanglementBonus = 0;
                
                for (const entanglementId of quantumState.entanglements) {
                    const entanglement = Array.from(this.entanglements)
                        .find(e => e.id === entanglementId);
                    
                    if (entanglement) {
                        const partnerNodeId = entanglement.nodes.find(id => id !== node.id);
                        const partnerNode = this.nodes.get(partnerNodeId);
                        
                        if (partnerNode && partnerNode.status === 'healthy') {
                            const partnerLoad = partnerNode.currentLoad / partnerNode.capacity;
                            entanglementBonus += entanglement.strength * (1 - partnerLoad) * this.config.entanglementFactor;
                        }
                    }
                }
                
                score += entanglementBonus;
            }

            if (score > bestScore) {
                bestScore = score;
                bestNode = node;
            }
        }

        if (bestNode) {
            await this.performQuantumMeasurement(bestNode.id);
        }

        return bestNode;
    }

    async adaptiveQuantumStrategy(request) {
        const healthyNodes = Array.from(this.nodes.values())
            .filter(node => node.status === 'healthy');
        
        if (healthyNodes.length === 0) return null;

        const currentPerformance = this.calculateSystemPerformance();
        
        let selectedStrategy = 'quantum_coherent';
        
        if (currentPerformance.averageLoad > 0.8) {
            selectedStrategy = 'least_connections';
        } else if (currentPerformance.responseTime > 2000) {
            selectedStrategy = 'response_time';
        } else if (currentPerformance.entanglementDensity > 0.5) {
            selectedStrategy = 'quantum_entangled';
        }

        const strategy = this.strategies[selectedStrategy];
        const selectedNode = await strategy(request);
        
        if (this.config.adaptiveLearning) {
            this.recordStrategyPerformance(selectedStrategy, selectedNode);
        }

        return selectedNode;
    }

    calculateSystemPerformance() {
        const nodes = Array.from(this.nodes.values());
        
        const averageLoad = nodes.reduce((sum, node) => 
            sum + (node.currentLoad / node.capacity), 0) / nodes.length;
        
        const responseTime = nodes.reduce((sum, node) => 
            sum + node.averageResponseTime, 0) / nodes.length;
        
        const entanglementDensity = this.entanglements.size / Math.max(1, nodes.length * (nodes.length - 1) / 2);
        
        return { averageLoad, responseTime, entanglementDensity };
    }

    recordStrategyPerformance(strategy, selectedNode) {
        if (!this.strategyPerformance) {
            this.strategyPerformance = new Map();
        }

        if (!this.strategyPerformance.has(strategy)) {
            this.strategyPerformance.set(strategy, {
                selections: 0,
                totalResponseTime: 0,
                successfulRequests: 0,
                averageScore: 0
            });
        }

        const performance = this.strategyPerformance.get(strategy);
        performance.selections++;
        
        if (selectedNode) {
            performance.totalResponseTime += selectedNode.averageResponseTime;
            performance.averageScore = performance.totalResponseTime / performance.selections;
        }
    }

    async performQuantumMeasurement(nodeId) {
        const quantumState = this.quantumStates.get(nodeId);
        const node = this.nodes.get(nodeId);
        
        if (!quantumState || !node) return;

        const collapsedState = this.collapseWavefunction(quantumState.superposition);
        const measurement = {
            nodeId: nodeId,
            timestamp: Date.now(),
            collapsedState: collapsedState,
            coherence: quantumState.coherence
        };

        quantumState.measurements.push(measurement);
        quantumState.lastMeasurement = Date.now();
        
        this.updateEntangledNodes(nodeId, measurement);
        
        if (quantumState.measurements.length > 100) {
            quantumState.measurements.shift();
        }

        logger.debug('Quantum measurement performed', {
            nodeId,
            collapsedState: collapsedState.name,
            coherence: quantumState.coherence.toFixed(3)
        });
    }

    collapseWavefunction(superposition) {
        const random = Math.random();
        let cumulativeProbability = 0;
        
        for (const state of superposition) {
            cumulativeProbability += state.probability;
            if (random <= cumulativeProbability) {
                return state;
            }
        }
        
        return superposition[superposition.length - 1];
    }

    updateEntangledNodes(nodeId, measurement) {
        const quantumState = this.quantumStates.get(nodeId);
        if (!quantumState) return;

        for (const entanglementId of quantumState.entanglements) {
            const entanglement = Array.from(this.entanglements)
                .find(e => e.id === entanglementId);
            
            if (entanglement) {
                const partnerNodeId = entanglement.nodes.find(id => id !== nodeId);
                const partnerState = this.quantumStates.get(partnerNodeId);
                
                if (partnerState) {
                    this.applyEntanglementEffect(partnerState, measurement, entanglement.strength);
                }
            }
        }
    }

    applyEntanglementEffect(partnerState, measurement, strength) {
        const effectStrength = strength * 0.2;
        
        partnerState.superposition.forEach(state => {
            if (state.name === measurement.collapsedState.name) {
                state.probability += effectStrength;
            } else {
                state.probability *= (1 - effectStrength * 0.1);
            }
        });

        partnerState.superposition = this.normalizeStateProbabilities(partnerState.superposition);
        partnerState.coherence = Math.max(0.1, partnerState.coherence - effectStrength * 0.05);
    }

    updateNodeLoad(nodeId, event, responseTime = null) {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        switch (event) {
            case 'request_start':
                node.activeConnections++;
                node.totalRequests++;
                node.currentLoad = Math.min(node.capacity, 
                    node.currentLoad + (100 / node.capacity));
                break;
                
            case 'request_complete':
                node.activeConnections = Math.max(0, node.activeConnections - 1);
                node.successfulRequests++;
                node.currentLoad = Math.max(0, 
                    node.currentLoad - (100 / node.capacity));
                
                if (responseTime !== null) {
                    this.updateNodeResponseTime(node, responseTime);
                }
                break;
                
            case 'request_failed':
                node.activeConnections = Math.max(0, node.activeConnections - 1);
                node.failedRequests++;
                node.currentLoad = Math.max(0, 
                    node.currentLoad - (100 / node.capacity));
                this.metrics.failedRequests++;
                break;
        }

        this.updateQuantumState(nodeId, node);
        this.metrics.nodeUtilization.set(nodeId, node.currentLoad / node.capacity);
    }

    updateNodeResponseTime(node, responseTime) {
        if (node.averageResponseTime === 0) {
            node.averageResponseTime = responseTime;
        } else {
            node.averageResponseTime = 
                (node.averageResponseTime * 0.9) + (responseTime * 0.1);
        }
        
        this.updateGlobalMetrics();
    }

    updateGlobalMetrics() {
        const nodes = Array.from(this.nodes.values());
        const totalResponseTime = nodes.reduce((sum, node) => 
            sum + node.averageResponseTime, 0);
        
        this.metrics.averageResponseTime = totalResponseTime / nodes.length;
    }

    updateQuantumState(nodeId, node) {
        const quantumState = this.quantumStates.get(nodeId);
        if (!quantumState) return;

        quantumState.superposition = this.generateNodeSuperposition(node);
        
        const timeSinceLastMeasurement = Date.now() - quantumState.lastMeasurement;
        const coherenceDecay = Math.exp(-timeSinceLastMeasurement / 60000); // 1 minute decay
        quantumState.coherence *= coherenceDecay * this.config.quantumWeightDecay;
        quantumState.coherence = Math.max(0.01, quantumState.coherence);
    }

    async performHealthChecks() {
        const healthPromises = Array.from(this.nodes.keys()).map(nodeId => 
            this.checkNodeHealth(nodeId)
        );

        await Promise.allSettled(healthPromises);
        this.updateLoadHistory();
    }

    async checkNodeHealth(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        try {
            const healthScore = await this.calculateNodeHealthScore(node);
            
            const wasHealthy = node.status === 'healthy';
            node.status = healthScore > 0.5 ? 'healthy' : 'unhealthy';
            node.lastHealthCheck = Date.now();

            if (wasHealthy && node.status === 'unhealthy') {
                logger.warn('Node became unhealthy', { 
                    nodeId, 
                    healthScore: healthScore.toFixed(3) 
                });
                this.emit('nodeUnhealthy', node);
            } else if (!wasHealthy && node.status === 'healthy') {
                logger.info('Node recovered', { 
                    nodeId, 
                    healthScore: healthScore.toFixed(3) 
                });
                this.emit('nodeRecovered', node);
            }

        } catch (error) {
            logger.error('Health check failed', { 
                nodeId, 
                error: error.message 
            });
            node.status = 'unhealthy';
        }
    }

    async calculateNodeHealthScore(node) {
        let healthScore = 1.0;

        const loadRatio = node.currentLoad / node.capacity;
        if (loadRatio > 0.9) healthScore -= 0.4;
        else if (loadRatio > 0.7) healthScore -= 0.2;

        if (node.averageResponseTime > 5000) healthScore -= 0.3;
        else if (node.averageResponseTime > 2000) healthScore -= 0.1;

        const failureRate = node.totalRequests > 0 ? 
            node.failedRequests / node.totalRequests : 0;
        if (failureRate > 0.1) healthScore -= 0.3;
        else if (failureRate > 0.05) healthScore -= 0.1;

        const quantumState = this.quantumStates.get(node.id);
        if (quantumState && quantumState.coherence < 0.3) {
            healthScore -= 0.2;
        }

        return Math.max(0, healthScore);
    }

    updateLoadHistory() {
        const snapshot = {
            timestamp: Date.now(),
            nodes: Array.from(this.nodes.values()).map(node => ({
                id: node.id,
                load: node.currentLoad / node.capacity,
                connections: node.activeConnections,
                responseTime: node.averageResponseTime,
                status: node.status
            })),
            systemMetrics: { ...this.metrics }
        };

        this.loadHistory.push(snapshot);
        
        if (this.loadHistory.length > 1000) {
            this.loadHistory.shift();
        }
    }

    async performRebalancing() {
        const imbalanceScore = this.calculateSystemImbalance();
        
        if (imbalanceScore > this.config.rebalanceThreshold) {
            logger.info('System imbalance detected, initiating rebalancing', {
                imbalanceScore: imbalanceScore.toFixed(3)
            });
            
            await this.executeRebalancing(imbalanceScore);
            this.emit('rebalancingCompleted', { imbalanceScore });
        }
    }

    calculateSystemImbalance() {
        const healthyNodes = Array.from(this.nodes.values())
            .filter(node => node.status === 'healthy');
        
        if (healthyNodes.length < 2) return 0;

        const loads = healthyNodes.map(node => node.currentLoad / node.capacity);
        const averageLoad = loads.reduce((sum, load) => sum + load, 0) / loads.length;
        
        const variance = loads.reduce((sum, load) => 
            sum + Math.pow(load - averageLoad, 2), 0) / loads.length;
        
        return Math.sqrt(variance);
    }

    async executeRebalancing(imbalanceScore) {
        const healthyNodes = Array.from(this.nodes.values())
            .filter(node => node.status === 'healthy');
        
        healthyNodes.sort((a, b) => 
            (b.currentLoad / b.capacity) - (a.currentLoad / a.capacity)
        );

        const overloadedNodes = healthyNodes.filter(node => 
            (node.currentLoad / node.capacity) > 0.8
        );
        
        const underutilizedNodes = healthyNodes.filter(node => 
            (node.currentLoad / node.capacity) < 0.4
        );

        if (overloadedNodes.length > 0 && underutilizedNodes.length > 0) {
            for (const overloadedNode of overloadedNodes.slice(0, 3)) {
                this.adjustNodeWeight(overloadedNode.id, 0.8);
            }
            
            for (const underutilizedNode of underutilizedNodes.slice(0, 3)) {
                this.adjustNodeWeight(underutilizedNode.id, 1.2);
            }
            
            setTimeout(() => {
                for (const node of overloadedNodes.slice(0, 3)) {
                    this.adjustNodeWeight(node.id, 1.0);
                }
                for (const node of underutilizedNodes.slice(0, 3)) {
                    this.adjustNodeWeight(node.id, 1.0);
                }
            }, this.config.gracePeriod);
        }
    }

    adjustNodeWeight(nodeId, factor) {
        const node = this.nodes.get(nodeId);
        if (node) {
            node.weight *= factor;
            node.weight = Math.max(0.1, Math.min(5.0, node.weight));
            
            logger.debug('Node weight adjusted', { 
                nodeId, 
                newWeight: node.weight.toFixed(2) 
            });
        }
    }

    async completeRequest(nodeId, responseTime, success = true) {
        const event = success ? 'request_complete' : 'request_failed';
        this.updateNodeLoad(nodeId, event, responseTime);

        if (success) {
            this.emit('requestCompleted', { nodeId, responseTime });
        } else {
            this.emit('requestFailed', { nodeId, responseTime });
        }
    }

    unregisterNode(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;

        this.nodes.delete(nodeId);
        this.quantumStates.delete(nodeId);
        this.metrics.nodeUtilization.delete(nodeId);

        for (const entanglement of this.entanglements) {
            if (entanglement.nodes.includes(nodeId)) {
                this.entanglements.delete(entanglement);
            }
        }

        logger.info('Node unregistered', { nodeId });
        this.emit('nodeUnregistered', node);
        
        return true;
    }

    getNodeStatus(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return null;

        const quantumState = this.quantumStates.get(nodeId);
        
        return {
            ...node,
            quantumState: quantumState,
            utilization: node.currentLoad / node.capacity,
            healthScore: this.calculateNodeHealthScore(node)
        };
    }

    getSystemMetrics() {
        const healthyNodeCount = Array.from(this.nodes.values())
            .filter(node => node.status === 'healthy').length;

        return {
            ...this.metrics,
            systemHealth: {
                totalNodes: this.nodes.size,
                healthyNodes: healthyNodeCount,
                unhealthyNodes: this.nodes.size - healthyNodeCount,
                systemImbalance: this.calculateSystemImbalance(),
                averageLoad: Array.from(this.metrics.nodeUtilization.values())
                    .reduce((sum, load) => sum + load, 0) / this.metrics.nodeUtilization.size
            },
            quantumMetrics: {
                totalQuantumStates: this.quantumStates.size,
                totalEntanglements: this.entanglements.size,
                averageCoherence: Array.from(this.quantumStates.values())
                    .reduce((sum, state) => sum + state.coherence, 0) / this.quantumStates.size
            },
            performance: {
                balancingStrategy: this.config.balancingStrategy,
                strategyPerformance: this.strategyPerformance ? 
                    Object.fromEntries(this.strategyPerformance) : {}
            }
        };
    }

    async shutdown() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        if (this.rebalanceTimer) {
            clearInterval(this.rebalanceTimer);
            this.rebalanceTimer = null;
        }

        this.nodes.clear();
        this.quantumStates.clear();
        this.entanglements.clear();
        this.loadHistory.length = 0;
        this.routingTable.clear();

        this.isRunning = false;
        this.emit('shutdown');
        
        logger.info('Quantum Load Balancer shutdown completed');
    }
}

module.exports = { QuantumLoadBalancer };