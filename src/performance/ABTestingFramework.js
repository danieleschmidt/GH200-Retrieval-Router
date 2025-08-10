/**
 * A/B Testing Framework for Performance Optimizations
 * Statistical testing framework for GH200 vector search optimizations
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

/**
 * Statistical test utilities
 */
class StatisticalTest {
    /**
     * Perform t-test for comparing means
     */
    static tTest(sample1, sample2) {
        if (sample1.length === 0 || sample2.length === 0) {
            return { significant: false, pValue: 1, error: 'Empty samples' };
        }
        
        const mean1 = sample1.reduce((a, b) => a + b, 0) / sample1.length;
        const mean2 = sample2.reduce((a, b) => a + b, 0) / sample2.length;
        
        const variance1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (sample1.length - 1);
        const variance2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (sample2.length - 1);
        
        const pooledVariance = ((sample1.length - 1) * variance1 + (sample2.length - 1) * variance2) / 
                              (sample1.length + sample2.length - 2);
        
        const standardError = Math.sqrt(pooledVariance * (1/sample1.length + 1/sample2.length));
        const tStatistic = (mean1 - mean2) / standardError;
        const degreesOfFreedom = sample1.length + sample2.length - 2;
        
        // Simplified p-value calculation (for demonstration)
        const pValue = this._tDistributionPValue(Math.abs(tStatistic), degreesOfFreedom);
        
        return {
            mean1,
            mean2,
            meanDifference: mean1 - mean2,
            tStatistic,
            pValue,
            significant: pValue < 0.05,
            confidenceInterval: this._calculateCI(mean1, mean2, standardError)
        };
    }
    
    /**
     * Perform Mann-Whitney U test (non-parametric)
     */
    static mannWhitneyU(sample1, sample2) {
        const combined = [...sample1.map(x => ({ value: x, group: 1 })), 
                          ...sample2.map(x => ({ value: x, group: 2 }))];
        
        combined.sort((a, b) => a.value - b.value);
        
        let rank = 1;
        for (let i = 0; i < combined.length; i++) {
            combined[i].rank = rank++;
        }
        
        const r1 = combined.filter(x => x.group === 1).reduce((sum, x) => sum + x.rank, 0);
        const u1 = r1 - (sample1.length * (sample1.length + 1)) / 2;
        const u2 = sample1.length * sample2.length - u1;
        
        const u = Math.min(u1, u2);
        const meanU = (sample1.length * sample2.length) / 2;
        const stdU = Math.sqrt((sample1.length * sample2.length * (sample1.length + sample2.length + 1)) / 12);
        
        const zScore = (u - meanU) / stdU;
        const pValue = 2 * (1 - this._normalCDF(Math.abs(zScore)));
        
        return {
            u1,
            u2,
            uStatistic: u,
            zScore,
            pValue,
            significant: pValue < 0.05
        };
    }
    
    /**
     * Calculate effect size (Cohen's d)
     */
    static cohensD(sample1, sample2) {
        const mean1 = sample1.reduce((a, b) => a + b, 0) / sample1.length;
        const mean2 = sample2.reduce((a, b) => a + b, 0) / sample2.length;
        
        const variance1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (sample1.length - 1);
        const variance2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (sample2.length - 1);
        
        const pooledStd = Math.sqrt(((sample1.length - 1) * variance1 + (sample2.length - 1) * variance2) / 
                                   (sample1.length + sample2.length - 2));
        
        const effectSize = (mean1 - mean2) / pooledStd;
        
        let magnitude = 'negligible';
        if (Math.abs(effectSize) >= 0.2) magnitude = 'small';
        if (Math.abs(effectSize) >= 0.5) magnitude = 'medium';
        if (Math.abs(effectSize) >= 0.8) magnitude = 'large';
        
        return {
            effectSize,
            magnitude,
            description: `${magnitude} effect size`
        };
    }
    
    static _tDistributionPValue(t, df) {
        // Simplified approximation for demonstration
        return Math.max(0.001, 2 * Math.exp(-0.5 * Math.pow(t, 2)));
    }
    
