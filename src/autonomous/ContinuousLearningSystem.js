/**
 * Continuous Learning System
 * Real-time adaptation and knowledge evolution
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class ContinuousLearningSystem extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            learningWindow: 24 * 60 * 60 * 1000, // 24 hours
            knowledgeRetention: 30 * 24 * 60 * 60 * 1000, // 30 days
            adaptationRate: 0.1,
            confidenceThreshold: 0.8,
            batchSize: 1000,
            updateInterval: 5 * 60 * 1000, // 5 minutes
            ...config
        };
        
        this.knowledgeBase = new Map();
        this.learningQueue = [];
        this.adaptationHistory = [];
        this.models = {
            performance: new PerformanceModel(),
            usage: new UsagePatternModel(),
            error: new ErrorPredictionModel(),
            resource: new ResourceOptimizationModel()
        };
        
        this.isLearning = false;
        this.updateTimer = null;
        this.stats = {
            knowledgeItems: 0,
            predictionsCorrect: 0,
            adaptationsMade: 0,
            modelAccuracy: {}
        };
    }

    async initialize() {
        logger.info('Initializing Continuous Learning System');
        
        // Initialize all models
        for (const [name, model] of Object.entries(this.models)) {
            await model.initialize();
            this.stats.modelAccuracy[name] = model.getAccuracy();
        }
        
        this.isLearning = true;
        this.startContinuousLearning();
        
        this.emit('initialized');
        logger.info('Continuous Learning System initialized');
        return true;
    }

    async learn(data, context = {}) {
        const learningItem = {
            id: uuidv4(),
            data,
            context,
            timestamp: Date.now(),
            type: context.type || 'general',
            importance: context.importance || 0.5,
            processed: false
        };
        
        this.learningQueue.push(learningItem);
        this.emit('learningItemAdded', learningItem);
        
        // Process immediately if high importance
        if (learningItem.importance > 0.8) {
            await this.processLearningItem(learningItem);
        }
        
        return learningItem.id;
    }

    async processLearningItem(item) {
        try {
            logger.debug('Processing learning item', { id: item.id, type: item.type });
            
            // Update relevant models
            await this.updateModels(item);
            
            // Extract knowledge
            const knowledge = await this.extractKnowledge(item);
            if (knowledge) {
                await this.storeKnowledge(knowledge);
            }
            
            // Generate predictions
            const predictions = await this.generatePredictions(item);
            if (predictions.length > 0) {
                await this.storePredictions(predictions);
            }
            
            // Check for adaptation opportunities
            const adaptations = await this.identifyAdaptations(item);
            for (const adaptation of adaptations) {
                await this.executeAdaptation(adaptation);
            }
            
            item.processed = true;
            this.emit('learningItemProcessed', item);
            
        } catch (error) {
            logger.error('Failed to process learning item', { 
                itemId: item.id, 
                error: error.message 
            });
            throw error;
        }
    }

    async updateModels(item) {
        const modelUpdates = [];
        
        // Update performance model
        if (item.type === 'performance' || item.data.latency !== undefined) {
            modelUpdates.push(this.models.performance.update(item));
        }
        
        // Update usage pattern model
        if (item.type === 'usage' || item.data.query !== undefined) {
            modelUpdates.push(this.models.usage.update(item));
        }
        
        // Update error prediction model
        if (item.type === 'error' || item.data.error !== undefined) {
            modelUpdates.push(this.models.error.update(item));
        }
        
        // Update resource optimization model
        if (item.type === 'resource' || item.data.resourceUsage !== undefined) {
            modelUpdates.push(this.models.resource.update(item));
        }
        
        await Promise.all(modelUpdates);
    }

    async extractKnowledge(item) {
        const knowledge = {
            id: uuidv4(),
            source: item.id,
            type: item.type,
            patterns: [],
            insights: [],
            confidence: 0,
            timestamp: Date.now()
        };
        
        // Pattern extraction based on item type
        switch (item.type) {
            case 'performance':
                knowledge.patterns = this.extractPerformancePatterns(item.data);
                break;
            case 'usage':
                knowledge.patterns = this.extractUsagePatterns(item.data);
                break;
            case 'error':
                knowledge.patterns = this.extractErrorPatterns(item.data);
                break;
            case 'resource':
                knowledge.patterns = this.extractResourcePatterns(item.data);
                break;
        }
        
        // Generate insights
        knowledge.insights = await this.generateInsights(knowledge.patterns, item.context);
        
        // Calculate confidence
        knowledge.confidence = this.calculateConfidence(knowledge.patterns, knowledge.insights);
        
        return knowledge.confidence > this.config.confidenceThreshold ? knowledge : null;
    }

    extractPerformancePatterns(data) {
        const patterns = [];
        
        if (data.latency !== undefined) {
            patterns.push({
                type: 'latency_pattern',
                value: data.latency,
                context: data.queryType || 'unknown',
                timestamp: Date.now()
            });
        }
        
        if (data.throughput !== undefined) {
            patterns.push({
                type: 'throughput_pattern',
                value: data.throughput,
                context: data.load || 'normal',
                timestamp: Date.now()
            });
        }
        
        return patterns;
    }

    extractUsagePatterns(data) {
        const patterns = [];
        
        if (data.query) {
            patterns.push({
                type: 'query_pattern',
                value: this.hashQuery(data.query),
                frequency: data.frequency || 1,
                timestamp: Date.now()
            });
        }
        
        if (data.userBehavior) {
            patterns.push({
                type: 'behavior_pattern',
                value: data.userBehavior,
                context: data.sessionContext,
                timestamp: Date.now()
            });
        }
        
        return patterns;
    }

    extractErrorPatterns(data) {
        const patterns = [];
        
        if (data.error) {
            patterns.push({
                type: 'error_pattern',
                value: data.error.type || 'unknown',
                context: {
                    message: data.error.message,
                    stack: data.error.stack ? data.error.stack.split('\n')[0] : null,
                    frequency: data.frequency || 1
                },
                timestamp: Date.now()
            });
        }
        
        return patterns;
    }

    extractResourcePatterns(data) {
        const patterns = [];
        
        if (data.resourceUsage) {
            for (const [resource, usage] of Object.entries(data.resourceUsage)) {
                patterns.push({
                    type: 'resource_pattern',
                    value: usage,
                    context: { resource, load: data.currentLoad },
                    timestamp: Date.now()
                });
            }
        }
        
        return patterns;
    }

    async generateInsights(patterns, context) {
        const insights = [];
        
        // Correlation analysis
        const correlations = this.analyzeCorrelations(patterns);
        insights.push(...correlations);
        
        // Trend analysis
        const trends = this.analyzeTrends(patterns);
        insights.push(...trends);
        
        // Anomaly detection
        const anomalies = this.detectAnomalies(patterns);
        insights.push(...anomalies);
        
        // Optimization opportunities
        const optimizations = this.identifyOptimizations(patterns);
        insights.push(...optimizations);
        
        return insights;
    }

    analyzeCorrelations(patterns) {
        const correlations = [];
        
        // Find patterns that occur together
        const patternGroups = this.groupPatternsByTime(patterns, 1000); // 1 second window
        
        for (const group of patternGroups) {
            if (group.length > 1) {
                correlations.push({
                    type: 'correlation',
                    patterns: group.map(p => p.type),
                    strength: this.calculateCorrelationStrength(group),
                    insight: this.describeCorrelation(group)
                });
            }
        }
        
        return correlations;
    }

    analyzeTrends(patterns) {
        const trends = [];
        const patternTypes = [...new Set(patterns.map(p => p.type))];
        
        for (const type of patternTypes) {
            const typePatterns = patterns.filter(p => p.type === type);
            if (typePatterns.length >= 3) {
                const trend = this.calculateTrend(typePatterns);
                if (Math.abs(trend.slope) > 0.1) {
                    trends.push({
                        type: 'trend',
                        patternType: type,
                        direction: trend.slope > 0 ? 'increasing' : 'decreasing',
                        strength: Math.abs(trend.slope),
                        insight: this.describeTrend(type, trend)
                    });
                }
            }
        }
        
        return trends;
    }

    detectAnomalies(patterns) {
        const anomalies = [];
        const patternTypes = [...new Set(patterns.map(p => p.type))];
        
        for (const type of patternTypes) {
            const typePatterns = patterns.filter(p => p.type === type);
            const values = typePatterns.map(p => p.value);
            
            if (values.length >= 5) {
                const outliers = this.findOutliers(values);
                if (outliers.length > 0) {
                    anomalies.push({
                        type: 'anomaly',
                        patternType: type,
                        outliers: outliers,
                        severity: this.calculateAnomalySeverity(outliers, values),
                        insight: this.describeAnomaly(type, outliers)
                    });
                }
            }
        }
        
        return anomalies;
    }

    identifyOptimizations(patterns) {
        const optimizations = [];
        
        // Performance optimization opportunities
        const performancePatterns = patterns.filter(p => p.type === 'latency_pattern');
        if (performancePatterns.some(p => p.value > 100)) { // > 100ms latency
            optimizations.push({
                type: 'optimization',
                area: 'performance',
                priority: 'high',
                suggestion: 'Consider implementing caching or query optimization',
                expectedGain: 'Reduce latency by 20-40%'
            });
        }
        
        // Resource optimization opportunities
        const resourcePatterns = patterns.filter(p => p.type === 'resource_pattern');
        const highCPU = resourcePatterns.filter(p => 
            p.context?.resource === 'cpu' && p.value > 0.8
        );
        if (highCPU.length > 0) {
            optimizations.push({
                type: 'optimization',
                area: 'resource',
                priority: 'medium',
                suggestion: 'Implement load balancing or horizontal scaling',
                expectedGain: 'Reduce CPU usage by 15-25%'
            });
        }
        
        return optimizations;
    }

    async storeKnowledge(knowledge) {
        this.knowledgeBase.set(knowledge.id, knowledge);
        this.stats.knowledgeItems++;
        
        // Cleanup old knowledge
        await this.cleanupOldKnowledge();
        
        this.emit('knowledgeStored', knowledge);
    }

    async storePredictions(predictions) {
        for (const prediction of predictions) {
            prediction.id = uuidv4();
            prediction.timestamp = Date.now();
            
            // Store prediction for later validation
            this.knowledgeBase.set(`prediction_${prediction.id}`, prediction);
        }
        
        this.emit('predictionsGenerated', predictions);
    }

    async generatePredictions(item) {
        const predictions = [];
        
        // Generate predictions using each model
        for (const [modelName, model] of Object.entries(this.models)) {
            try {
                const prediction = await model.predict(item);
                if (prediction && prediction.confidence > this.config.confidenceThreshold) {
                    predictions.push({
                        model: modelName,
                        prediction: prediction.value,
                        confidence: prediction.confidence,
                        horizon: prediction.horizon || 3600000, // 1 hour default
                        type: prediction.type
                    });
                }
            } catch (error) {
                logger.error(`Prediction failed for model ${modelName}`, { error: error.message });
            }
        }
        
        return predictions;
    }

    async identifyAdaptations(item) {
        const adaptations = [];
        
        // Check if learning suggests system adaptations
        const knowledge = Array.from(this.knowledgeBase.values())
            .filter(k => k.timestamp > Date.now() - this.config.learningWindow);
        
        // Performance adaptations
        const performanceInsights = knowledge.flatMap(k => 
            (k.insights || []).filter(i => i.type === 'optimization' && i.area === 'performance')
        );
        
        if (performanceInsights.length > 2) {
            adaptations.push({
                type: 'performance_adaptation',
                action: 'optimize_query_execution',
                priority: 'high',
                data: performanceInsights
            });
        }
        
        // Resource adaptations
        const resourceInsights = knowledge.flatMap(k =>
            (k.insights || []).filter(i => i.type === 'optimization' && i.area === 'resource')
        );
        
        if (resourceInsights.length > 1) {
            adaptations.push({
                type: 'resource_adaptation',
                action: 'rebalance_resources',
                priority: 'medium',
                data: resourceInsights
            });
        }
        
        return adaptations;
    }

    async executeAdaptation(adaptation) {
        logger.info('Executing adaptation', { 
            type: adaptation.type, 
            action: adaptation.action,
            priority: adaptation.priority
        });
        
        try {
            let result;
            
            switch (adaptation.action) {
                case 'optimize_query_execution':
                    result = await this.optimizeQueryExecution(adaptation.data);
                    break;
                case 'rebalance_resources':
                    result = await this.rebalanceResources(adaptation.data);
                    break;
                default:
                    logger.warn(`Unknown adaptation action: ${adaptation.action}`);
                    return;
            }
            
            const adaptationRecord = {
                id: uuidv4(),
                type: adaptation.type,
                action: adaptation.action,
                result,
                timestamp: Date.now(),
                success: result.success
            };
            
            this.adaptationHistory.push(adaptationRecord);
            this.stats.adaptationsMade++;
            
            this.emit('adaptationExecuted', adaptationRecord);
            
        } catch (error) {
            logger.error('Adaptation execution failed', { 
                type: adaptation.type,
                error: error.message
            });
        }
    }

    async optimizeQueryExecution(insights) {
        logger.info('Optimizing query execution based on learning');
        
        // Simulate query optimization
        return {
            success: true,
            improvement: 25, // 25% improvement
            details: {
                indexesCreated: 3,
                queriesOptimized: 12,
                cacheHitRateImproved: 0.15
            }
        };
    }

    async rebalanceResources(insights) {
        logger.info('Rebalancing resources based on learning');
        
        // Simulate resource rebalancing
        return {
            success: true,
            improvement: 18, // 18% improvement
            details: {
                cpuUtilizationReduced: 0.2,
                memoryRebalanced: true,
                loadDistributed: true
            }
        };
    }

    startContinuousLearning() {
        this.updateTimer = setInterval(() => {
            this.processBatch();
        }, this.config.updateInterval);
        
        logger.info('Continuous learning started');
    }

    async processBatch() {
        if (this.learningQueue.length === 0) return;
        
        const batchSize = Math.min(this.config.batchSize, this.learningQueue.length);
        const batch = this.learningQueue.splice(0, batchSize);
        
        logger.debug('Processing learning batch', { size: batch.length });
        
        const processingPromises = batch.map(item => this.processLearningItem(item));
        
        try {
            await Promise.all(processingPromises);
            logger.debug('Batch processing completed successfully');
        } catch (error) {
            logger.error('Batch processing failed', { error: error.message });
        }
    }

    async validatePredictions() {
        const now = Date.now();
        const predictions = Array.from(this.knowledgeBase.entries())
            .filter(([key, value]) => key.startsWith('prediction_') && 
                    value.timestamp + value.horizon < now)
            .map(([key, value]) => ({ key, ...value }));
        
        for (const prediction of predictions) {
            // Validate prediction against actual outcome
            const actual = await this.getActualOutcome(prediction);
            if (actual !== null) {
                const correct = this.isPredictionCorrect(prediction, actual);
                if (correct) {
                    this.stats.predictionsCorrect++;
                }
                
                // Update model accuracy
                const model = this.models[prediction.model];
                if (model) {
                    model.updateAccuracy(correct);
                    this.stats.modelAccuracy[prediction.model] = model.getAccuracy();
                }
            }
            
            // Remove validated prediction
            this.knowledgeBase.delete(prediction.key);
        }
    }

    async getActualOutcome(prediction) {
        // This would integrate with actual system metrics
        // For now, simulate based on prediction type
        switch (prediction.type) {
            case 'latency':
                return Math.random() * 200; // Random latency value
            case 'throughput':
                return Math.random() * 2000; // Random throughput value
            case 'error_rate':
                return Math.random() * 0.1; // Random error rate
            default:
                return null;
        }
    }

    isPredictionCorrect(prediction, actual) {
        const tolerance = 0.2; // 20% tolerance
        const error = Math.abs(prediction.prediction - actual) / prediction.prediction;
        return error <= tolerance;
    }

    // Utility methods
    hashQuery(query) {
        return require('crypto').createHash('sha256').update(query).digest('hex').substring(0, 16);
    }

    groupPatternsByTime(patterns, windowMs) {
        const groups = [];
        const sortedPatterns = [...patterns].sort((a, b) => a.timestamp - b.timestamp);
        
        let currentGroup = [];
        let currentWindowStart = 0;
        
        for (const pattern of sortedPatterns) {
            if (currentGroup.length === 0) {
                currentWindowStart = pattern.timestamp;
                currentGroup = [pattern];
            } else if (pattern.timestamp - currentWindowStart <= windowMs) {
                currentGroup.push(pattern);
            } else {
                if (currentGroup.length > 0) {
                    groups.push(currentGroup);
                }
                currentGroup = [pattern];
                currentWindowStart = pattern.timestamp;
            }
        }
        
        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }
        
        return groups;
    }

    calculateCorrelationStrength(patterns) {
        // Simplified correlation calculation
        return Math.min(1.0, patterns.length / 5);
    }

    describeCorrelation(patterns) {
        const types = patterns.map(p => p.type).join(', ');
        return `Patterns ${types} occur together frequently`;
    }

    calculateTrend(patterns) {
        const n = patterns.length;
        const xSum = patterns.reduce((sum, p, i) => sum + i, 0);
        const ySum = patterns.reduce((sum, p) => sum + p.value, 0);
        const xySum = patterns.reduce((sum, p, i) => sum + i * p.value, 0);
        const x2Sum = patterns.reduce((sum, p, i) => sum + i * i, 0);
        
        const slope = (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
        const intercept = (ySum - slope * xSum) / n;
        
        return { slope, intercept };
    }

    describeTrend(type, trend) {
        const direction = trend.slope > 0 ? 'increasing' : 'decreasing';
        return `${type} is ${direction} over time`;
    }

    findOutliers(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        
        return values.filter(v => v < lowerBound || v > upperBound);
    }

    calculateAnomalySeverity(outliers, allValues) {
        const maxValue = Math.max(...allValues);
        const maxOutlier = Math.max(...outliers.map(Math.abs));
        return Math.min(1.0, maxOutlier / maxValue);
    }

    describeAnomaly(type, outliers) {
        return `${type} shows anomalous values: ${outliers.join(', ')}`;
    }

    calculateConfidence(patterns, insights) {
        const patternConfidence = patterns.length > 0 ? Math.min(1.0, patterns.length / 10) : 0;
        const insightConfidence = insights.length > 0 ? Math.min(1.0, insights.length / 5) : 0;
        return (patternConfidence + insightConfidence) / 2;
    }

    async cleanupOldKnowledge() {
        const cutoff = Date.now() - this.config.knowledgeRetention;
        const toDelete = [];
        
        for (const [id, knowledge] of this.knowledgeBase) {
            if (knowledge.timestamp < cutoff) {
                toDelete.push(id);
            }
        }
        
        for (const id of toDelete) {
            this.knowledgeBase.delete(id);
        }
        
        if (toDelete.length > 0) {
            logger.debug('Cleaned up old knowledge', { count: toDelete.length });
        }
    }

    getMetrics() {
        return {
            ...this.stats,
            knowledgeBaseSize: this.knowledgeBase.size,
            learningQueueSize: this.learningQueue.length,
            recentAdaptations: this.adaptationHistory.slice(-10)
        };
    }

    async shutdown() {
        logger.info('Shutting down Continuous Learning System');
        
        this.isLearning = false;
        
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        
        // Process remaining items in queue
        if (this.learningQueue.length > 0) {
            logger.info('Processing remaining learning items', { count: this.learningQueue.length });
            await this.processBatch();
        }
        
        // Shutdown models
        for (const model of Object.values(this.models)) {
            if (model.shutdown) {
                await model.shutdown();
            }
        }
        
        this.emit('shutdown');
        logger.info('Continuous Learning System shutdown complete');
    }
}

// Simple model implementations
class PerformanceModel {
    constructor() {
        this.accuracy = 0.85;
        this.data = [];
    }

    async initialize() {
        logger.debug('Performance model initialized');
    }

    async update(item) {
        this.data.push(item);
        // Keep only recent data
        if (this.data.length > 1000) {
            this.data = this.data.slice(-1000);
        }
    }

    async predict(item) {
        if (item.data.latency !== undefined) {
            return {
                value: item.data.latency * 1.1, // Predict 10% increase
                confidence: this.accuracy,
                type: 'latency',
                horizon: 3600000
            };
        }
        return null;
    }

    updateAccuracy(correct) {
        this.accuracy = this.accuracy * 0.9 + (correct ? 0.1 : 0);
    }

    getAccuracy() {
        return this.accuracy;
    }
}

class UsagePatternModel {
    constructor() {
        this.accuracy = 0.80;
        this.patterns = new Map();
    }

    async initialize() {
        logger.debug('Usage pattern model initialized');
    }

    async update(item) {
        if (item.data.query) {
            const hash = require('crypto').createHash('sha256').update(item.data.query).digest('hex').substring(0, 16);
            this.patterns.set(hash, (this.patterns.get(hash) || 0) + 1);
        }
    }

    async predict(item) {
        return {
            value: 'high_usage_expected',
            confidence: this.accuracy,
            type: 'usage',
            horizon: 7200000
        };
    }

    updateAccuracy(correct) {
        this.accuracy = this.accuracy * 0.9 + (correct ? 0.1 : 0);
    }

    getAccuracy() {
        return this.accuracy;
    }
}

class ErrorPredictionModel {
    constructor() {
        this.accuracy = 0.75;
        this.errorRates = [];
    }

    async initialize() {
        logger.debug('Error prediction model initialized');
    }

    async update(item) {
        if (item.data.error) {
            this.errorRates.push({
                type: item.data.error.type,
                timestamp: Date.now()
            });
        }
    }

    async predict(item) {
        return {
            value: 0.02, // 2% error rate
            confidence: this.accuracy,
            type: 'error_rate',
            horizon: 1800000
        };
    }

    updateAccuracy(correct) {
        this.accuracy = this.accuracy * 0.9 + (correct ? 0.1 : 0);
    }

    getAccuracy() {
        return this.accuracy;
    }
}

class ResourceOptimizationModel {
    constructor() {
        this.accuracy = 0.82;
        this.resourceHistory = [];
    }

    async initialize() {
        logger.debug('Resource optimization model initialized');
    }

    async update(item) {
        if (item.data.resourceUsage) {
            this.resourceHistory.push({
                usage: item.data.resourceUsage,
                timestamp: Date.now()
            });
        }
    }

    async predict(item) {
        return {
            value: 85, // 85% resource usage
            confidence: this.accuracy,
            type: 'resource_usage',
            horizon: 1800000
        };
    }

    updateAccuracy(correct) {
        this.accuracy = this.accuracy * 0.9 + (correct ? 0.1 : 0);
    }

    getAccuracy() {
        return this.accuracy;
    }
}

module.exports = { 
    ContinuousLearningSystem,
    PerformanceModel,
    UsagePatternModel,
    ErrorPredictionModel,
    ResourceOptimizationModel
};