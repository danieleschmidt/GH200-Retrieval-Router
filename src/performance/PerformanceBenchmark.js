/**
 * Comprehensive Performance Benchmarking Framework
 * Enterprise-grade benchmarking for GH200 Vector Search Systems
 */

const EventEmitter = require('events');
const { performance } = require('perf_hooks');
const { logger } = require('../utils/logger');

/**
 * Benchmark test case
 */
class BenchmarkTest {
    constructor(name, testFunction, options = {}) {
        this.name = name;
        this.testFunction = testFunction;
        this.config = {
            iterations: options.iterations || 1000,
            warmupIterations: options.warmup || 100,
            timeout: options.timeout || 300000, // 5 minutes
            parallel: options.parallel || false,
            concurrency: options.concurrency || 1,
            dataSize: options.dataSize || 'medium',
            category: options.category || 'general',
            tags: options.tags || [],
            ...options
        };
        
        this.results = {
            name: this.name,
            category: this.config.category,
            completed: false,
            iterations: 0,
            successfulIterations: 0,
            failedIterations: 0,
            metrics: {
                min: Infinity,
                max: -Infinity,
                mean: 0,
                median: 0,
                p95: 0,
                p99: 0,
                stdDev: 0,
                throughput: 0,
                errorRate: 0
            },
            timings: [],
            errors: [],
            metadata: {}
        };
    }
    
    async run(context = {}) {
        logger.info(`Starting benchmark: ${this.name}`, {
            iterations: this.config.iterations,
            warmup: this.config.warmupIterations,
            parallel: this.config.parallel,
            concurrency: this.config.concurrency
        });
        
        const startTime = performance.now();
        
        try {
            // Warmup phase
            if (this.config.warmupIterations > 0) {
                await this._runWarmup(context);
            }
            
            // Main benchmark phase
            if (this.config.parallel) {
                await this._runParallel(context);
            } else {
                await this._runSequential(context);
            }
            
            // Calculate statistics
            this._calculateStatistics();
            
            this.results.completed = true;
            this.results.totalDuration = performance.now() - startTime;
            
            logger.info(`Benchmark completed: ${this.name}`, {
                iterations: this.results.iterations,
                mean: this.results.metrics.mean,
                throughput: this.results.metrics.throughput,
                errorRate: this.results.metrics.errorRate
            });
            
            return this.results;
            
        } catch (error) {
            logger.error(`Benchmark failed: ${this.name}`, {
                error: error.message
            });
            
            this.results.error = error.message;
            throw error;
        }
    }
    
    async _runWarmup(context) {
        logger.debug(`Warming up benchmark: ${this.name}`, {
            warmupIterations: this.config.warmupIterations
        });
        
        for (let i = 0; i < this.config.warmupIterations; i++) {
            try {
                await this.testFunction(context);
            } catch (error) {
                // Ignore warmup errors
            }
        }
    }
    
    async _runSequential(context) {
        for (let i = 0; i < this.config.iterations; i++) {
            await this._runSingleIteration(context);
            
            // Progress reporting
            if ((i + 1) % Math.max(1, Math.floor(this.config.iterations / 10)) === 0) {
                logger.debug(`Benchmark progress: ${this.name}`, {
                    completed: i + 1,
                    total: this.config.iterations,
                    progress: Math.round(((i + 1) / this.config.iterations) * 100)
                });
            }
        }
    }
    
    async _runParallel(context) {
        const batchSize = this.config.concurrency;
        const totalBatches = Math.ceil(this.config.iterations / batchSize);
        
        for (let batch = 0; batch < totalBatches; batch++) {
            const batchStart = batch * batchSize;
            const batchEnd = Math.min(batchStart + batchSize, this.config.iterations);
            const batchPromises = [];
            
            for (let i = batchStart; i < batchEnd; i++) {
                batchPromises.push(this._runSingleIteration(context));
            }
            
            await Promise.allSettled(batchPromises);
            
            // Progress reporting
            logger.debug(`Benchmark batch completed: ${this.name}`, {
                batch: batch + 1,
                totalBatches,
                completed: batchEnd,
                total: this.config.iterations
            });
        }
    }
    
