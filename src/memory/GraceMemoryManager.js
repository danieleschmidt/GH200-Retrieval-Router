/**
 * GraceMemoryManager - Unified memory management for Grace Hopper architecture
 * Manages 480GB unified memory pools with 900GB/s bandwidth optimization
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');
const { validateMemoryConfig } = require('../utils/validators');

class GraceMemoryManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            totalMemoryGB: config.totalMemoryGB || 480,
            embeddingsPoolGB: config.embeddingsPoolGB || 300,
            cachePoolGB: config.cachePoolGB || 100,
            workspacePoolGB: config.workspacePoolGB || 80,
            enableZeroCopy: config.enableZeroCopy !== false,
            memoryAlignment: config.memoryAlignment || 64,
            ...config
        };
        
        validateMemoryConfig(this.config);
        
        // Memory pools
        this.pools = {
            embeddings: {
                allocated: 0,
                available: this.config.embeddingsPoolGB * 1024 * 1024 * 1024,
                segments: new Map(),
                pinnedRegions: new Set()
            },
            cache: {
                allocated: 0,
                available: this.config.cachePoolGB * 1024 * 1024 * 1024,
                segments: new Map(),
                lruCache: new Map()
            },
            workspace: {
                allocated: 0,
                available: this.config.workspacePoolGB * 1024 * 1024 * 1024,
                segments: new Map(),
                tempAllocations: new Set()
            }
        };
        
        // Performance tracking
        this.stats = {
            totalAllocations: 0,
            totalDeallocations: 0,
            peakUsage: 0,
            fragmentationRatio: 0,
            bandwidthUtilization: 0,
            allocationFailures: 0,
            defragmentationEvents: 0
        };
        
        // GPU resource tracking
        this.gpuResources = {
            discoveredGPUs: [],
            activeAllocations: new Map(),
            utilizationHistory: [],
            bandwidthMetrics: {
                currentThroughput: 0,
                peakThroughput: 0,
                averageThroughput: 0
            }
        };
        
        this.initialized = false;
    }
    
    /**
     * Initialize Grace memory manager
     */
    async initialize() {
        if (this.initialized) {
            throw new Error('GraceMemoryManager already initialized');
        }
        
        logger.info('Initializing Grace Memory Manager', {
            totalMemoryGB: this.config.totalMemoryGB,
            embeddingsPoolGB: this.config.embeddingsPoolGB,
            cachePoolGB: this.config.cachePoolGB,
            workspacePoolGB: this.config.workspacePoolGB,
            zeroCopyEnabled: this.config.enableZeroCopy
        });
        
        try {
            // Discover available GPU resources
            await this._discoverGPUResources();
            
            // Initialize memory pools
            await this._initializePools();
            
            // Setup memory monitoring
            this._startMemoryMonitoring();
            
            // Configure zero-copy transfers if enabled
            if (this.config.enableZeroCopy) {
                await this._enableZeroCopyTransfers();
            }
            
            // Start adaptive allocation monitoring
            this._startAdaptiveAllocation();
            
            this.initialized = true;
            this.emit('initialized');
            
            logger.info('Grace Memory Manager initialized successfully', {
                availableMemory: this.getAvailableMemory(),
                zeroCopyEnabled: this.config.enableZeroCopy
            });
            
        } catch (error) {
            logger.error('Grace Memory Manager initialization failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Allocate memory from specified pool
     * @param {string} poolName - Name of memory pool
     * @param {number} sizeBytes - Size in bytes to allocate
     * @param {Object} options - Allocation options
     * @returns {Promise<Object>} Memory allocation descriptor
     */
    async allocate(poolName, sizeBytes, options = {}) {
        if (!this.initialized) {
            throw new Error('GraceMemoryManager not initialized');
        }
        
        const pool = this.pools[poolName];
        if (!pool) {
            throw new Error(`Invalid pool name: ${poolName}`);
        }
        
        if (pool.available < sizeBytes) {
            // Attempt garbage collection and defragmentation
            await this._garbageCollect(poolName);
            
            if (pool.available < sizeBytes) {
                throw new Error(`Insufficient memory in pool '${poolName}': requested ${sizeBytes}, available ${pool.available}`);
            }
        }
        
        const alignedSize = this._alignSize(sizeBytes);
        const segmentId = this._generateSegmentId();
        
        const allocation = {
            id: segmentId,
            pool: poolName,
            size: alignedSize,
            address: this._allocateSegment(pool, alignedSize),
            pinned: options.pinned || false,
            zeroCopy: options.zeroCopy && this.config.enableZeroCopy,
            timestamp: Date.now()
        };
        
        pool.segments.set(segmentId, allocation);
        pool.allocated += alignedSize;
        pool.available -= alignedSize;
        
        if (allocation.pinned) {
            pool.pinnedRegions.add(segmentId);
        }
        
        this.stats.totalAllocations++;
        this._updatePeakUsage();
        
        logger.debug('Memory allocated', {
            segmentId,
            pool: poolName,
            size: alignedSize,
            pinned: allocation.pinned,
            zeroCopy: allocation.zeroCopy
        });
        
        this.emit('memoryAllocated', allocation);
        
        return allocation;
    }
    
    /**
     * Deallocate memory segment
     * @param {string} segmentId - Segment identifier
     */
    async deallocate(segmentId) {
        if (!this.initialized) {
            throw new Error('GraceMemoryManager not initialized');
        }
        
        let allocation = null;
        let pool = null;
        
        // Find allocation across all pools
        for (const [poolName, poolData] of Object.entries(this.pools)) {
            if (poolData.segments.has(segmentId)) {
                allocation = poolData.segments.get(segmentId);
                pool = poolData;
                break;
            }
        }
        
        if (!allocation) {
            throw new Error(`Segment not found: ${segmentId}`);
        }
        
        // Remove from pool
        pool.segments.delete(segmentId);
        pool.allocated -= allocation.size;
        pool.available += allocation.size;
        
        if (allocation.pinned) {
            pool.pinnedRegions.delete(segmentId);
        }
        
        this.stats.totalDeallocations++;
        
        logger.debug('Memory deallocated', {
            segmentId,
            pool: allocation.pool,
            size: allocation.size
        });
        
        this.emit('memoryDeallocated', allocation);
    }
    
    /**
     * Pin data to Grace memory for zero-copy access
     * @param {Buffer|ArrayBuffer} data - Data to pin
     * @param {string} poolName - Target memory pool
     * @returns {Promise<Object>} Pinned memory descriptor
     */
    async pinToGrace(data, poolName = 'embeddings') {
        if (!this.config.enableZeroCopy) {
            throw new Error('Zero-copy not enabled');
        }
        
        const allocation = await this.allocate(poolName, data.byteLength, {
            pinned: true,
            zeroCopy: true
        });
        
        // Copy data to Grace memory (simulated)
        // In real implementation, this would use CUDA unified memory APIs
        logger.debug('Data pinned to Grace memory', {
            segmentId: allocation.id,
            size: data.byteLength,
            pool: poolName
        });
        
        return allocation;
    }
    
    /**
     * Get memory statistics
     */
    getStats() {
        const totalAllocated = Object.values(this.pools)
            .reduce((sum, pool) => sum + pool.allocated, 0);
            
        const totalAvailable = Object.values(this.pools)
            .reduce((sum, pool) => sum + pool.available, 0);
        
        return {
            ...this.stats,
            totalAllocated,
            totalAvailable,
            utilizationRatio: totalAllocated / (totalAllocated + totalAvailable),
            pools: Object.fromEntries(
                Object.entries(this.pools).map(([name, pool]) => [
                    name,
                    {
                        allocated: pool.allocated,
                        available: pool.available,
                        segments: pool.segments.size,
                        pinnedRegions: pool.pinnedRegions?.size || 0
                    }
                ])
            )
        };
    }
    
    /**
     * Get available memory across all pools
     */
    getAvailableMemory() {
        return Object.values(this.pools)
            .reduce((sum, pool) => sum + pool.available, 0);
    }
    
    /**
     * Perform health check on memory manager
     */
    async healthCheck() {
        try {
            const stats = this.getStats();
            const utilizationRatio = stats.utilizationRatio || 0;
            const fragmentationRatio = stats.fragmentationRatio || 0;
            
            // Consider healthy if utilization is below 90% and fragmentation is low
            const healthy = utilizationRatio < 0.9 && fragmentationRatio < 0.5;
            
            return {
                healthy,
                timestamp: new Date().toISOString(),
                utilizationRatio,
                fragmentationRatio,
                totalAllocated: stats.totalAllocated,
                totalAvailable: stats.totalAvailable,
                peakUsage: stats.peakUsage,
                pools: stats.pools
            };
        } catch (error) {
            logger.error('Health check failed', { error: error.message });
            return {
                healthy: false,
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }
    
    /**
     * Check if memory manager is ready for operations
     */
    async isReady() {
        return this.initialized;
    }
    
    /**
     * Perform garbage collection on specified pool
     */
    async _garbageCollect(poolName) {
        const pool = this.pools[poolName];
        if (!pool) return;
        
        logger.debug(`Performing garbage collection on pool '${poolName}'`);
        
        // Clean up expired allocations (simplified logic)
        const now = Date.now();
        const expiredThreshold = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [segmentId, allocation] of pool.segments) {
            if (!allocation.pinned && (now - allocation.timestamp) > expiredThreshold) {
                await this.deallocate(segmentId);
            }
        }
        
        // Update fragmentation statistics
        this._updateFragmentationStats(poolName);
    }
    
    /**
     * Initialize memory pools
     */
    async _initializePools() {
        logger.debug('Initializing memory pools');
        
        // Validate pool sizes don't exceed total memory
        const totalPoolSize = this.config.embeddingsPoolGB + 
                             this.config.cachePoolGB + 
                             this.config.workspacePoolGB;
        
        if (totalPoolSize > this.config.totalMemoryGB) {
            throw new Error(`Pool sizes exceed total memory: ${totalPoolSize}GB > ${this.config.totalMemoryGB}GB`);
        }
        
        // Initialize each pool
        for (const [poolName, pool] of Object.entries(this.pools)) {
            logger.debug(`Initialized pool '${poolName}'`, {
                available: pool.available,
                sizeGB: pool.available / (1024 * 1024 * 1024)
            });
        }
    }
    
    /**
     * Enable zero-copy transfers
     */
    async _enableZeroCopyTransfers() {
        logger.debug('Enabling zero-copy transfers');
        // In real implementation, this would configure CUDA unified memory
        // and set up Grace-specific memory mapping
    }
    
    /**
     * Start memory monitoring
     */
    _startMemoryMonitoring() {
        setInterval(() => {
            this._updateMemoryStats();
        }, 5000); // Update every 5 seconds
    }
    
    /**
     * Update memory statistics
     */
    _updateMemoryStats() {
        this._updatePeakUsage();
        this._updateBandwidthUtilization();
        
        // Emit memory status
        this.emit('memoryStats', this.getStats());
    }
    
    /**
     * Update peak memory usage
     */
    _updatePeakUsage() {
        const currentUsage = Object.values(this.pools)
            .reduce((sum, pool) => sum + pool.allocated, 0);
            
        if (currentUsage > this.stats.peakUsage) {
            this.stats.peakUsage = currentUsage;
        }
    }
    
    /**
     * Update bandwidth utilization metrics
     */
    _updateBandwidthUtilization() {
        // Simplified bandwidth calculation
        // In real implementation, this would measure actual memory bandwidth usage
        const utilizationRatio = Object.values(this.pools)
            .reduce((sum, pool) => sum + pool.allocated, 0) / 
            (this.config.totalMemoryGB * 1024 * 1024 * 1024);
            
        this.stats.bandwidthUtilization = Math.min(utilizationRatio * 900, 900); // Max 900GB/s
    }
    
    /**
     * Update fragmentation statistics
     */
    _updateFragmentationStats(poolName) {
        const pool = this.pools[poolName];
        if (!pool) return;
        
        // Simplified fragmentation calculation
        const totalSegments = pool.segments.size;
        const avgSegmentSize = totalSegments > 0 ? pool.allocated / totalSegments : 0;
        const idealSegmentSize = 1024 * 1024; // 1MB
        
        this.stats.fragmentationRatio = Math.abs(avgSegmentSize - idealSegmentSize) / idealSegmentSize;
    }
    
    /**
     * Align memory size to configured boundary
     */
    _alignSize(size) {
        const alignment = this.config.memoryAlignment;
        return Math.ceil(size / alignment) * alignment;
    }
    
    /**
     * Generate unique segment identifier
     */
    _generateSegmentId() {
        return `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Allocate memory segment (simulated)
     */
    _allocateSegment(pool, size) {
        // In real implementation, this would use actual memory allocation APIs
        return `0x${Math.random().toString(16).substr(2, 8).padStart(8, '0')}`;
    }
    
    /**
     * Discover available GPU resources
     * @private
     */
    async _discoverGPUResources() {
        logger.debug('Discovering GPU resources...');
        
        try {
            // Simulate GPU discovery (in real implementation would use nvidia-ml-py)
            const mockGPUs = [];
            const gpuCount = parseInt(process.env.GPU_COUNT) || 4;
            
            for (let i = 0; i < gpuCount; i++) {
                const gpu = {
                    id: i,
                    name: `NVIDIA GH200 Grace Hopper ${i}`,
                    totalMemoryGB: 480,
                    availableMemoryGB: 450,
                    computeCapability: '9.0',
                    bandwidth: {
                        memoryBandwidth: 4900, // GB/s
                        nvlinkBandwidth: 900    // GB/s
                    },
                    utilization: {
                        compute: 0,
                        memory: 0,
                        encoder: 0,
                        decoder: 0
                    },
                    temperature: 65,
                    powerDraw: 700 // Watts
                };
                
                mockGPUs.push(gpu);
            }
            
            this.gpuResources.discoveredGPUs = mockGPUs;
            
            logger.info('GPU resource discovery complete', {
                gpuCount: mockGPUs.length,
                totalGPUMemory: mockGPUs.reduce((sum, gpu) => sum + gpu.totalMemoryGB, 0),
                totalAvailableMemory: mockGPUs.reduce((sum, gpu) => sum + gpu.availableMemoryGB, 0)
            });
            
            this.emit('gpuResourcesDiscovered', mockGPUs);
            
        } catch (error) {
            logger.warn('GPU resource discovery failed, falling back to CPU-only mode', {
                error: error.message
            });
            
            // Fallback to CPU-only configuration
            this.gpuResources.discoveredGPUs = [];
        }
    }
    
    /**
     * Start adaptive allocation monitoring
     * @private
     */
    _startAdaptiveAllocation() {
        logger.debug('Starting adaptive allocation monitoring');
        
        // Monitor allocation patterns every 10 seconds
        setInterval(() => {
            this._analyzeAllocationPatterns();
        }, 10000);
        
        // Perform pool rebalancing every minute
        setInterval(() => {
            this._rebalancePools();
        }, 60000);
    }
    
    /**
     * Analyze allocation patterns for optimization
     * @private
     */
    _analyzeAllocationPatterns() {
        const stats = this.getStats();
        
        // Track utilization history
        this.gpuResources.utilizationHistory.push({
            timestamp: Date.now(),
            utilizationRatio: stats.utilizationRatio || 0,
            fragmentationRatio: stats.fragmentationRatio || 0,
            bandwidthUtilization: this.stats.bandwidthUtilization
        });
        
        // Keep only last 100 entries
        if (this.gpuResources.utilizationHistory.length > 100) {
            this.gpuResources.utilizationHistory.shift();
        }
        
        // Check for allocation optimization opportunities
        this._optimizeAllocations();
    }
    
    /**
     * Optimize memory allocations based on usage patterns
     * @private
     */
    _optimizeAllocations() {
        const recentHistory = this.gpuResources.utilizationHistory.slice(-10);
        if (recentHistory.length < 5) return;
        
        const avgUtilization = recentHistory.reduce((sum, entry) => sum + entry.utilizationRatio, 0) / recentHistory.length;
        const avgFragmentation = recentHistory.reduce((sum, entry) => sum + entry.fragmentationRatio, 0) / recentHistory.length;
        
        // If high fragmentation detected, trigger defragmentation
        if (avgFragmentation > 0.4) {
            logger.info('High fragmentation detected, triggering defragmentation', {
                avgFragmentation,
                threshold: 0.4
            });
            
            this._defragmentPools();
        }
        
        // If consistently high utilization, suggest pool expansion
        if (avgUtilization > 0.85) {
            logger.warn('High memory utilization detected', {
                avgUtilization,
                suggestion: 'Consider increasing memory pool sizes or adding more GPUs'
            });
            
            this.emit('highUtilizationWarning', {
                avgUtilization,
                recentHistory
            });
        }
    }
    
    /**
     * Rebalance memory pools based on usage patterns
     * @private
     */
    _rebalancePools() {
        logger.debug('Performing pool rebalancing analysis');
        
        const stats = this.getStats();
        const pools = stats.pools;
        
        // Find underutilized pools
        const underutilizedPools = Object.entries(pools)
            .filter(([name, pool]) => {
                const utilization = pool.allocated / (pool.allocated + pool.available);
                return utilization < 0.3 && pool.allocated > 0;
            });
        
        // Find overutilized pools
        const overutilizedPools = Object.entries(pools)
            .filter(([name, pool]) => {
                const utilization = pool.allocated / (pool.allocated + pool.available);
                return utilization > 0.9;
            });
        
        if (underutilizedPools.length > 0 && overutilizedPools.length > 0) {
            logger.info('Pool imbalance detected', {
                underutilized: underutilizedPools.map(([name]) => name),
                overutilized: overutilizedPools.map(([name]) => name)
            });
            
            // Emit rebalancing suggestion
            this.emit('poolRebalancingSuggested', {
                underutilized: underutilizedPools,
                overutilized: overutilizedPools
            });
        }
    }
    
    /**
     * Perform defragmentation on all pools
     * @private
     */
    async _defragmentPools() {
        logger.info('Starting memory defragmentation');
        
        this.stats.defragmentationEvents++;
        
        for (const poolName of Object.keys(this.pools)) {
            await this._defragmentPool(poolName);
        }
        
        logger.info('Memory defragmentation complete');
        this.emit('defragmentationComplete');
    }
    
    /**
     * Defragment a specific memory pool
     * @private
     */
    async _defragmentPool(poolName) {
        const pool = this.pools[poolName];
        if (!pool || pool.segments.size === 0) return;
        
        logger.debug(`Defragmenting pool '${poolName}'`);
        
        // Simplified defragmentation: consolidate small allocations
        const smallAllocations = Array.from(pool.segments.values())
            .filter(allocation => allocation.size < 1024 * 1024 && !allocation.pinned) // < 1MB
            .sort((a, b) => a.timestamp - b.timestamp); // Oldest first
        
        if (smallAllocations.length > 10) {
            logger.debug(`Found ${smallAllocations.length} small allocations for consolidation in pool '${poolName}'`);
        }
    }
    
    /**
     * Get GPU resource information
     */
    getGPUResources() {
        return {
            discoveredGPUs: this.gpuResources.discoveredGPUs,
            activeAllocations: this.gpuResources.activeAllocations.size,
            bandwidthMetrics: this.gpuResources.bandwidthMetrics,
            utilizationHistory: this.gpuResources.utilizationHistory.slice(-20) // Last 20 entries
        };
    }
    
    /**
     * Allocate GPU-optimized memory
     */
    async allocateGPUOptimized(sizeBytes, options = {}) {
        const gpuId = options.preferredGPU || this._selectOptimalGPU();
        
        if (gpuId !== null && this.gpuResources.discoveredGPUs[gpuId]) {
            // Allocate on specific GPU
            const allocation = await this.allocate('embeddings', sizeBytes, {
                ...options,
                gpuId,
                gpuOptimized: true
            });
            
            this.gpuResources.activeAllocations.set(allocation.id, {
                gpuId,
                size: sizeBytes,
                timestamp: Date.now()
            });
            
            return allocation;
        } else {
            // Fall back to regular allocation
            return await this.allocate('embeddings', sizeBytes, options);
        }
    }
    
    /**
     * Select optimal GPU for allocation
     * @private
     */
    _selectOptimalGPU() {
        if (this.gpuResources.discoveredGPUs.length === 0) {
            return null;
        }
        
        // Find GPU with lowest memory utilization
        let optimalGPU = null;
        let lowestUtilization = Infinity;
        
        this.gpuResources.discoveredGPUs.forEach((gpu, index) => {
            const utilization = (gpu.totalMemoryGB - gpu.availableMemoryGB) / gpu.totalMemoryGB;
            if (utilization < lowestUtilization) {
                lowestUtilization = utilization;
                optimalGPU = index;
            }
        });
        
        return optimalGPU;
    }
    
    /**
     * Gracefully shutdown memory manager
     */
    async shutdown() {
        if (!this.initialized) {
            return;
        }
        
        logger.info('Shutting down Grace Memory Manager');
        
        try {
            // Deallocate all non-pinned memory
            for (const [poolName, pool] of Object.entries(this.pools)) {
                for (const [segmentId, allocation] of pool.segments) {
                    if (!allocation.pinned) {
                        await this.deallocate(segmentId);
                    }
                }
            }
            
            this.initialized = false;
            this.emit('shutdown');
            
            logger.info('Grace Memory Manager shutdown complete');
            
        } catch (error) {
            logger.error('Error during Grace Memory Manager shutdown', { error: error.message });
            throw error;
        }
    }
}

module.exports = { GraceMemoryManager };
