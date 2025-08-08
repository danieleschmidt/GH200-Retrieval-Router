/**
 * Auto-Scaling Manager
 * Dynamic scaling based on load, performance metrics, and quantum coherence
 */

const { logger } = require('../utils/logger');
const { EventEmitter } = require('events');

class AutoScalingManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Scaling thresholds
            cpuThreshold: options.cpuThreshold || 70,
            memoryThreshold: options.memoryThreshold || 80,
            queueThreshold: options.queueThreshold || 100,
            latencyThreshold: options.latencyThreshold || 2000,
            
            // Quantum-specific thresholds
            coherenceThreshold: options.coherenceThreshold || 0.3,
            entanglementDensityThreshold: options.entanglementDensityThreshold || 0.8,
            
            // Scaling parameters
            scaleUpCooldown: options.scaleUpCooldown || 120000, // 2 minutes
            scaleDownCooldown: options.scaleDownCooldown || 300000, // 5 minutes
            minInstances: options.minInstances || 2,
            maxInstances: options.maxInstances || 20,
            scaleUpFactor: options.scaleUpFactor || 2,
            scaleDownFactor: options.scaleDownFactor || 0.5,
            
            // Monitoring
            monitoringInterval: options.monitoringInterval || 30000,
            metricsWindow: options.metricsWindow || 300000, // 5 minutes
            
            // Predictive scaling
            enablePredictiveScaling: options.enablePredictiveScaling !== false,
            predictionWindow: options.predictionWindow || 600000, // 10 minutes
            
            ...options
        };
        
        this.metrics = {
            cpu: [],
            memory: [],
            queueSize: [],
            latency: [],
            coherence: [],
            entanglementDensity: [],
            timestamp: []
        };
        
        this.scalingHistory = [];
        this.lastScaleUp = 0;
        this.lastScaleDown = 0;
        this.currentInstances = this.config.minInstances;
        this.targetInstances = this.config.minInstances;
        
        this.isRunning = false;
        this.monitoringTimer = null;
        this.scalingInProgress = false;
        
        // Predictive model (simple linear regression)
        this.predictionModel = {
            weights: new Array(6).fill(0), // CPU, Memory, Queue, Latency, Coherence, EntanglementDensity
            bias: 0,
            trained: false
        };
    }
    
    async initialize(systemComponents) {
        if (this.isRunning) return;
        
        this.components = systemComponents;
        
        logger.info('Initializing Auto-Scaling Manager', {
            minInstances: this.config.minInstances,
            maxInstances: this.config.maxInstances,
            monitoringInterval: this.config.monitoringInterval
        });
        
        // Start monitoring
        this.monitoringTimer = setInterval(() => {
            this.collectMetrics().catch(error => {
                logger.error('Failed to collect scaling metrics', { error: error.message });
            });
        }, this.config.monitoringInterval);
        
        this.isRunning = true;
        this.emit('initialized');
    }
    
    async collectMetrics() {
        try {
            const timestamp = Date.now();
            
            // Collect system metrics
            const systemMetrics = await this.getSystemMetrics();
            const quantumMetrics = await this.getQuantumMetrics();
            
            // Store metrics
            this.storeMetrics(timestamp, systemMetrics, quantumMetrics);
            
            // Cleanup old metrics
            this.cleanupOldMetrics(timestamp);
            
            // Check if scaling is needed
            await this.evaluateScaling(systemMetrics, quantumMetrics);
            
        } catch (error) {
            logger.error('Error collecting metrics for auto-scaling', { error: error.message });
        }
    }
    
    async getSystemMetrics() {
        // In a real implementation, these would come from system monitoring
        // For demo purposes, we'll simulate realistic values
        return {
            cpu: Math.random() * 100,
            memory: Math.random() * 100,
            queueSize: Math.floor(Math.random() * 200),
            latency: Math.random() * 3000 + 100
        };
    }
    
    async getQuantumMetrics() {
        const metrics = { coherence: 0.5, entanglementDensity: 0.4 };
        
        try {
            if (this.components?.planner) {
                const plannerMetrics = this.components.planner.getMetrics();
                metrics.coherence = plannerMetrics.averageCoherence || 0.5;
                
                if (plannerMetrics.totalTasks > 0) {
                    metrics.entanglementDensity = plannerMetrics.entanglements / plannerMetrics.totalTasks;
                }
            }
        } catch (error) {
            logger.warn('Failed to get quantum metrics', { error: error.message });
        }
        
        return metrics;
    }
    
    storeMetrics(timestamp, systemMetrics, quantumMetrics) {
        this.metrics.timestamp.push(timestamp);
        this.metrics.cpu.push(systemMetrics.cpu);
        this.metrics.memory.push(systemMetrics.memory);
        this.metrics.queueSize.push(systemMetrics.queueSize);
        this.metrics.latency.push(systemMetrics.latency);
        this.metrics.coherence.push(quantumMetrics.coherence);
        this.metrics.entanglementDensity.push(quantumMetrics.entanglementDensity);
    }
    
    cleanupOldMetrics(currentTime) {
        const cutoffTime = currentTime - this.config.metricsWindow;
        
        while (this.metrics.timestamp.length > 0 && 
               this.metrics.timestamp[0] < cutoffTime) {
            
            this.metrics.timestamp.shift();
            this.metrics.cpu.shift();
            this.metrics.memory.shift();
            this.metrics.queueSize.shift();
            this.metrics.latency.shift();
            this.metrics.coherence.shift();
            this.metrics.entanglementDensity.shift();
        }
    }
    
    async evaluateScaling(systemMetrics, quantumMetrics) {
        if (this.scalingInProgress) return;
        
        const now = Date.now();
        
        // Calculate averages for decision making
        const recentMetrics = this.getRecentAverages(5); // Last 5 measurements
        
        // Determine scaling need
        const scaleUpNeeded = this.shouldScaleUp(recentMetrics, systemMetrics, quantumMetrics, now);
        const scaleDownNeeded = this.shouldScaleDown(recentMetrics, systemMetrics, quantumMetrics, now);
        
        if (scaleUpNeeded && !scaleDownNeeded) {
            await this.scaleUp();
        } else if (scaleDownNeeded && !scaleUpNeeded) {
            await this.scaleDown();
        }
        
        // Update prediction model
        if (this.config.enablePredictiveScaling) {
            this.updatePredictionModel();
        }
    }
    
    shouldScaleUp(recent, current, quantum, now) {
        // Check cooldown
        if (now - this.lastScaleUp < this.config.scaleUpCooldown) {
            return false;
        }
        
        // Check if at maximum capacity
        if (this.currentInstances >= this.config.maxInstances) {
            return false;
        }
        
        // System resource thresholds
        const highCpu = recent.cpu > this.config.cpuThreshold;
        const highMemory = recent.memory > this.config.memoryThreshold;
        const highQueue = recent.queueSize > this.config.queueThreshold;
        const highLatency = recent.latency > this.config.latencyThreshold;
        
        // Quantum-specific thresholds
        const lowCoherence = quantum.coherence < this.config.coherenceThreshold;
        const highEntanglement = quantum.entanglementDensity > this.config.entanglementDensityThreshold;
        
        // Scale up if multiple conditions are met
        const systemStress = [highCpu, highMemory, highQueue, highLatency].filter(Boolean).length;
        const quantumStress = [lowCoherence, highEntanglement].filter(Boolean).length;
        
        return systemStress >= 2 || quantumStress >= 1;
    }
    
    shouldScaleDown(recent, current, quantum, now) {
        // Check cooldown
        if (now - this.lastScaleDown < this.config.scaleDownCooldown) {
            return false;
        }
        
        // Check if at minimum capacity
        if (this.currentInstances <= this.config.minInstances) {
            return false;
        }
        
        // All metrics should be well below thresholds for scale down
        const lowCpu = recent.cpu < this.config.cpuThreshold * 0.5;
        const lowMemory = recent.memory < this.config.memoryThreshold * 0.5;
        const lowQueue = recent.queueSize < this.config.queueThreshold * 0.3;
        const lowLatency = recent.latency < this.config.latencyThreshold * 0.5;
        
        const goodCoherence = quantum.coherence > this.config.coherenceThreshold * 2;
        const normalEntanglement = quantum.entanglementDensity < this.config.entanglementDensityThreshold * 0.7;
        
        return lowCpu && lowMemory && lowQueue && lowLatency && 
               goodCoherence && normalEntanglement;
    }
    
    async scaleUp() {
        if (this.scalingInProgress) return;
        
        this.scalingInProgress = true;
        const currentInstances = this.currentInstances;
        const newInstances = Math.min(
            this.config.maxInstances,
            Math.ceil(currentInstances * this.config.scaleUpFactor)
        );
        
        logger.info('Scaling up quantum system', {
            from: currentInstances,
            to: newInstances,
            reason: 'High load detected'
        });
        
        try {
            await this.performScaling(newInstances);
            
            this.currentInstances = newInstances;
            this.lastScaleUp = Date.now();
            
            this.scalingHistory.push({
                timestamp: Date.now(),
                action: 'scale_up',
                from: currentInstances,
                to: newInstances,
                reason: 'High load'
            });
            
            this.emit('scaled', { action: 'up', from: currentInstances, to: newInstances });
            
        } catch (error) {
            logger.error('Failed to scale up', { error: error.message });
        } finally {
            this.scalingInProgress = false;
        }
    }
    
    async scaleDown() {
        if (this.scalingInProgress) return;
        
        this.scalingInProgress = true;
        const currentInstances = this.currentInstances;
        const newInstances = Math.max(
            this.config.minInstances,
            Math.floor(currentInstances * this.config.scaleDownFactor)
        );
        
        logger.info('Scaling down quantum system', {
            from: currentInstances,
            to: newInstances,
            reason: 'Low load detected'
        });
        
        try {
            await this.performScaling(newInstances);
            
            this.currentInstances = newInstances;
            this.lastScaleDown = Date.now();
            
            this.scalingHistory.push({
                timestamp: Date.now(),
                action: 'scale_down',
                from: currentInstances,
                to: newInstances,
                reason: 'Low load'
            });
            
            this.emit('scaled', { action: 'down', from: currentInstances, to: newInstances });
            
        } catch (error) {
            logger.error('Failed to scale down', { error: error.message });
        } finally {
            this.scalingInProgress = false;
        }
    }
    
    async performScaling(targetInstances) {
        // In a real implementation, this would:
        // 1. Start/stop container instances
        // 2. Update load balancer configuration
        // 3. Wait for instances to become healthy
        // 4. Redistribute workload
        
        logger.info(`Simulating scaling to ${targetInstances} instances`);
        
        // Simulate scaling time
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Update component configurations if available
        if (this.components) {
            for (const [name, component] of Object.entries(this.components)) {
                if (component.updateScaling) {
                    try {
                        await component.updateScaling(targetInstances);
                    } catch (error) {
                        logger.warn(`Failed to update scaling for ${name}`, { error: error.message });
                    }
                }
            }
        }
    }
    
    getRecentAverages(count = 5) {
        const len = this.metrics.cpu.length;
        if (len === 0) return { cpu: 0, memory: 0, queueSize: 0, latency: 0 };
        
        const start = Math.max(0, len - count);
        const slice = (arr) => arr.slice(start);
        const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
        
        return {
            cpu: avg(slice(this.metrics.cpu)),
            memory: avg(slice(this.metrics.memory)),
            queueSize: avg(slice(this.metrics.queueSize)),
            latency: avg(slice(this.metrics.latency))
        };
    }
    
    updatePredictionModel() {
        // Simple implementation - in production, use proper ML library
        if (this.metrics.cpu.length < 10) return;
        
        // This would implement a simple regression model to predict future load
        // For demo purposes, we'll just mark it as "trained"
        this.predictionModel.trained = true;
    }
    
    predictFutureLoad(minutesAhead = 10) {
        if (!this.predictionModel.trained) return null;
        
        // Simplified prediction - in reality, this would use the regression model
        const recent = this.getRecentAverages();
        
        // Simple trend-based prediction
        const trend = this.calculateTrend();
        return {
            cpu: Math.max(0, Math.min(100, recent.cpu + trend.cpu * minutesAhead)),
            memory: Math.max(0, Math.min(100, recent.memory + trend.memory * minutesAhead)),
            estimatedInstancesNeeded: Math.ceil((recent.cpu + trend.cpu * minutesAhead) / 70)
        };
    }
    
    calculateTrend() {
        if (this.metrics.cpu.length < 5) return { cpu: 0, memory: 0 };
        
        const recent = this.metrics.cpu.slice(-5);
        const trend = (recent[recent.length - 1] - recent[0]) / recent.length;
        
        return { cpu: trend, memory: trend };
    }
    
    getMetrics() {
        return {
            currentInstances: this.currentInstances,
            targetInstances: this.targetInstances,
            scalingInProgress: this.scalingInProgress,
            scalingHistory: this.scalingHistory.slice(-10),
            recentMetrics: this.getRecentAverages(),
            prediction: this.predictFutureLoad(),
            modelTrained: this.predictionModel.trained
        };
    }
    
    async shutdown() {
        if (!this.isRunning) return;
        
        logger.info('Shutting down Auto-Scaling Manager');
        
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }
        
        this.isRunning = false;
        this.emit('shutdown');
    }
}

module.exports = { AutoScalingManager };