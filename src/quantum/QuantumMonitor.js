/**
 * Quantum Monitor
 * Advanced monitoring and observability for quantum task planning
 */

const EventEmitter = require('eventemitter3');
const { logger } = require('../utils/logger');

class QuantumMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            monitoringInterval: options.monitoringInterval || 5000,
            alertThresholds: options.alertThresholds || this.getDefaultThresholds(),
            metricsRetention: options.metricsRetention || 86400000, // 24 hours
            enableDetailedLogging: options.enableDetailedLogging !== false,
            enableAlerting: options.enableAlerting !== false,
            ...options
        };
        
        this.metrics = new Map();
        this.alerts = new Map();
        this.isMonitoring = false;
        this.monitoringInterval = null;
        
        this.initializeMetrics();
    }

    getDefaultThresholds() {
        return {
            coherenceCritical: 0.1,
            coherenceWarning: 0.3,
            measurementRateCritical: 100,
            measurementRateWarning: 50,
            entanglementRatioCritical: 0.9,
            entanglementRatioWarning: 0.7,
            taskFailureRateCritical: 0.1,
            taskFailureRateWarning: 0.05,
            systemEfficiencyCritical: 0.3,
            systemEfficiencyWarning: 0.5,
            memoryUsageCritical: 0.9,
            memoryUsageWarning: 0.8,
            responseTimeCritical: 5000,
            responseTimeWarning: 2000
        };
    }

    async initialize() {
        if (this.isMonitoring) return;
        
        logger.info('Initializing Quantum Monitor', {
            monitoringInterval: this.config.monitoringInterval,
            alertingEnabled: this.config.enableAlerting
        });
        
        this.monitoringInterval = setInterval(
            () => this.collectMetrics(),
            this.config.monitoringInterval
        );
        
        this.isMonitoring = true;
        this.emit('initialized');
    }

    initializeMetrics() {
        this.metricsDefinitions = {
            quantum: {
                coherenceMetrics: {
                    averageCoherence: 0,
                    minCoherence: 1,
                    maxCoherence: 0,
                    coherenceVariance: 0,
                    decoherenceRate: 0
                },
                entanglementMetrics: {
                    totalEntanglements: 0,
                    strongEntanglements: 0,
                    weakEntanglements: 0,
                    averageCorrelation: 0,
                    entanglementDensity: 0
                },
                measurementMetrics: {
                    totalMeasurements: 0,
                    measurementRate: 0,
                    averageCollapseTime: 0,
                    measurementAccuracy: 0
                },
                stateMetrics: {
                    activeSuperpositions: 0,
                    averageStateCount: 0,
                    stateTransitionRate: 0,
                    quantumEfficiency: 0
                }
            },
            performance: {
                taskMetrics: {
                    totalTasks: 0,
                    completedTasks: 0,
                    failedTasks: 0,
                    averageExecutionTime: 0,
                    taskThroughput: 0,
                    taskSuccessRate: 0
                },
                systemMetrics: {
                    cpuUsage: 0,
                    memoryUsage: 0,
                    networkUsage: 0,
                    diskUsage: 0,
                    systemLoad: 0
                },
                responseMetrics: {
                    averageResponseTime: 0,
                    p95ResponseTime: 0,
                    p99ResponseTime: 0,
                    timeoutRate: 0
                }
            },
            optimization: {
                adaptationMetrics: {
                    totalAdaptations: 0,
                    successfulAdaptations: 0,
                    adaptationRate: 0,
                    improvementScore: 0
                },
                learningMetrics: {
                    learningRate: 0,
                    predictionAccuracy: 0,
                    patternRecognitionScore: 0,
                    knowledgeBase: 0
                }
            },
            errors: {
                errorMetrics: {
                    totalErrors: 0,
                    criticalErrors: 0,
                    errorRate: 0,
                    recoveryRate: 0,
                    meanTimeToRecovery: 0
                },
                validationMetrics: {
                    validationErrors: 0,
                    sanitizationEvents: 0,
                    securityBlocks: 0
                }
            }
        };

        this.resetMetrics();
    }

    resetMetrics() {
        this.metrics.clear();
        for (const [category, categoryMetrics] of Object.entries(this.metricsDefinitions)) {
            for (const [group, groupMetrics] of Object.entries(categoryMetrics)) {
                const metricKey = `${category}.${group}`;
                this.metrics.set(metricKey, { ...groupMetrics });
            }
        }
    }

    async startMonitoring(quantumPlanner, optimizer) {
        if (this.isMonitoring) return;

        this.quantumPlanner = quantumPlanner;
        this.optimizer = optimizer;
        
        logger.info('Starting quantum monitoring system', {
            monitoringInterval: this.config.monitoringInterval,
            alertThresholds: Object.keys(this.config.alertThresholds).length
        });

        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
        }, this.config.monitoringInterval);

        this.isMonitoring = true;
        this.emit('monitoringStarted');
    }

    async stopMonitoring() {
        if (!this.isMonitoring) return;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.isMonitoring = false;
        this.emit('monitoringStopped');
        
        logger.info('Stopped quantum monitoring system');
    }

    collectMetrics() {
        try {
            this.collectQuantumMetrics();
            this.collectPerformanceMetrics();
            this.collectOptimizationMetrics();
            this.collectErrorMetrics();
            
            this.checkAlertConditions();
            this.cleanupOldMetrics();
            
            if (this.config.enableDetailedLogging) {
                this.logMetricsSummary();
            }
            
            this.emit('metricsCollected', this.getCurrentMetrics());
            
        } catch (error) {
            logger.error('Error collecting metrics', { error: error.message });
            this.recordError('metrics_collection', error);
        }
    }

    collectQuantumMetrics() {
        if (!this.quantumPlanner) return;

        const quantumMetrics = this.quantumPlanner.getMetrics();
        const quantumStates = this.quantumPlanner.quantumStates;
        
        const coherenceMetrics = this.metrics.get('quantum.coherenceMetrics');
        const entanglementMetrics = this.metrics.get('quantum.entanglementMetrics');
        const measurementMetrics = this.metrics.get('quantum.measurementMetrics');
        const stateMetrics = this.metrics.get('quantum.stateMetrics');

        if (quantumStates.size > 0) {
            const coherences = Array.from(quantumStates.values()).map(state => state.coherence);
            coherenceMetrics.averageCoherence = coherences.reduce((a, b) => a + b, 0) / coherences.length;
            coherenceMetrics.minCoherence = Math.min(...coherences);
            coherenceMetrics.maxCoherence = Math.max(...coherences);
            coherenceMetrics.coherenceVariance = this.calculateVariance(coherences);
            coherenceMetrics.decoherenceRate = this.calculateDecoherenceRate(quantumStates);
        }

        entanglementMetrics.totalEntanglements = quantumMetrics.entanglements;
        entanglementMetrics.entanglementDensity = quantumMetrics.entanglements / Math.max(quantumMetrics.totalTasks, 1);
        
        const entanglements = Array.from(this.quantumPlanner.entanglements);
        entanglementMetrics.strongEntanglements = entanglements.filter(e => e.type === 'strong').length;
        entanglementMetrics.weakEntanglements = entanglements.filter(e => e.type === 'weak').length;
        
        if (entanglements.length > 0) {
            entanglementMetrics.averageCorrelation = entanglements.reduce((sum, e) => sum + e.correlation, 0) / entanglements.length;
        }

        measurementMetrics.totalMeasurements = quantumMetrics.totalMeasurements;
        measurementMetrics.measurementRate = this.calculateMeasurementRate();
        measurementMetrics.averageCollapseTime = this.calculateAverageCollapseTime();
        measurementMetrics.measurementAccuracy = this.calculateMeasurementAccuracy();

        stateMetrics.activeSuperpositions = quantumMetrics.activeQuantumStates;
        stateMetrics.averageStateCount = this.calculateAverageStateCount(quantumStates);
        stateMetrics.stateTransitionRate = this.calculateStateTransitionRate();
        stateMetrics.quantumEfficiency = quantumMetrics.systemEfficiency;
    }

    collectPerformanceMetrics() {
        const taskMetrics = this.metrics.get('performance.taskMetrics');
        const systemMetrics = this.metrics.get('performance.systemMetrics');
        const responseMetrics = this.metrics.get('performance.responseMetrics');

        if (this.quantumPlanner) {
            const tasks = Array.from(this.quantumPlanner.taskRegistry.values());
            
            taskMetrics.totalTasks = tasks.length;
            taskMetrics.completedTasks = tasks.filter(t => t.status === 'completed').length;
            taskMetrics.failedTasks = tasks.filter(t => t.status === 'failed').length;
            
            const completedTasks = tasks.filter(t => t.status === 'completed' && t.completedAt);
            if (completedTasks.length > 0) {
                const executionTimes = completedTasks.map(t => t.completedAt - t.createdAt);
                taskMetrics.averageExecutionTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
            }
            
            taskMetrics.taskSuccessRate = taskMetrics.totalTasks > 0 ? 
                taskMetrics.completedTasks / taskMetrics.totalTasks : 0;
        }

        systemMetrics.cpuUsage = this.getCPUUsage();
        systemMetrics.memoryUsage = this.getMemoryUsage();
        systemMetrics.networkUsage = this.getNetworkUsage();
        systemMetrics.diskUsage = this.getDiskUsage();
        systemMetrics.systemLoad = this.getSystemLoad();

        responseMetrics.averageResponseTime = this.calculateAverageResponseTime();
        responseMetrics.p95ResponseTime = this.calculatePercentileResponseTime(0.95);
        responseMetrics.p99ResponseTime = this.calculatePercentileResponseTime(0.99);
        responseMetrics.timeoutRate = this.calculateTimeoutRate();
    }

    collectOptimizationMetrics() {
        if (!this.optimizer) return;

        const adaptationMetrics = this.metrics.get('optimization.adaptationMetrics');
        const learningMetrics = this.metrics.get('optimization.learningMetrics');

        const optimizationSummary = this.optimizer.getOptimizationSummary();
        if (optimizationSummary) {
            adaptationMetrics.totalAdaptations = optimizationSummary.adaptationHistory?.length || 0;
            adaptationMetrics.successfulAdaptations = optimizationSummary.adaptationHistory?.filter(a => a.success).length || 0;
            adaptationMetrics.adaptationRate = this.calculateAdaptationRate();
            adaptationMetrics.improvementScore = this.calculateImprovementScore(optimizationSummary);

            learningMetrics.learningRate = this.optimizer.config.learningRate;
            learningMetrics.predictionAccuracy = optimizationSummary.recentPerformance?.predictionAccuracy || 0;
            learningMetrics.patternRecognitionScore = this.calculatePatternRecognitionScore();
            learningMetrics.knowledgeBase = this.optimizer.executionHistory.length;
        }
    }

    collectErrorMetrics() {
        const errorMetrics = this.metrics.get('errors.errorMetrics');
        const validationMetrics = this.metrics.get('errors.validationMetrics');

        const recentErrors = this.getRecentErrors();
        errorMetrics.totalErrors = recentErrors.length;
        errorMetrics.criticalErrors = recentErrors.filter(e => e.severity === 'critical').length;
        errorMetrics.errorRate = this.calculateErrorRate(recentErrors);
        errorMetrics.recoveryRate = this.calculateRecoveryRate(recentErrors);
        errorMetrics.meanTimeToRecovery = this.calculateMeanTimeToRecovery(recentErrors);

        validationMetrics.validationErrors = recentErrors.filter(e => e.type === 'validation').length;
        validationMetrics.sanitizationEvents = recentErrors.filter(e => e.type === 'sanitization').length;
        validationMetrics.securityBlocks = recentErrors.filter(e => e.type === 'security').length;
    }

    calculateVariance(values) {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
        
        return variance;
    }

    calculateDecoherenceRate(quantumStates) {
        const now = Date.now();
        let totalDecoherence = 0;
        let stateCount = 0;

        for (const state of quantumStates.values()) {
            const timeSinceLastMeasurement = now - state.lastMeasurement;
            const expectedCoherence = Math.exp(-timeSinceLastMeasurement / 10000);
            const actualDecoherence = Math.max(0, expectedCoherence - state.coherence);
            
            totalDecoherence += actualDecoherence;
            stateCount++;
        }

        return stateCount > 0 ? totalDecoherence / stateCount : 0;
    }

    calculateMeasurementRate() {
        if (!this.quantumPlanner || !this.quantumPlanner.measurements) return 0;

        const recentMeasurements = this.quantumPlanner.measurements.filter(
            m => Date.now() - m.timestamp < this.config.monitoringInterval * 5
        );

        const timeSpan = this.config.monitoringInterval * 5 / 1000; // Convert to seconds
        return recentMeasurements.length / timeSpan;
    }

    calculateAverageCollapseTime() {
        if (!this.quantumPlanner || !this.quantumPlanner.measurements) return 0;

        const recentMeasurements = this.quantumPlanner.measurements.filter(
            m => Date.now() - m.timestamp < this.config.monitoringInterval * 10
        );

        if (recentMeasurements.length === 0) return 0;

        const collapseTimes = recentMeasurements.map(m => {
            const state = this.quantumPlanner.quantumStates.get(m.taskId);
            return state ? Date.now() - state.lastMeasurement : 0;
        }).filter(time => time > 0);

        return collapseTimes.length > 0 ? 
            collapseTimes.reduce((a, b) => a + b, 0) / collapseTimes.length : 0;
    }

    calculateMeasurementAccuracy() {
        if (!this.quantumPlanner || !this.quantumPlanner.measurements) return 0;

        const recentMeasurements = this.quantumPlanner.measurements.slice(-100);
        const accuracies = recentMeasurements.map(m => m.collapsedTo.probability);

        return accuracies.length > 0 ?
            accuracies.reduce((a, b) => a + b, 0) / accuracies.length : 0;
    }

    calculateAverageStateCount(quantumStates) {
        if (quantumStates.size === 0) return 0;

        const totalStates = Array.from(quantumStates.values())
            .reduce((sum, state) => sum + state.superposition.length, 0);

        return totalStates / quantumStates.size;
    }

    calculateStateTransitionRate() {
        if (!this.quantumPlanner || !this.quantumPlanner.measurements) return 0;

        const recentTransitions = this.quantumPlanner.measurements.filter(
            m => Date.now() - m.timestamp < this.config.monitoringInterval * 5
        );

        const timeSpan = this.config.monitoringInterval * 5 / 1000;
        return recentTransitions.length / timeSpan;
    }

    getCPUUsage() {
        try {
            const usage = process.cpuUsage();
            return (usage.user + usage.system) / 1000000; // Convert to seconds
        } catch (error) {
            return 0;
        }
    }

    getMemoryUsage() {
        try {
            const usage = process.memoryUsage();
            return usage.heapUsed / usage.heapTotal;
        } catch (error) {
            return 0;
        }
    }

    getNetworkUsage() {
        return 0;
    }

    getDiskUsage() {
        return 0;
    }

    getSystemLoad() {
        try {
            const load = require('os').loadavg();
            return load[0]; // 1-minute load average
        } catch (error) {
            return 0;
        }
    }

    calculateAverageResponseTime() {
        const responseTimes = this.getRecentResponseTimes();
        return responseTimes.length > 0 ?
            responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    }

    calculatePercentileResponseTime(percentile) {
        const responseTimes = this.getRecentResponseTimes().sort((a, b) => a - b);
        if (responseTimes.length === 0) return 0;

        const index = Math.ceil(responseTimes.length * percentile) - 1;
        return responseTimes[index] || 0;
    }

    calculateTimeoutRate() {
        const recentRequests = this.getRecentRequests();
        const timeouts = recentRequests.filter(r => r.timeout).length;
        
        return recentRequests.length > 0 ? timeouts / recentRequests.length : 0;
    }

    getRecentResponseTimes() {
        return [];
    }

    getRecentRequests() {
        return [];
    }

    calculateAdaptationRate() {
        if (!this.optimizer || !this.optimizer.executionHistory) return 0;

        const recentAdaptations = this.optimizer.executionHistory.filter(
            exec => exec.adaptations && Date.now() - exec.timestamp < this.config.monitoringInterval * 10
        );

        const timeSpan = this.config.monitoringInterval * 10 / 1000;
        return recentAdaptations.length / timeSpan;
    }

    calculateImprovementScore(optimizationSummary) {
        if (!optimizationSummary.improvements) return 0;

        const improvements = Object.values(optimizationSummary.improvements);
        const positiveImprovements = improvements.filter(imp => imp > 0);
        
        return positiveImprovements.length > 0 ?
            positiveImprovements.reduce((a, b) => a + b, 0) / improvements.length : 0;
    }

    calculatePatternRecognitionScore() {
        if (!this.optimizer || !this.optimizer.executionHistory) return 0;

        const recentExecutions = this.optimizer.executionHistory.slice(-50);
        const patterns = this.identifyPatterns(recentExecutions);
        
        return Math.min(1.0, patterns.length / 10);
    }

    identifyPatterns(executions) {
        const patterns = [];
        
        const successPatterns = executions.filter(e => e.success);
        if (successPatterns.length > executions.length * 0.8) {
            patterns.push('high_success_rate');
        }
        
        const avgDuration = executions.reduce((sum, e) => sum + e.duration, 0) / executions.length;
        const recentAvgDuration = executions.slice(-10).reduce((sum, e) => sum + e.duration, 0) / 10;
        
        if (recentAvgDuration < avgDuration * 0.9) {
            patterns.push('improving_performance');
        }
        
        return patterns;
    }

    getRecentErrors() {
        return [];
    }

    calculateErrorRate(errors) {
        const timeSpan = this.config.monitoringInterval * 5 / 1000;
        return errors.length / timeSpan;
    }

    calculateRecoveryRate(errors) {
        const recoveredErrors = errors.filter(e => e.recovered).length;
        return errors.length > 0 ? recoveredErrors / errors.length : 0;
    }

    calculateMeanTimeToRecovery(errors) {
        const recoveredErrors = errors.filter(e => e.recovered && e.recoveryTime);
        
        if (recoveredErrors.length === 0) return 0;
        
        const totalRecoveryTime = recoveredErrors.reduce(
            (sum, e) => sum + (e.recoveryTime - e.timestamp), 0
        );
        
        return totalRecoveryTime / recoveredErrors.length;
    }

    checkAlertConditions() {
        if (!this.config.enableAlerting) return;

        const currentMetrics = this.getCurrentMetrics();
        
        this.checkThreshold('coherenceCritical', currentMetrics.quantum.coherenceMetrics.averageCoherence, 'critical', '<');
        this.checkThreshold('coherenceWarning', currentMetrics.quantum.coherenceMetrics.averageCoherence, 'warning', '<');
        
        this.checkThreshold('measurementRateCritical', currentMetrics.quantum.measurementMetrics.measurementRate, 'critical', '>');
        this.checkThreshold('measurementRateWarning', currentMetrics.quantum.measurementMetrics.measurementRate, 'warning', '>');
        
        this.checkThreshold('entanglementRatioCritical', currentMetrics.quantum.entanglementMetrics.entanglementDensity, 'critical', '>');
        this.checkThreshold('entanglementRatioWarning', currentMetrics.quantum.entanglementMetrics.entanglementDensity, 'warning', '>');
        
        this.checkThreshold('taskFailureRateCritical', 1 - currentMetrics.performance.taskMetrics.taskSuccessRate, 'critical', '>');
        this.checkThreshold('taskFailureRateWarning', 1 - currentMetrics.performance.taskMetrics.taskSuccessRate, 'warning', '>');
        
        this.checkThreshold('systemEfficiencyCritical', currentMetrics.quantum.stateMetrics.quantumEfficiency, 'critical', '<');
        this.checkThreshold('systemEfficiencyWarning', currentMetrics.quantum.stateMetrics.quantumEfficiency, 'warning', '<');
        
        this.checkThreshold('memoryUsageCritical', currentMetrics.performance.systemMetrics.memoryUsage, 'critical', '>');
        this.checkThreshold('memoryUsageWarning', currentMetrics.performance.systemMetrics.memoryUsage, 'warning', '>');
        
        this.checkThreshold('responseTimeCritical', currentMetrics.performance.responseMetrics.averageResponseTime, 'critical', '>');
        this.checkThreshold('responseTimeWarning', currentMetrics.performance.responseMetrics.averageResponseTime, 'warning', '>');
    }

    checkThreshold(thresholdName, value, severity, operator) {
        const threshold = this.config.alertThresholds[thresholdName];
        if (threshold === undefined || value === undefined) return;

        let triggered = false;
        
        if (operator === '>') {
            triggered = value > threshold;
        } else if (operator === '<') {
            triggered = value < threshold;
        } else if (operator === '>=') {
            triggered = value >= threshold;
        } else if (operator === '<=') {
            triggered = value <= threshold;
        }

        if (triggered) {
            this.triggerAlert(thresholdName, value, threshold, severity);
        } else {
            this.clearAlert(thresholdName);
        }
    }

    triggerAlert(alertName, currentValue, threshold, severity) {
        const existingAlert = this.alerts.get(alertName);
        
        if (existingAlert && existingAlert.active) {
            return;
        }

        const alert = {
            name: alertName,
            severity: severity,
            currentValue: currentValue,
            threshold: threshold,
            timestamp: Date.now(),
            active: true,
            acknowledgedBy: null,
            acknowledgedAt: null
        };

        this.alerts.set(alertName, alert);
        
        logger.warn(`Quantum monitoring alert triggered: ${alertName}`, alert);
        
        this.emit('alertTriggered', alert);
    }

    clearAlert(alertName) {
        const existingAlert = this.alerts.get(alertName);
        
        if (existingAlert && existingAlert.active) {
            existingAlert.active = false;
            existingAlert.clearedAt = Date.now();
            
            logger.info(`Quantum monitoring alert cleared: ${alertName}`);
            
            this.emit('alertCleared', existingAlert);
        }
    }

    acknowledgeAlert(alertName, acknowledgedBy) {
        const alert = this.alerts.get(alertName);
        
        if (alert && alert.active) {
            alert.acknowledgedBy = acknowledgedBy;
            alert.acknowledgedAt = Date.now();
            
            this.emit('alertAcknowledged', alert);
            
            return true;
        }
        
        return false;
    }

    logMetricsSummary() {
        const metrics = this.getCurrentMetrics();
        
        logger.info('Quantum monitoring metrics summary', {
            quantum: {
                averageCoherence: metrics.quantum.coherenceMetrics.averageCoherence.toFixed(3),
                totalEntanglements: metrics.quantum.entanglementMetrics.totalEntanglements,
                measurementRate: metrics.quantum.measurementMetrics.measurementRate.toFixed(2),
                quantumEfficiency: metrics.quantum.stateMetrics.quantumEfficiency.toFixed(3)
            },
            performance: {
                totalTasks: metrics.performance.taskMetrics.totalTasks,
                taskSuccessRate: (metrics.performance.taskMetrics.taskSuccessRate * 100).toFixed(1) + '%',
                averageResponseTime: metrics.performance.responseMetrics.averageResponseTime.toFixed(0) + 'ms',
                memoryUsage: (metrics.performance.systemMetrics.memoryUsage * 100).toFixed(1) + '%'
            },
            optimization: {
                totalAdaptations: metrics.optimization.adaptationMetrics.totalAdaptations,
                predictionAccuracy: (metrics.optimization.learningMetrics.predictionAccuracy * 100).toFixed(1) + '%',
                knowledgeBase: metrics.optimization.learningMetrics.knowledgeBase
            }
        });
    }

    getCurrentMetrics() {
        const result = {};
        
        for (const [key, value] of this.metrics.entries()) {
            const [category, group] = key.split('.');
            
            if (!result[category]) {
                result[category] = {};
            }
            
            result[category][group] = { ...value };
        }
        
        return result;
    }

    getActiveAlerts() {
        return Array.from(this.alerts.values()).filter(alert => alert.active);
    }

    cleanupOldMetrics() {
        const cutoff = Date.now() - this.config.metricsRetention;
        
        let cleaned = 0;
        for (const [key, alert] of this.alerts.entries()) {
            if (!alert.active && alert.clearedAt && alert.clearedAt < cutoff) {
                this.alerts.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.debug(`Cleaned up ${cleaned} old alerts`);
        }
    }

    recordError(type, error) {
        const errorRecord = {
            type: type,
            message: error.message,
            stack: error.stack,
            timestamp: Date.now(),
            severity: this.classifyErrorSeverity(error),
            recovered: false,
            recoveryTime: null
        };

        this.emit('errorRecorded', errorRecord);
    }

    classifyErrorSeverity(error) {
        if (error.name === 'ValidationError') return 'warning';
        if (error.message.includes('critical')) return 'critical';
        if (error.message.includes('timeout')) return 'warning';
        
        return 'info';
    }

    generateHealthReport() {
        const metrics = this.getCurrentMetrics();
        const activeAlerts = this.getActiveAlerts();
        
        const healthScore = this.calculateHealthScore(metrics, activeAlerts);
        
        return {
            timestamp: Date.now(),
            healthScore: healthScore,
            status: this.getHealthStatus(healthScore),
            metrics: metrics,
            alerts: activeAlerts,
            recommendations: this.generateRecommendations(metrics, activeAlerts)
        };
    }

    calculateHealthScore(metrics, alerts) {
        let score = 100;
        
        score -= alerts.filter(a => a.severity === 'critical').length * 20;
        score -= alerts.filter(a => a.severity === 'warning').length * 10;
        score -= alerts.filter(a => a.severity === 'info').length * 5;
        
        if (metrics.quantum.coherenceMetrics.averageCoherence < 0.3) score -= 15;
        if (metrics.performance.taskMetrics.taskSuccessRate < 0.8) score -= 20;
        if (metrics.performance.systemMetrics.memoryUsage > 0.9) score -= 10;
        
        return Math.max(0, Math.min(100, score));
    }

    getHealthStatus(score) {
        if (score >= 90) return 'excellent';
        if (score >= 75) return 'good';
        if (score >= 50) return 'degraded';
        if (score >= 25) return 'poor';
        return 'critical';
    }

    generateRecommendations(metrics, alerts) {
        const recommendations = [];
        
        if (metrics.quantum.coherenceMetrics.averageCoherence < 0.5) {
            recommendations.push({
                type: 'quantum',
                priority: 'high',
                message: 'Low quantum coherence detected. Consider reducing measurement frequency or increasing coherence time.'
            });
        }
        
        if (metrics.quantum.entanglementMetrics.entanglementDensity > 0.8) {
            recommendations.push({
                type: 'quantum',
                priority: 'medium',
                message: 'High entanglement density. Consider reviewing entanglement thresholds to prevent over-coupling.'
            });
        }
        
        if (metrics.performance.taskMetrics.taskSuccessRate < 0.9) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: 'Low task success rate. Review error patterns and resource allocation.'
            });
        }
        
        if (metrics.performance.systemMetrics.memoryUsage > 0.8) {
            recommendations.push({
                type: 'resource',
                priority: 'medium',
                message: 'High memory usage detected. Consider optimizing memory pools or adding resources.'
            });
        }
        
        if (alerts.length > 5) {
            recommendations.push({
                type: 'monitoring',
                priority: 'medium',
                message: 'Multiple active alerts detected. Review alert thresholds and system configuration.'
            });
        }
        
        return recommendations;
    }

    exportMetrics(format = 'json') {
        const metrics = this.getCurrentMetrics();
        const alerts = Array.from(this.alerts.values());
        
        const exportData = {
            timestamp: Date.now(),
            metrics: metrics,
            alerts: alerts,
            monitoring: {
                isActive: this.isMonitoring,
                interval: this.config.monitoringInterval,
                retention: this.config.metricsRetention
            }
        };
        
        if (format === 'json') {
            return JSON.stringify(exportData, null, 2);
        } else if (format === 'csv') {
            return this.convertToCSV(exportData);
        }
        
        return exportData;
    }

    convertToCSV(data) {
        return 'CSV export not implemented yet';
    }

    async shutdown() {
        await this.stopMonitoring();
        
        this.metrics.clear();
        this.alerts.clear();
        
        this.emit('shutdown');
    }
}

module.exports = { QuantumMonitor };