    static _normalCDF(z) {
        return 0.5 * (1 + this._erf(z / Math.sqrt(2)));
    }
    
    static _erf(x) {
        const a1 =  0.254829592;
        const a2 = -0.284496736;
        const a3 =  1.421413741;
        const a4 = -1.453152027;
        const a5 =  1.061405429;
        const p  =  0.3275911;
        
        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);
        
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        
        return sign * y;
    }
    
    static _calculateCI(mean1, mean2, standardError) {
        const diff = mean1 - mean2;
        const margin = 1.96 * standardError; // 95% CI
        
        return {
            lower: diff - margin,
            upper: diff + margin
        };
    }
}

/**
 * A/B Test Variant
 */
class ABTestVariant {
    constructor(id, name, config, implementation) {
        this.id = id;
        this.name = name;
        this.config = config;
        this.implementation = implementation;
        
        this.metrics = {
            participants: 0,
            conversions: 0,
            conversionRate: 0,
            samples: [],
            customMetrics: new Map()
        };
        
        this.startTime = Date.now();
        this.isActive = true;
    }
    
    async execute(context) {
        this.metrics.participants++;
        const startTime = Date.now();
        
        try {
            const result = await this.implementation(context, this.config);
            const executionTime = Date.now() - startTime;
            
            this.metrics.samples.push(executionTime);
            
            // Record custom metrics if provided
            if (result && result.metrics) {
                for (const [key, value] of Object.entries(result.metrics)) {
                    if (!this.metrics.customMetrics.has(key)) {
                        this.metrics.customMetrics.set(key, []);
                    }
                    this.metrics.customMetrics.get(key).push(value);
                }
            }
            
            // Check for conversion (success)
            if (result && result.success !== false) {
                this.metrics.conversions++;
            }
            
            this.metrics.conversionRate = this.metrics.conversions / this.metrics.participants;
            
            return {
                ...result,
                variantId: this.id,
                executionTime,
                participant: this.metrics.participants
            };
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.metrics.samples.push(executionTime);
            
            logger.warn('A/B test variant execution failed', {
                variantId: this.id,
                error: error.message
            });
            
            throw error;
        }
    }
    
    getStats() {
        const samples = this.metrics.samples;
        
        if (samples.length === 0) {
            return {
                ...this.metrics,
                mean: 0,
                median: 0,
                stdDev: 0,
                min: 0,
                max: 0,
                customMetrics: Object.fromEntries(this.metrics.customMetrics)
            };
        }
        
        const sortedSamples = [...samples].sort((a, b) => a - b);
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / samples.length;
        
        return {
            ...this.metrics,
            mean,
            median: sortedSamples[Math.floor(sortedSamples.length / 2)],
            stdDev: Math.sqrt(variance),
            min: sortedSamples[0],
            max: sortedSamples[sortedSamples.length - 1],
            p95: sortedSamples[Math.floor(sortedSamples.length * 0.95)],
            p99: sortedSamples[Math.floor(sortedSamples.length * 0.99)],
            customMetrics: Object.fromEntries(
                Array.from(this.metrics.customMetrics.entries()).map(([key, values]) => [
                    key,
                    {
                        samples: values.length,
                        mean: values.reduce((a, b) => a + b, 0) / values.length,
                        min: Math.min(...values),
                        max: Math.max(...values)
                    }
                ])
            )
        };
    }
}

/**
 * A/B Test Experiment
 */
