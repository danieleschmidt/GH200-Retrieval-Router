/**
 * Quantum Task Validator
 * Comprehensive validation for quantum-inspired task planning
 */

const Joi = require('joi');
const { logger } = require('../utils/logger');

class QuantumValidator {
    constructor() {
        this.taskSchema = this.createTaskSchema();
        this.configSchema = this.createConfigSchema();
        this.quantumStateSchema = this.createQuantumStateSchema();
    }

    createTaskSchema() {
        return Joi.object({
            id: Joi.string().uuid().optional(),
            name: Joi.string().min(1).max(255).required(),
            description: Joi.string().max(1000).optional(),
            priority: Joi.number().min(0).max(1).default(1.0),
            estimatedDuration: Joi.number().positive().optional(),
            complexity: Joi.number().min(1).max(10).default(1),
            dependencies: Joi.array().items(Joi.string().uuid()).default([]),
            resources: Joi.object({
                memory: Joi.number().min(0).max(10000).optional(),
                cpu: Joi.number().min(0).max(100).optional(),
                gpu: Joi.number().min(0).max(1000).optional(),
                network: Joi.number().min(0).max(1000).optional()
            }).optional(),
            category: Joi.string().valid(
                'computation', 'data_processing', 'network', 'storage', 'ml_inference'
            ).optional(),
            assignee: Joi.string().optional(),
            deadline: Joi.date().greater('now').optional(),
            tags: Joi.array().items(Joi.string()).max(20).optional(),
            quantumHints: Joi.object({
                expectedCoherence: Joi.number().min(0).max(1).optional(),
                expectedMeasurements: Joi.number().min(0).max(1000).optional(),
                preferredStates: Joi.array().items(Joi.string()).max(16).optional(),
                entanglementPreference: Joi.number().min(0).max(1).optional()
            }).optional(),
            requiresGPU: Joi.boolean().default(false),
            networkIntensive: Joi.boolean().default(false),
            metadata: Joi.object().optional()
        });
    }

    createConfigSchema() {
        return Joi.object({
            maxSuperpositionStates: Joi.number().integer().min(4).max(128).default(32),
            entanglementThreshold: Joi.number().min(0.1).max(0.99).default(0.8),
            coherenceTime: Joi.number().integer().min(1000).max(60000).default(10000),
            measurementInterval: Joi.number().integer().min(100).max(10000).default(1000),
            adaptiveLearning: Joi.boolean().default(true),
            quantumAnnealing: Joi.boolean().default(false),
            errorCorrection: Joi.boolean().default(true),
            decoherenceThreshold: Joi.number().min(0.01).max(0.5).default(0.1),
            maxEntanglements: Joi.number().integer().min(10).max(1000).default(100),
            coherenceDecayRate: Joi.number().min(0.01).max(0.1).default(0.02)
        });
    }

    createQuantumStateSchema() {
        return Joi.object({
            taskId: Joi.string().uuid().required(),
            superposition: Joi.array().items(
                Joi.object({
                    id: Joi.number().integer().required(),
                    name: Joi.string().required(),
                    amplitude: Joi.number().required(),
                    phase: Joi.number().required(),
                    probability: Joi.number().min(0).max(1).required(),
                    executionPath: Joi.array().items(Joi.string()).required(),
                    resources: Joi.object({
                        memory: Joi.number().min(0).required(),
                        cpu: Joi.number().min(0).required(),
                        gpu: Joi.number().min(0).required(),
                        network: Joi.number().min(0).required()
                    }).required(),
                    estimatedCompletion: Joi.number().integer().required()
                })
            ).min(1).max(128).required(),
            coherence: Joi.number().min(0).max(1).required(),
            lastMeasurement: Joi.number().integer().required(),
            collapseHistory: Joi.array().items(Joi.object()).optional(),
            entangled: Joi.boolean().default(false)
        });
    }

    validateTask(taskData) {
        const validation = this.taskSchema.validate(taskData, {
            abortEarly: false,
            allowUnknown: false,
            stripUnknown: true
        });

        if (validation.error) {
            const errors = validation.error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            logger.warn('Task validation failed', { errors, taskData });
            
            throw new ValidationError('Task validation failed', errors);
        }

        const validatedTask = validation.value;
        
        this.validateTaskLogic(validatedTask);
        
        return validatedTask;
    }

    validateTaskLogic(task) {
        const errors = [];

        if (task.deadline && task.estimatedDuration) {
            const now = Date.now();
            const timeToDeadline = task.deadline.getTime() - now;
            
            if (task.estimatedDuration > timeToDeadline) {
                errors.push({
                    field: 'estimatedDuration',
                    message: 'Estimated duration exceeds time to deadline',
                    value: { estimatedDuration: task.estimatedDuration, timeToDeadline }
                });
            }
        }

        if (task.resources) {
            const totalGPU = task.resources.gpu || 0;
            if (totalGPU > 100) {
                errors.push({
                    field: 'resources.gpu',
                    message: 'GPU requirements exceed system capacity',
                    value: totalGPU
                });
            }

            const totalMemory = task.resources.memory || 0;
            if (totalMemory > 1000) {
                errors.push({
                    field: 'resources.memory',
                    message: 'Memory requirements exceed system capacity',
                    value: totalMemory
                });
            }
        }

        if (task.dependencies && task.dependencies.length > 50) {
            errors.push({
                field: 'dependencies',
                message: 'Too many dependencies (max 50)',
                value: task.dependencies.length
            });
        }

        if (errors.length > 0) {
            throw new ValidationError('Task logic validation failed', errors);
        }
    }

