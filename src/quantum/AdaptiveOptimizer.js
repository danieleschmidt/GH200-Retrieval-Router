/**
 * Adaptive Optimizer
 * Self-improving system that learns from execution patterns
 */

const EventEmitter = require('eventemitter3');
const { logger } = require('../utils/logger');

class AdaptiveOptimizer extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            learningRate: options.learningRate || 0.01,
            adaptationInterval: options.adaptationInterval || 5000,
            memoryWindow: options.memoryWindow || 1000,
            optimizationThreshold: options.optimizationThreshold || 0.1,
            ...options
        };
        
        this.executionHistory = [];
        this.performanceMetrics = new Map();
        this.adaptationRules = new Map();
        this.currentBaseline = null;
        this.isRunning = false;
        
        this.initializeAdaptationRules();
    }

    async initialize() {
        if (this.isRunning) return;
        
        logger.info('Initializing Adaptive Optimizer', {
            learningRate: this.config.learningRate,
            adaptationInterval: this.config.adaptationInterval
        });
        
        this.adaptationTimer = setInterval(
            () => this.performAdaptation(),
            this.config.adaptationInterval
        );
        
        this.currentBaseline = this.createPerformanceBaseline();
        this.isRunning = true;
        this.emit('initialized');
    }

    initializeAdaptationRules() {
        this.adaptationRules.set('throughput', {
            metric: 'tasksPerSecond',
            threshold: 0.15,
            adaptations: [
                { parameter: 'maxSuperpositionStates', factor: 1.2 },
                { parameter: 'coherenceTime', factor: 0.9 },
                { parameter: 'measurementInterval', factor: 0.8 }
            ]
        });

        this.adaptationRules.set('latency', {
            metric: 'averageLatency',
            threshold: 0.1, // Positive threshold - adapt when latency increases
            adaptations: [
                { parameter: 'entanglementThreshold', factor: 1.1 },
                { parameter: 'measurementInterval', factor: 1.2 },
                { parameter: 'coherenceTime', factor: 1.1 }
            ]
        });

        this.adaptationRules.set('accuracy', {
            metric: 'predictionAccuracy',
            threshold: 0.05,
            adaptations: [
                { parameter: 'maxSuperpositionStates', factor: 1.1 },
                { parameter: 'learningRate', factor: 1.05 }
            ]
        });

        this.adaptationRules.set('resource', {
            metric: 'resourceEfficiency',
            threshold: 0.1,
            adaptations: [
                { parameter: 'memoryPoolSize', factor: 0.9 },
                { parameter: 'batchSize', factor: 1.1 }
            ]
        });
    }

    recordExecution(executionData) {
        try {
            // Input validation
            if (!executionData || typeof executionData !== 'object') {
                throw new Error('Execution data must be a valid object');
            }
            
            if (!executionData.taskId) {
                throw new Error('Task ID is required');
            }
            
            if (executionData.duration && (typeof executionData.duration !== 'number' || executionData.duration < 0)) {
                throw new Error('Duration must be a positive number');
            }
            
            // Check for duplicate executions to prevent double counting
            const timestamp = executionData.timestamp || Date.now();
            const isDuplicate = this.executionHistory.some(exec => 
                exec.taskId === executionData.taskId && 
                Math.abs(exec.timestamp - timestamp) < 100 // Allow 100ms tolerance
            );
            
            if (isDuplicate) {
                logger.debug('Duplicate execution record ignored', { 
                    taskId: executionData.taskId,
                    timestamp
                });
                return;
            }
            
            const record = {
                timestamp: timestamp,
                taskId: executionData.taskId,
                duration: Math.max(0, executionData.duration || 0),
                resourceUsage: executionData.resourceUsage || {},
                success: Boolean(executionData.success),
                error: executionData.error,
                quantumMetrics: executionData.quantumMetrics || {},
                optimizationLevel: Math.max(1, executionData.optimizationLevel || 1)
            };
            
            this.executionHistory.push(record);
            
            // Maintain memory window
            if (this.executionHistory.length > this.config.memoryWindow) {
                this.executionHistory.shift();
            }
            
            this.updatePerformanceMetrics(record);
            this.emit('executionRecorded', record);
            
        } catch (error) {
            logger.error('Failed to record execution', { 
                error: error.message,
                taskId: executionData?.taskId || 'unknown'
            });
            // Don't throw - continue operation but log the issue
        }
    }

    updatePerformanceMetrics(record) {
        const windowStart = Date.now() - (this.config.adaptationInterval * 2);
        const recentExecutions = this.executionHistory.filter(
            exec => exec.timestamp >= windowStart
        );
        
        if (recentExecutions.length === 0) return;
        
        const metrics = {
            tasksPerSecond: this.calculateThroughput(recentExecutions),
            averageLatency: this.calculateAverageLatency(recentExecutions),
            successRate: this.calculateSuccessRate(recentExecutions),
            resourceEfficiency: this.calculateResourceEfficiency(recentExecutions),
            predictionAccuracy: this.calculatePredictionAccuracy(recentExecutions),
            adaptiveScore: this.calculateAdaptiveScore(recentExecutions)
        };
        
        // Use record timestamp to ensure distinct metrics entries
        const metricsTimestamp = record.timestamp || Date.now();
        this.performanceMetrics.set(metricsTimestamp, metrics);
        
        const maxMetrics = 100;
        if (this.performanceMetrics.size > maxMetrics) {
            const oldestKey = Math.min(...this.performanceMetrics.keys());
            this.performanceMetrics.delete(oldestKey);
        }
    }

    calculateThroughput(executions) {
        if (executions.length < 2) return 0;
        
        const timeSpan = executions[executions.length - 1].timestamp - executions[0].timestamp;
        return (executions.length / timeSpan) * 1000;
    }

    calculateAverageLatency(executions) {
        if (executions.length === 0) return 0;
        
        const totalLatency = executions.reduce((sum, exec) => sum + exec.duration, 0);
        return totalLatency / executions.length;
    }

    calculateSuccessRate(executions) {
        if (executions.length === 0) return 0;
        
        const successfulExecutions = executions.filter(exec => exec.success).length;
        return successfulExecutions / executions.length;
    }

    calculateResourceEfficiency(executions) {
        if (executions.length === 0) return 0;
        
        const totalEfficiency = executions.reduce((sum, exec) => {
            const usage = exec.resourceUsage;
            const utilization = (usage.cpu || 0) / 100 + 
                              (usage.memory || 0) / 1000 + 
                              (usage.gpu || 0) / 100;
            
            return sum + Math.min(1.0, utilization / 3);
        }, 0);
        
        return totalEfficiency / executions.length;
    }

    calculatePredictionAccuracy(executions) {
        const accuracies = executions
            .filter(exec => exec.quantumMetrics.predictedDuration)
            .map(exec => {
                const predicted = exec.quantumMetrics.predictedDuration;
                const actual = exec.duration;
                return 1 - Math.abs(predicted - actual) / Math.max(predicted, actual);
            });
        
        if (accuracies.length === 0) return 0;
        
        return accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
    }

    calculateAdaptiveScore(executions) {
        const recentScore = executions.slice(-10).reduce((sum, exec) => {
            return sum + (exec.optimizationLevel * exec.success ? 1 : 0.5);
        }, 0) / Math.min(10, executions.length);
        
        return Math.min(1.0, recentScore);
    }

    async performAdaptation() {
        if (this.performanceMetrics.size < 2) return [];
        
        const currentMetrics = this.getCurrentMetrics();
        const previousMetrics = this.getPreviousMetrics();
        
        if (!currentMetrics || !previousMetrics) return [];
        
        const improvementNeeded = this.analyzePerformanceTrends(
            currentMetrics, 
            previousMetrics
        );
        
        if (Object.keys(improvementNeeded).length === 0) return [];
        
        const adaptations = await this.generateAdaptations(improvementNeeded);
        
        if (adaptations.length > 0) {
            await this.applyAdaptations(adaptations);
            this.emit('adaptationApplied', adaptations);
        }
        
        return adaptations;
    }

    getCurrentMetrics() {
        const timestamps = Array.from(this.performanceMetrics.keys()).sort();
        const latest = timestamps[timestamps.length - 1];
        return this.performanceMetrics.get(latest);
    }

    getPreviousMetrics() {
        const timestamps = Array.from(this.performanceMetrics.keys()).sort();
        if (timestamps.length < 2) return null;
        
        const previous = timestamps[timestamps.length - 2];
        return this.performanceMetrics.get(previous);
    }

    analyzePerformanceTrends(current, previous) {
        const trends = {};
        
        for (const [metric, value] of Object.entries(current)) {
            const previousValue = previous[metric];
            if (previousValue === undefined) continue;
            
            const change = (value - previousValue) / previousValue;
            const rule = this.adaptationRules.get(this.getMetricCategory(metric));
            
            if (rule && Math.abs(change) > Math.abs(rule.threshold)) {
                trends[metric] = {
                    change: change,
                    needsImprovement: change < rule.threshold,
                    rule: rule
                };
            }
        }
        
        return trends;
    }

    getMetricCategory(metric) {
        const categories = {
            'tasksPerSecond': 'throughput',
            'averageLatency': 'latency',
            'predictionAccuracy': 'accuracy',
            'resourceEfficiency': 'resource'
        };
        
        return categories[metric] || 'throughput';
    }

    async generateAdaptations(trends) {
        const adaptations = [];
        const appliedParameters = new Set();
        
        for (const [metric, trend] of Object.entries(trends)) {
            if (!trend.needsImprovement) continue;
            
            for (const adaptation of trend.rule.adaptations) {
                if (appliedParameters.has(adaptation.parameter)) continue;
                
                const factor = trend.change < 0 ? adaptation.factor : 1 / adaptation.factor;
                
                adaptations.push({
                    parameter: adaptation.parameter,
                    factor: factor,
                    reason: `Improve ${metric}`,
                    confidence: this.calculateAdaptationConfidence(trend),
                    priority: Math.abs(trend.change)
                });
                
                appliedParameters.add(adaptation.parameter);
            }
        }
        
        return adaptations.sort((a, b) => b.priority - a.priority).slice(0, 3);
    }

    calculateAdaptationConfidence(trend) {
        const baseConfidence = Math.min(0.9, Math.abs(trend.change) * 2);
        const historySize = this.executionHistory.length;
        const historyFactor = Math.min(1.0, historySize / 100);
        
        return baseConfidence * historyFactor;
    }

    async applyAdaptations(adaptations) {
        const changes = [];
        
        for (const adaptation of adaptations) {
            const change = await this.applyParameterChange(adaptation);
            if (change) {
                changes.push(change);
            }
        }
        
        logger.info('Applied adaptive optimizations', {
            adaptations: changes.length,
            changes: changes.map(c => ({
                parameter: c.parameter,
                from: c.oldValue,
                to: c.newValue
            }))
        });
        
        return changes;
    }

    async applyParameterChange(adaptation) {
        const currentValue = await this.getCurrentParameterValue(adaptation.parameter);
        if (currentValue === null) return null;
        
        const newValue = this.calculateNewParameterValue(
            currentValue, 
            adaptation.factor,
            adaptation.parameter
        );
        
        const change = {
            parameter: adaptation.parameter,
            oldValue: currentValue,
            newValue: newValue,
            factor: adaptation.factor,
            confidence: adaptation.confidence,
            timestamp: Date.now()
        };
        
        await this.setParameterValue(adaptation.parameter, newValue);
        
        return change;
    }

    async getCurrentParameterValue(parameter) {
        const parameterMap = {
            'maxSuperpositionStates': () => this.config.maxSuperpositionStates || 32,
            'coherenceTime': () => this.config.coherenceTime || 10000,
            'measurementInterval': () => this.config.measurementInterval || 1000,
            'entanglementThreshold': () => this.config.entanglementThreshold || 0.8,
            'learningRate': () => this.config.learningRate || 0.01,
            'memoryPoolSize': () => this.config.memoryPoolSize || 1000,
            'batchSize': () => this.config.batchSize || 32
        };
        
        const getter = parameterMap[parameter];
        const value = getter ? getter() : null;
        
        // Ensure numeric values are returned as numbers, not undefined/null
        return typeof value === 'number' ? value : null;
    }

    calculateNewParameterValue(currentValue, factor, parameter) {
        const constraints = {
            'maxSuperpositionStates': { min: 4, max: 128 },
            'coherenceTime': { min: 1000, max: 60000 },
            'measurementInterval': { min: 100, max: 10000 },
            'entanglementThreshold': { min: 0.1, max: 0.99 },
            'learningRate': { min: 0.001, max: 0.1 },
            'memoryPoolSize': { min: 100, max: 10000 },
            'batchSize': { min: 1, max: 512 }
        };
        
        const newValue = currentValue * factor;
        const constraint = constraints[parameter];
        
        if (constraint) {
            return Math.max(constraint.min, Math.min(constraint.max, newValue));
        }
        
        return newValue;
    }

    async setParameterValue(parameter, value) {
        const parameterSetters = {
            'maxSuperpositionStates': (v) => { this.config.maxSuperpositionStates = Math.round(v); },
            'coherenceTime': (v) => { this.config.coherenceTime = Math.round(v); },
            'measurementInterval': (v) => { this.config.measurementInterval = Math.round(v); },
            'entanglementThreshold': (v) => { this.config.entanglementThreshold = v; },
            'learningRate': (v) => { this.config.learningRate = v; },
            'memoryPoolSize': (v) => { this.config.memoryPoolSize = Math.round(v); },
            'batchSize': (v) => { this.config.batchSize = Math.round(v); }
        };
        
        const setter = parameterSetters[parameter];
        if (setter) {
            setter(value);
            this.emit('parameterChanged', { parameter, value });
        }
    }

    createPerformanceBaseline() {
        return {
            tasksPerSecond: 10,
            averageLatency: 1000,
            successRate: 0.95,
            resourceEfficiency: 0.7,
            predictionAccuracy: 0.8,
            adaptiveScore: 0.75,
            timestamp: Date.now()
        };
    }

    predictOptimalConfiguration(taskCharacteristics) {
        const prediction = {
            recommendedConfig: {},
            confidence: 0,
            reasoning: []
        };
        
        const similarExecutions = this.findSimilarExecutions(taskCharacteristics);
        
        if (similarExecutions.length < 3) {
            prediction.confidence = 0.1;
            prediction.reasoning.push('Insufficient historical data');
            return prediction;
        }
        
        const bestExecution = similarExecutions
            .filter(exec => exec.success)
            .sort((a, b) => (b.optimizationLevel / b.duration) - (a.optimizationLevel / a.duration))[0];
        
        if (bestExecution) {
            prediction.recommendedConfig = this.extractConfigFromExecution(bestExecution);
            prediction.confidence = Math.min(0.9, similarExecutions.length / 20);
            prediction.reasoning.push(`Based on ${similarExecutions.length} similar executions`);
        }
        
        return prediction;
    }

    findSimilarExecutions(characteristics) {
        return this.executionHistory.filter(exec => {
            const similarity = this.calculateTaskSimilarity(exec, characteristics);
            return similarity > 0.7;
        });
    }

    calculateTaskSimilarity(execution, characteristics) {
        let similarity = 0;
        let factors = 0;
        
        if (execution.resourceUsage && characteristics.estimatedResources) {
            const resourceSim = this.calculateResourceSimilarity(
                execution.resourceUsage,
                characteristics.estimatedResources
            );
            similarity += resourceSim;
            factors++;
        }
        
        if (execution.quantumMetrics && characteristics.quantumHints) {
            const quantumSim = this.calculateQuantumSimilarity(
                execution.quantumMetrics,
                characteristics.quantumHints
            );
            similarity += quantumSim;
            factors++;
        }
        
        const durationSim = 1 - Math.abs(
            (execution.duration - (characteristics.estimatedDuration || 1000)) / 
            Math.max(execution.duration, characteristics.estimatedDuration || 1000)
        );
        similarity += Math.max(0, durationSim);
        factors++;
        
        return factors > 0 ? similarity / factors : 0;
    }

    calculateResourceSimilarity(resources1, resources2) {
        const metrics = ['cpu', 'memory', 'gpu', 'network'];
        let similarity = 0;
        
        for (const metric of metrics) {
            const r1 = resources1[metric] || 0;
            const r2 = resources2[metric] || 0;
            
            if (r1 === 0 && r2 === 0) {
                similarity += 1;
            } else if (r1 > 0 && r2 > 0) {
                similarity += Math.min(r1, r2) / Math.max(r1, r2);
            }
        }
        
        return similarity / metrics.length;
    }

    calculateQuantumSimilarity(quantum1, quantum2) {
        let similarity = 0;
        let factors = 0;
        
        if (quantum1.coherence !== undefined && quantum2.expectedCoherence !== undefined) {
            similarity += 1 - Math.abs(quantum1.coherence - quantum2.expectedCoherence);
            factors++;
        }
        
        if (quantum1.measurements !== undefined && quantum2.expectedMeasurements !== undefined) {
            const measurementSim = 1 - Math.abs(
                quantum1.measurements - quantum2.expectedMeasurements
            ) / Math.max(quantum1.measurements, quantum2.expectedMeasurements, 1);
            similarity += Math.max(0, measurementSim);
            factors++;
        }
        
        return factors > 0 ? similarity / factors : 0.5;
    }

    extractConfigFromExecution(execution) {
        return {
            maxSuperpositionStates: execution.quantumMetrics.superpositionStates || 16,
            coherenceTime: execution.quantumMetrics.coherenceTime || 10000,
            measurementInterval: execution.quantumMetrics.measurementInterval || 1000,
            entanglementThreshold: execution.quantumMetrics.entanglementThreshold || 0.8
        };
    }

    getOptimizationSummary() {
        const recent = this.executionHistory.slice(-50);
        if (recent.length === 0) return null;
        
        const summary = {
            totalExecutions: this.executionHistory.length,
            recentPerformance: this.getCurrentMetrics(),
            baseline: this.currentBaseline,
            improvements: {},
            adaptationHistory: this.getRecentAdaptations(),
            recommendations: []
        };
        
        if (summary.recentPerformance && this.currentBaseline) {
            summary.improvements = {
                throughput: (summary.recentPerformance.tasksPerSecond / this.currentBaseline.tasksPerSecond - 1) * 100,
                latency: (1 - summary.recentPerformance.averageLatency / this.currentBaseline.averageLatency) * 100,
                efficiency: (summary.recentPerformance.resourceEfficiency / this.currentBaseline.resourceEfficiency - 1) * 100
            };
        }
        
        summary.recommendations = this.generateRecommendations(recent);
        
        return summary;
    }

    getRecentAdaptations() {
        const recentAdaptations = [];
        const cutoff = Date.now() - (this.config.adaptationInterval * 5);
        
        for (const execution of this.executionHistory) {
            if (execution.timestamp >= cutoff && execution.adaptations) {
                recentAdaptations.push(...execution.adaptations);
            }
        }
        
        return recentAdaptations.slice(-10);
    }

    generateRecommendations(executions) {
        const recommendations = [];
        
        const avgLatency = this.calculateAverageLatency(executions);
        if (avgLatency > this.currentBaseline.averageLatency * 1.2) {
            recommendations.push({
                type: 'performance',
                message: 'Consider reducing task complexity or increasing resources',
                priority: 'high'
            });
        }
        
        const resourceEff = this.calculateResourceEfficiency(executions);
        if (resourceEff < 0.5) {
            recommendations.push({
                type: 'resource',
                message: 'Resource utilization is low, consider batch processing',
                priority: 'medium'
            });
        }
        
        const successRate = this.calculateSuccessRate(executions);
        if (successRate < 0.9) {
            recommendations.push({
                type: 'reliability',
                message: 'Success rate is below threshold, review error patterns',
                priority: 'high'
            });
        }
        
        return recommendations;
    }

    async shutdown() {
        if (this.adaptationTimer) {
            clearInterval(this.adaptationTimer);
            this.adaptationTimer = null;
        }
        
        this.isRunning = false;
        this.emit('shutdown');
    }
}

module.exports = { AdaptiveOptimizer };