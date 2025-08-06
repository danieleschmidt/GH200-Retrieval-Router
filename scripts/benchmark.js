#!/usr/bin/env node
/**
 * Benchmark script for GH200 Retrieval Router
 * Tests performance under various loads
 */

const { performance } = require('perf_hooks');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Benchmark configuration
const BENCHMARK_CONFIG = {
    warmupQueries: 100,
    testQueries: 1000,
    concurrentUsers: [1, 5, 10, 25, 50, 100],
    queryTypes: [
        'simple_search',
        'complex_search',
        'bulk_insert',
        'health_check'
    ]
};

class BenchmarkRunner {
    constructor() {
        this.baseUrl = process.env.BASE_URL || 'http://localhost:8080';
        this.results = {};
    }
    
    /**
     * Run all benchmarks
     */
    async runAll() {
        console.log('🚀 Starting GH200 Retrieval Router Benchmark');
        console.log(`Base URL: ${this.baseUrl}`);
        console.log('=' * 60);
        
        // Wait for server to be ready
        await this.waitForServer();
        
        // Run warmup
        await this.warmup();
        
        // Run benchmark tests
        for (const users of BENCHMARK_CONFIG.concurrentUsers) {
            console.log(`\n📊 Testing with ${users} concurrent users...`);
            await this.benchmarkConcurrency(users);
        }
        
        // Generate report
        this.generateReport();
    }
    
    /**
     * Wait for server to be available
     */
    async waitForServer() {
        console.log('⏳ Waiting for server to be ready...');
        
        const maxRetries = 30;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(`${this.baseUrl}/ping`);
                if (response.ok) {
                    console.log('✅ Server is ready');
                    return;
                }
            } catch (error) {
                // Server not ready yet
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error('Server did not become ready within timeout');
    }
    
    /**
     * Perform warmup queries
     */
    async warmup() {
        console.log(`🔥 Warming up with ${BENCHMARK_CONFIG.warmupQueries} queries...`);
        
        const promises = [];
        for (let i = 0; i < BENCHMARK_CONFIG.warmupQueries; i++) {
            promises.push(this.executeQuery('health_check'));
        }
        
        await Promise.all(promises);
        console.log('✅ Warmup complete');
    }
    
