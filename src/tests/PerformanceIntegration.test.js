/**
 * Performance Integration Tests
 * Tests for advanced caching, concurrent processing, and load balancing
 */

const AdvancedCachingEngine = require('../performance/AdvancedCachingEngine');
const ConcurrentProcessingEngine = require('../performance/ConcurrentProcessingEngine');
const LoadBalancingOrchestrator = require('../performance/LoadBalancingOrchestrator');

describe('Performance Integration', () => {
    describe('AdvancedCachingEngine', () => {
        let cachingEngine;

        beforeEach(async () => {
            cachingEngine = new AdvancedCachingEngine({
                l1Size: 10 * 1024 * 1024, // 10MB
                l2Size: 50 * 1024 * 1024, // 50MB
                l3Size: 100 * 1024 * 1024, // 100MB
                ttl: 60000, // 1 minute
                analyticsEnabled: false
            });
            
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        afterEach(async () => {
            if (cachingEngine) {
                await cachingEngine.shutdown();
            }
        });

        test('should cache and retrieve data', async () => {
            const key = 'test_key';
            const data = { message: 'Hello World', timestamp: Date.now() };

            await cachingEngine.set(key, data);
            const result = await cachingEngine.get(key);

            expect(result).toBeDefined();
            expect(result.data.message).toBe('Hello World');
            expect(result.metadata.cacheHit).toBe(true);
        });

        test('should handle cache misses', async () => {
            const result = await cachingEngine.get('non_existent_key');
            expect(result).toBeNull();
        });

        test('should evict entries', async () => {
            const key = 'evict_test';
            const data = { test: true };

            await cachingEngine.set(key, data);
            let result = await cachingEngine.get(key);
            expect(result).toBeDefined();

            await cachingEngine.evict(key);
            result = await cachingEngine.get(key);
            expect(result).toBeNull();
        });

        test('should provide cache statistics', () => {
            const stats = cachingEngine.getStats();
            
            expect(stats).toHaveProperty('hitRate');
            expect(stats).toHaveProperty('hitStats');
            expect(stats).toHaveProperty('cacheSizes');
            expect(stats).toHaveProperty('entrycounts');
        });

        test('should support multi-tier caching', async () => {
            const key = 'multi_tier_test';
            const data = { tier: 'test', size: 1000 };

            // Set to specific tiers
            await cachingEngine.set(key, data, { tier: 'l1' });
            let result = await cachingEngine.get(key, { tier: 'l1' });
            expect(result).toBeDefined();

            // Should miss in L2
            result = await cachingEngine.get(key, { tier: 'l2' });
            expect(result).toBeNull();
        });
    });

    describe('ConcurrentProcessingEngine', () => {
        let processingEngine;

        beforeEach(async () => {
            processingEngine = new ConcurrentProcessingEngine({
                maxWorkers: 2,
                maxConcurrency: 10,
                enableGraceHopper: false, // Disable for testing
                adaptiveScaling: false
            });

            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 200));
        });

        afterEach(async () => {
            if (processingEngine) {
                await processingEngine.shutdown();
            }
        });

        test('should process simple tasks', async () => {
            const task = {
                type: 'text_processing',
                data: { text: 'hello world', operation: 'uppercase' }
            };

            const result = await processingEngine.process(task);
            
            expect(result.processed).toBe(true);
            expect(result.data.processedText).toBe('HELLO WORLD');
        });

        test('should handle vector search tasks', async () => {
            const task = {
                type: 'vector_search',
                data: { query: 'test query', k: 5 }
            };

            const result = await processingEngine.process(task);
            
            expect(result.processed).toBe(true);
            expect(result.data.vectors).toHaveLength(5);
            expect(result.data.totalResults).toBe(5);
        });

        test('should process batch operations', async () => {
            const tasks = [
                { text: 'item 1', operation: 'process' },
                { text: 'item 2', operation: 'process' },
                { text: 'item 3', operation: 'process' }
            ];

            const result = await processingEngine.processBatch(tasks);
            
            expect(result.processed).toBe(true);
            expect(result.data.batchSize).toBe(3);
            expect(result.data.results).toHaveLength(3);
        });

        test('should provide processing statistics', () => {
            const stats = processingEngine.getStats();
            
            expect(stats).toHaveProperty('activeJobs');
            expect(stats).toHaveProperty('completedJobs');
            expect(stats).toHaveProperty('failedJobs');
            expect(stats).toHaveProperty('queueSizes');
            expect(stats).toHaveProperty('workerStats');
            expect(stats).toHaveProperty('metrics');
        });

        test('should handle high priority tasks first', async () => {
            const results = [];
            
            // Add low priority task
            processingEngine.process({
                type: 'text_processing',
                data: { text: 'low', operation: 'test' }
            }, { priority: 'low' }).then(r => results.push({ priority: 'low', result: r }));

            // Add high priority task
            processingEngine.process({
                type: 'text_processing', 
                data: { text: 'high', operation: 'test' }
            }, { priority: 'high' }).then(r => results.push({ priority: 'high', result: r }));

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 500));

            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('LoadBalancingOrchestrator', () => {
        let orchestrator;

        beforeEach(() => {
            orchestrator = new LoadBalancingOrchestrator({
                algorithm: 'round_robin',
                healthCheckInterval: 1000,
                nvlinkOptimization: false
            });
        });

        afterEach(async () => {
            if (orchestrator) {
                await orchestrator.shutdown();
            }
        });

        test('should add and manage nodes', () => {
            const nodeConfig = {
                endpoint: 'http://localhost:8001',
                weight: 1,
                capacity: 100,
                graceHopperEnabled: true
            };

            const node = orchestrator.addNode('node1', nodeConfig);
            
            expect(node.id).toBe('node1');
            expect(node.endpoint).toBe('http://localhost:8001');
            expect(node.graceHopperEnabled).toBe(true);
        });

        test('should select nodes using round-robin', async () => {
            // Add multiple nodes
            orchestrator.addNode('node1', { endpoint: 'http://localhost:8001' });
            orchestrator.addNode('node2', { endpoint: 'http://localhost:8002' });
            orchestrator.addNode('node3', { endpoint: 'http://localhost:8003' });

            const request = { type: 'test', sessionId: null };
            
            const node1 = await orchestrator.selectNode(request);
            const node2 = await orchestrator.selectNode(request);
            const node3 = await orchestrator.selectNode(request);
            const node4 = await orchestrator.selectNode(request);

            expect([node1, node2, node3]).toContain('node1');
            expect([node1, node2, node3]).toContain('node2');
            expect([node1, node2, node3]).toContain('node3');
            expect(node4).toBe(node1); // Should wrap around
        });

        test('should process requests through selected nodes', async () => {
            orchestrator.addNode('test_node', { endpoint: 'http://localhost:9999' });
            
            const request = { type: 'test_request', data: { message: 'hello' } };
            const selectedNode = await orchestrator.selectNode(request);
            
            const result = await orchestrator.processRequest(request, selectedNode);
            
            expect(result.processed).toBe(true);
            expect(result.nodeId).toBe(selectedNode);
        });

        test('should provide load balancing statistics', () => {
            orchestrator.addNode('stats_node', { endpoint: 'http://localhost:8888' });
            
            const stats = orchestrator.getStats();
            
            expect(stats).toHaveProperty('nodes');
            expect(stats).toHaveProperty('globalMetrics');
            expect(stats).toHaveProperty('algorithm');
            expect(stats).toHaveProperty('totalNodes');
            expect(stats).toHaveProperty('availableNodes');
            expect(stats.totalNodes).toBe(1);
        });

        test('should remove nodes gracefully', () => {
            orchestrator.addNode('temp_node', { endpoint: 'http://localhost:7777' });
            
            let stats = orchestrator.getStats();
            expect(stats.totalNodes).toBe(1);
            
            const removed = orchestrator.removeNode('temp_node');
            expect(removed).toBe(true);
            
            // Node should be marked as draining initially
            stats = orchestrator.getStats();
            const node = stats.nodes.find(n => n.id === 'temp_node');
            expect(node.status).toBe('draining');
        });

        test('should handle weighted round-robin algorithm', async () => {
            const orchestratorWeighted = new LoadBalancingOrchestrator({
                algorithm: 'weighted_round_robin'
            });

            orchestratorWeighted.addNode('heavy_node', { 
                endpoint: 'http://localhost:8001',
                weight: 3
            });
            orchestratorWeighted.addNode('light_node', { 
                endpoint: 'http://localhost:8002',
                weight: 1
            });

            const request = { type: 'test' };
            const selections = [];
            
            // Make multiple selections
            for (let i = 0; i < 10; i++) {
                const selected = await orchestratorWeighted.selectNode(request);
                selections.push(selected);
            }

            // Heavy node should be selected more often
            const heavySelections = selections.filter(s => s === 'heavy_node').length;
            const lightSelections = selections.filter(s => s === 'light_node').length;
            
            expect(heavySelections).toBeGreaterThan(lightSelections);

            await orchestratorWeighted.shutdown();
        });
    });
});

module.exports = { AdvancedCachingEngine, ConcurrentProcessingEngine, LoadBalancingOrchestrator };