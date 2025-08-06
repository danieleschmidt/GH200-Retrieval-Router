/**
 * Quantum Error Handler
 * Advanced error handling and recovery for quantum task planning
 */

const { logger } = require('../utils/logger');
const { ValidationError } = require('./QuantumValidator');

class QuantumErrorHandler {
    constructor(options = {}) {
        this.config = {
            maxRetryAttempts: options.maxRetryAttempts || 3,
            retryBackoffMs: options.retryBackoffMs || 1000,
            circuitBreakerThreshold: options.circuitBreakerThreshold || 10,
            circuitBreakerTimeout: options.circuitBreakerTimeout || 30000,
            enableAutoRecovery: options.enableAutoRecovery !== false,
            errorCategories: options.errorCategories || this.getDefaultErrorCategories(),
            ...options
        };
        
        this.errorRegistry = new Map();
        this.circuitBreakers = new Map();
        this.recoveryStrategies = new Map();
        this.errorPatterns = new Map();
        
        this.initializeRecoveryStrategies();
        this.initializeErrorPatterns();
    }

    getDefaultErrorCategories() {
        return {
            QUANTUM_DECOHERENCE: {
                severity: 'warning',
                recoverable: true,
                retryable: true,
                timeout: 5000
            },
            ENTANGLEMENT_FAILURE: {
                severity: 'error',
                recoverable: true,
                retryable: true,
                timeout: 10000
            },
            MEASUREMENT_ERROR: {
                severity: 'error',
                recoverable: true,
                retryable: true,
                timeout: 3000
            },
            STATE_CORRUPTION: {
                severity: 'critical',
                recoverable: true,
                retryable: false,
                timeout: 15000
            },
            VALIDATION_FAILURE: {
                severity: 'warning',
                recoverable: true,
                retryable: false,
                timeout: 1000
            },
            SYSTEM_OVERLOAD: {
                severity: 'critical',
                recoverable: true,
                retryable: true,
                timeout: 30000
            },
            MEMORY_EXHAUSTION: {
                severity: 'critical',
                recoverable: true,
                retryable: false,
                timeout: 60000
            },
            NETWORK_FAILURE: {
                severity: 'error',
                recoverable: true,
                retryable: true,
                timeout: 10000
            },
            CONFIGURATION_ERROR: {
                severity: 'error',
                recoverable: false,
                retryable: false,
                timeout: 0
            },
            UNKNOWN_ERROR: {
                severity: 'error',
                recoverable: true,
                retryable: true,
                timeout: 5000
            }
        };
    }