    validateConfig(config) {
        const validation = this.configSchema.validate(config, {
            abortEarly: false,
            allowUnknown: true,
            stripUnknown: false
        });

        if (validation.error) {
            const errors = validation.error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            logger.warn('Config validation failed', { errors, config });
            
            throw new ValidationError('Config validation failed', errors);
        }

        return validation.value;
    }

    validateQuantumState(state) {
        const validation = this.quantumStateSchema.validate(state, {
            abortEarly: false,
            allowUnknown: false,
            stripUnknown: true
        });

        if (validation.error) {
            const errors = validation.error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            logger.warn('Quantum state validation failed', { errors, state });
            
            throw new ValidationError('Quantum state validation failed', errors);
        }

        const validatedState = validation.value;
        
        this.validateQuantumStateLogic(validatedState);
        
        return validatedState;
    }

    validateQuantumStateLogic(state) {
        const errors = [];

        const totalProbability = state.superposition.reduce(
            (sum, superState) => sum + superState.probability, 0
        );

        if (Math.abs(totalProbability - 1.0) > 0.001) {
            errors.push({
                field: 'superposition',
                message: 'Total probability must sum to 1.0',
                value: totalProbability
            });
        }

        for (const [index, superState] of state.superposition.entries()) {
            if (superState.amplitude * superState.amplitude !== superState.probability) {
                errors.push({
                    field: `superposition[${index}].probability`,
                    message: 'Probability must equal amplitude squared',
                    value: { amplitude: superState.amplitude, probability: superState.probability }
                });
            }

            if (superState.estimatedCompletion < Date.now()) {
                errors.push({
                    field: `superposition[${index}].estimatedCompletion`,
                    message: 'Estimated completion cannot be in the past',
                    value: superState.estimatedCompletion
                });
            }

            if (superState.executionPath.length === 0) {
                errors.push({
                    field: `superposition[${index}].executionPath`,
                    message: 'Execution path cannot be empty',
                    value: superState.executionPath
                });
            }
        }

        if (state.coherence < 0 || state.coherence > 1) {
            errors.push({
                field: 'coherence',
                message: 'Coherence must be between 0 and 1',
                value: state.coherence
            });
        }

        if (state.lastMeasurement > Date.now()) {
            errors.push({
                field: 'lastMeasurement',
                message: 'Last measurement cannot be in the future',
                value: state.lastMeasurement
            });
        }

        if (errors.length > 0) {
            throw new ValidationError('Quantum state logic validation failed', errors);
        }
    }

    validateEntanglement(entanglement) {
        const schema = Joi.object({
            id: Joi.string().uuid().required(),
            tasks: Joi.array().items(Joi.string().uuid()).min(2).max(2).required(),
            correlation: Joi.number().min(0).max(1).required(),
            createdAt: Joi.number().integer().required(),
            strength: Joi.number().min(0).max(1).required(),
            type: Joi.string().valid('strong', 'weak').required()
        });

        const validation = schema.validate(entanglement, {
            abortEarly: false,
            allowUnknown: false,
            stripUnknown: true
        });

        if (validation.error) {
            const errors = validation.error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            throw new ValidationError('Entanglement validation failed', errors);
        }

        return validation.value;
    }

    validateMeasurement(measurement) {
        const schema = Joi.object({
            taskId: Joi.string().uuid().required(),
            timestamp: Joi.number().integer().required(),
            collapsedTo: Joi.object({
                id: Joi.number().integer().required(),
                name: Joi.string().required(),
                amplitude: Joi.number().required(),
                probability: Joi.number().min(0).max(1).required()
            }).required(),
            previousCoherence: Joi.number().min(0).max(1).required(),
            measurement: Joi.number().integer().min(0).required()
        });

        const validation = schema.validate(measurement, {
            abortEarly: false,
            allowUnknown: false,
            stripUnknown: true
        });

        if (validation.error) {
            const errors = validation.error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            throw new ValidationError('Measurement validation failed', errors);
        }

        return validation.value;
    }

    validateSystemState(systemState) {
        const schema = Joi.object({
            totalTasks: Joi.number().integer().min(0).required(),
            activeQuantumStates: Joi.number().integer().min(0).required(),
            entanglements: Joi.number().integer().min(0).required(),
            totalMeasurements: Joi.number().integer().min(0).required(),
            averageCoherence: Joi.number().min(0).max(1).required(),
            systemEfficiency: Joi.number().min(0).max(1).required()
        });

        const validation = schema.validate(systemState, {
            abortEarly: false,
            allowUnknown: true,
            stripUnknown: false
        });

        if (validation.error) {
            const errors = validation.error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            throw new ValidationError('System state validation failed', errors);
        }

        return validation.value;
    }

