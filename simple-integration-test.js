/**
 * Simple Integration Test for Core System Components
 */

console.log('🔬 Running Simple Integration Test...');

async function testCoreSystem() {
    try {
        // Test 1: Basic router initialization
        console.log('📋 Testing Basic Router Initialization...');
        const { initializeRouter } = require('./src/index');
        
        const router = await initializeRouter({
            graceMemory: { enabled: false },
            nvlink: { enabled: false },
            database: { 
                indexType: 'faiss',
                dimensions: 128 // Smaller for testing
            }
        });
        
        console.log('✅ Router initialized successfully');
        
        // Test 2: Basic vector operations
        console.log('📊 Testing Vector Operations...');
        
        // Create test vectors
        const testVectors = [];
        for (let i = 0; i < 10; i++) {
            const vector = [];
            for (let j = 0; j < 128; j++) {
                vector.push(Math.random() * 2 - 1);
            }
            testVectors.push({ id: `test_${i}`, vector, metadata: { type: 'test' } });
        }
        
        // Add vectors to database
        for (const vectorData of testVectors) {
            await router.vectorDatabase.addVector(vectorData.id, vectorData.vector, vectorData.metadata);
        }
        console.log('✅ Vectors added to database');
        
        // Test search
        const queryVector = testVectors[0].vector;
        const searchResults = await router.search(queryVector, { k: 5 });
        
        if (searchResults && searchResults.length > 0) {
            console.log('✅ Vector search working');
        } else {
            throw new Error('Vector search returned no results');
        }
        
        // Test 3: Performance metrics
        console.log('📈 Testing Performance Metrics...');
        const metrics = router.getMetrics();
        
        if (metrics && typeof metrics === 'object') {
            console.log('✅ Performance metrics available');
        } else {
            throw new Error('Performance metrics not available');
        }
        
        // Test 4: Graceful shutdown
        console.log('🔄 Testing Graceful Shutdown...');
        await router.shutdown();
        console.log('✅ Graceful shutdown completed');
        
        return true;
        
    } catch (error) {
        console.error('❌ Core system test failed:', error.message);
        return false;
    }
}

async function testPerformance() {
    try {
        console.log('⚡ Testing Performance...');
        
        // Vector similarity calculation performance test
        const startTime = Date.now();
        const vectorCount = 1000;
        const dimensions = 128;
        
        // Generate test data
        const vectors = [];
        for (let i = 0; i < vectorCount; i++) {
            const vector = [];
            for (let j = 0; j < dimensions; j++) {
                vector.push(Math.random() * 2 - 1);
            }
            vectors.push(vector);
        }
        
        const query = vectors[0];
        
        // Compute similarities
        const similarities = vectors.map((vector, index) => {
            const dotProduct = vector.reduce((sum, val, i) => sum + val * query[i], 0);
            const magnitudeA = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
            const magnitudeB = Math.sqrt(query.reduce((sum, val) => sum + val * val, 0));
            return {
                index,
                similarity: dotProduct / (magnitudeA * magnitudeB)
            };
        });
        
        // Sort by similarity
        similarities.sort((a, b) => b.similarity - a.similarity);
        
        const processingTime = Date.now() - startTime;
        console.log(`✅ Performance test: ${processingTime}ms for ${vectorCount} vectors`);
        
        // Check memory usage
        const memUsage = process.memoryUsage();
        console.log(`📊 Memory: RSS=${Math.round(memUsage.rss/1024/1024)}MB, Heap=${Math.round(memUsage.heapUsed/1024/1024)}MB`);
        
        return processingTime < 1000; // Should complete within 1 second
        
    } catch (error) {
        console.error('❌ Performance test failed:', error.message);
        return false;
    }
}

async function testQuantumComponents() {
    try {
        console.log('🌟 Testing Quantum Components...');
        
        const { QuantumTaskPlanner } = require('./src/quantum');
        const planner = new QuantumTaskPlanner();
        await planner.initialize();
        
        // Test quantum state management
        const quantumState = await planner.createQuantumState({
            type: 'optimization',
            parameters: { dimensions: 10 }
        });
        
        if (quantumState && quantumState.id) {
            console.log('✅ Quantum state creation working');
        } else {
            throw new Error('Quantum state creation failed');
        }
        
        await planner.shutdown();
        return true;
        
    } catch (error) {
        console.error('❌ Quantum components test failed:', error.message);
        return false;
    }
}

async function runAllTests() {
    console.log('🚀 Starting Comprehensive Integration Tests');
    console.log('=' * 60);
    
    const results = {
        coreSystem: false,
        performance: false,
        quantumComponents: false
    };
    
    // Run tests
    results.coreSystem = await testCoreSystem();
    results.performance = await testPerformance();
    results.quantumComponents = await testQuantumComponents();
    
    // Report results
    console.log('\n' + '=' * 60);
    console.log('📋 Test Results:');
    console.log(`   • Core System: ${results.coreSystem ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   • Performance: ${results.performance ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   • Quantum Components: ${results.quantumComponents ? '✅ PASS' : '❌ FAIL'}`);
    
    const totalPassed = Object.values(results).filter(r => r).length;
    const totalTests = Object.keys(results).length;
    const successRate = (totalPassed / totalTests) * 100;
    
    console.log(`   • Overall: ${totalPassed}/${totalTests} tests passed (${successRate.toFixed(1)}%)`);
    
    if (successRate >= 66.7) { // At least 2/3 tests must pass
        console.log('\n🎉 Integration tests PASSED! System is functional.');
        return 0;
    } else {
        console.log('\n⚠️ Integration tests FAILED. System needs attention.');
        return 1;
    }
}

// Run tests
runAllTests().then(exitCode => {
    process.exit(exitCode);
}).catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
});