    async _runSingleIteration(context) {
        const iterationStart = performance.now();
        
        try {
            const result = await Promise.race([
                this.testFunction(context),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), this.config.timeout)
                )
            ]);
            
            const duration = performance.now() - iterationStart;
            
            this.results.timings.push(duration);
            this.results.successfulIterations++;
            this.results.iterations++;
            
            // Store additional metrics if returned
            if (result && typeof result === 'object' && result.metrics) {
                this._mergeMetrics(result.metrics);
            }
            
        } catch (error) {
            const duration = performance.now() - iterationStart;
            
            this.results.timings.push(duration);
            this.results.failedIterations++;
            this.results.iterations++;
            this.results.errors.push({
                message: error.message,
                duration,
                iteration: this.results.iterations
            });
        }
    }
    
    _mergeMetrics(additionalMetrics) {
        if (!this.results.metadata.customMetrics) {
            this.results.metadata.customMetrics = {};
        }
        
        for (const [key, value] of Object.entries(additionalMetrics)) {
            if (!this.results.metadata.customMetrics[key]) {
                this.results.metadata.customMetrics[key] = [];
            }
            this.results.metadata.customMetrics[key].push(value);
        }
    }
    
    _calculateStatistics() {
        const timings = this.results.timings;
        
        if (timings.length === 0) {
            return;
        }
        
        // Sort timings for percentile calculations
        const sortedTimings = [...timings].sort((a, b) => a - b);
        
        // Basic statistics
        this.results.metrics.min = sortedTimings[0];
        this.results.metrics.max = sortedTimings[sortedTimings.length - 1];
        this.results.metrics.mean = timings.reduce((sum, t) => sum + t, 0) / timings.length;
        
        // Percentiles
        this.results.metrics.median = this._percentile(sortedTimings, 50);
        this.results.metrics.p95 = this._percentile(sortedTimings, 95);
        this.results.metrics.p99 = this._percentile(sortedTimings, 99);
        
        // Standard deviation
        const variance = timings.reduce((sum, t) => 
            sum + Math.pow(t - this.results.metrics.mean, 2), 0) / timings.length;
        this.results.metrics.stdDev = Math.sqrt(variance);
        
        // Throughput (operations per second)
        if (this.results.totalDuration > 0) {
            this.results.metrics.throughput = 
                (this.results.successfulIterations / (this.results.totalDuration / 1000));
        }
        
        // Error rate
        this.results.metrics.errorRate = 
            this.results.failedIterations / this.results.iterations;
    }
    
    _percentile(sortedArray, percentile) {
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[Math.max(0, index)];
    }
}

/**
 * Performance Benchmark Suite
 */