    validateResourceAllocation(allocation) {
        const schema = Joi.object({
            memory: Joi.number().min(0).required(),
            cpu: Joi.number().min(0).required(),
            gpu: Joi.number().min(0).required(),
            network: Joi.number().min(0).required(),
            peaks: Joi.object().required(),
            distribution: Joi.array().items(
                Joi.object({
                    batchId: Joi.array().items(Joi.string().uuid()).required(),
                    resources: Joi.object({
                        memory: Joi.number().min(0).required(),
                        cpu: Joi.number().min(0).required(),
                        gpu: Joi.number().min(0).required(),
                        network: Joi.number().min(0).required()
                    }).required()
                })
            ).required()
        });

        const validation = schema.validate(allocation, {
            abortEarly: false,
            allowUnknown: true,
            stripUnknown: false
        });

        if (validation.error) {
            const errors = validation.error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            throw new ValidationError('Resource allocation validation failed', errors);
        }

        return validation.value;
    }

    sanitizeTaskInput(input) {
        if (typeof input !== 'object' || input === null) {
            throw new ValidationError('Task input must be an object', []);
        }

        const sanitized = { ...input };

        if (sanitized.name && typeof sanitized.name === 'string') {
            sanitized.name = sanitized.name.trim().substring(0, 255);
        }

        if (sanitized.description && typeof sanitized.description === 'string') {
            sanitized.description = sanitized.description.trim().substring(0, 1000);
        }

        if (sanitized.tags && Array.isArray(sanitized.tags)) {
            sanitized.tags = sanitized.tags
                .filter(tag => typeof tag === 'string')
                .map(tag => tag.trim())
                .slice(0, 20);
        }

        if (sanitized.dependencies && Array.isArray(sanitized.dependencies)) {
            sanitized.dependencies = sanitized.dependencies
                .filter(dep => typeof dep === 'string' && this.isValidUUID(dep))
                .slice(0, 50);
        }

        if (sanitized.priority && typeof sanitized.priority === 'number') {
            sanitized.priority = Math.max(0, Math.min(1, sanitized.priority));
        }

        return sanitized;
    }

    isValidUUID(str) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }

    validateCircularDependencies(tasks) {
        const graph = new Map();
        const visited = new Set();
        const recursionStack = new Set();

        for (const task of tasks) {
            graph.set(task.id, task.dependencies || []);
        }

        const hasCycle = (taskId) => {
            if (recursionStack.has(taskId)) {
                return true;
            }

            if (visited.has(taskId)) {
                return false;
            }

            visited.add(taskId);
            recursionStack.add(taskId);

            const dependencies = graph.get(taskId) || [];
            for (const depId of dependencies) {
                if (hasCycle(depId)) {
                    return true;
                }
            }

            recursionStack.delete(taskId);
            return false;
        };

        for (const taskId of graph.keys()) {
            if (!visited.has(taskId)) {
                if (hasCycle(taskId)) {
                    throw new ValidationError('Circular dependency detected', [
                        { field: 'dependencies', message: 'Circular dependency detected', value: taskId }
                    ]);
                }
            }
        }

        return true;
    }

    validateResourceConstraints(tasks, systemLimits) {
        const totalResources = { memory: 0, cpu: 0, gpu: 0, network: 0 };
        const errors = [];

        for (const task of tasks) {
            if (task.resources) {
                totalResources.memory += task.resources.memory || 0;
                totalResources.cpu += task.resources.cpu || 0;
                totalResources.gpu += task.resources.gpu || 0;
                totalResources.network += task.resources.network || 0;
            }
        }

        for (const [resource, total] of Object.entries(totalResources)) {
            const limit = systemLimits[resource];
            if (limit && total > limit) {
                errors.push({
                    field: `resources.${resource}`,
                    message: `Total ${resource} requirements exceed system limit`,
                    value: { required: total, available: limit }
                });
            }
        }

        if (errors.length > 0) {
            throw new ValidationError('Resource constraint validation failed', errors);
        }

        return true;
    }

    createSafeExecutionContext() {
        return {
            maxExecutionTime: 300000, // 5 minutes
            maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
            allowedOperations: [
                'quantum_measurement',
                'state_collapse',
                'entanglement_creation',
                'coherence_maintenance',
                'optimization_adaptation'
            ],
            restrictedOperations: [
                'file_system_access',
                'network_access',
                'process_execution',
                'system_calls'
            ],
            sandboxEnabled: true
        };
    }
}

class ValidationError extends Error {
    constructor(message, errors) {
        super(message);
        this.name = 'ValidationError';
        this.errors = errors;
        this.timestamp = Date.now();
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            errors: this.errors,
            timestamp: this.timestamp
        };
    }
}

module.exports = { QuantumValidator, ValidationError };