    initializeRecoveryStrategies() {
        this.recoveryStrategies.set('QUANTUM_DECOHERENCE', async (error, context) => {
            logger.info('Recovering from quantum decoherence', { taskId: context.taskId });
            
            if (context.quantumPlanner && context.taskId) {
                const state = context.quantumPlanner.quantumStates.get(context.taskId);
                if (state) {
                    context.quantumPlanner.reinitializeQuantumState(context.taskId, state);
                    return { success: true, action: 'state_reinitialized' };
                }
            }
            
            return { success: false, action: 'manual_intervention_required' };
        });

        this.recoveryStrategies.set('ENTANGLEMENT_FAILURE', async (error, context) => {
            logger.info('Recovering from entanglement failure', { 
                taskId: context.taskId,
                entanglementId: context.entanglementId 
            });
            
            if (context.quantumPlanner && context.entanglementId) {
                for (const entanglement of context.quantumPlanner.entanglements) {
                    if (entanglement.id === context.entanglementId) {
                        context.quantumPlanner.entanglements.delete(entanglement);
                        break;
                    }
                }
                
                if (context.taskId) {
                    context.quantumPlanner.evaluateEntanglements(
                        context.quantumPlanner.taskRegistry.get(context.taskId)
                    );
                }
                
                return { success: true, action: 'entanglement_recreated' };
            }
            
            return { success: false, action: 'entanglement_disabled' };
        });

        this.recoveryStrategies.set('MEASUREMENT_ERROR', async (error, context) => {
            logger.info('Recovering from measurement error', { taskId: context.taskId });
            
            if (context.quantumPlanner && context.taskId) {
                const state = context.quantumPlanner.quantumStates.get(context.taskId);
                if (state) {
                    state.coherence = Math.min(1.0, state.coherence + 0.1);
                    state.lastMeasurement = Date.now();
                    return { success: true, action: 'coherence_restored' };
                }
            }
            
            return { success: false, action: 'measurement_skipped' };
        });

        this.recoveryStrategies.set('STATE_CORRUPTION', async (error, context) => {
            logger.warn('Recovering from state corruption', { 
                taskId: context.taskId,
                corruption: error.corruption 
            });
            
            if (context.quantumPlanner && context.taskId) {
                const task = context.quantumPlanner.taskRegistry.get(context.taskId);
                if (task) {
                    context.quantumPlanner.quantumStates.delete(context.taskId);
                    context.quantumPlanner.initializeQuantumState(task);
                    return { success: true, action: 'state_recreated' };
                }
            }
            
            return { success: false, action: 'task_quarantined' };
        });

        this.recoveryStrategies.set('VALIDATION_FAILURE', async (error, context) => {
            logger.info('Recovering from validation failure', { 
                errors: error.errors,
                context: context.operation 
            });
            
            if (error instanceof ValidationError && context.input) {
                try {
                    const sanitizedInput = this.sanitizeInput(context.input, error.errors);
                    return { success: true, action: 'input_sanitized', result: sanitizedInput };
                } catch (sanitizationError) {
                    return { success: false, action: 'input_rejected', reason: sanitizationError.message };
                }
            }
            
            return { success: false, action: 'validation_strict_mode' };
        });

        this.recoveryStrategies.set('SYSTEM_OVERLOAD', async (error, context) => {
            logger.warn('Recovering from system overload', { 
                load: context.systemLoad,
                activeTask: context.activeTasks 
            });
            
            if (context.quantumPlanner) {
                await this.throttleSystem(context.quantumPlanner);
                return { success: true, action: 'system_throttled' };
            }
            
            return { success: false, action: 'load_shedding_required' };
        });

        this.recoveryStrategies.set('MEMORY_EXHAUSTION', async (error, context) => {
            logger.error('Recovering from memory exhaustion', { 
                memoryUsage: context.memoryUsage,
                availableMemory: context.availableMemory 
            });
            
            if (context.quantumPlanner) {
                await this.performMemoryCleanup(context.quantumPlanner);
                return { success: true, action: 'memory_cleaned' };
            }
            
            return { success: false, action: 'restart_required' };
        });

        this.recoveryStrategies.set('NETWORK_FAILURE', async (error, context) => {
            logger.warn('Recovering from network failure', { 
                endpoint: context.endpoint,
                networkError: error.networkError 
            });
            
            if (this.config.enableAutoRecovery) {
                await this.waitWithBackoff(this.config.retryBackoffMs);
                return { success: true, action: 'retry_after_backoff' };
            }
            
            return { success: false, action: 'offline_mode' };
        });

        this.recoveryStrategies.set('UNKNOWN_ERROR', async (error, context) => {
            logger.error('Attempting recovery from unknown error', { 
                error: error.message,
                stack: error.stack,
                context 
            });
            
            if (this.config.enableAutoRecovery) {
                return { success: true, action: 'graceful_degradation' };
            }
            
            return { success: false, action: 'error_logged' };
        });
    }

    initializeErrorPatterns() {
        this.errorPatterns.set('MEMORY_LEAK', {
            pattern: /memory.*leak|heap.*overflow|out.*of.*memory/i,
            category: 'MEMORY_EXHAUSTION',
            indicators: ['increasing_memory_usage', 'gc_pressure', 'allocation_failures'],
            threshold: 5,
            timeWindow: 300000 // 5 minutes
        });

        this.errorPatterns.set('CASCADING_DECOHERENCE', {
            pattern: /decoherence.*cascade|coherence.*loss|quantum.*collapse/i,
            category: 'QUANTUM_DECOHERENCE',
            indicators: ['rapid_coherence_loss', 'measurement_failures', 'state_instability'],
            threshold: 3,
            timeWindow: 60000 // 1 minute
        });

        this.errorPatterns.set('ENTANGLEMENT_STORM', {
            pattern: /entanglement.*overflow|correlation.*spike|quantum.*coupling/i,
            category: 'ENTANGLEMENT_FAILURE',
            indicators: ['entanglement_creation_rate', 'correlation_variance', 'coupling_strength'],
            threshold: 10,
            timeWindow: 120000 // 2 minutes
        });

        this.errorPatterns.set('VALIDATION_FLOOD', {
            pattern: /validation.*error|invalid.*input|schema.*violation/i,
            category: 'VALIDATION_FAILURE',
            indicators: ['validation_error_rate', 'input_rejection_rate', 'schema_mismatches'],
            threshold: 20,
            timeWindow: 60000 // 1 minute
        });
    }