    /**
     * Benchmark with specific concurrency level
     */
    async benchmarkConcurrency(users) {
        const queriesPerUser = Math.ceil(BENCHMARK_CONFIG.testQueries / users);
        const workers = [];
        const results = [];
        
        const startTime = performance.now();
        
        // Create worker threads
        for (let i = 0; i < users; i++) {
            const worker = new Worker(__filename, {
                workerData: {
                    baseUrl: this.baseUrl,
                    queries: queriesPerUser,
                    workerId: i
                }
            });
            
            workers.push(new Promise((resolve, reject) => {
                worker.on('message', resolve);
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Worker stopped with exit code ${code}`));
                    }
                });
            }));
        }
        
        // Wait for all workers to complete
        const workerResults = await Promise.all(workers);
        const endTime = performance.now();
        
        // Aggregate results
        const aggregated = this.aggregateResults(workerResults, endTime - startTime);
        this.results[users] = aggregated;
        
        // Display results
        console.log(`  Throughput: ${aggregated.throughput.toFixed(2)} QPS`);
        console.log(`  Avg Latency: ${aggregated.avgLatency.toFixed(2)} ms`);
        console.log(`  P95 Latency: ${aggregated.p95Latency.toFixed(2)} ms`);
        console.log(`  P99 Latency: ${aggregated.p99Latency.toFixed(2)} ms`);
        console.log(`  Error Rate: ${(aggregated.errorRate * 100).toFixed(2)}%`);
    }
    
    /**
     * Execute a single query
     */
    async executeQuery(type) {
        const startTime = performance.now();
        
        try {
            let response;
            
            switch (type) {
                case 'health_check':
                    response = await fetch(`${this.baseUrl}/ping`);
                    break;
                case 'simple_search':
                    response = await fetch(`${this.baseUrl}/api/v1/search`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            query: 'What is quantum computing?',
                            k: 10
                        })
                    });
                    break;
                default:
                    response = await fetch(`${this.baseUrl}/ping`);
            }
            
            const endTime = performance.now();
            const latency = endTime - startTime;
            
            return {
                success: response.ok,
                latency,
                statusCode: response.status
            };
            
        } catch (error) {
            const endTime = performance.now();
            return {
                success: false,
                latency: endTime - startTime,
                error: error.message
            };
        }
    }
    
    /**
     * Aggregate results from workers
     */
    aggregateResults(workerResults, totalTime) {
        const allResults = workerResults.flat();
        const successful = allResults.filter(r => r.success);
        const latencies = allResults.map(r => r.latency).sort((a, b) => a - b);
        
        return {
            totalRequests: allResults.length,
            successfulRequests: successful.length,
            failedRequests: allResults.length - successful.length,
            errorRate: (allResults.length - successful.length) / allResults.length,
            avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
            minLatency: latencies[0] || 0,
            maxLatency: latencies[latencies.length - 1] || 0,
            p95Latency: latencies[Math.floor(latencies.length * 0.95)] || 0,
            p99Latency: latencies[Math.floor(latencies.length * 0.99)] || 0,
            throughput: allResults.length / (totalTime / 1000),
            totalTime
        };
    }
    
    /**
     * Generate benchmark report
     */
    generateReport() {
        console.log('\n' + '=' * 60);
        console.log('📈 BENCHMARK REPORT');
        console.log('=' * 60);
        
        console.log('\nThroughput (QPS):');
        for (const [users, result] of Object.entries(this.results)) {
            console.log(`  ${users.padStart(3)} users: ${result.throughput.toFixed(2)} QPS`);
        }
        
        console.log('\nAverage Latency (ms):');
        for (const [users, result] of Object.entries(this.results)) {
            console.log(`  ${users.padStart(3)} users: ${result.avgLatency.toFixed(2)} ms`);
        }
        
        console.log('\nP99 Latency (ms):');
        for (const [users, result] of Object.entries(this.results)) {
            console.log(`  ${users.padStart(3)} users: ${result.p99Latency.toFixed(2)} ms`);
        }
        
        console.log('\nError Rates (%):');
        for (const [users, result] of Object.entries(this.results)) {
            console.log(`  ${users.padStart(3)} users: ${(result.errorRate * 100).toFixed(2)}%`);
        }
        
        // Find optimal concurrency
        const optimal = Object.entries(this.results)
            .filter(([_, result]) => result.errorRate < 0.01) // Less than 1% error rate
            .sort(([_, a], [__, b]) => b.throughput - a.throughput)[0];
        
        if (optimal) {
            console.log(`\n🎯 Optimal Concurrency: ${optimal[0]} users (${optimal[1].throughput.toFixed(2)} QPS)`);
        }
        
        console.log('\n✅ Benchmark complete!');
    }
}

// Worker thread logic
if (!isMainThread) {
    const { baseUrl, queries, workerId } = workerData;
    
    async function runWorker() {
        const results = [];
        
        for (let i = 0; i < queries; i++) {
            const result = await executeQuery('health_check', baseUrl);
            results.push(result);
            
            // Small delay to prevent overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        parentPort.postMessage(results);
    }
    
    async function executeQuery(type, baseUrl) {
        const startTime = performance.now();
        
        try {
            const response = await fetch(`${baseUrl}/ping`);
            const endTime = performance.now();
            
            return {
                success: response.ok,
                latency: endTime - startTime,
                statusCode: response.status
            };
        } catch (error) {
            const endTime = performance.now();
            return {
                success: false,
                latency: endTime - startTime,
                error: error.message
            };
        }
    }
    
    runWorker().catch(error => {
        console.error('Worker error:', error);
        process.exit(1);
    });
}

// Main execution
if (isMainThread && require.main === module) {
    const runner = new BenchmarkRunner();
    runner.runAll().catch(error => {
        console.error('Benchmark failed:', error);
        process.exit(1);
    });
}

module.exports = BenchmarkRunner;