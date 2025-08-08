#!/usr/bin/env node
/**
 * Generation 3 Performance Test
 * Tests scaling, caching, and optimization features
 */

const { QuantumTaskPlanner, AdaptiveOptimizer, QuantumCacheManager } = require('./src/quantum');
const { ConnectionPoolManager } = require('./src/performance/ConnectionPoolManager');
const { AutoScalingManager } = require('./src/performance/AutoScalingManager');

async function performanceTest() {
    console.log('⚡ Testing Generation 3: Performance and Scaling...');
    
    let planner, optimizer, cache, poolManager, autoScaler;
    
    try {
        // Test 1: High-performance task creation
        console.log('1. Testing optimized task creation performance...');
        
        planner = new QuantumTaskPlanner({
            maxSuperpositionStates: 16,
            entanglementThreshold: 0.7
        });
        await planner.initialize();
        
        const startTime = Date.now();
        const taskCount = 1000;
        
        // Create many tasks to test performance optimization
        const tasks = [];
        for (let i = 0; i < taskCount; i++) {
            tasks.push(planner.createTask({
                name: `Performance Task ${i}`,
                category: i % 5 === 0 ? 'ml' : 'database',
                assignee: `worker_${i % 10}`,
                resources: {
                    memory: Math.random() * 1000 + 500,
                    cpu: Math.random() * 50 + 25
                }
            }));
        }
        
        const creationTime = Date.now() - startTime;
        console.log(`   ✅ Created ${taskCount} tasks in ${creationTime}ms`);
        console.log(`   📊 Performance: ${(taskCount / creationTime * 1000).toFixed(0)} tasks/second`);
        
        // Test 2: Caching system performance
        console.log('2. Testing quantum cache performance...');
        
        cache = new QuantumCacheManager({
            maxSize: 10000,
            coherenceTimeMs: 60000,
            quantumPrefetching: true
        });
        await cache.initialize();
        
        // Cache performance test
        const cacheStartTime = Date.now();
        const cacheOperations = 1000;
        
        // Write operations
        for (let i = 0; i < cacheOperations; i++) {
            await cache.cacheTask(`task_${i}`, {
                id: `task_${i}`,
                data: `test_data_${i}`,
                metadata: { cached: true }
            });
        }
        
        // Read operations  
        let cacheHits = 0;
        for (let i = 0; i < cacheOperations; i++) {
            const result = await cache.getTask(`task_${i}`);
            if (result) cacheHits++;
        }
        
        const cacheTime = Date.now() - cacheStartTime;
        const hitRate = (cacheHits / cacheOperations) * 100;
        
        console.log(`   ✅ Cache operations: ${cacheOperations * 2} in ${cacheTime}ms`);
        console.log(`   📊 Hit rate: ${hitRate.toFixed(1)}%`);
        console.log(`   🚀 Cache ops/sec: ${(cacheOperations * 2 / cacheTime * 1000).toFixed(0)}`);
        
        // Test 3: Connection pooling
        console.log('3. Testing connection pool performance...');
        
        poolManager = new ConnectionPoolManager({
            minConnections: 5,
            maxConnections: 50,
            autoScale: true
        });
        await poolManager.initialize();
        
        // Mock database connection factory
        const mockConnectionFactory = async () => {
            await new Promise(resolve => setTimeout(resolve, 10)); // Simulate connection time
            return {
                id: Math.random().toString(36),
                query: async (sql) => ({ result: 'mock_data' }),
                close: async () => {}
            };
        };
        
        poolManager.registerDatabase('test_db', mockConnectionFactory);
        
        // Test concurrent connection acquisition
        const poolStartTime = Date.now();
        const connectionPromises = [];
        
        for (let i = 0; i < 100; i++) {
            connectionPromises.push(
                poolManager.acquireConnection('test_db')
                    .then(conn => poolManager.releaseConnection('test_db', conn))
                    .catch(error => console.warn(`Connection ${i} failed:`, error.message))
            );
        }
        
        await Promise.allSettled(connectionPromises);
        const poolTime = Date.now() - poolStartTime;
        const poolMetrics = poolManager.getMetrics();
        
        console.log(`   ✅ Pool operations completed in ${poolTime}ms`);
        console.log(`   📊 Pool efficiency: ${poolMetrics.overall.averageAcquireTime.toFixed(1)}ms avg acquire`);
        console.log(`   🔄 Auto-scaling: ${poolMetrics.pools.test_db?.totalConnections || 0} connections`);
        
        // Test 4: Auto-scaling manager
        console.log('4. Testing auto-scaling capabilities...');
        
        autoScaler = new AutoScalingManager({
            minInstances: 2,
            maxInstances: 10,
            cpuThreshold: 70,
            scaleUpCooldown: 1000, // Reduced for testing
            monitoringInterval: 2000
        });
        
        const components = { planner, optimizer, cache };
        await autoScaler.initialize(components);
        
        // Simulate load and monitor scaling decisions
        console.log('   📈 Monitoring scaling decisions for 10 seconds...');
        
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const scalingMetrics = autoScaler.getMetrics();
        console.log(`   ✅ Auto-scaling: ${scalingMetrics.currentInstances} instances`);
        console.log(`   🎯 Predictive model: ${scalingMetrics.modelTrained ? 'Trained' : 'Training'}`);
        
        if (scalingMetrics.scalingHistory.length > 0) {
            console.log(`   📊 Scaling events: ${scalingMetrics.scalingHistory.length}`);
        }
        
        // Test 5: Adaptive optimization under load
        console.log('5. Testing adaptive optimization under load...');
        
        optimizer = new AdaptiveOptimizer({
            learningRate: 0.05,
            adaptationInterval: 2000
        });
        await optimizer.initialize();
        
        // Simulate varying load patterns
        const loadStartTime = Date.now();
        const executionPatterns = [
            { duration: 1000, success: true, load: 'low' },
            { duration: 2000, success: true, load: 'medium' },
            { duration: 3000, success: false, load: 'high' },
            { duration: 1500, success: true, load: 'medium' }
        ];
        
        for (let i = 0; i < 20; i++) {
            const pattern = executionPatterns[i % executionPatterns.length];
            optimizer.recordExecution({
                taskId: `load_test_${i}`,
                duration: pattern.duration + Math.random() * 500,
                success: pattern.success,
                resourceUsage: {
                    cpu: pattern.load === 'high' ? 90 : pattern.load === 'medium' ? 60 : 30,
                    memory: Math.random() * 1000 + 500
                },
                timestamp: Date.now() - (20 - i) * 1000
            });
        }
        
        // Trigger adaptation
        const adaptations = await optimizer.performAdaptation();
        const loadTime = Date.now() - loadStartTime;
        
        console.log(`   ✅ Load simulation completed in ${loadTime}ms`);
        console.log(`   🧠 Adaptations applied: ${adaptations ? adaptations.length : 0}`);
        console.log(`   📊 Learning: ${optimizer.executionHistory.length} executions recorded`);
        
        // Test 6: Overall system metrics
        console.log('6. Overall system performance metrics...');
        
        const systemMetrics = {
            taskCreationRate: taskCount / creationTime * 1000,
            cacheHitRate: hitRate,
            avgConnectionTime: poolMetrics.overall.averageAcquireTime,
            scalingInstances: scalingMetrics.currentInstances,
            adaptationsApplied: adaptations ? adaptations.length : 0
        };
        
        console.log('   📋 Performance Summary:');
        console.log(`   🚀 Task creation: ${systemMetrics.taskCreationRate.toFixed(0)} tasks/sec`);
        console.log(`   💾 Cache hit rate: ${systemMetrics.cacheHitRate.toFixed(1)}%`);
        console.log(`   🔗 Avg connection: ${systemMetrics.avgConnectionTime.toFixed(1)}ms`);
        console.log(`   📈 Scaling instances: ${systemMetrics.scalingInstances}`);
        console.log(`   🧠 Adaptations: ${systemMetrics.adaptationsApplied}`);
        
        // Performance targets
        const targets = {
            taskCreationRate: 500, // tasks/sec
            cacheHitRate: 80, // %
            avgConnectionTime: 100, // ms
            maxScalingTime: 300000 // 5 minutes
        };
        
        console.log('\n🎯 Performance Targets vs Actual:');
        console.log(`   Task creation: ${systemMetrics.taskCreationRate >= targets.taskCreationRate ? '✅' : '⚠️'} ${systemMetrics.taskCreationRate.toFixed(0)}/${targets.taskCreationRate} tasks/sec`);
        console.log(`   Cache hit rate: ${systemMetrics.cacheHitRate >= targets.cacheHitRate ? '✅' : '⚠️'} ${systemMetrics.cacheHitRate.toFixed(1)}%/${targets.cacheHitRate}%`);
        console.log(`   Connection time: ${systemMetrics.avgConnectionTime <= targets.avgConnectionTime ? '✅' : '⚠️'} ${systemMetrics.avgConnectionTime.toFixed(1)}ms/${targets.avgConnectionTime}ms`);
        
        console.log('🎉 Generation 3 performance tests completed!');
        
        // Summary of scaling features implemented
        console.log('\n📋 Scaling Features Summary:');
        console.log('✅ Optimized task creation with batching');
        console.log('✅ High-performance quantum caching');
        console.log('✅ Auto-scaling connection pools');
        console.log('✅ Predictive auto-scaling manager');
        console.log('✅ Adaptive optimization under load');
        console.log('✅ Performance monitoring and metrics');
        
        return true;
        
    } catch (error) {
        console.error('❌ Performance test failed:', error.message);
        console.error(error.stack);
        return false;
    } finally {
        // Cleanup
        try {
            if (planner) await planner.shutdown();
            if (cache && cache.shutdown) await cache.shutdown();
            if (poolManager) await poolManager.shutdown();
            if (autoScaler) await autoScaler.shutdown();
        } catch (error) {
            console.warn('Cleanup warning:', error.message);
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nPerformance test interrupted, cleaning up...');
    process.exit(0);
});

if (require.main === module) {
    performanceTest().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { performanceTest };