class ABTestExperiment extends EventEmitter {
    constructor(id, name, options = {}) {
        super();
        
        this.id = id;
        this.name = name;
        this.config = {
            // Traffic allocation
            trafficAllocation: options.trafficAllocation || 1.0,
            
            // Statistical configuration
            significanceLevel: options.significanceLevel || 0.05,
            minimumSampleSize: options.minimumSampleSize || 100,
            minimumRunTime: options.minimumRunTime || 86400000, // 24 hours
            maximumRunTime: options.maximumRunTime || 2592000000, // 30 days
            
            // Early stopping
            earlyStoppingEnabled: options.earlyStoppingEnabled !== false,
            earlyStoppingThreshold: options.earlyStoppingThreshold || 0.01,
            
            // Success criteria
            primaryMetric: options.primaryMetric || 'executionTime',
            improvementThreshold: options.improvementThreshold || 0.05, // 5% improvement
            
            // Segment analysis
            segmentAnalysis: options.segmentAnalysis || false,
            segments: options.segments || [],
            
            ...options
        };
        
        this.variants = new Map();
        this.status = 'created';
        this.startTime = null;
        this.endTime = null;
        this.results = null;
        
        // Participant tracking
        this.participantHash = new Map();
        this.totalParticipants = 0;
        
        // Analysis cache
        this.lastAnalysis = null;
        this.analysisCache = new Map();
    }
    
    addVariant(id, name, config, implementation) {
        if (this.variants.has(id)) {
            throw new Error(`Variant ${id} already exists`);
        }
        
        const variant = new ABTestVariant(id, name, config, implementation);
        this.variants.set(id, variant);
        
        logger.debug('Added A/B test variant', {
            experimentId: this.id,
            variantId: id,
            variantName: name
        });
        
        return variant;
    }
    
    removeVariant(id) {
        return this.variants.delete(id);
    }
    
    start() {
        if (this.status !== 'created') {
            throw new Error(`Cannot start experiment in ${this.status} status`);
        }
        
        if (this.variants.size < 2) {
            throw new Error('Experiment must have at least 2 variants');
        }
        
        this.status = 'running';
        this.startTime = Date.now();
        
        logger.info('Started A/B test experiment', {
            experimentId: this.id,
            experimentName: this.name,
            variants: Array.from(this.variants.keys()),
            trafficAllocation: this.config.trafficAllocation
        });
        
        // Start periodic analysis
        this._startPeriodicAnalysis();
        
        this.emit('started', { experimentId: this.id });
        
        return this;
    }
    
    stop(reason = 'manual') {
        if (this.status !== 'running') {
            return this;
        }
        
        this.status = 'stopped';
        this.endTime = Date.now();
        
        // Perform final analysis
        this.results = this._performAnalysis();
        
        logger.info('Stopped A/B test experiment', {
            experimentId: this.id,
            reason,
            duration: this.endTime - this.startTime,
            participants: this.totalParticipants
        });
        
        this.emit('stopped', { 
            experimentId: this.id, 
            reason, 
            results: this.results 
        });
        
        return this;
    }
    
    async execute(context) {
        if (this.status !== 'running') {
            throw new Error(`Experiment ${this.id} is not running`);
        }
        
        // Check traffic allocation
        if (Math.random() > this.config.trafficAllocation) {
            return null; // Not allocated to experiment
        }
        
        // Select variant for participant
        const variant = this._selectVariant(context);
        
        if (!variant) {
            return null;
        }
        
        try {
            // Execute variant
            const result = await variant.execute(context);
            
            this.totalParticipants++;
            
            // Check for early stopping conditions
            if (this.config.earlyStoppingEnabled) {
                this._checkEarlyStoppingConditions();
            }
            
            this.emit('participantProcessed', {
                experimentId: this.id,
                variantId: variant.id,
                participant: this.totalParticipants
            });
            
            return result;
            
        } catch (error) {
            logger.error('A/B test execution failed', {
                experimentId: this.id,
                variantId: variant.id,
                error: error.message
            });
            throw error;
        }
    }
    
    _selectVariant(context) {
        // Generate consistent hash for participant
        const participantId = context.participantId || context.userId || 
                             context.sessionId || JSON.stringify(context);
        
        let hash = this.participantHash.get(participantId);
        
        if (!hash) {
            hash = crypto.createHash('md5').update(participantId + this.id).digest('hex');
            this.participantHash.set(participantId, hash);
        }
        
        // Convert hash to number between 0 and 1
        const hashNumber = parseInt(hash.substring(0, 8), 16) / 0xffffffff;
        
        // Select variant based on hash (equal distribution)
        const variantArray = Array.from(this.variants.values());
        const variantIndex = Math.floor(hashNumber * variantArray.length);
        
        return variantArray[variantIndex];
    }
    
