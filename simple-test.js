#!/usr/bin/env node
/**
 * Simple test to verify quantum components work
 */

const { QuantumTaskPlanner, AdaptiveOptimizer } = require('./src/quantum');

async function simpleTest() {
    console.log('🧪 Testing Quantum Components...');
    
    try {
        // Test QuantumTaskPlanner
        console.log('1. Testing QuantumTaskPlanner...');
        const planner = new QuantumTaskPlanner({
            maxSuperpositionStates: 8,
            entanglementThreshold: 0.7
        });
        
        await planner.initialize();
        console.log('   ✅ Planner initialized');
        
        // Create test tasks
        const task1 = planner.createTask({
            name: 'ML Task 1',
            category: 'ml',
            assignee: 'worker1'
        });
        
        const task2 = planner.createTask({
            name: 'ML Task 2', 
            category: 'ml',
            assignee: 'worker1'
        });
        
        console.log('   ✅ Created quantum tasks');
        
        // Check metrics
        const metrics = planner.getMetrics();
        console.log(`   📊 Metrics: ${metrics.totalTasks} tasks, ${metrics.entanglements} entanglements`);
        
        // Test AdaptiveOptimizer
        console.log('2. Testing AdaptiveOptimizer...');
        const optimizer = new AdaptiveOptimizer({
            learningRate: 0.02
        });
        
        await optimizer.initialize();
        console.log('   ✅ Optimizer initialized');
        
        // Record executions
        optimizer.recordExecution({
            taskId: task1.id,
            duration: 1000,
            success: true,
            timestamp: Date.now() - 2000
        });
        
        optimizer.recordExecution({
            taskId: task2.id,
            duration: 2000,
            success: true,
            timestamp: Date.now()
        });
        
        console.log('   ✅ Recorded executions');
        
        // Test adaptation
        const adaptations = await optimizer.performAdaptation();
        console.log(`   📈 Adaptations: ${adaptations ? adaptations.length : 0} changes`);
        
        // Shutdown
        await planner.shutdown();
        console.log('   ✅ Planner shutdown');
        
        console.log('🎉 All quantum components working correctly!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

simpleTest();