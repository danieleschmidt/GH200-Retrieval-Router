/**
 * Comprehensive test suite for QuantumTaskPlanner
 */

const { QuantumTaskPlanner } = require('../../../src/quantum/QuantumTaskPlanner');

describe('QuantumTaskPlanner', () => {
    let quantumPlanner;

    beforeEach(() => {
        quantumPlanner = new QuantumTaskPlanner({
            maxSuperpositionStates: 16,
            entanglementThreshold: 0.8,
            coherenceTime: 10000,
            measurementInterval: 1000
        });
    });

    afterEach(async () => {
        if (quantumPlanner) {
            await quantumPlanner.shutdown();
        }
    });

    describe('initialization', () => {
        test('should initialize with default configuration', async () => {
            const planner = new QuantumTaskPlanner();
            expect(planner.config.maxSuperpositionStates).toBe(32);
            expect(planner.config.entanglementThreshold).toBe(0.8);
            expect(planner.config.coherenceTime).toBe(10000);
            expect(planner.config.measurementInterval).toBe(1000);
        });

        test('should initialize with custom configuration', () => {
            expect(quantumPlanner.config.maxSuperpositionStates).toBe(16);
            expect(quantumPlanner.config.entanglementThreshold).toBe(0.8);
        });

        test('should initialize quantum components', async () => {
            await quantumPlanner.initialize();
            expect(quantumPlanner.isInitialized).toBe(true);
            expect(quantumPlanner.taskRegistry).toBeDefined();
            expect(quantumPlanner.quantumStates).toBeDefined();
            expect(quantumPlanner.entanglements).toBeDefined();
        });

        test('should emit initialized event', async () => {
            const initializePromise = new Promise(resolve => {
                quantumPlanner.once('initialized', resolve);
            });
            
            await quantumPlanner.initialize();
            await initializePromise;
        });

        test('should not initialize twice', async () => {
            await quantumPlanner.initialize();
            expect(quantumPlanner.isInitialized).toBe(true);
            
            await quantumPlanner.initialize(); // Second call
            expect(quantumPlanner.isInitialized).toBe(true);
        });
    });

    describe('task creation', () => {
        beforeEach(async () => {
            await quantumPlanner.initialize();
        });

        test('should create task with quantum properties', () => {
            const taskData = {
                name: 'Test Task',
                priority: 0.8,
                complexity: 5
            };

            const task = quantumPlanner.createTask(taskData);

            expect(task).toHaveProperty('id');
            expect(task.name).toBe('Test Task');
            expect(task.priority).toBe(0.8);
            expect(task.complexity).toBe(5);
            expect(task.status).toBe('superposition');
            expect(task.quantum).toHaveProperty('amplitude');
            expect(task.quantum).toHaveProperty('phase');
            expect(task.quantum).toHaveProperty('entangled');
        });

        test('should initialize quantum state for task', () => {
            const taskData = { name: 'Test Task' };
            const task = quantumPlanner.createTask(taskData);
            
            const quantumState = quantumPlanner.quantumStates.get(task.id);
            expect(quantumState).toBeDefined();
            expect(quantumState.taskId).toBe(task.id);
            expect(quantumState.superposition).toBeInstanceOf(Array);
            expect(quantumState.coherence).toBe(1.0);
        });

        test('should generate superposition states', () => {
            const taskData = { name: 'Test Task', complexity: 3 };
            const task = quantumPlanner.createTask(taskData);
            
            const quantumState = quantumPlanner.quantumStates.get(task.id);
            const superposition = quantumState.superposition;
            
            expect(superposition.length).toBeGreaterThan(0);
            expect(superposition.length).toBeLessThanOrEqual(16);
            
            const totalProbability = superposition.reduce((sum, state) => sum + state.probability, 0);
            expect(totalProbability).toBeCloseTo(1.0, 2);
            
            superposition.forEach(state => {
                expect(state).toHaveProperty('id');
                expect(state).toHaveProperty('name');
                expect(state).toHaveProperty('amplitude');
                expect(state).toHaveProperty('phase');
                expect(state).toHaveProperty('probability');
                expect(state).toHaveProperty('executionPath');
                expect(state).toHaveProperty('resources');
            });
        });

        test('should emit taskCreated event', () => {
            const eventPromise = new Promise(resolve => {
                quantumPlanner.once('taskCreated', resolve);
            });
            
            const task = quantumPlanner.createTask({ name: 'Test Task' });
            
            return eventPromise.then(emittedTask => {
                expect(emittedTask.id).toBe(task.id);
            });
        });

        test('should handle task with dependencies', () => {
            const parentTask = quantumPlanner.createTask({ name: 'Parent Task' });
            const childTask = quantumPlanner.createTask({ 
                name: 'Child Task',
                dependencies: [parentTask.id]
            });

            expect(childTask.dependencies).toContain(parentTask.id);
        });
    });

    describe('quantum entanglement', () => {
        beforeEach(async () => {
            await quantumPlanner.initialize();
        });

        test('should create entanglement between correlated tasks', () => {
            const task1 = quantumPlanner.createTask({
                name: 'Task 1',
                category: 'computation',
                assignee: 'user1'
            });

            const task2 = quantumPlanner.createTask({
                name: 'Task 2',
                category: 'computation',
                assignee: 'user1'
            });

            // Check if entanglement was created (correlation should be high due to same category and assignee)
            const hasEntanglement = Array.from(quantumPlanner.entanglements)
                .some(e => e.tasks.includes(task1.id) && e.tasks.includes(task2.id));

            expect(hasEntanglement).toBe(true);
        });

        test('should calculate task correlation correctly', () => {
            const task1 = {
                id: 'task1',
                category: 'computation',
                assignee: 'user1',
                dependencies: [],
                resources: { memory: 100, cpu: 50 }
            };

            const task2 = {
                id: 'task2',
                category: 'computation',
                assignee: 'user1',
                dependencies: [],
                resources: { memory: 120, cpu: 45 }
            };

            const correlation = quantumPlanner.calculateTaskCorrelation(task1, task2);
            expect(correlation).toBeGreaterThan(0.5); // Should be high due to same category and assignee
        });

        test('should emit entanglementCreated event', () => {
            const eventPromise = new Promise(resolve => {
                quantumPlanner.once('entanglementCreated', resolve);
            });
            
            quantumPlanner.createTask({
                name: 'Task 1',
                category: 'computation',
                assignee: 'user1'
            });

            quantumPlanner.createTask({
                name: 'Task 2',
                category: 'computation',
                assignee: 'user1'
            });

            return eventPromise;
        });
    });

    describe('quantum measurements', () => {
        beforeEach(async () => {
            await quantumPlanner.initialize();
        });

        test('should perform quantum measurement', async () => {
            const task = quantumPlanner.createTask({ name: 'Test Task' });
            const state = quantumPlanner.quantumStates.get(task.id);
            
            const measurement = await quantumPlanner.measureQuantumState(task.id, state);
            
            expect(measurement).toHaveProperty('taskId', task.id);
            expect(measurement).toHaveProperty('timestamp');
            expect(measurement).toHaveProperty('collapsedTo');
            expect(measurement).toHaveProperty('previousCoherence');
        });

        test('should collapse wavefunction to valid state', () => {
            const superposition = [
                { id: 0, name: 'state1', probability: 0.3 },
                { id: 1, name: 'state2', probability: 0.5 },
                { id: 2, name: 'state3', probability: 0.2 }
            ];

            const collapsedState = quantumPlanner.collapseWavefunction({ superposition });
            
            expect(['state1', 'state2', 'state3']).toContain(collapsedState.name);
        });

        test('should update task status after measurement', async () => {
            const task = quantumPlanner.createTask({ name: 'Test Task' });
            const state = quantumPlanner.quantumStates.get(task.id);
            
            await quantumPlanner.measureQuantumState(task.id, state);
            
            const updatedTask = quantumPlanner.taskRegistry.get(task.id);
            expect(['planning', 'executing', 'optimizing', 'completed']).toContain(updatedTask.status);
        });

        test('should emit measurementComplete event', async () => {
            const task = quantumPlanner.createTask({ name: 'Test Task' });
            
            // Wait for automatic measurement
            const measurementPromise = new Promise(resolve => {
                quantumPlanner.once('measurementComplete', resolve);
            });

            // Trigger measurement manually
            await quantumPlanner.performQuantumMeasurement();

            const measurements = await measurementPromise;
            expect(Array.isArray(measurements)).toBe(true);
        });
    });

    describe('coherence maintenance', () => {
        beforeEach(async () => {
            await quantumPlanner.initialize();
        });

        test('should maintain coherence over time', async () => {
            const task = quantumPlanner.createTask({ name: 'Test Task' });
            const state = quantumPlanner.quantumStates.get(task.id);
            
            const initialCoherence = state.coherence;
            
            // Simulate time passing
            state.lastMeasurement = Date.now() - 30000; // 30 seconds ago
            
            quantumPlanner.maintainCoherence();
            
            expect(state.coherence).toBeLessThan(initialCoherence);
        });

        test('should reinitialize quantum state when coherence is too low', () => {
            const task = quantumPlanner.createTask({ name: 'Test Task' });
            const state = quantumPlanner.quantumStates.get(task.id);
            
            // Force low coherence
            state.coherence = 0.05;
            
            quantumPlanner.maintainCoherence();
            
            // Should have been reinitialized
            expect(state.coherence).toBeGreaterThan(0.1); // Reinitialized to higher coherence
        });

        test('should cleanup completed tasks', () => {
            const task = quantumPlanner.createTask({ name: 'Test Task' });
            
            // Mark task as completed and old
            task.status = 'completed';
            task.updatedAt = Date.now() - 120000; // 2 minutes ago
            
            quantumPlanner.maintainCoherence();
            
            // Task should be cleaned up
            expect(quantumPlanner.taskRegistry.has(task.id)).toBe(false);
            expect(quantumPlanner.quantumStates.has(task.id)).toBe(false);
        });
    });

    describe('adaptive learning', () => {
        beforeEach(async () => {
            await quantumPlanner.initialize();
        });

        test('should adapt from measurements when enabled', async () => {
            quantumPlanner.config.adaptiveLearning = true;
            
            // Create multiple measurements indicating frequent collapse
            const measurements = Array.from({ length: 25 }, (_, i) => ({
                taskId: `task${i}`,
                timestamp: Date.now() - i * 1000,
                previousCoherence: 0.2, // Low coherence
                collapsedTo: { name: 'planning' }
            }));
            
            quantumPlanner.measurements.push(...measurements);
            
            const initialCoherenceTime = quantumPlanner.config.coherenceTime;
            
            await quantumPlanner.adaptFromMeasurements(measurements);
            
            // Should have increased coherence time due to frequent collapse
            expect(quantumPlanner.config.coherenceTime).toBeGreaterThan(initialCoherenceTime);
        });

        test('should analyze measurement patterns correctly', () => {
            const measurements = Array.from({ length: 30 }, () => ({
                previousCoherence: Math.random() < 0.7 ? 0.2 : 0.8 // 70% low coherence
            }));
            
            quantumPlanner.measurements = measurements;
            
            const patterns = quantumPlanner.analyzeMeasurementPatterns(measurements);
            
            expect(patterns).toHaveProperty('frequentCollapse');
            expect(patterns.frequentCollapse).toBe(true);
        });
    });

    describe('execution planning', () => {
        beforeEach(async () => {
            await quantumPlanner.initialize();
        });

        test('should generate optimal execution plan', () => {
            // Create tasks with different priorities and dependencies
            const task1 = quantumPlanner.createTask({
                name: 'High Priority Task',
                priority: 0.9,
                estimatedDuration: 5000
            });

            const task2 = quantumPlanner.createTask({
                name: 'Dependent Task',
                priority: 0.7,
                dependencies: [task1.id],
                estimatedDuration: 3000
            });

            const task3 = quantumPlanner.createTask({
                name: 'Independent Task',
                priority: 0.6,
                estimatedDuration: 2000
            });

            const plan = quantumPlanner.getOptimalExecutionPlan();

            expect(plan).toHaveProperty('totalTasks', 3);
            expect(plan).toHaveProperty('highPriorityTasks');
            expect(plan).toHaveProperty('parallelBatches');
            expect(plan).toHaveProperty('criticalPath');
            expect(plan).toHaveProperty('resourceAllocation');
            expect(plan).toHaveProperty('estimatedCompletion');

            // High priority task should be first
            expect(plan.highPriorityTasks[0].id).toBe(task1.id);
        });

        test('should identify parallel batches correctly', () => {
            const task1 = quantumPlanner.createTask({
                name: 'Task 1',
                resources: { memory: 100, cpu: 50 }
            });

            const task2 = quantumPlanner.createTask({
                name: 'Task 2',
                resources: { memory: 200, cpu: 30 }
            });

            const task3 = quantumPlanner.createTask({
                name: 'Task 3',
                dependencies: [task1.id]
            });

            const tasks = [task1, task2, task3];
            const batches = quantumPlanner.identifyParallelBatches(tasks);

            expect(batches).toBeInstanceOf(Array);
            expect(batches.length).toBeGreaterThan(0);
            
            // task1 and task2 should be in the same batch (no dependencies)
            // task3 should be in a different batch (depends on task1)
            const firstBatch = batches[0];
            expect(firstBatch.some(task => task.id === task1.id)).toBe(true);
        });

        test('should calculate critical path', () => {
            const task1 = quantumPlanner.createTask({
                name: 'Task 1',
                estimatedDuration: 5000
            });

            const task2 = quantumPlanner.createTask({
                name: 'Task 2',
                dependencies: [task1.id],
                estimatedDuration: 3000
            });

            const task3 = quantumPlanner.createTask({
                name: 'Task 3',
                dependencies: [task2.id],
                estimatedDuration: 2000
            });

            const tasks = [task1, task2, task3];
            const criticalPath = quantumPlanner.calculateCriticalPath(tasks);

            expect(criticalPath).toBeInstanceOf(Array);
            expect(criticalPath).toContain(task1.id);
            expect(criticalPath).toContain(task2.id);
            expect(criticalPath).toContain(task3.id);
        });
    });

    describe('metrics and monitoring', () => {
        beforeEach(async () => {
            await quantumPlanner.initialize();
        });

        test('should provide system metrics', () => {
            quantumPlanner.createTask({ name: 'Task 1' });
            quantumPlanner.createTask({ name: 'Task 2' });

            const metrics = quantumPlanner.getMetrics();

            expect(metrics).toHaveProperty('totalTasks', 2);
            expect(metrics).toHaveProperty('activeQuantumStates', 2);
            expect(metrics).toHaveProperty('entanglements');
            expect(metrics).toHaveProperty('totalMeasurements', 0);
            expect(metrics).toHaveProperty('averageCoherence');
            expect(metrics).toHaveProperty('systemEfficiency');
        });

        test('should calculate average coherence', () => {
            const task1 = quantumPlanner.createTask({ name: 'Task 1' });
            const task2 = quantumPlanner.createTask({ name: 'Task 2' });

            // Modify coherence values
            quantumPlanner.quantumStates.get(task1.id).coherence = 0.8;
            quantumPlanner.quantumStates.get(task2.id).coherence = 0.6;

            const averageCoherence = quantumPlanner.calculateAverageCoherence();
            expect(averageCoherence).toBeCloseTo(0.7, 1);
        });

        test('should calculate system efficiency', () => {
            const task1 = quantumPlanner.createTask({ name: 'Task 1' });
            
            // Mark task as completed with timing
            task1.status = 'completed';
            task1.completedAt = task1.createdAt + 3000;
            task1.estimatedDuration = 5000;

            const efficiency = quantumPlanner.calculateSystemEfficiency();
            expect(efficiency).toBeGreaterThan(0);
            expect(efficiency).toBeLessThanOrEqual(1);
        });
    });

    describe('error handling', () => {
        beforeEach(async () => {
            await quantumPlanner.initialize();
        });

        test('should handle invalid task creation gracefully', () => {
            expect(() => {
                quantumPlanner.createTask(null);
            }).toThrow('Task data must be a valid object');
            
            expect(() => {
                quantumPlanner.createTask({});
            }).toThrow('Task name is required and must be a string');
        });

        test('should handle measurement on non-existent task', async () => {
            const result = await quantumPlanner.measureQuantumState('non-existent-id', null);
            expect(result).toBeNull();
        });

        test('should handle empty superposition gracefully', () => {
            const emptySuper = { superposition: [] };
            const result = quantumPlanner.collapseWavefunction(emptySuper);
            expect(result).toBeUndefined();
        });
    });

    describe('shutdown', () => {
        beforeEach(async () => {
            await quantumPlanner.initialize();
        });

        test('should shutdown gracefully', async () => {
            const task = quantumPlanner.createTask({ name: 'Test Task' });
            
            await quantumPlanner.shutdown();
            
            expect(quantumPlanner.isInitialized).toBe(false);
            expect(quantumPlanner.taskRegistry.size).toBe(0);
            expect(quantumPlanner.quantumStates.size).toBe(0);
            expect(quantumPlanner.entanglements.size).toBe(0);
        });

        test('should emit shutdown event', async () => {
            const shutdownPromise = new Promise(resolve => {
                quantumPlanner.once('shutdown', resolve);
            });
            
            await quantumPlanner.shutdown();
            await shutdownPromise;
        });

        test('should clear all timers', async () => {
            expect(quantumPlanner.measurementTimer).toBeDefined();
            expect(quantumPlanner.coherenceTimer).toBeDefined();
            
            await quantumPlanner.shutdown();
            
            expect(quantumPlanner.measurementTimer).toBeNull();
            expect(quantumPlanner.coherenceTimer).toBeNull();
        });
    });

    describe('edge cases and performance', () => {
        beforeEach(async () => {
            await quantumPlanner.initialize();
        });

        test('should handle large number of tasks', () => {
            const startTime = Date.now();
            const taskCount = 1000;
            
            for (let i = 0; i < taskCount; i++) {
                quantumPlanner.createTask({
                    name: `Task ${i}`,
                    priority: Math.random()
                });
            }
            
            const endTime = Date.now();
            const creationTime = endTime - startTime;
            
            expect(quantumPlanner.taskRegistry.size).toBe(taskCount);
            expect(creationTime).toBeLessThan(5000); // Should create 1000 tasks in under 5 seconds
        });

        test('should handle circular dependencies detection', () => {
            const task1 = quantumPlanner.createTask({ name: 'Task 1' });
            const task2 = quantumPlanner.createTask({ name: 'Task 2', dependencies: [task1.id] });
            
            // Try to create circular dependency
            task1.dependencies = [task2.id];
            
            const plan = quantumPlanner.getOptimalExecutionPlan();
            
            // Should not crash and provide a valid plan
            expect(plan).toBeDefined();
            expect(plan.totalTasks).toBe(2);
        });

        test('should maintain performance with many entanglements', () => {
            const tasks = [];
            
            // Create tasks with high correlation to force many entanglements
            for (let i = 0; i < 50; i++) {
                tasks.push(quantumPlanner.createTask({
                    name: `Task ${i}`,
                    category: 'computation',
                    assignee: 'user1',
                    priority: 0.8
                }));
            }
            
            const entanglementCount = quantumPlanner.entanglements.size;
            expect(entanglementCount).toBeGreaterThan(0);
            
            // Should still be able to get metrics quickly
            const startTime = Date.now();
            const metrics = quantumPlanner.getMetrics();
            const metricsTime = Date.now() - startTime;
            
            expect(metricsTime).toBeLessThan(100); // Should get metrics in under 100ms
            expect(metrics.entanglements).toBe(entanglementCount);
        });

        test('should handle task priority edge cases', () => {
            const task1 = quantumPlanner.createTask({ name: 'Task 1', priority: 0 });
            const task2 = quantumPlanner.createTask({ name: 'Task 2', priority: 1 });
            const task3 = quantumPlanner.createTask({ name: 'Task 3', priority: -1 }); // Invalid
            const task4 = quantumPlanner.createTask({ name: 'Task 4', priority: 2 }); // Invalid
            
            expect(task1.priority).toBe(0);
            expect(task2.priority).toBe(1);
            expect(task3.priority).toBe(-1); // Should be allowed but handled gracefully
            expect(task4.priority).toBe(2); // Should be allowed but handled gracefully
        });
    });
});