    _performAnalysis() {
        const variantStats = new Map();
        const variants = Array.from(this.variants.values());
        
        // Collect variant statistics
        for (const variant of variants) {
            variantStats.set(variant.id, variant.getStats());
        }
        
        // Perform statistical comparisons
        const comparisons = this._performStatisticalComparisons(variants);
        
        // Determine winner
        const winner = this._determineWinner(variants, comparisons);
        
        // Calculate business impact
        const businessImpact = this._calculateBusinessImpact(variants, winner);
        
        const analysis = {
            experimentId: this.id,
            experimentName: this.name,
            status: this.status,
            duration: (this.endTime || Date.now()) - this.startTime,
            totalParticipants: this.totalParticipants,
            
            variants: Object.fromEntries(variantStats),
            comparisons,
            winner,
            businessImpact,
            
            recommendations: this._generateRecommendations(variants, comparisons, winner),
            
            metadata: {
                significanceLevel: this.config.significanceLevel,
                primaryMetric: this.config.primaryMetric,
                improvementThreshold: this.config.improvementThreshold,
                analysisTime: Date.now()
            }
        };
        
        this.lastAnalysis = analysis;
        return analysis;
    }
    
    _performStatisticalComparisons(variants) {
        const comparisons = [];
        const primaryMetric = this.config.primaryMetric;
        
        // Compare each variant against the control (first variant)
        const control = variants[0];
        const controlSamples = primaryMetric === 'executionTime' ? 
            control.metrics.samples : 
            (control.metrics.customMetrics.get(primaryMetric) || []);
        
        for (let i = 1; i < variants.length; i++) {
            const variant = variants[i];
            const variantSamples = primaryMetric === 'executionTime' ? 
                variant.metrics.samples : 
                (variant.metrics.customMetrics.get(primaryMetric) || []);
            
            if (controlSamples.length === 0 || variantSamples.length === 0) {
                comparisons.push({
                    control: control.id,
                    variant: variant.id,
                    error: 'Insufficient data',
                    significant: false
                });
                continue;
            }
            
            // Perform t-test
            const tTest = StatisticalTest.tTest(controlSamples, variantSamples);
            
            // Perform non-parametric test
            const mannWhitneyU = StatisticalTest.mannWhitneyU(controlSamples, variantSamples);
            
            // Calculate effect size
            const cohensD = StatisticalTest.cohensD(controlSamples, variantSamples);
            
            comparisons.push({
                control: control.id,
                variant: variant.id,
                
                // T-test results
                tTest,
                
                // Mann-Whitney U test results
                mannWhitneyU,
                
                // Effect size
                effectSize: cohensD,
                
                // Overall significance
                significant: tTest.significant && mannWhitneyU.significant,
                
                // Improvement calculation
                improvement: {
                    absolute: tTest.meanDifference,
                    relative: tTest.mean2 !== 0 ? (tTest.meanDifference / tTest.mean2) : 0,
                    meetsThreshold: Math.abs(tTest.meanDifference / tTest.mean2) >= this.config.improvementThreshold
                }
            });
        }
        
        return comparisons;
    }
    
    _determineWinner(variants, comparisons) {
        let winner = null;
        let bestImprovement = 0;
        let confidence = 0;
        
        // Check for statistically significant improvements
        for (const comparison of comparisons) {
            if (comparison.significant && comparison.improvement.meetsThreshold) {
                const improvement = Math.abs(comparison.improvement.relative);
                
                if (improvement > bestImprovement) {
                    bestImprovement = improvement;
                    winner = comparison.variant;
                    confidence = 1 - comparison.tTest.pValue;
                }
            }
        }
        
        // If no significant winner, check for practical significance
        if (!winner) {
            for (const comparison of comparisons) {
                if (comparison.improvement.meetsThreshold && comparison.effectSize.magnitude !== 'negligible') {
                    const improvement = Math.abs(comparison.improvement.relative);
                    
                    if (improvement > bestImprovement) {
                        bestImprovement = improvement;
                        winner = comparison.variant;
                        confidence = 0.5; // Lower confidence for practical significance
                    }
                }
            }
        }
        
        return {
            variantId: winner,
            improvement: bestImprovement,
            confidence,
            type: confidence > 0.8 ? 'statistical' : 'practical',
            recommendation: winner ? 'implement' : 'continue_testing'
        };
    }
    