class PerformanceBenchmark extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Suite Configuration
            name: options.name || 'GH200 Performance Benchmark',
            parallel: options.parallel || false,
            stopOnError: options.stopOnError || false,
            
            // Reporting Configuration
            reportFormat: options.reportFormat || 'detailed',
            exportResults: options.exportResults !== false,
            compareBaseline: options.compareBaseline || false,
            
            // Performance Targets
            targets: options.targets || {
                vectorSearchQPS: 125000,
                ragPipelineQPS: 450,
                p99Latency: 200,
                errorRate: 0.01
            },
            
            // System Information
            systemInfo: options.systemInfo || {},
            
            ...options
        };
        
        this.tests = new Map();
        this.suiteResults = {
            name: this.config.name,
            startTime: null,
            endTime: null,
            duration: 0,
            testsRun: 0,
            testsPassed: 0,
            testsFailed: 0,
            results: new Map(),
            summary: {},
            baseline: null,
            systemInfo: this.config.systemInfo
        };
        
        this.baseline = null;
        this.isRunning = false;
    }
    
    /**
     * Add a benchmark test
     */
    addTest(name, testFunction, options = {}) {
        if (this.tests.has(name)) {
            throw new Error(`Test '${name}' already exists`);
        }
        
        const test = new BenchmarkTest(name, testFunction, options);
        this.tests.set(name, test);
        
        logger.debug('Added benchmark test', {
            name,
            category: test.config.category,
            iterations: test.config.iterations
        });
        
        return test;
    }
    
    /**
     * Remove a benchmark test
     */
    removeTest(name) {
        return this.tests.delete(name);
    }
    
    /**
     * Add predefined vector search benchmarks
     */
    addVectorSearchBenchmarks(searchSystem) {
        // Single vector search
        this.addTest('vector_search_single', async (context) => {
            const queryVector = this._generateRandomVector(768);
            const startTime = performance.now();
            
            const result = await searchSystem.search(queryVector, { k: 10 });
            
            return {
                duration: performance.now() - startTime,
                metrics: {
                    vectorsReturned: result.vectors.length,
                    avgSimilarity: result.similarities.reduce((a, b) => a + b, 0) / result.similarities.length
                }
            };
        }, {
            category: 'vector_search',
            iterations: 10000,
            tags: ['search', 'single']
        });
        
        // Batch vector search
        this.addTest('vector_search_batch', async (context) => {
            const queryVectors = Array.from({ length: 32 }, () => this._generateRandomVector(768));
            const startTime = performance.now();
            
            const results = await Promise.all(
                queryVectors.map(vector => searchSystem.search(vector, { k: 10 }))
            );
            
            return {
                duration: performance.now() - startTime,
                metrics: {
                    batchSize: queryVectors.length,
                    totalVectors: results.reduce((sum, r) => sum + r.vectors.length, 0),
                    avgBatchTime: (performance.now() - startTime) / queryVectors.length
                }
            };
        }, {
            category: 'vector_search',
            iterations: 1000,
            parallel: true,
            concurrency: 10,
            tags: ['search', 'batch']
        });
        
        // High-dimensional vector search
        this.addTest('vector_search_high_dim', async (context) => {
            const queryVector = this._generateRandomVector(1536); // Higher dimension
            const startTime = performance.now();
            
            const result = await searchSystem.search(queryVector, { k: 100 }); // More results
            
            return {
                duration: performance.now() - startTime,
                metrics: {
                    dimension: 1536,
                    vectorsReturned: result.vectors.length
                }
            };
        }, {
            category: 'vector_search',
            iterations: 5000,
            tags: ['search', 'high_dimension']
        });
    }
    
    /**
     * Add predefined performance stress tests
     */
    addStressTests(system) {
        // Concurrent load test
        this.addTest('concurrent_load', async (context) => {
            const concurrentRequests = 100;
            const queryVector = this._generateRandomVector(768);
            const startTime = performance.now();
            
            const promises = Array.from({ length: concurrentRequests }, () =>
                system.search(queryVector, { k: 10 })
            );
            
            const results = await Promise.allSettled(promises);
            const successful = results.filter(r => r.status === 'fulfilled').length;
            
            return {
                duration: performance.now() - startTime,
                metrics: {
                    concurrency: concurrentRequests,
                    successfulRequests: successful,
                    failedRequests: concurrentRequests - successful
                }
            };
        }, {
            category: 'stress_test',
            iterations: 100,
            timeout: 60000,
            tags: ['stress', 'concurrency']
        });
        
        // Memory pressure test
        this.addTest('memory_pressure', async (context) => {
            const largeVectorCount = 10000;
            const vectors = Array.from({ length: largeVectorCount }, () => 
                this._generateRandomVector(768)
            );
            
            const startTime = performance.now();
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Process large batch
            for (const vector of vectors) {
                await system.search(vector, { k: 1 });
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            
            return {
                duration: performance.now() - startTime,
                metrics: {
                    vectorsProcessed: largeVectorCount,
                    memoryDelta: finalMemory - initialMemory,
                    memoryEfficiency: largeVectorCount / ((finalMemory - initialMemory) / (1024 * 1024))
                }
            };
        }, {
            category: 'stress_test',
            iterations: 10,
            timeout: 300000,
            tags: ['stress', 'memory']
        });
    }
    
    /**
     * Add latency benchmarks
     */
    addLatencyBenchmarks(system) {
        // P99 latency test
        this.addTest('p99_latency', async (context) => {
            const queryVector = this._generateRandomVector(768);
            const startTime = performance.now();
            
            await system.search(queryVector, { k: 10 });
            
            return {
                duration: performance.now() - startTime,
                metrics: {
                    latency: performance.now() - startTime
                }
            };
        }, {
            category: 'latency',
            iterations: 10000,
            tags: ['latency', 'p99']
        });
        
        // Cold start latency
        this.addTest('cold_start_latency', async (context) => {
            // Simulate cold start by clearing caches
            if (system.clearCache) {
                await system.clearCache();
            }
            
            const queryVector = this._generateRandomVector(768);
            const startTime = performance.now();
            
            await system.search(queryVector, { k: 10 });
            
            return {
                duration: performance.now() - startTime,
                metrics: {
                    coldStartLatency: performance.now() - startTime
                }
            };
        }, {
            category: 'latency',
            iterations: 100,
            tags: ['latency', 'cold_start']
        });
    }
    
    /**
     * Run all benchmarks
     */
    async runAll(context = {}) {
        if (this.isRunning) {
            throw new Error('Benchmark suite is already running');
        }
        
        this.isRunning = true;
        this.suiteResults.startTime = Date.now();
        
        logger.info('Starting benchmark suite', {
            name: this.config.name,
            totalTests: this.tests.size,
            parallel: this.config.parallel
        });
        
        try {
            if (this.config.parallel) {
                await this._runTestsParallel(context);
            } else {
                await this._runTestsSequential(context);
            }
            
            this.suiteResults.endTime = Date.now();
            this.suiteResults.duration = this.suiteResults.endTime - this.suiteResults.startTime;
            
            // Generate summary
            this._generateSummary();
            
            // Compare with baseline if available
            if (this.config.compareBaseline && this.baseline) {
                this._compareWithBaseline();
            }
            
            logger.info('Benchmark suite completed', {
                duration: this.suiteResults.duration,
                testsRun: this.suiteResults.testsRun,
                testsPassed: this.suiteResults.testsPassed,
                testsFailed: this.suiteResults.testsFailed
            });
            
            this.emit('completed', this.suiteResults);
            
            return this.suiteResults;
            
        } catch (error) {
            logger.error('Benchmark suite failed', {
                error: error.message
            });
            
            this.emit('failed', error);
            throw error;
            
        } finally {
            this.isRunning = false;
        }
    }
    
    /**
     * Run specific tests
     */
    async runTests(testNames, context = {}) {
        const testsToRun = testNames.filter(name => this.tests.has(name));
        
        if (testsToRun.length === 0) {
            throw new Error('No valid tests found');
        }
        
        logger.info('Running selected benchmark tests', {
            tests: testsToRun,
            total: testsToRun.length
        });
        
        const results = new Map();
        
        for (const testName of testsToRun) {
            const test = this.tests.get(testName);
            
            try {
                logger.info(`Running test: ${testName}`);
                const result = await test.run(context);
                results.set(testName, result);
                
            } catch (error) {
                logger.error(`Test failed: ${testName}`, {
                    error: error.message
                });
                
                results.set(testName, {
                    name: testName,
                    error: error.message,
                    completed: false
                });
                
                if (this.config.stopOnError) {
                    break;
                }
            }
        }
        
        return results;
    }
    
    async _runTestsSequential(context) {
        for (const [testName, test] of this.tests) {
            try {
                logger.info(`Running test: ${testName}`);
                
                const result = await test.run(context);
                this.suiteResults.results.set(testName, result);
                
                this.suiteResults.testsRun++;
                this.suiteResults.testsPassed++;
                
                this.emit('testCompleted', { testName, result });
                
            } catch (error) {
                logger.error(`Test failed: ${testName}`, {
                    error: error.message
                });
                
                this.suiteResults.results.set(testName, {
                    name: testName,
                    error: error.message,
                    completed: false
                });
                
                this.suiteResults.testsRun++;
                this.suiteResults.testsFailed++;
                
                this.emit('testFailed', { testName, error });
                
                if (this.config.stopOnError) {
                    break;
                }
            }
        }
    }
    
    async _runTestsParallel(context) {
        const testPromises = Array.from(this.tests.entries()).map(async ([testName, test]) => {
            try {
                const result = await test.run(context);
                
                this.suiteResults.results.set(testName, result);
                this.suiteResults.testsPassed++;
                this.emit('testCompleted', { testName, result });
                
                return { testName, result, success: true };
                
            } catch (error) {
                const errorResult = {
                    name: testName,
                    error: error.message,
                    completed: false
                };
                
                this.suiteResults.results.set(testName, errorResult);
                this.suiteResults.testsFailed++;
                this.emit('testFailed', { testName, error });
                
                return { testName, error, success: false };
            }
        });
        
        const results = await Promise.allSettled(testPromises);
        this.suiteResults.testsRun = results.length;
    }
    
    _generateSummary() {
        const results = Array.from(this.suiteResults.results.values());
        const completedResults = results.filter(r => r.completed);
        
        if (completedResults.length === 0) {
            return;
        }
        
        // Overall statistics
        const allTimings = completedResults.flatMap(r => r.timings);
        const totalIterations = completedResults.reduce((sum, r) => sum + r.iterations, 0);
        const totalSuccessful = completedResults.reduce((sum, r) => sum + r.successfulIterations, 0);
        
        this.suiteResults.summary = {
            totalIterations,
            totalSuccessful,
            overallThroughput: totalSuccessful / (this.suiteResults.duration / 1000),
            overallErrorRate: (totalIterations - totalSuccessful) / totalIterations,
            
            // Performance by category
            categories: this._summarizeByCategory(completedResults),
            
            // Target comparison
            targetComparison: this._compareWithTargets(completedResults),
            
            // Top performers
            topPerformers: this._findTopPerformers(completedResults)
        };
    }
    
    _summarizeByCategory(results) {
        const categories = {};
        
        for (const result of results) {
            const category = result.category || 'general';
            
            if (!categories[category]) {
                categories[category] = {
                    testCount: 0,
                    totalIterations: 0,
                    avgThroughput: 0,
                    avgLatency: 0,
                    avgErrorRate: 0
                };
            }
            
            const cat = categories[category];
            cat.testCount++;
            cat.totalIterations += result.iterations;
            cat.avgThroughput = (cat.avgThroughput * (cat.testCount - 1) + result.metrics.throughput) / cat.testCount;
            cat.avgLatency = (cat.avgLatency * (cat.testCount - 1) + result.metrics.mean) / cat.testCount;
            cat.avgErrorRate = (cat.avgErrorRate * (cat.testCount - 1) + result.metrics.errorRate) / cat.testCount;
        }
        
        return categories;
    }
    
    _compareWithTargets(results) {
        const targets = this.config.targets;
        const comparison = {};
        
        // Vector search QPS
        const vectorSearchResults = results.filter(r => r.category === 'vector_search');
        if (vectorSearchResults.length > 0) {
            const avgVectorQPS = vectorSearchResults.reduce((sum, r) => sum + r.metrics.throughput, 0) / vectorSearchResults.length;
            comparison.vectorSearchQPS = {
                target: targets.vectorSearchQPS,
                actual: avgVectorQPS,
                ratio: avgVectorQPS / targets.vectorSearchQPS,
                status: avgVectorQPS >= targets.vectorSearchQPS ? 'pass' : 'fail'
            };
        }
        
        // P99 Latency
        const latencyResults = results.filter(r => r.category === 'latency');
        if (latencyResults.length > 0) {
            const avgP99 = latencyResults.reduce((sum, r) => sum + r.metrics.p99, 0) / latencyResults.length;
            comparison.p99Latency = {
                target: targets.p99Latency,
                actual: avgP99,
                ratio: targets.p99Latency / avgP99,
                status: avgP99 <= targets.p99Latency ? 'pass' : 'fail'
            };
        }
        
        // Error rate
        const avgErrorRate = results.reduce((sum, r) => sum + r.metrics.errorRate, 0) / results.length;
        comparison.errorRate = {
            target: targets.errorRate,
            actual: avgErrorRate,
            ratio: targets.errorRate / avgErrorRate,
            status: avgErrorRate <= targets.errorRate ? 'pass' : 'fail'
        };
        
        return comparison;
    }
    
    _findTopPerformers(results) {
        return {
            highestThroughput: results.sort((a, b) => b.metrics.throughput - a.metrics.throughput).slice(0, 3),
            lowestLatency: results.sort((a, b) => a.metrics.mean - b.metrics.mean).slice(0, 3),
            mostReliable: results.sort((a, b) => a.metrics.errorRate - b.metrics.errorRate).slice(0, 3)
        };
    }
    
    _compareWithBaseline() {
        // Compare current results with baseline
        // This would implement statistical comparison
        logger.info('Comparing results with baseline (placeholder)');
    }
    
    /**
     * Export results
     */
    exportResults(format = 'json', filePath = null) {
        const results = {
            suite: this.suiteResults,
            timestamp: new Date().toISOString(),
            format: format
        };
        
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(results, null, 2);
            case 'csv':
                return this._formatCSV(results);
            case 'markdown':
                return this._formatMarkdown(results);
            default:
                return JSON.stringify(results, null, 2);
        }
    }
    
    _formatCSV(results) {
        const headers = ['Test Name', 'Category', 'Iterations', 'Mean (ms)', 'P95 (ms)', 'P99 (ms)', 'Throughput (ops/s)', 'Error Rate'];
        const rows = [headers.join(',')];
        
        for (const [name, result] of results.suite.results) {
            if (result.completed) {
                rows.push([
                    name,
                    result.category || 'general',
                    result.iterations,
                    result.metrics.mean.toFixed(2),
                    result.metrics.p95.toFixed(2),
                    result.metrics.p99.toFixed(2),
                    result.metrics.throughput.toFixed(2),
                    (result.metrics.errorRate * 100).toFixed(2) + '%'
                ].join(','));
            }
        }
        
        return rows.join('\n');
    }
    
    _formatMarkdown(results) {
        const lines = [
            `# ${results.suite.name} - Benchmark Results`,
            '',
            `**Date:** ${results.timestamp}`,
            `**Duration:** ${results.suite.duration}ms`,
            `**Tests Run:** ${results.suite.testsRun}`,
            `**Tests Passed:** ${results.suite.testsPassed}`,
            `**Tests Failed:** ${results.suite.testsFailed}`,
            '',
            '## Test Results',
            '',
            '| Test Name | Category | Iterations | Mean (ms) | P95 (ms) | P99 (ms) | Throughput (ops/s) | Error Rate |',
            '|-----------|----------|------------|-----------|----------|----------|-------------------|------------|'
        ];
        
        for (const [name, result] of results.suite.results) {
            if (result.completed) {
                lines.push(`| ${name} | ${result.category || 'general'} | ${result.iterations} | ${result.metrics.mean.toFixed(2)} | ${result.metrics.p95.toFixed(2)} | ${result.metrics.p99.toFixed(2)} | ${result.metrics.throughput.toFixed(2)} | ${(result.metrics.errorRate * 100).toFixed(2)}% |`);
            }
        }
        
        // Add summary
        if (results.suite.summary) {
            lines.push('', '## Summary', '');
            lines.push(`**Overall Throughput:** ${results.suite.summary.overallThroughput.toFixed(2)} ops/s`);
            lines.push(`**Overall Error Rate:** ${(results.suite.summary.overallErrorRate * 100).toFixed(2)}%`);
        }
        
        return lines.join('\n');
    }
    
    // Utility methods
    _generateRandomVector(dimensions) {
        return Array.from({ length: dimensions }, () => Math.random() - 0.5);
    }
    
    /**
     * Load baseline results
     */
    loadBaseline(baselineData) {
        this.baseline = baselineData;
        this.config.compareBaseline = true;
    }
    
    /**
     * Set performance targets
     */
    setTargets(targets) {
        this.config.targets = { ...this.config.targets, ...targets };
    }
    
    /**
     * Get test results
     */
    getResults() {
        return this.suiteResults;
    }
    
    /**
     * Clear all results
     */
    clearResults() {
        this.suiteResults.results.clear();
        this.suiteResults.testsRun = 0;
        this.suiteResults.testsPassed = 0;
        this.suiteResults.testsFailed = 0;
        this.suiteResults.summary = {};
    }
}

module.exports = { PerformanceBenchmark, BenchmarkTest };