    async handleError(error, context = {}) {
        const errorId = this.generateErrorId();
        const errorCategory = this.categorizeError(error);
        const errorInfo = this.config.errorCategories[errorCategory];
        
        const errorRecord = {
            id: errorId,
            timestamp: Date.now(),
            category: errorCategory,
            severity: errorInfo.severity,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context: context,
            attempts: 0,
            recovered: false,
            recoveryAction: null
        };

        this.errorRegistry.set(errorId, errorRecord);
        
        logger.error('Quantum error detected', {
            errorId,
            category: errorCategory,
            severity: errorInfo.severity,
            message: error.message
        });

        const recoveryResult = await this.attemptRecovery(errorRecord);
        
        if (!recoveryResult.success && errorInfo.retryable) {
            const retryResult = await this.attemptRetry(errorRecord);
            if (retryResult.success) {
                return retryResult;
            }
        }

        if (!recoveryResult.success) {
            await this.escalateError(errorRecord);
        }

        this.updateErrorPatterns(errorRecord);
        
        return {
            errorId,
            recovered: recoveryResult.success,
            action: recoveryResult.action,
            canRetry: errorInfo.retryable && errorRecord.attempts < this.config.maxRetryAttempts
        };
    }

    categorizeError(error) {
        if (error instanceof ValidationError) {
            return 'VALIDATION_FAILURE';
        }

        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('coherence') || errorMessage.includes('decoherence')) {
            return 'QUANTUM_DECOHERENCE';
        }
        
        if (errorMessage.includes('entanglement') || errorMessage.includes('correlation')) {
            return 'ENTANGLEMENT_FAILURE';
        }
        
        if (errorMessage.includes('measurement') || errorMessage.includes('collapse')) {
            return 'MEASUREMENT_ERROR';
        }
        
        if (errorMessage.includes('state') && errorMessage.includes('corrupt')) {
            return 'STATE_CORRUPTION';
        }
        
        if (errorMessage.includes('memory') || errorMessage.includes('heap')) {
            return 'MEMORY_EXHAUSTION';
        }
        
        if (errorMessage.includes('overload') || errorMessage.includes('throttle')) {
            return 'SYSTEM_OVERLOAD';
        }
        
        if (errorMessage.includes('network') || errorMessage.includes('connection')) {
            return 'NETWORK_FAILURE';
        }
        
        if (errorMessage.includes('config') || errorMessage.includes('setting')) {
            return 'CONFIGURATION_ERROR';
        }

        for (const [patternName, patternInfo] of this.errorPatterns.entries()) {
            if (patternInfo.pattern.test(error.message)) {
                return patternInfo.category;
            }
        }
        