    _calculateBusinessImpact(variants, winner) {
        if (!winner.variantId) {
            return {
                estimatedImprovement: 0,
                projectedBenefit: 'no_significant_improvement',
                riskAssessment: 'low_risk_no_change'
            };
        }
        
        const winnerVariant = this.variants.get(winner.variantId);
        const control = Array.from(this.variants.values())[0];
        
        const improvement = winner.improvement;
        
        return {
            estimatedImprovement: improvement,
            projectedBenefit: improvement > 0.1 ? 'high' : improvement > 0.05 ? 'medium' : 'low',
            riskAssessment: winner.confidence > 0.95 ? 'low_risk' : winner.confidence > 0.8 ? 'medium_risk' : 'high_risk',
            
            metrics: {
                performanceGain: `${(improvement * 100).toFixed(2)}%`,
                confidenceLevel: `${(winner.confidence * 100).toFixed(1)}%`,
                sampleSize: winnerVariant.metrics.participants + control.metrics.participants
            }
        };
    }
    
    _generateRecommendations(variants, comparisons, winner) {
        const recommendations = [];
        
        if (winner.variantId) {
            recommendations.push({
                type: 'implementation',
                priority: 'high',
                title: 'Implement winning variant',
                description: `Variant ${winner.variantId} shows ${(winner.improvement * 100).toFixed(2)}% improvement with ${(winner.confidence * 100).toFixed(1)}% confidence.`,
                actions: [
                    'Gradually roll out winning variant',
                    'Monitor performance in production',
                    'Prepare rollback plan'
                ]
            });
        } else {
            recommendations.push({
                type: 'continue_testing',
                priority: 'medium',
                title: 'Continue testing or redesign',
                description: 'No statistically significant winner found. Consider longer test duration or alternative variants.',
                actions: [
                    'Increase sample size',
                    'Extend test duration',
                    'Consider new variants'
                ]
            });
        }
        
        // Check for sample size adequacy
        const minSampleSize = this.config.minimumSampleSize;
        const totalSamples = variants.reduce((sum, v) => sum + v.metrics.participants, 0);
        
        if (totalSamples < minSampleSize) {
            recommendations.push({
                type: 'data_collection',
                priority: 'high',
                title: 'Increase sample size',
                description: `Current sample size (${totalSamples}) is below minimum threshold (${minSampleSize}).`,
                actions: [
                    'Increase traffic allocation',
                    'Extend test duration',
                    'Lower significance threshold if appropriate'
                ]
            });
        }
        
        return recommendations;
    }
    
    _checkEarlyStoppingConditions() {
        const runTime = Date.now() - this.startTime;
        
        // Minimum runtime check
        if (runTime < this.config.minimumRunTime) {
            return;
        }
        
        // Perform interim analysis
        const analysis = this._performAnalysis();
        
        // Check for strong statistical significance
        const strongEvidence = analysis.comparisons.some(comp => 
            comp.significant && comp.tTest.pValue < this.config.earlyStoppingThreshold
        );
        
        if (strongEvidence) {
            logger.info('Early stopping conditions met', {
                experimentId: this.id,
                runTime,
                reason: 'strong_statistical_evidence'
            });
            
            this.stop('early_stopping_statistical');
        }
        
        // Maximum runtime check
        if (runTime > this.config.maximumRunTime) {
            logger.info('Maximum runtime reached', {
                experimentId: this.id,
                runTime
            });
            
            this.stop('maximum_runtime');
        }
    }
    
