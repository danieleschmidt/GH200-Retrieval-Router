/**
 * Quantum-Inspired Task Planner
 * Implements quantum superposition and entanglement principles for task optimization
 */

const EventEmitter = require('eventemitter3');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

class QuantumTaskPlanner extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Validate configuration early
        if (options.maxSuperpositionStates !== undefined && 
            (options.maxSuperpositionStates < 1 || options.maxSuperpositionStates > 128)) {
            throw new Error('maxSuperpositionStates must be between 1 and 128');
        }
        
        if (options.entanglementThreshold !== undefined && 
            (options.entanglementThreshold < 0 || options.entanglementThreshold > 1)) {
            throw new Error('entanglementThreshold must be between 0 and 1');
        }
        
        if (options.coherenceTime !== undefined && 
            (options.coherenceTime < 100 || options.coherenceTime > 3600000)) {
            throw new Error('coherenceTime must be between 100ms and 1 hour');
        }
        
        this.config = {
            maxSuperpositionStates: options.maxSuperpositionStates || 32,
            entanglementThreshold: options.entanglementThreshold || 0.8,
            coherenceTime: options.coherenceTime || 10000,
            measurementInterval: options.measurementInterval || 1000,
            adaptiveLearning: options.adaptiveLearning !== false,
            ...options
        };
        
        this.taskRegistry = new Map();
        this.quantumStates = new Map();
        this.entanglements = new Set();
        this.measurements = [];
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;
        
        try {
            logger.info('Initializing Quantum Task Planner', {
                maxSuperpositionStates: this.config.maxSuperpositionStates,
                entanglementThreshold: this.config.entanglementThreshold
            });
            
            // Validate configuration
            if (this.config.maxSuperpositionStates < 1 || this.config.maxSuperpositionStates > 128) {
                throw new Error('maxSuperpositionStates must be between 1 and 128');
            }
            
            if (this.config.entanglementThreshold < 0 || this.config.entanglementThreshold > 1) {
                throw new Error('entanglementThreshold must be between 0 and 1');
            }
            
            if (this.config.coherenceTime < 100 || this.config.coherenceTime > 3600000) {
                throw new Error('coherenceTime must be between 100ms and 1 hour');
            }
            
            // Initialize timers with error handling
            this.measurementTimer = setInterval(() => {
                this.performQuantumMeasurement().catch(error => {
                    logger.error('Measurement timer error', { error: error.message });
                });
            }, this.config.measurementInterval);
            
            this.coherenceTimer = setInterval(() => {
                try {
                    this.maintainCoherence();
                } catch (error) {
                    logger.error('Coherence maintenance error', { error: error.message });
                }
            }, this.config.coherenceTime / 4);
            
            this.isInitialized = true;
            this.emit('initialized');
            
            logger.info('Quantum Task Planner initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize Quantum Task Planner', { 
                error: error.message 
            });
            this.isInitialized = false;
            throw error;
        }
    }

    createTask(taskData) {
        try {
            // Input validation
            if (!taskData || typeof taskData !== 'object') {
                throw new Error('Task data must be a valid object');
            }
            
            if (!taskData.name || typeof taskData.name !== 'string') {
                throw new Error('Task name is required and must be a string');
            }
            
            if (taskData.dependencies && !Array.isArray(taskData.dependencies)) {
                throw new Error('Task dependencies must be an array');
            }
            
            // Validate priority range
            if (taskData.priority !== undefined && (taskData.priority < -10 || taskData.priority > 10)) {
                logger.warn('Task priority out of recommended range [-10, 10], clamping', { 
                    priority: taskData.priority 
                });
                taskData.priority = Math.max(-10, Math.min(10, taskData.priority));
            }
            
            const taskId = uuidv4();
            const task = {
                id: taskId,
                ...taskData,
                createdAt: Date.now(),
                status: 'superposition',
                priority: taskData.priority !== undefined ? taskData.priority : 1.0,
                dependencies: taskData.dependencies || [],
                quantum: {
                    amplitude: Math.random(),
                    phase: Math.random() * 2 * Math.PI,
                    entangled: false,
                    measurements: 0
                }
            };
            
            // Check for circular dependencies
            if (this.hasCircularDependency(task)) {
                throw new Error(`Circular dependency detected for task: ${task.name}`);
            }
            
            this.taskRegistry.set(taskId, task);
            this.initializeQuantumState(task);
            
            logger.debug('Created quantum task', { taskId, task: task.name });
            this.emit('taskCreated', task);
            
            return task;
            
        } catch (error) {
            logger.error('Failed to create quantum task', { 
                error: error.message, 
                taskData: taskData?.name || 'unknown' 
            });
            throw error;
        }
    }

    initializeQuantumState(task) {
        const state = {
            taskId: task.id,
            superposition: this.generateSuperpositionStates(task),
            coherence: 1.0,
            lastMeasurement: Date.now(),
            collapseHistory: []
        };
        
        this.quantumStates.set(task.id, state);
        this.evaluateEntanglements(task);
    }

    generateSuperpositionStates(task) {
        const states = [];
        const baseStates = ['planning', 'executing', 'optimizing', 'completed'];
        
        for (let i = 0; i < Math.min(this.config.maxSuperpositionStates, 16); i++) {
            const amplitude = Math.random();
            const phase = Math.random() * 2 * Math.PI;
            
            states.push({
                id: i,
                name: baseStates[i % baseStates.length] + `_variant_${i}`,
                amplitude: amplitude * Math.cos(phase),
                phase: phase,
                probability: amplitude * amplitude,
                executionPath: this.generateExecutionPath(task, i),
                resources: this.calculateResourceRequirements(task, amplitude),
                estimatedCompletion: Date.now() + (Math.random() * 10000)
            });
        }
        
        return this.normalizeAmplitudes(states);
    }

    generateExecutionPath(task, variant) {
        const basePath = ['initialize', 'validate', 'execute', 'monitor', 'finalize'];
        const variations = [
            ['pre_optimize', 'initialize', 'parallel_execute', 'aggregate', 'finalize'],
            ['initialize', 'branch_execute', 'merge', 'validate', 'finalize'],
            ['lazy_initialize', 'stream_execute', 'continuous_monitor', 'adaptive_finalize'],
            ['batch_initialize', 'vectorized_execute', 'reduce', 'finalize']
        ];
        
        return variations[variant % variations.length] || basePath;
    }

    calculateResourceRequirements(task, amplitude) {
        return {
            memory: Math.ceil(amplitude * 1000) * (task.complexity || 1),
            cpu: Math.ceil(amplitude * 100) * (task.priority || 1),
            gpu: task.requiresGPU ? Math.ceil(amplitude * 500) : 0,
            network: Math.ceil(amplitude * 50) * (task.networkIntensive ? 2 : 1)
        };
    }

    normalizeAmplitudes(states) {
        const totalProbability = states.reduce((sum, state) => sum + state.probability, 0);
        
        return states.map(state => ({
            ...state,
            amplitude: state.amplitude / Math.sqrt(totalProbability),
            probability: state.probability / totalProbability
        }));
    }

    evaluateEntanglements(newTask) {
        // Performance-optimized entanglement evaluation
        const taskCount = this.taskRegistry.size;
        const maxEvaluations = Math.min(taskCount, this.getOptimalEvaluationLimit(taskCount));
        
        // Use batch processing for large task sets
        if (taskCount > 1000) {
            this.batchEvaluateEntanglements(newTask, maxEvaluations);
        } else {
            this.standardEvaluateEntanglements(newTask, maxEvaluations);
        }
    }
    
    getOptimalEvaluationLimit(taskCount) {
        if (taskCount < 100) return taskCount;
        if (taskCount < 1000) return 200;
        return Math.min(500, Math.floor(taskCount * 0.1)); // 10% sampling for large sets
    }
    
    standardEvaluateEntanglements(newTask, maxEvaluations) {
        let evaluations = 0;
        
        for (const [existingTaskId, existingTask] of this.taskRegistry) {
            if (existingTaskId === newTask.id) continue;
            if (evaluations++ >= maxEvaluations) break;
            
            const correlation = this.calculateTaskCorrelation(newTask, existingTask);
            
            if (correlation >= this.config.entanglementThreshold) {
                this.createEntanglement(newTask.id, existingTaskId, correlation);
            }
        }
    }
    
    batchEvaluateEntanglements(newTask, maxEvaluations) {
        const tasks = Array.from(this.taskRegistry.values())
            .filter(task => task.id !== newTask.id);
        
        // Sample tasks for performance - prioritize recent and similar tasks
        const recentTasks = tasks.slice(-200); // Most recent 200 tasks
        const similarCategoryTasks = tasks.filter(t => 
            t.category === newTask.category && !recentTasks.includes(t)
        ).slice(0, 100);
        
        const candidateTasks = [...recentTasks, ...similarCategoryTasks]
            .slice(0, maxEvaluations);
        
        for (const existingTask of candidateTasks) {
            const correlation = this.calculateTaskCorrelation(newTask, existingTask);
            
            if (correlation >= this.config.entanglementThreshold) {
                this.createEntanglement(newTask.id, existingTask.id, correlation);
            }
        }
    }

    calculateTaskCorrelation(task1, task2) {
        let correlation = 0;
        
        // Ensure dependencies are arrays
        const deps1 = task1.dependencies || [];
        const deps2 = task2.dependencies || [];
        
        if (deps1.includes(task2.id) || deps2.includes(task1.id)) {
            correlation += 0.4;
        }
        
        if (task1.category === task2.category) {
            correlation += 0.4; // Higher weight for same category
        }
        
        if (task1.assignee === task2.assignee) {
            correlation += 0.4; // Higher weight for same assignee  
        }
        
        const resourceOverlap = this.calculateResourceOverlap(task1, task2);
        correlation += resourceOverlap * 0.2;
        
        return Math.min(correlation, 1.0);
    }

    calculateResourceOverlap(task1, task2) {
        const resources1 = task1.resources || {};
        const resources2 = task2.resources || {};
        
        let overlap = 0;
        const resourceTypes = ['memory', 'cpu', 'gpu', 'network'];
        
        for (const resource of resourceTypes) {
            const r1 = resources1[resource] || 0;
            const r2 = resources2[resource] || 0;
            
            if (r1 > 0 && r2 > 0) {
                overlap += Math.min(r1, r2) / Math.max(r1, r2);
            }
        }
        
        return overlap / resourceTypes.length;
    }

    createEntanglement(taskId1, taskId2, correlation) {
        const entanglement = {
            id: uuidv4(),
            tasks: [taskId1, taskId2],
            correlation: correlation,
            createdAt: Date.now(),
            strength: correlation,
            type: correlation > 0.9 ? 'strong' : 'weak'
        };
        
        this.entanglements.add(entanglement);
        
        const state1 = this.quantumStates.get(taskId1);
        const state2 = this.quantumStates.get(taskId2);
        
        if (state1) state1.entangled = true;
        if (state2) state2.entangled = true;
        
        logger.debug('Created quantum entanglement', {
            tasks: [taskId1, taskId2],
            correlation: correlation
        });
        
        // Emit entanglement event asynchronously to prevent blocking
        setImmediate(() => this.emit('entanglementCreated', entanglement));
        
        return entanglement;
    }

    async performQuantumMeasurement() {
        const measurements = [];
        const errors = [];
        const measurementStartTime = Date.now();
        
        try {
            // Use Array.from to avoid iterator invalidation during measurement
            const states = Array.from(this.quantumStates.entries());
            
            // Process measurements in controlled batches to prevent resource exhaustion
            const batchSize = Math.min(10, states.length);
            
            for (let i = 0; i < states.length; i += batchSize) {
                const batch = states.slice(i, i + batchSize);
                
                const batchPromises = batch.map(async ([taskId, state]) => {
                    try {
                        if (this.shouldMeasure(state)) {
                            const measurement = await this.measureQuantumState(taskId, state);
                            if (measurement) {
                                return { type: 'measurement', data: measurement };
                            }
                        }
                        return null;
                    } catch (error) {
                        logger.warn('Failed to measure quantum state', { 
                            taskId, 
                            error: error.message 
                        });
                        
                        // Attempt recovery for corrupted quantum state
                        try {
                            this.reinitializeQuantumState(taskId, state);
                            logger.info('Recovered quantum state after measurement error', { taskId });
                        } catch (recoveryError) {
                            logger.error('Failed to recover quantum state', { 
                                taskId, 
                                recoveryError: recoveryError.message 
                            });
                        }
                        
                        return { type: 'error', data: { taskId, error: error.message } };
                    }
                });
                
                // Process batch with timeout
                const batchResults = await Promise.allSettled(batchPromises);
                
                for (const result of batchResults) {
                    if (result.status === 'fulfilled' && result.value) {
                        if (result.value.type === 'measurement') {
                            measurements.push(result.value.data);
                        } else if (result.value.type === 'error') {
                            errors.push(result.value.data);
                        }
                    }
                }
                
                // Add small delay between batches to prevent overwhelming
                if (i + batchSize < states.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            if (measurements.length > 0) {
                // Limit measurement history to prevent memory leaks
                this.measurements.push(...measurements);
                if (this.measurements.length > 1000) {
                    this.measurements.splice(0, this.measurements.length - 1000);
                }
                
                this.emit('measurementComplete', measurements);
                
                if (this.config.adaptiveLearning) {
                    try {
                        await this.adaptFromMeasurements(measurements);
                    } catch (adaptationError) {
                        logger.error('Failed to adapt from measurements', { 
                            error: adaptationError.message 
                        });
                    }
                }
            }
            
            if (errors.length > 0) {
                this.emit('measurementErrors', errors);
            }
            
            // Log performance metrics
            const measurementDuration = Date.now() - measurementStartTime;
            if (measurementDuration > 5000) {
                logger.warn('Quantum measurement cycle took too long', { 
                    duration: measurementDuration,
                    statesCount: states.length,
                    measurementsCount: measurements.length
                });
            }
            
        } catch (error) {
            logger.error('Critical error in quantum measurement process', { 
                error: error.message,
                duration: Date.now() - measurementStartTime
            });
            this.emit('criticalError', error);
            throw error;
        }
    }

    shouldMeasure(state) {
        const timeSinceLastMeasurement = Date.now() - state.lastMeasurement;
        const coherenceDecay = Math.exp(-timeSinceLastMeasurement / this.config.coherenceTime);
        
        return coherenceDecay < 0.7 || Math.random() < 0.1;
    }

    async measureQuantumState(taskId, state) {
        const task = this.taskRegistry.get(taskId);
        if (!task) return null;
        
        const collapsedState = this.collapseWavefunction(state);
        const measurement = {
            taskId: taskId,
            timestamp: Date.now(),
            collapsedTo: collapsedState,
            previousCoherence: state.coherence,
            measurement: state.collapseHistory.length
        };
        
        state.collapseHistory.push(measurement);
        state.lastMeasurement = Date.now();
        state.coherence = Math.random() * 0.5 + 0.5;
        
        task.status = collapsedState.name.split('_')[0];
        task.quantum.measurements++;
        
        this.updateEntangledStates(taskId, measurement);
        
        logger.debug('Quantum measurement performed', {
            taskId: taskId,
            collapsedTo: collapsedState.name,
            coherence: state.coherence
        });
        
        return measurement;
    }

    collapseWavefunction(state) {
        const random = Math.random();
        let cumulativeProbability = 0;
        
        for (const superpositionState of state.superposition) {
            cumulativeProbability += superpositionState.probability;
            if (random <= cumulativeProbability) {
                return superpositionState;
            }
        }
        
        return state.superposition[state.superposition.length - 1];
    }

    updateEntangledStates(measuredTaskId, measurement) {
        for (const entanglement of this.entanglements) {
            if (entanglement.tasks.includes(measuredTaskId)) {
                const otherTaskId = entanglement.tasks.find(id => id !== measuredTaskId);
                const otherState = this.quantumStates.get(otherTaskId);
                
                if (otherState) {
                    this.applyEntanglementEffect(otherState, measurement, entanglement.correlation);
                }
            }
        }
    }

    applyEntanglementEffect(state, measurement, correlation) {
        const effectStrength = correlation * 0.3;
        
        state.superposition.forEach(superState => {
            if (superState.name.includes(measurement.collapsedTo.name.split('_')[0])) {
                superState.amplitude += effectStrength;
                superState.probability = superState.amplitude * superState.amplitude;
            }
        });
        
        state.superposition = this.normalizeAmplitudes(state.superposition);
        state.coherence = Math.max(0.1, state.coherence - effectStrength * 0.1);
    }

    maintainCoherence() {
        for (const [taskId, state] of this.quantumStates) {
            const timeSinceLastMeasurement = Date.now() - state.lastMeasurement;
            const coherenceDecay = Math.exp(-timeSinceLastMeasurement / this.config.coherenceTime);
            
            // Ensure coherence decreases over time even if small amounts
            const minDecay = 0.95; // Always decay by at least 5%
            state.coherence *= Math.min(coherenceDecay, minDecay);
            
            if (state.coherence < 0.1) {
                this.reinitializeQuantumState(taskId, state);
            }
        }
        
        this.cleanupCompletedTasks();
    }

    reinitializeQuantumState(taskId, state) {
        const task = this.taskRegistry.get(taskId);
        if (task && task.status !== 'completed') {
            state.superposition = this.generateSuperpositionStates(task);
            state.coherence = 0.8; // Don't fully reset to allow observable coherence decay
            state.lastMeasurement = Date.now();
            
            logger.debug('Reinitialized quantum state due to decoherence', { taskId });
        }
    }

    cleanupCompletedTasks() {
        for (const [taskId, task] of this.taskRegistry) {
            if (task.status === 'completed' && Date.now() - task.updatedAt > 60000) {
                this.taskRegistry.delete(taskId);
                this.quantumStates.delete(taskId);
                
                for (const entanglement of this.entanglements) {
                    if (entanglement.tasks.includes(taskId)) {
                        this.entanglements.delete(entanglement);
                    }
                }
            }
        }
    }

    async adaptFromMeasurements(measurements) {
        const patterns = this.analyzeMeasurementPatterns(measurements);
        
        if (patterns.frequentCollapse) {
            this.config.coherenceTime *= 1.1;
            logger.debug('Increased coherence time due to frequent collapse');
        }
        
        if (patterns.lowEfficiency) {
            this.config.maxSuperpositionStates = Math.max(8, this.config.maxSuperpositionStates - 2);
            logger.debug('Reduced superposition states due to low efficiency');
        }
        
        if (patterns.highCorrelation) {
            this.config.entanglementThreshold *= 0.95;
            logger.debug('Lowered entanglement threshold due to high correlation');
        }
    }

    analyzeMeasurementPatterns(measurements) {
        const recentMeasurements = measurements.length > 0 ? measurements : this.measurements.slice(-100);
        
        return {
            frequentCollapse: recentMeasurements.filter(m => m.previousCoherence && m.previousCoherence < 0.3).length > Math.max(1, recentMeasurements.length * 0.2),
            lowEfficiency: this.calculateAverageTaskCompletion() < 0.6,
            highCorrelation: this.calculateAverageCorrelation() > 0.8
        };
    }

    calculateAverageTaskCompletion() {
        const completedTasks = Array.from(this.taskRegistry.values())
            .filter(task => task.status === 'completed');
        
        if (completedTasks.length === 0) return 0;
        
        return completedTasks.length / this.taskRegistry.size;
    }

    calculateAverageCorrelation() {
        if (this.entanglements.size === 0) return 0;
        
        const totalCorrelation = Array.from(this.entanglements)
            .reduce((sum, ent) => sum + ent.correlation, 0);
        
        return totalCorrelation / this.entanglements.size;
    }

    getOptimalExecutionPlan() {
        const plan = {
            totalTasks: this.taskRegistry.size,
            highPriorityTasks: [],
            parallelBatches: [],
            criticalPath: [],
            resourceAllocation: {},
            estimatedCompletion: 0
        };
        
        const tasks = Array.from(this.taskRegistry.values());
        
        plan.highPriorityTasks = tasks
            .filter(task => task.priority > 0.8)
            .sort((a, b) => b.priority - a.priority);
        
        plan.parallelBatches = this.identifyParallelBatches(tasks);
        plan.criticalPath = this.calculateCriticalPath(tasks);
        plan.resourceAllocation = this.optimizeResourceAllocation(tasks);
        plan.estimatedCompletion = this.estimateCompletionTime(plan);
        
        return plan;
    }

    hasCircularDependency(newTask) {
        const visited = new Set();
        const recursionStack = new Set();
        
        const hasCycle = (taskId) => {
            if (recursionStack.has(taskId)) return true;
            if (visited.has(taskId)) return false;
            
            visited.add(taskId);
            recursionStack.add(taskId);
            
            const task = this.taskRegistry.get(taskId);
            if (task) {
                for (const depId of task.dependencies || []) {
                    if (hasCycle(depId)) return true;
                }
            }
            
            // Check if new task creates a cycle
            if (taskId === newTask.id) {
                for (const depId of newTask.dependencies || []) {
                    if (hasCycle(depId)) return true;
                }
            }
            
            recursionStack.delete(taskId);
            return false;
        };
        
        // Check if adding new task creates cycles
        for (const depId of newTask.dependencies || []) {
            if (hasCycle(depId)) return true;
        }
        
        return false;
    }

    identifyParallelBatches(tasks) {
        const batches = [];
        const processed = new Set();
        
        for (const task of tasks) {
            if (processed.has(task.id)) continue;
            
            const batch = [task];
            processed.add(task.id);
            
            for (const otherTask of tasks) {
                if (processed.has(otherTask.id)) continue;
                
                const canRunInParallel = !this.hasResourceConflict(task, otherTask) &&
                                       !this.hasDependencyConflict(task, otherTask);
                
                if (canRunInParallel) {
                    batch.push(otherTask);
                    processed.add(otherTask.id);
                }
            }
            
            batches.push(batch);
        }
        
        return batches;
    }

    hasResourceConflict(task1, task2) {
        const r1 = task1.resources || {};
        const r2 = task2.resources || {};
        
        return (r1.gpu || 0) + (r2.gpu || 0) > 100 ||
               (r1.memory || 0) + (r2.memory || 0) > 1000;
    }

    hasDependencyConflict(task1, task2) {
        return task1.dependencies.includes(task2.id) ||
               task2.dependencies.includes(task1.id);
    }

    calculateCriticalPath(tasks) {
        const criticalPath = [];
        let maxDuration = 0;
        
        const findLongestPath = (task, currentPath, currentDuration) => {
            if (currentDuration > maxDuration) {
                maxDuration = currentDuration;
                criticalPath.splice(0, criticalPath.length, ...currentPath, task.id);
            }
            
            // Find dependent tasks (tasks that depend on this one)
            const dependentTasks = tasks.filter(t => 
                (t.dependencies || []).includes(task.id)
            );
            
            for (const depTask of dependentTasks) {
                findLongestPath(
                    depTask, 
                    [...currentPath, task.id], 
                    currentDuration + (task.estimatedDuration || 1000)
                );
            }
        };
        
        // Start with tasks that have no dependencies (roots)
        const rootTasks = tasks.filter(task => 
            !task.dependencies || task.dependencies.length === 0
        );
        
        for (const rootTask of rootTasks) {
            findLongestPath(rootTask, [], 0);
        }
        
        // If no critical path found, include all task IDs
        if (criticalPath.length === 0) {
            return tasks.map(t => t.id);
        }
        
        return criticalPath;
    }

    buildDependencyGraph(tasks) {
        const graph = new Map();
        
        for (const task of tasks) {
            graph.set(task.id, task.dependencies);
        }
        
        return graph;
    }

    optimizeResourceAllocation(tasks) {
        const allocation = {
            memory: 0,
            cpu: 0,
            gpu: 0,
            network: 0,
            peaks: {},
            distribution: []
        };
        
        const batches = this.identifyParallelBatches(tasks);
        
        for (const batch of batches) {
            const batchResources = batch.reduce((sum, task) => {
                const res = task.resources || {};
                return {
                    memory: sum.memory + (res.memory || 0),
                    cpu: sum.cpu + (res.cpu || 0),
                    gpu: sum.gpu + (res.gpu || 0),
                    network: sum.network + (res.network || 0)
                };
            }, { memory: 0, cpu: 0, gpu: 0, network: 0 });
            
            allocation.memory = Math.max(allocation.memory, batchResources.memory);
            allocation.cpu = Math.max(allocation.cpu, batchResources.cpu);
            allocation.gpu = Math.max(allocation.gpu, batchResources.gpu);
            allocation.network = Math.max(allocation.network, batchResources.network);
            
            allocation.distribution.push({
                batchId: batch.map(t => t.id),
                resources: batchResources
            });
        }
        
        return allocation;
    }

    estimateCompletionTime(plan) {
        let totalTime = 0;
        
        for (const batch of plan.parallelBatches) {
            const batchTime = Math.max(...batch.map(task => {
                const state = this.quantumStates.get(task.id);
                if (!state) return task.estimatedDuration || 1000;
                
                const mostProbableState = state.superposition.reduce((max, s) => 
                    s.probability > max.probability ? s : max);
                
                return mostProbableState.estimatedCompletion - Date.now();
            }));
            
            totalTime += Math.max(0, batchTime);
        }
        
        return totalTime;
    }

    async shutdown() {
        if (!this.isInitialized) {
            return;
        }
        
        logger.info('Shutting down Quantum Task Planner');
        
        try {
            // Clear timers first to prevent new operations
            if (this.measurementTimer) {
                clearInterval(this.measurementTimer);
                this.measurementTimer = null;
            }
            
            if (this.coherenceTimer) {
                clearInterval(this.coherenceTimer);
                this.coherenceTimer = null;
            }
            
            // Wait a brief moment for any in-flight operations to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Clear data structures
            this.taskRegistry.clear();
            this.quantumStates.clear();
            this.entanglements.clear();
            this.measurements.length = 0;
            
            this.isInitialized = false;
            this.emit('shutdown');
            
            logger.info('Quantum Task Planner shutdown complete');
            
        } catch (error) {
            logger.error('Error during Quantum Task Planner shutdown', { 
                error: error.message 
            });
            throw error;
        }
    }

    getMetrics() {
        return {
            totalTasks: this.taskRegistry.size,
            activeQuantumStates: this.quantumStates.size,
            entanglements: this.entanglements.size,
            totalMeasurements: this.measurements.length,
            averageCoherence: this.calculateAverageCoherence(),
            systemEfficiency: this.calculateSystemEfficiency()
        };
    }

    calculateAverageCoherence() {
        if (this.quantumStates.size === 0) return 0;
        
        const totalCoherence = Array.from(this.quantumStates.values())
            .reduce((sum, state) => sum + state.coherence, 0);
        
        return totalCoherence / this.quantumStates.size;
    }

    calculateSystemEfficiency() {
        const completedTasks = Array.from(this.taskRegistry.values())
            .filter(task => task.status === 'completed');
        
        if (completedTasks.length === 0) return 0;
        
        const averageCompletionTime = completedTasks.reduce((sum, task) => {
            return sum + (task.completedAt - task.createdAt);
        }, 0) / completedTasks.length;
        
        const averageEstimatedTime = completedTasks.reduce((sum, task) => {
            return sum + (task.estimatedDuration || 5000);
        }, 0) / completedTasks.length;
        
        return Math.min(1.0, averageEstimatedTime / averageCompletionTime);
    }
}

module.exports = { QuantumTaskPlanner };