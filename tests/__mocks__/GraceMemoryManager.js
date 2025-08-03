/**
 * Mock GraceMemoryManager for testing
 */

class GraceMemoryManager {
  constructor(config = {}) {
    // Validate configuration
    if (config.totalMemoryGB !== undefined && config.totalMemoryGB < 0) {
      throw new Error('Invalid memory configuration');
    }
    
    this.config = {
      totalMemoryGB: 480,
      pools: {
        embeddings: 300,
        cache: 100,
        workspace: 80
      },
      ...config
    };
    this.pools = new Map();
    this.allocations = new Map();
    this.isInitialized = false;
    this.operationStats = {
      allocations: 0,
      poolCreations: 0,
      frees: 0
    };
  }

  async initialize() {
    this.isInitialized = true;
    return { success: true };
  }

  async cleanup() {
    this.pools.clear();
    this.allocations.clear();
    this.isInitialized = false;
    return true;
  }

  async createPool(name, size) {
    const poolId = `pool_${name}_${Date.now()}`;
    this.pools.set(poolId, {
      name,
      size,
      used: 0,
      allocations: new Map()
    });
    this.operationStats.poolCreations++;
    return poolId;
  }

  async allocate(poolId, size) {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error('Pool not found');
    }

    if (pool.used + size > pool.size) {
      throw new Error('Memory allocation failed');
    }

    const allocationId = `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const allocation = {
      pointer: allocationId,
      size,
      poolId
    };

    pool.allocations.set(allocationId, allocation);
    pool.used += size;
    this.allocations.set(allocationId, allocation);
    this.operationStats.allocations++;

    return allocation;
  }

  async free(pointer) {
    const allocation = this.allocations.get(pointer);
    if (!allocation) {
      throw new Error('Invalid pointer or already freed');
    }

    const pool = this.pools.get(allocation.poolId);
    if (pool) {
      pool.allocations.delete(pointer);
      pool.used -= allocation.size;
    }

    this.allocations.delete(pointer);
    this.operationStats.frees++;
    return true;
  }

  async destroyPool(poolId) {
    const pool = this.pools.get(poolId);
    if (!pool) return false;

    // Free all allocations in the pool
    for (const allocation of pool.allocations.values()) {
      this.allocations.delete(allocation.pointer);
    }

    this.pools.delete(poolId);
    return true;
  }

  async enableUnifiedMemory() {
    return true;
  }

  isGraceHardwareAvailable() {
    return false; // Mock as false in test environment
  }

  async getBandwidthMetrics() {
    return {
      currentBandwidth: 750 * 1024 * 1024 * 1024, // 750 GB/s
      maxBandwidth: 900 * 1024 * 1024 * 1024,     // 900 GB/s
      utilization: 0.83
    };
  }

  async optimizeForGrace(poolId) {
    return this.pools.has(poolId);
  }

  async getStatus() {
    const totalUsed = Array.from(this.pools.values()).reduce((sum, pool) => sum + pool.used, 0);
    const totalSize = this.config.totalMemoryGB * 1024 * 1024 * 1024;

    return {
      totalMemory: totalSize,
      usedMemory: totalUsed,
      freeMemory: totalSize - totalUsed,
      pools: Object.fromEntries(
        Array.from(this.pools.entries()).map(([id, pool]) => [
          pool.name,
          {
            size: pool.size,
            used: pool.used,
            free: pool.size - pool.used,
            utilization: pool.used / pool.size
          }
        ])
      )
    };
  }

  async getMetrics() {
    const status = await this.getStatus();
    return {
      utilization: status.usedMemory / status.totalMemory,
      fragmentation: 0.15, // Mock fragmentation
      poolStats: status.pools,
      used: status.usedMemory,
      total: status.totalMemory,
      poolUtilization: {
        embeddings: 0.75,
        cache: 0.60,
        workspace: 0.25
      }
    };
  }

  async getDetailedMetrics() {
    return await this.getMetrics();
  }

  async getOperationStats() {
    return { ...this.operationStats };
  }

  async healthCheck() {
    return {
      healthy: this.isInitialized,
      timestamp: new Date().toISOString(),
      totalPools: this.pools.size,
      totalAllocations: this.allocations.size
    };
  }

  async isReady() {
    return this.isInitialized;
  }

  async checkForLeaks() {
    // Simple leak detection - check for allocations without corresponding pools
    let hasLeaks = false;
    for (const allocation of this.allocations.values()) {
      if (!this.pools.has(allocation.poolId)) {
        hasLeaks = true;
        break;
      }
    }

    return {
      hasLeaks,
      leakCount: hasLeaks ? 1 : 0,
      orphanedAllocations: hasLeaks ? ['mock_leak'] : []
    };
  }

  async getAvailableMemory() {
    const status = await this.getStatus();
    return status.freeMemory;
  }
}

module.exports = GraceMemoryManager;