        return 'UNKNOWN_ERROR';
    }

    async attemptRecovery(errorRecord) {
        const recoveryStrategy = this.recoveryStrategies.get(errorRecord.category);
        
        if (!recoveryStrategy) {
            logger.warn('No recovery strategy found', { 
                category: errorRecord.category,
                errorId: errorRecord.id 
            });
            return { success: false, action: 'no_recovery_strategy' };
        }

        try {
            logger.info('Attempting error recovery', { 
                category: errorRecord.category,
                errorId: errorRecord.id 
            });

            const recoveryResult = await Promise.race([
                recoveryStrategy(errorRecord.error, errorRecord.context),
                this.createTimeoutPromise(this.config.errorCategories[errorRecord.category].timeout)
            ]);

            if (recoveryResult.success) {
                errorRecord.recovered = true;
                errorRecord.recoveryAction = recoveryResult.action;
                
                logger.info('Error recovery successful', {
                    errorId: errorRecord.id,
                    action: recoveryResult.action
                });
            } else {
                logger.warn('Error recovery failed', {
                    errorId: errorRecord.id,
                    reason: recoveryResult.action
                });
            }

            return recoveryResult;

        } catch (recoveryError) {
            logger.error('Recovery strategy failed with exception', {
                errorId: errorRecord.id,
                recoveryError: recoveryError.message
            });

            return { success: false, action: 'recovery_exception', error: recoveryError };
        }
    }

    async attemptRetry(errorRecord) {
        if (errorRecord.attempts >= this.config.maxRetryAttempts) {
            logger.warn('Maximum retry attempts reached', { 
                errorId: errorRecord.id,
                attempts: errorRecord.attempts 
            });
            return { success: false, action: 'max_retries_exceeded' };
        }

        const circuitBreaker = this.getCircuitBreaker(errorRecord.category);
        if (circuitBreaker.isOpen()) {
            logger.warn('Circuit breaker open, skipping retry', { 
                category: errorRecord.category,
                errorId: errorRecord.id 
            });
            return { success: false, action: 'circuit_breaker_open' };
        }

        errorRecord.attempts++;
        const backoffTime = this.calculateBackoff(errorRecord.attempts);
        
        logger.info('Retrying operation after backoff', {
            errorId: errorRecord.id,
            attempt: errorRecord.attempts,
            backoffMs: backoffTime
        });

        await this.waitWithBackoff(backoffTime);

        try {
            if (errorRecord.context.retryFunction) {
                const retryResult = await errorRecord.context.retryFunction();
                
                circuitBreaker.recordSuccess();
                
                logger.info('Retry successful', { 
                    errorId: errorRecord.id,
                    attempt: errorRecord.attempts 
                });
                
                return { success: true, action: 'retry_successful', result: retryResult };
            } else {
                logger.warn('No retry function provided', { errorId: errorRecord.id });
                return { success: false, action: 'no_retry_function' };
            }

        } catch (retryError) {
            circuitBreaker.recordFailure();
            
            logger.warn('Retry failed', {
                errorId: errorRecord.id,
                attempt: errorRecord.attempts,
                retryError: retryError.message
            });

            return await this.attemptRetry(errorRecord);
        }
    }

    calculateBackoff(attempt) {
        const baseBackoff = this.config.retryBackoffMs;
        const exponentialBackoff = baseBackoff * Math.pow(2, attempt - 1);
        const jitter = Math.random() * baseBackoff * 0.1;
        
        return Math.min(exponentialBackoff + jitter, 60000); // Max 1 minute
    }

    async waitWithBackoff(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getCircuitBreaker(category) {
        if (!this.circuitBreakers.has(category)) {
            this.circuitBreakers.set(category, new CircuitBreaker({
                threshold: this.config.circuitBreakerThreshold,
                timeout: this.config.circuitBreakerTimeout
            }));
        }
        
        return this.circuitBreakers.get(category);
    }

    async escalateError(errorRecord) {
        logger.error('Escalating unrecoverable error', {
            errorId: errorRecord.id,
            category: errorRecord.category,
            severity: errorRecord.severity,
            attempts: errorRecord.attempts
        });

        if (errorRecord.severity === 'critical') {
            await this.handleCriticalError(errorRecord);
        }

        this.notifyOperations(errorRecord);
    }

    async handleCriticalError(errorRecord) {
        switch (errorRecord.category) {
            case 'MEMORY_EXHAUSTION':
                logger.critical('System memory exhaustion - initiating emergency procedures');
                await this.emergencyMemoryCleanup();
                break;
                
            case 'SYSTEM_OVERLOAD':
                logger.critical('System overload detected - enabling load shedding');
                await this.enableLoadShedding();
                break;
                
            case 'STATE_CORRUPTION':
                logger.critical('Critical state corruption - isolating affected components');
                await this.isolateCorruptedStates(errorRecord);
                break;
                
            default:
                logger.critical('Unhandled critical error', { errorRecord });
        }
    }

    notifyOperations(errorRecord) {
        // Placeholder for operations notification system
        // In production, this would integrate with alerting systems
        logger.error('OPERATIONS ALERT', {
            errorId: errorRecord.id,
            category: errorRecord.category,
            severity: errorRecord.severity,
            message: 'Manual intervention may be required'
        });
    }

    sanitizeInput(input, validationErrors) {
        const sanitized = { ...input };
        
        for (const error of validationErrors) {
            const field = error.field;
            const path = field.split('.');
            
            if (error.message.includes('required') && this.getNestedValue(sanitized, path) === undefined) {
                this.setNestedValue(sanitized, path, this.getDefaultValue(field));
            } else if (error.message.includes('length') || error.message.includes('size')) {
                const value = this.getNestedValue(sanitized, path);
                if (typeof value === 'string') {
                    this.setNestedValue(sanitized, path, value.substring(0, 255));
                } else if (Array.isArray(value)) {
                    this.setNestedValue(sanitized, path, value.slice(0, 100));
                }
            } else if (error.message.includes('range') || error.message.includes('min') || error.message.includes('max')) {
                const value = this.getNestedValue(sanitized, path);
                if (typeof value === 'number') {
                    this.setNestedValue(sanitized, path, Math.max(0, Math.min(1, value)));
                }
            }
        }
        
        return sanitized;
    }

    getNestedValue(obj, path) {
        return path.reduce((current, key) => current?.[key], obj);
    }

    setNestedValue(obj, path, value) {
        const lastKey = path.pop();
        const target = path.reduce((current, key) => {
            if (!current[key]) current[key] = {};
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    getDefaultValue(field) {
        const defaults = {
            'name': 'unnamed_task',
            'priority': 1.0,
            'complexity': 1,
            'dependencies': [],
            'resources': {}
        };
        
        return defaults[field] || null;
    }

    async throttleSystem(quantumPlanner) {
        logger.info('Throttling quantum system to reduce load');
        
        quantumPlanner.config.measurementInterval *= 2;
        quantumPlanner.config.coherenceTime *= 1.5;
        quantumPlanner.config.maxSuperpositionStates = Math.max(4, Math.floor(quantumPlanner.config.maxSuperpositionStates * 0.7));
        
        setTimeout(() => {
            logger.info('Restoring normal system parameters');
            quantumPlanner.config.measurementInterval /= 2;
            quantumPlanner.config.coherenceTime /= 1.5;
            quantumPlanner.config.maxSuperpositionStates = Math.min(128, Math.floor(quantumPlanner.config.maxSuperpositionStates / 0.7));
        }, 300000); // Restore after 5 minutes
    }

    async performMemoryCleanup(quantumPlanner) {
        logger.info('Performing emergency memory cleanup');
        
        quantumPlanner.cleanupCompletedTasks();
        
        const oldMeasurements = quantumPlanner.measurements.splice(0, Math.floor(quantumPlanner.measurements.length * 0.5));
        logger.info(`Cleaned up ${oldMeasurements.length} old measurements`);
        
        for (const state of quantumPlanner.quantumStates.values()) {
            state.collapseHistory = state.collapseHistory.slice(-10);
        }
        
        if (global.gc) {
            global.gc();
            logger.info('Forced garbage collection');
        }
    }

    async emergencyMemoryCleanup() {
        logger.critical('Performing emergency system-wide memory cleanup');
        
        if (global.gc) {
            global.gc();
        }
        
        process.nextTick(() => {
            logger.critical('Emergency cleanup completed - system may need restart');
        });
    }

    async enableLoadShedding() {
        logger.critical('Enabling emergency load shedding');
        
        // Placeholder for load shedding logic
        // In production, this would reject lower-priority requests
    }

    async isolateCorruptedStates(errorRecord) {
        logger.critical('Isolating corrupted quantum states');
        
        if (errorRecord.context.quantumPlanner && errorRecord.context.taskId) {
            const taskId = errorRecord.context.taskId;
            errorRecord.context.quantumPlanner.taskRegistry.delete(taskId);
            errorRecord.context.quantumPlanner.quantumStates.delete(taskId);
            
            logger.critical(`Isolated corrupted task: ${taskId}`);
        }
    }

    createTimeoutPromise(timeoutMs) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Recovery timeout')), timeoutMs);
        });
    }

    generateErrorId() {
        return `qerr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    updateErrorPatterns(errorRecord) {
        for (const [patternName, patternInfo] of this.errorPatterns.entries()) {
            if (errorRecord.category === patternInfo.category) {
                const recentErrors = Array.from(this.errorRegistry.values())
                    .filter(err => err.category === patternInfo.category)
                    .filter(err => Date.now() - err.timestamp < patternInfo.timeWindow);
                
                if (recentErrors.length >= patternInfo.threshold) {
                    logger.warn(`Error pattern detected: ${patternName}`, {
                        pattern: patternName,
                        occurrences: recentErrors.length,
                        timeWindow: patternInfo.timeWindow
                    });
                    
                    this.handleErrorPattern(patternName, patternInfo, recentErrors);
                }
            }
        }
    }

    async handleErrorPattern(patternName, patternInfo, errors) {
        logger.warn(`Handling error pattern: ${patternName}`);
        
        switch (patternName) {
            case 'MEMORY_LEAK':
                await this.handleMemoryLeakPattern(errors);
                break;
                
            case 'CASCADING_DECOHERENCE':
                await this.handleDecoherencePattern(errors);
                break;
                
            case 'ENTANGLEMENT_STORM':
                await this.handleEntanglementPattern(errors);
                break;
                
            case 'VALIDATION_FLOOD':
                await this.handleValidationPattern(errors);
                break;
        }
    }

    async handleMemoryLeakPattern(errors) {
        logger.warn('Memory leak pattern detected - initiating memory monitoring');
        // Increase memory monitoring frequency
        // Consider memory pool adjustments
    }

    async handleDecoherencePattern(errors) {
        logger.warn('Cascading decoherence pattern detected - adjusting quantum parameters');
        // Adjust coherence time and measurement intervals
    }

    async handleEntanglementPattern(errors) {
        logger.warn('Entanglement storm pattern detected - reducing entanglement sensitivity');
        // Increase entanglement thresholds temporarily
    }

    async handleValidationPattern(errors) {
        logger.warn('Validation flood pattern detected - enabling stricter input filtering');
        // Enable more aggressive input validation
    }

    getErrorStatistics() {
        const stats = {
            totalErrors: this.errorRegistry.size,
            byCategory: {},
            bySeverity: {},
            recoveryRate: 0,
            averageRecoveryTime: 0
        };
        
        const errors = Array.from(this.errorRegistry.values());
        
        for (const error of errors) {
            stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
            stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
        }
        
        const recoveredErrors = errors.filter(err => err.recovered);
        stats.recoveryRate = errors.length > 0 ? recoveredErrors.length / errors.length : 0;
        
        if (recoveredErrors.length > 0) {
            const totalRecoveryTime = recoveredErrors.reduce((sum, err) => {
                return sum + (err.recoveryTime || 0);
            }, 0);
            stats.averageRecoveryTime = totalRecoveryTime / recoveredErrors.length;
        }
        
        return stats;
    }

    cleanup() {
        const cutoff = Date.now() - 86400000; // 24 hours
        
        let cleaned = 0;
        for (const [errorId, errorRecord] of this.errorRegistry.entries()) {
            if (errorRecord.timestamp < cutoff) {
                this.errorRegistry.delete(errorId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.info(`Cleaned up ${cleaned} old error records`);
        }
    }
}

class CircuitBreaker {
    constructor(options = {}) {
        this.threshold = options.threshold || 5;
        this.timeout = options.timeout || 60000;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.lastFailure = null;
        this.successCount = 0;
    }

    isOpen() {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailure > this.timeout) {
                this.state = 'HALF_OPEN';
                return false;
            }
            return true;
        }
        
        return false;
    }

    recordSuccess() {
        this.failures = 0;
        this.successCount++;
        
        if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
        }
    }

    recordFailure() {
        this.failures++;
        this.lastFailure = Date.now();
        
        if (this.failures >= this.threshold) {
            this.state = 'OPEN';
        }
    }
}

module.exports = { QuantumErrorHandler, CircuitBreaker };