    _startPeriodicAnalysis() {
        // Perform analysis every hour while running
        this.analysisInterval = setInterval(() => {
            if (this.status === 'running') {
                try {
                    const analysis = this._performAnalysis();
                    this.emit('analysisUpdate', { experimentId: this.id, analysis });
                } catch (error) {
                    logger.error('Periodic analysis failed', {
                        experimentId: this.id,
                        error: error.message
                    });
                }
            }
        }, 3600000); // Every hour
    }
    
    getStatus() {
        return {
            id: this.id,
            name: this.name,
            status: this.status,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: (this.endTime || Date.now()) - (this.startTime || Date.now()),
            totalParticipants: this.totalParticipants,
            variants: Array.from(this.variants.keys()),
            lastAnalysis: this.lastAnalysis
        };
    }
    
    getResults() {
        return this.results || this._performAnalysis();
    }
    
    cleanup() {
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
        }
        
        this.removeAllListeners();
    }
}

/**
 * A/B Testing Framework Manager
 */
class ABTestingFramework extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            maxConcurrentExperiments: options.maxConcurrentExperiments || 10,
            defaultSignificanceLevel: options.significanceLevel || 0.05,
            defaultMinimumSampleSize: options.minimumSampleSize || 1000,
            
            // Analytics
            enableAnalytics: options.analytics !== false,
            analyticsRetention: options.analyticsRetention || 2592000000, // 30 days
            
            ...options
        };
        
        this.experiments = new Map();
        this.experimentHistory = [];
        
        // Global metrics
        this.globalMetrics = {
            totalExperiments: 0,
            activeExperiments: 0,
            completedExperiments: 0,
            totalParticipants: 0,
            successfulOptimizations: 0
        };
        
        this.isInitialized = false;
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        logger.info('Initializing A/B Testing Framework', {
            maxConcurrentExperiments: this.config.maxConcurrentExperiments,
            significanceLevel: this.config.defaultSignificanceLevel
        });
        
        // Start background tasks
        this._startMetricsCollection();
        this._startCleanupTasks();
        
        this.isInitialized = true;
        this.emit('initialized');
        
        logger.info('A/B Testing Framework initialized successfully');
    }
    
    createExperiment(id, name, options = {}) {
        if (this.experiments.has(id)) {
            throw new Error(`Experiment ${id} already exists`);
        }
        
        if (this.getActiveExperiments().length >= this.config.maxConcurrentExperiments) {
            throw new Error('Maximum concurrent experiments reached');
        }
        
        const experimentOptions = {
            significanceLevel: this.config.defaultSignificanceLevel,
            minimumSampleSize: this.config.defaultMinimumSampleSize,
            ...options
        };
        
        const experiment = new ABTestExperiment(id, name, experimentOptions);
        
        // Set up event handlers
        experiment.on('started', (data) => {
            this.globalMetrics.activeExperiments++;
            this.emit('experimentStarted', data);
        });
        
        experiment.on('stopped', (data) => {
            this.globalMetrics.activeExperiments--;
            this.globalMetrics.completedExperiments++;
            
            // Archive experiment
            this._archiveExperiment(experiment);
            
            this.emit('experimentStopped', data);
        });
        
        experiment.on('participantProcessed', (data) => {
            this.globalMetrics.totalParticipants++;
        });
        
        this.experiments.set(id, experiment);
        this.globalMetrics.totalExperiments++;
        
        logger.info('Created A/B test experiment', {
            id,
            name,
            options: experimentOptions
        });
        
        return experiment;
    }
    
    getExperiment(id) {
        return this.experiments.get(id);
    }
    
    getActiveExperiments() {
        return Array.from(this.experiments.values()).filter(exp => exp.status === 'running');
    }
    
    getAllExperiments() {
        return Array.from(this.experiments.values());
    }
    
    async stopExperiment(id, reason = 'manual') {
        const experiment = this.experiments.get(id);
        
        if (!experiment) {
            throw new Error(`Experiment ${id} not found`);
        }
        
        experiment.stop(reason);
        return experiment.getResults();
    }
    
    async stopAllExperiments(reason = 'shutdown') {
        const activeExperiments = this.getActiveExperiments();
        
        for (const experiment of activeExperiments) {
            experiment.stop(reason);
        }
        
        return activeExperiments.map(exp => exp.getResults());
    }
    
    _archiveExperiment(experiment) {
        const archiveEntry = {
            ...experiment.getStatus(),
            results: experiment.getResults(),
            archivedAt: Date.now()
        };
        
        this.experimentHistory.push(archiveEntry);
        
        // Clean up experiment resources
        experiment.cleanup();
        
        // Keep experiment in active list for a short period for access
        setTimeout(() => {
            this.experiments.delete(experiment.id);
        }, 60000); // 1 minute
    }
    
    // Pre-built optimization tests
    
    /**
     * Create a caching optimization experiment
     */
    createCacheOptimizationTest(id, cacheSystem, options = {}) {
        const experiment = this.createExperiment(id, 'Cache Strategy Optimization', options);
        
        // Control: Current caching strategy
        experiment.addVariant('control', 'Current Cache Strategy', {}, 
            async (context, config) => {
                return await cacheSystem.get(context.key, context.vector);
            }
        );
        
        // Variant A: Aggressive caching
        experiment.addVariant('aggressive_cache', 'Aggressive Caching', 
            { ttl: 7200000, prefetch: true }, 
            async (context, config) => {
                const result = await cacheSystem.get(context.key, context.vector, config);
                return {
                    ...result,
                    metrics: {
                        cacheHit: result?.metadata?.fromCache || false
                    }
                };
            }
        );
        
        // Variant B: Conservative caching
        experiment.addVariant('conservative_cache', 'Conservative Caching',
            { ttl: 1800000, prefetch: false },
            async (context, config) => {
                const result = await cacheSystem.get(context.key, context.vector, config);
                return {
                    ...result,
                    metrics: {
                        cacheHit: result?.metadata?.fromCache || false
                    }
                };
            }
        );
        
        return experiment;
    }
    
    /**
     * Create a search algorithm optimization experiment
     */
    createSearchOptimizationTest(id, searchSystem, options = {}) {
        const experiment = this.createExperiment(id, 'Search Algorithm Optimization', options);
        
        // Control: Current algorithm
        experiment.addVariant('control', 'Current Algorithm', {}, 
            async (context, config) => {
                return await searchSystem.search(context.queryVector, { k: context.k });
            }
        );
        
        // Variant A: GPU-accelerated search
        experiment.addVariant('gpu_accelerated', 'GPU Accelerated', 
            { useGPU: true, batchSize: 32 }, 
            async (context, config) => {
                const result = await searchSystem.search(context.queryVector, {
                    k: context.k,
                    useGPU: true,
                    batchSize: config.batchSize
                });
                
                return {
                    ...result,
                    metrics: {
                        gpuUtilization: result.metadata?.gpuUtilization || 0
                    }
                };
            }
        );
        
        // Variant B: Optimized batch processing
        experiment.addVariant('batch_optimized', 'Batch Optimized',
            { batchSize: 64, parallel: true },
            async (context, config) => {
                const result = await searchSystem.search(context.queryVector, {
                    k: context.k,
                    batchSize: config.batchSize,
                    parallel: config.parallel
                });
                
                return {
                    ...result,
                    metrics: {
                        batchEfficiency: result.metadata?.batchEfficiency || 1
                    }
                };
            }
        );
        
        return experiment;
    }
    
    // Analytics and reporting
    
    getGlobalStats() {
        return {
            ...this.globalMetrics,
            experiments: this.experiments.size,
            archivedExperiments: this.experimentHistory.length,
            
            // Recent performance
            recentOptimizations: this.experimentHistory
                .filter(exp => exp.results?.winner?.variantId)
                .slice(-10)
                .map(exp => ({
                    id: exp.id,
                    name: exp.name,
                    improvement: exp.results.winner.improvement,
                    confidence: exp.results.winner.confidence
                }))
        };
    }
    
    generateReport(format = 'json') {
        const report = {
            framework: 'GH200 A/B Testing Framework',
            timestamp: new Date().toISOString(),
            summary: this.getGlobalStats(),
            activeExperiments: this.getActiveExperiments().map(exp => exp.getStatus()),
            recentResults: this.experimentHistory.slice(-20)
        };
        
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(report, null, 2);
            case 'csv':
                return this._formatReportCSV(report);
            case 'markdown':
                return this._formatReportMarkdown(report);
            default:
                return JSON.stringify(report, null, 2);
        }
    }
    
    _formatReportCSV(report) {
        const headers = ['Experiment ID', 'Name', 'Status', 'Participants', 'Winner', 'Improvement', 'Confidence'];
        const rows = [headers.join(',')];
        
        for (const experiment of [...report.activeExperiments, ...report.recentResults]) {
            const winner = experiment.results?.winner;
            rows.push([
                experiment.id,
                experiment.name,
                experiment.status,
                experiment.totalParticipants,
                winner?.variantId || 'None',
                winner?.improvement ? `${(winner.improvement * 100).toFixed(2)}%` : '0%',
                winner?.confidence ? `${(winner.confidence * 100).toFixed(1)}%` : '0%'
            ].join(','));
        }
        
        return rows.join('\n');
    }
    
    _formatReportMarkdown(report) {
        const lines = [
            '# A/B Testing Framework Report',
            '',
            `**Generated:** ${report.timestamp}`,
            `**Active Experiments:** ${report.activeExperiments.length}`,
            `**Total Experiments:** ${report.summary.totalExperiments}`,
            `**Total Participants:** ${report.summary.totalParticipants}`,
            '',
            '## Active Experiments',
            ''
        ];
        
        if (report.activeExperiments.length > 0) {
            lines.push('| Experiment | Status | Participants | Duration |');
            lines.push('|------------|--------|--------------|----------|');
            
            for (const exp of report.activeExperiments) {
                lines.push(`| ${exp.name} | ${exp.status} | ${exp.totalParticipants} | ${Math.floor(exp.duration / 3600000)}h |`);
            }
        } else {
            lines.push('No active experiments.');
        }
        
        lines.push('', '## Recent Results', '');
        
        if (report.recentResults.length > 0) {
            lines.push('| Experiment | Winner | Improvement | Confidence |');
            lines.push('|------------|---------|-------------|------------|');
            
            for (const exp of report.recentResults) {
                const winner = exp.results?.winner;
                lines.push(`| ${exp.name} | ${winner?.variantId || 'None'} | ${winner?.improvement ? (winner.improvement * 100).toFixed(2) + '%' : '0%'} | ${winner?.confidence ? (winner.confidence * 100).toFixed(1) + '%' : '0%'} |`);
            }
        }
        
        return lines.join('\n');
    }
    
    // Background tasks
    _startMetricsCollection() {
        setInterval(() => {
            this.emit('metricsUpdated', this.getGlobalStats());
        }, 60000); // Every minute
    }
    
    _startCleanupTasks() {
        setInterval(() => {
            this._cleanupOldExperiments();
        }, 86400000); // Daily
    }
    
    _cleanupOldExperiments() {
        const cutoffTime = Date.now() - this.config.analyticsRetention;
        const beforeCount = this.experimentHistory.length;
        
        this.experimentHistory = this.experimentHistory.filter(exp => 
            exp.archivedAt > cutoffTime
        );
        
        const cleanedCount = beforeCount - this.experimentHistory.length;
        
        if (cleanedCount > 0) {
            logger.debug('Cleaned up old experiment records', { cleanedCount });
        }
    }
    
    async shutdown() {
        logger.info('Shutting down A/B Testing Framework');
        
        // Stop all active experiments
        await this.stopAllExperiments('framework_shutdown');
        
        // Clear all data
        this.experiments.clear();
        this.experimentHistory.length = 0;
        
        this.isInitialized = false;
        this.emit('shutdown');
    }
}

module.exports = {
    ABTestingFramework,
    ABTestExperiment,
    ABTestVariant,
    StatisticalTest
};