#!/usr/bin/env node
/**
 * GH200 Retrieval Router - Quantum Task Planning Demo
 * Demonstrates the core quantum-inspired task planning system
 */

const { initializeRouter, shutdownRouter } = require('./src/index');
const { logger } = require('./src/utils/logger');

async function runDemo() {
    // Suppress Winston transport warnings for demo
    process.env.NODE_ENV = 'test';
    
    console.log('🚀 Starting GH200 Retrieval Router Quantum Demo');
    
    try {
        // Initialize the quantum system
        logger.info('Initializing quantum-enhanced retrieval router...');
        const router = await initializeRouter({
            quantumPlanning: {
                maxSuperpositionStates: 16,
                entanglementThreshold: 0.7,
                coherenceTime: 8000
            },
            optimization: {
                learningRate: 0.02,
                adaptationInterval: 3000
            }
        });
        
        logger.info('✅ Router initialized successfully');
        
        // Demonstrate quantum task planning
        logger.info('Creating quantum tasks to demonstrate entanglement...');
        
        const tasks = [];
        
        // Create related ML tasks that should entangle
        tasks.push(router.quantumPlanner.createTask({
            name: 'Vector Embedding Generation',
            category: 'machine_learning',
            assignee: 'ml_worker_1',
            resources: { memory: 4096, cpu: 80, gpu: 90 },
            estimatedDuration: 5000
        }));
        
        tasks.push(router.quantumPlanner.createTask({
            name: 'Similarity Search Optimization', 
            category: 'machine_learning',
            assignee: 'ml_worker_1',
            resources: { memory: 2048, cpu: 60, gpu: 80 },
            estimatedDuration: 3000
        }));
        
        // Create database task
        tasks.push(router.quantumPlanner.createTask({
            name: 'Index Maintenance',
            category: 'database',
            assignee: 'db_worker_1',
            resources: { memory: 1024, cpu: 40, gpu: 0 },
            estimatedDuration: 2000
        }));
        
        logger.info(`Created ${tasks.length} quantum tasks`);
        
        // Show quantum metrics
        const metrics = router.quantumPlanner.getMetrics();
        logger.info('Initial Quantum Metrics:', {
            totalTasks: metrics.totalTasks,
            activeQuantumStates: metrics.activeQuantumStates,
            entanglements: metrics.entanglements,
            averageCoherence: metrics.averageCoherence.toFixed(3)
        });
        
        // Generate optimal execution plan
        logger.info('Generating quantum-optimized execution plan...');
        const plan = router.quantumPlanner.getOptimalExecutionPlan();
        
        logger.info('Quantum Execution Plan:', {
            totalBatches: plan.parallelBatches.length,
            estimatedCompletion: plan.estimatedCompletionTime + 'ms',
            criticalPathTasks: plan.criticalPath.length,
            resourceAllocation: {
                memory: plan.resourceAllocation.memory + 'MB',
                cpu: plan.resourceAllocation.cpu + '%',
                gpu: plan.resourceAllocation.gpu + '%'
            }
        });
        
        // Simulate some task executions for adaptive learning
        logger.info('Simulating task executions for adaptive optimization...');
        
        for (let i = 0; i < 3; i++) {
            router.optimizer.recordExecution({
                taskId: tasks[i % tasks.length].id,
                duration: Math.random() * 2000 + 1000,
                success: Math.random() > 0.1,
                resourceUsage: {
                    memory: Math.random() * 1000 + 500,
                    cpu: Math.random() * 50 + 25,
                    gpu: Math.random() * 60 + 20
                },
                timestamp: Date.now() - (i * 1000)
            });
        }
        
        // Perform quantum measurements
        logger.info('Performing quantum measurements...');
        await router.quantumPlanner.performQuantumMeasurement();
        
        // Show updated metrics after measurements
        const updatedMetrics = router.quantumPlanner.getMetrics();
        logger.info('Post-Measurement Quantum Metrics:', {
            totalTasks: updatedMetrics.totalTasks,
            entanglements: updatedMetrics.entanglements,
            averageCoherence: updatedMetrics.averageCoherence.toFixed(3),
            systemEfficiency: updatedMetrics.systemEfficiency.toFixed(3)
        });
        
        // Test adaptive optimization
        logger.info('Testing adaptive optimization...');
        const adaptations = await router.optimizer.performAdaptation();
        
        if (adaptations && adaptations.length > 0) {
            logger.info(`Applied ${adaptations.length} adaptive optimizations:`, 
                adaptations.map(a => ({
                    parameter: a.parameter,
                    oldValue: a.oldValue,
                    newValue: a.newValue,
                    improvement: ((a.newValue - a.oldValue) / a.oldValue * 100).toFixed(1) + '%'
                }))
            );
        } else {
            logger.info('No adaptations needed - system performing optimally');
        }
        
        logger.info('🎯 Demo completed successfully! The quantum-enhanced system is operational.');
        
        // Graceful shutdown
        await shutdownRouter(router);
        logger.info('Router shutdown complete');
        
    } catch (error) {
        logger.error('Demo failed:', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Demo interrupted, shutting down...');
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', { promise, reason });
    process.exit(1);
});

if (require.main === module) {
    runDemo();
}

module.exports = { runDemo };