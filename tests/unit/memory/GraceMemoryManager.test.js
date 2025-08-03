/**
 * Unit tests for GraceMemoryManager
 */

const GraceMemoryManager = require('../../__mocks__/GraceMemoryManager');

describe('GraceMemoryManager', () => {
  let memoryManager;

  beforeEach(() => {
    memoryManager = new GraceMemoryManager({
      totalMemoryGB: 480,
      pools: {
        embeddings: 300,
        cache: 100,
        workspace: 80
      }
    });
  });

  afterEach(() => {
    if (memoryManager) {
      memoryManager.cleanup();
    }
  });

  describe('Constructor', () => {
    test('should initialize with default configuration', () => {
      const defaultManager = new GraceMemoryManager();
      expect(defaultManager).toBeDefined();
      expect(defaultManager.config).toBeDefined();
    });

    test('should initialize with custom configuration', () => {
      expect(memoryManager.config.totalMemoryGB).toBe(480);
      expect(memoryManager.config.pools.embeddings).toBe(300);
    });

    test('should throw error for invalid configuration', () => {
      expect(() => {
        new GraceMemoryManager({ totalMemoryGB: -1 });
      }).toThrow('Invalid memory configuration');
    });
  });

  describe('Memory Pool Management', () => {
    test('should create memory pool successfully', async () => {
      const poolId = await memoryManager.createPool('test_pool', 1024 * 1024 * 1024); // 1GB
      expect(poolId).toBeDefined();
      expect(typeof poolId).toBe('string');
    });

    test('should allocate memory from pool', async () => {
      const poolId = await memoryManager.createPool('test_pool', 1024 * 1024 * 1024);
      const allocation = await memoryManager.allocate(poolId, 1024 * 1024); // 1MB
      
      expect(allocation).toBeDefined();
      expect(allocation.size).toBe(1024 * 1024);
      expect(allocation.pointer).toBeDefined();
    });

    test('should free allocated memory', async () => {
      const poolId = await memoryManager.createPool('test_pool', 1024 * 1024 * 1024);
      const allocation = await memoryManager.allocate(poolId, 1024 * 1024);
      
      const freed = await memoryManager.free(allocation.pointer);
      expect(freed).toBe(true);
    });

    test('should handle memory exhaustion gracefully', async () => {
      const poolId = await memoryManager.createPool('small_pool', 1024); // 1KB
      
      await expect(
        memoryManager.allocate(poolId, 2048) // Request 2KB from 1KB pool
      ).rejects.toThrow('Memory allocation failed');
    });

    test('should destroy pool and free all memory', async () => {
      const poolId = await memoryManager.createPool('test_pool', 1024 * 1024 * 1024);
      await memoryManager.allocate(poolId, 1024 * 1024);
      
      const destroyed = await memoryManager.destroyPool(poolId);
      expect(destroyed).toBe(true);
    });
  });

  describe('Grace Memory Specific Features', () => {
    test('should enable unified memory access', async () => {
      const result = await memoryManager.enableUnifiedMemory();
      expect(result).toBe(true);
    });

    test('should check Grace hardware availability', () => {
      const isAvailable = memoryManager.isGraceHardwareAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });

    test('should get memory bandwidth metrics', async () => {
      const metrics = await memoryManager.getBandwidthMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.currentBandwidth).toBeDefined();
      expect(metrics.maxBandwidth).toBeDefined();
    });

    test('should optimize memory layout for Grace architecture', async () => {
      const poolId = await memoryManager.createPool('test_pool', 1024 * 1024 * 1024);
      const optimized = await memoryManager.optimizeForGrace(poolId);
      expect(optimized).toBe(true);
    });
  });

  describe('Memory Statistics', () => {
    test('should return current memory status', async () => {
      const status = await memoryManager.getStatus();
      
      expect(status).toBeDefined();
      expect(status.totalMemory).toBeDefined();
      expect(status.usedMemory).toBeDefined();
      expect(status.freeMemory).toBeDefined();
      expect(status.pools).toBeDefined();
    });

    test('should return detailed memory metrics', async () => {
      const metrics = await memoryManager.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.utilization).toBeDefined();
      expect(metrics.fragmentation).toBeDefined();
      expect(metrics.poolStats).toBeDefined();
    });

    test('should track memory operations', async () => {
      const poolId = await memoryManager.createPool('tracked_pool', 1024 * 1024 * 1024);
      await memoryManager.allocate(poolId, 1024 * 1024);
      
      const stats = await memoryManager.getOperationStats();
      expect(stats.allocations).toBeGreaterThan(0);
      expect(stats.poolCreations).toBeGreaterThan(0);
    });
  });

  describe('Health Checks', () => {
    test('should perform health check', async () => {
      const health = await memoryManager.healthCheck();
      
      expect(health).toBeDefined();
      expect(health.healthy).toBe(true);
      expect(health.timestamp).toBeDefined();
    });

    test('should check if ready for operations', async () => {
      const ready = await memoryManager.isReady();
      expect(typeof ready).toBe('boolean');
    });

    test('should detect memory leaks', async () => {
      const poolId = await memoryManager.createPool('leak_test', 1024 * 1024);
      
      // Allocate without freeing
      await memoryManager.allocate(poolId, 1024);
      await memoryManager.allocate(poolId, 1024);
      
      const leakCheck = await memoryManager.checkForLeaks();
      expect(leakCheck).toBeDefined();
      expect(leakCheck.hasLeaks).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid pool operations', async () => {
      await expect(
        memoryManager.allocate('invalid_pool_id', 1024)
      ).rejects.toThrow('Pool not found');
    });

    test('should handle double free attempts', async () => {
      const poolId = await memoryManager.createPool('test_pool', 1024 * 1024);
      const allocation = await memoryManager.allocate(poolId, 1024);
      
      await memoryManager.free(allocation.pointer);
      
      await expect(
        memoryManager.free(allocation.pointer)
      ).rejects.toThrow('Invalid pointer or already freed');
    });

    test('should handle cleanup during shutdown', async () => {
      const poolId = await memoryManager.createPool('cleanup_test', 1024 * 1024);
      await memoryManager.allocate(poolId, 1024);
      
      const cleanupResult = await memoryManager.cleanup();
      expect(cleanupResult).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    test('should handle rapid allocations', async () => {
      const poolId = await memoryManager.createPool('perf_test', 100 * 1024 * 1024); // 100MB
      const allocations = [];
      
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        const allocation = await memoryManager.allocate(poolId, 1024); // 1KB each
        allocations.push(allocation);
      }
      
      const allocTime = Date.now() - startTime;
      expect(allocTime).toBeLessThan(1000); // Should complete in less than 1 second
      
      // Clean up
      for (const allocation of allocations) {
        await memoryManager.free(allocation.pointer);
      }
    });

    test('should handle memory fragmentation', async () => {
      const poolId = await memoryManager.createPool('frag_test', 10 * 1024 * 1024); // 10MB
      
      // Create fragmentation by alternating allocations and frees
      const allocations = [];
      
      for (let i = 0; i < 50; i++) {
        const allocation = await memoryManager.allocate(poolId, 1024);
        allocations.push(allocation);
      }
      
      // Free every other allocation
      for (let i = 0; i < allocations.length; i += 2) {
        await memoryManager.free(allocations[i].pointer);
      }
      
      const metrics = await memoryManager.getMetrics();
      expect(metrics.fragmentation).toBeDefined();
      expect(metrics.fragmentation).toBeGreaterThan(0);
    });
  });
});