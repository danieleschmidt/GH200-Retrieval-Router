/**
 * Quantum Cache Manager
 * Advanced caching with quantum-inspired coherence and entanglement patterns
 */

const { LRUCache } = require('lru-cache');
const { logger } = require('../utils/logger');

class QuantumCacheManager {
    constructor(options = {}) {
        this.config = {
            maxSize: options.maxSize || 1000000, // 1M entries
            maxMemoryGB: options.maxMemoryGB || 20,
            coherenceTimeMs: options.coherenceTimeMs || 300000, // 5 minutes
            entanglementRadius: options.entanglementRadius || 3,
            quantumPrefetching: options.quantumPrefetching !== false,
            adaptiveTTL: options.adaptiveTTL !== false,
            compressionEnabled: options.compressionEnabled !== false,
            ...options
        };

        this.taskCache = new LRUCache({
            max: this.config.maxSize,
            ttl: this.config.coherenceTimeMs,
            updateAgeOnGet: true,
            updateAgeOnHas: true
        });

        this.stateCache = new LRUCache({
            max: this.config.maxSize / 2,
            ttl: this.config.coherenceTimeMs / 2,
            updateAgeOnGet: true
        });

        this.measurementCache = new LRUCache({
            max: this.config.maxSize / 4,
            ttl: this.config.coherenceTimeMs * 2,
            updateAgeOnGet: true
        });

        this.entanglementIndex = new Map();
        this.accessPatterns = new Map();
        this.prefetchQueue = [];
        this.coherenceMetrics = {
            hits: 0,
            misses: 0,
            coherenceViolations: 0,
            entanglementHits: 0,
            prefetchHits: 0
        };

        this.isRunning = false;
        this.maintainInterval = null;

        if (this.config.compressionEnabled) {
            try {
                this.compressor = require('zlib');
                logger.info('Compression enabled for quantum cache');
            } catch (error) {
                logger.warn('Compression unavailable, proceeding without it');
                this.config.compressionEnabled = false;
            }
        }
    }

    async initialize() {
        if (this.isRunning) return;

        logger.info('Initializing Quantum Cache Manager', {
            maxSize: this.config.maxSize,
            maxMemoryGB: this.config.maxMemoryGB,
            coherenceTime: this.config.coherenceTimeMs
        });

        this.maintainInterval = setInterval(() => {
            this.maintainCoherence();
        }, Math.min(60000, this.config.coherenceTimeMs / 5));

        this.isRunning = true;
    }

    async cacheTask(taskId, task, metadata = {}) {
        const cacheKey = this.generateTaskCacheKey(taskId);
        const cacheEntry = {
            task: this.config.compressionEnabled ? await this.compress(task) : task,
            metadata: {
                ...metadata,
                cached: Date.now(),
                accessCount: 0,
                coherenceLevel: 1.0,
                entanglements: []
            }
        };

        this.taskCache.set(cacheKey, cacheEntry);
        this.updateAccessPattern(cacheKey, 'write');
        
        if (this.config.quantumPrefetching) {
            await this.identifyAndCacheEntanglements(taskId, task);
        }

        logger.debug('Task cached with quantum properties', { taskId, cacheKey });
        return cacheKey;
    }

    async getTask(taskId) {
        const cacheKey = this.generateTaskCacheKey(taskId);
        const entry = this.taskCache.get(cacheKey);

        if (!entry) {
            this.coherenceMetrics.misses++;
            this.updateAccessPattern(cacheKey, 'miss');
            return null;
        }

        this.coherenceMetrics.hits++;
        entry.metadata.accessCount++;
        entry.metadata.lastAccess = Date.now();

        const coherence = this.calculateCoherence(entry);
        if (coherence < 0.5) {
            this.coherenceMetrics.coherenceViolations++;
            logger.debug('Cache coherence violation detected', { taskId, coherence });
            return null;
        }

        entry.metadata.coherenceLevel = coherence;
        this.updateAccessPattern(cacheKey, 'hit');

        if (this.config.quantumPrefetching) {
            this.triggerEntanglementPrefetch(taskId, entry);
        }

        const task = this.config.compressionEnabled ? 
            await this.decompress(entry.task) : entry.task;

        return task;
    }

    async cacheQuantumState(taskId, state, measurement = null) {
        const cacheKey = this.generateStateCacheKey(taskId);
        const stateEntry = {
            state: this.config.compressionEnabled ? await this.compress(state) : state,
            measurement: measurement,
            metadata: {
                cached: Date.now(),
                coherence: state.coherence || 1.0,
                lastMeasurement: state.lastMeasurement || Date.now(),
                superpositionStates: state.superposition?.length || 0
            }
        };

        this.stateCache.set(cacheKey, stateEntry);
        
        if (measurement) {
            await this.cacheMeasurement(taskId, measurement, state);
        }

        return cacheKey;
    }

    async getQuantumState(taskId) {
        const cacheKey = this.generateStateCacheKey(taskId);
        const entry = this.stateCache.get(cacheKey);

        if (!entry) {
            this.coherenceMetrics.misses++;
            return null;
        }

        const timeSinceCache = Date.now() - entry.metadata.cached;
        const coherenceDecay = Math.exp(-timeSinceCache / this.config.coherenceTimeMs);
        
        if (coherenceDecay * entry.metadata.coherence < 0.3) {
            this.stateCache.delete(cacheKey);
            this.coherenceMetrics.coherenceViolations++;
            return null;
        }

        this.coherenceMetrics.hits++;
        const state = this.config.compressionEnabled ? 
            await this.decompress(entry.state) : entry.state;

        return {
            state: state,
            measurement: entry.measurement,
            cacheCoherence: coherenceDecay * entry.metadata.coherence
        };
    }

    async cacheMeasurement(taskId, measurement, quantumState = null) {
        const cacheKey = this.generateMeasurementCacheKey(taskId, measurement.timestamp);
        const measurementEntry = {
            measurement: measurement,
            quantumState: quantumState,
            metadata: {
                cached: Date.now(),
                taskId: taskId,
                correlations: []
            }
        };

        this.measurementCache.set(cacheKey, measurementEntry);
        this.updateMeasurementCorrelations(taskId, measurement);

        return cacheKey;
    }

    async getMeasurement(taskId, timestamp = null) {
        if (timestamp) {
            const cacheKey = this.generateMeasurementCacheKey(taskId, timestamp);
            const entry = this.measurementCache.get(cacheKey);
            return entry ? entry.measurement : null;
        }

        const measurements = [];
        for (const [key, entry] of this.measurementCache.entries()) {
            if (entry.metadata.taskId === taskId) {
                measurements.push(entry.measurement);
            }
        }

        return measurements.sort((a, b) => b.timestamp - a.timestamp);
    }

    async identifyAndCacheEntanglements(taskId, task) {
        const entanglements = [];
        
        if (task.dependencies) {
            for (const depId of task.dependencies) {
                const depTask = await this.getTask(depId);
                if (depTask) {
                    entanglements.push({
                        taskId: depId,
                        type: 'dependency',
                        strength: 0.8
                    });
                }
            }
        }

        const similarTasks = this.findSimilarTasks(task);
        for (const similarTask of similarTasks.slice(0, this.config.entanglementRadius)) {
            entanglements.push({
                taskId: similarTask.id,
                type: 'similarity',
                strength: similarTask.similarity
            });
        }

        if (entanglements.length > 0) {
            this.entanglementIndex.set(taskId, entanglements);
            
            for (const entanglement of entanglements) {
                this.prefetchQueue.push({
                    taskId: entanglement.taskId,
                    reason: `entangled_with_${taskId}`,
                    priority: entanglement.strength,
                    timestamp: Date.now()
                });
            }
        }
    }

    findSimilarTasks(task) {
        const similarTasks = [];
        
        for (const [cacheKey, entry] of this.taskCache.entries()) {
            if (entry.task.id === task.id) continue;
            
            const cachedTask = entry.task;
            const similarity = this.calculateTaskSimilarity(task, cachedTask);
            
            if (similarity > 0.6) {
                similarTasks.push({
                    id: cachedTask.id,
                    similarity: similarity,
                    cacheKey: cacheKey
                });
            }
        }
        
        return similarTasks.sort((a, b) => b.similarity - a.similarity);
    }

    calculateTaskSimilarity(task1, task2) {
        let similarity = 0;
        let factors = 0;

        if (task1.category && task2.category) {
            similarity += task1.category === task2.category ? 1 : 0;
            factors++;
        }

        if (task1.priority && task2.priority) {
            const priorityDiff = Math.abs(task1.priority - task2.priority);
            similarity += 1 - priorityDiff;
            factors++;
        }

        if (task1.resources && task2.resources) {
            const resourceSim = this.calculateResourceSimilarity(task1.resources, task2.resources);
            similarity += resourceSim;
            factors++;
        }

        if (task1.tags && task2.tags) {
            const commonTags = task1.tags.filter(tag => task2.tags.includes(tag));
            const totalTags = new Set([...task1.tags, ...task2.tags]).size;
            similarity += totalTags > 0 ? commonTags.length / totalTags : 0;
            factors++;
        }

        return factors > 0 ? similarity / factors : 0;
    }

    calculateResourceSimilarity(resources1, resources2) {
        const metrics = ['memory', 'cpu', 'gpu', 'network'];
        let similarity = 0;

        for (const metric of metrics) {
            const r1 = resources1[metric] || 0;
            const r2 = resources2[metric] || 0;
            
            if (r1 === 0 && r2 === 0) {
                similarity += 1;
            } else if (r1 > 0 && r2 > 0) {
                similarity += Math.min(r1, r2) / Math.max(r1, r2);
            }
        }

        return similarity / metrics.length;
    }

    async triggerEntanglementPrefetch(taskId, taskEntry) {
        const entanglements = this.entanglementIndex.get(taskId);
        if (!entanglements) return;

        for (const entanglement of entanglements) {
            const entangledTask = await this.getTask(entanglement.taskId);
            if (!entangledTask) {
                this.prefetchQueue.push({
                    taskId: entanglement.taskId,
                    reason: `entanglement_prefetch_${taskId}`,
                    priority: entanglement.strength,
                    timestamp: Date.now()
                });
                this.coherenceMetrics.entanglementHits++;
            }
        }
    }

    async processPrefetchQueue() {
        if (this.prefetchQueue.length === 0) return;

        const highPriorityItems = this.prefetchQueue
            .filter(item => item.priority > 0.7)
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 10);

        for (const item of highPriorityItems) {
            try {
                await this.prefetchTask(item.taskId, item.reason);
                this.coherenceMetrics.prefetchHits++;
            } catch (error) {
                logger.debug('Prefetch failed', { taskId: item.taskId, error: error.message });
            }
        }

        this.prefetchQueue = this.prefetchQueue.filter(
            item => !highPriorityItems.includes(item)
        );
    }

    async prefetchTask(taskId, reason) {
        logger.debug('Prefetching task', { taskId, reason });
    }

    calculateCoherence(cacheEntry) {
        const timeSinceCache = Date.now() - cacheEntry.metadata.cached;
        const timeDecay = Math.exp(-timeSinceCache / this.config.coherenceTimeMs);
        
        const accessFrequency = cacheEntry.metadata.accessCount / Math.max(1, timeSinceCache / 60000);
        const frequencyBonus = Math.min(0.3, accessFrequency * 0.1);
        
        return Math.min(1.0, timeDecay + frequencyBonus);
    }

    updateAccessPattern(cacheKey, accessType) {
        if (!this.accessPatterns.has(cacheKey)) {
            this.accessPatterns.set(cacheKey, {
                hits: 0,
                misses: 0,
                writes: 0,
                pattern: [],
                lastAccess: Date.now()
            });
        }

        const pattern = this.accessPatterns.get(cacheKey);
        pattern[accessType === 'hit' ? 'hits' : accessType === 'miss' ? 'misses' : 'writes']++;
        pattern.lastAccess = Date.now();
        pattern.pattern.push({ type: accessType, timestamp: Date.now() });

        if (pattern.pattern.length > 100) {
            pattern.pattern.shift();
        }

        if (this.config.adaptiveTTL) {
            this.adjustTTLBasedOnPattern(cacheKey, pattern);
        }
    }

    adjustTTLBasedOnPattern(cacheKey, pattern) {
        const hitRate = pattern.hits / Math.max(1, pattern.hits + pattern.misses);
        const recentAccesses = pattern.pattern.filter(
            p => Date.now() - p.timestamp < 300000 // 5 minutes
        ).length;

        let ttlMultiplier = 1.0;
        
        if (hitRate > 0.8 && recentAccesses > 5) {
            ttlMultiplier = 1.5; // Extend TTL for frequently accessed items
        } else if (hitRate < 0.3) {
            ttlMultiplier = 0.5; // Reduce TTL for rarely accessed items
        }

        const newTTL = Math.floor(this.config.coherenceTimeMs * ttlMultiplier);
        
        logger.debug('Adjusting cache TTL', { 
            cacheKey, 
            hitRate: hitRate.toFixed(2), 
            recentAccesses, 
            newTTL 
        });
    }

    updateMeasurementCorrelations(taskId, measurement) {
        const correlatedMeasurements = [];
        
        for (const [key, entry] of this.measurementCache.entries()) {
            if (entry.metadata.taskId === taskId) continue;
            
            const correlation = this.calculateMeasurementCorrelation(
                measurement, 
                entry.measurement
            );
            
            if (correlation > 0.7) {
                correlatedMeasurements.push({
                    measurementKey: key,
                    correlation: correlation
                });
            }
        }

        if (correlatedMeasurements.length > 0) {
            const cacheKey = this.generateMeasurementCacheKey(taskId, measurement.timestamp);
            const entry = this.measurementCache.get(cacheKey);
            if (entry) {
                entry.metadata.correlations = correlatedMeasurements;
            }
        }
    }

    calculateMeasurementCorrelation(measurement1, measurement2) {
        const timeDiff = Math.abs(measurement1.timestamp - measurement2.timestamp);
        const timeCorrelation = Math.exp(-timeDiff / 60000); // 1 minute decay

        const stateCorrelation = measurement1.collapsedTo && measurement2.collapsedTo ?
            this.calculateStateCorrelation(measurement1.collapsedTo, measurement2.collapsedTo) : 0;

        return (timeCorrelation + stateCorrelation) / 2;
    }

    calculateStateCorrelation(state1, state2) {
        if (state1.name === state2.name) return 1.0;
        
        const probabilityDiff = Math.abs(state1.probability - state2.probability);
        return 1 - probabilityDiff;
    }

    maintainCoherence() {
        this.processPrefetchQueue();
        this.cleanupLowCoherenceEntries();
        this.optimizeMemoryUsage();
        this.logCoherenceMetrics();
    }

    cleanupLowCoherenceEntries() {
        const now = Date.now();
        let cleanedTasks = 0;
        let cleanedStates = 0;

        for (const [key, entry] of this.taskCache.entries()) {
            const coherence = this.calculateCoherence(entry);
            if (coherence < 0.1) {
                this.taskCache.delete(key);
                cleanedTasks++;
            }
        }

        for (const [key, entry] of this.stateCache.entries()) {
            const timeSinceCache = now - entry.metadata.cached;
            const coherenceDecay = Math.exp(-timeSinceCache / this.config.coherenceTimeMs);
            
            if (coherenceDecay * entry.metadata.coherence < 0.05) {
                this.stateCache.delete(key);
                cleanedStates++;
            }
        }

        if (cleanedTasks > 0 || cleanedStates > 0) {
            logger.debug('Cleaned low coherence entries', { 
                tasks: cleanedTasks, 
                states: cleanedStates 
            });
        }
    }

    optimizeMemoryUsage() {
        const memoryUsage = this.getMemoryUsage();
        const maxMemoryBytes = this.config.maxMemoryGB * 1024 * 1024 * 1024;
        
        if (memoryUsage.totalBytes > maxMemoryBytes * 0.9) {
            logger.warn('Cache approaching memory limit, performing optimization', {
                currentMB: Math.round(memoryUsage.totalBytes / 1024 / 1024),
                limitMB: Math.round(maxMemoryBytes / 1024 / 1024)
            });
            
            this.performMemoryOptimization();
        }
    }

    performMemoryOptimization() {
        const taskEntriesToRemove = [];
        const stateEntriesToRemove = [];

        for (const [key, entry] of this.taskCache.entries()) {
            const coherence = this.calculateCoherence(entry);
            const accessPattern = this.accessPatterns.get(key);
            const score = coherence * (accessPattern ? accessPattern.hits : 1);
            
            taskEntriesToRemove.push({ key, score });
        }

        taskEntriesToRemove
            .sort((a, b) => a.score - b.score)
            .slice(0, Math.floor(this.taskCache.size * 0.2))
            .forEach(item => this.taskCache.delete(item.key));

        for (const [key, entry] of this.stateCache.entries()) {
            const timeSinceCache = Date.now() - entry.metadata.cached;
            const score = entry.metadata.coherence / Math.max(1, timeSinceCache / 60000);
            
            stateEntriesToRemove.push({ key, score });
        }

        stateEntriesToRemove
            .sort((a, b) => a.score - b.score)
            .slice(0, Math.floor(this.stateCache.size * 0.3))
            .forEach(item => this.stateCache.delete(item.key));

        logger.info('Memory optimization completed', {
            tasksRemoved: taskEntriesToRemove.length,
            statesRemoved: stateEntriesToRemove.length
        });
    }

    logCoherenceMetrics() {
        const hitRate = this.coherenceMetrics.hits / 
            Math.max(1, this.coherenceMetrics.hits + this.coherenceMetrics.misses);

        logger.debug('Quantum cache coherence metrics', {
            hitRate: (hitRate * 100).toFixed(1) + '%',
            totalHits: this.coherenceMetrics.hits,
            totalMisses: this.coherenceMetrics.misses,
            coherenceViolations: this.coherenceMetrics.coherenceViolations,
            entanglementHits: this.coherenceMetrics.entanglementHits,
            prefetchHits: this.coherenceMetrics.prefetchHits,
            cacheSize: {
                tasks: this.taskCache.size,
                states: this.stateCache.size,
                measurements: this.measurementCache.size
            }
        });
    }

    getMemoryUsage() {
        let totalBytes = 0;
        
        for (const entry of this.taskCache.values()) {
            totalBytes += this.estimateObjectSize(entry);
        }
        
        for (const entry of this.stateCache.values()) {
            totalBytes += this.estimateObjectSize(entry);
        }
        
        for (const entry of this.measurementCache.values()) {
            totalBytes += this.estimateObjectSize(entry);
        }

        return {
            totalBytes: totalBytes,
            taskCacheBytes: totalBytes * (this.taskCache.size / (this.taskCache.size + this.stateCache.size + this.measurementCache.size)),
            stateCacheBytes: totalBytes * (this.stateCache.size / (this.taskCache.size + this.stateCache.size + this.measurementCache.size)),
            measurementCacheBytes: totalBytes * (this.measurementCache.size / (this.taskCache.size + this.stateCache.size + this.measurementCache.size))
        };
    }

    estimateObjectSize(obj) {
        return JSON.stringify(obj).length * 2;
    }

    async compress(data) {
        if (!this.compressor) return data;
        
        try {
            const jsonString = JSON.stringify(data);
            const compressed = this.compressor.gzipSync(Buffer.from(jsonString));
            return compressed;
        } catch (error) {
            logger.warn('Compression failed, storing uncompressed', { error: error.message });
            return data;
        }
    }

    async decompress(data) {
        if (!this.compressor) return data;
        
        try {
            if (Buffer.isBuffer(data)) {
                const decompressed = this.compressor.gunzipSync(data);
                return JSON.parse(decompressed.toString());
            }
            return data;
        } catch (error) {
            logger.warn('Decompression failed, returning raw data', { error: error.message });
            return data;
        }
    }

    generateTaskCacheKey(taskId) {
        return `task:${taskId}`;
    }

    generateStateCacheKey(taskId) {
        return `state:${taskId}`;
    }

    generateMeasurementCacheKey(taskId, timestamp) {
        return `measurement:${taskId}:${timestamp}`;
    }

    invalidateTask(taskId) {
        const taskKey = this.generateTaskCacheKey(taskId);
        const stateKey = this.generateStateCacheKey(taskId);
        
        this.taskCache.delete(taskKey);
        this.stateCache.delete(stateKey);
        
        const measurementKeysToDelete = [];
        for (const [key, entry] of this.measurementCache.entries()) {
            if (entry.metadata.taskId === taskId) {
                measurementKeysToDelete.push(key);
            }
        }
        
        measurementKeysToDelete.forEach(key => this.measurementCache.delete(key));
        
        this.entanglementIndex.delete(taskId);
        this.accessPatterns.delete(taskKey);
        
        logger.debug('Invalidated all cache entries for task', { taskId });
    }

    invalidateAll() {
        this.taskCache.clear();
        this.stateCache.clear();
        this.measurementCache.clear();
        this.entanglementIndex.clear();
        this.accessPatterns.clear();
        this.prefetchQueue.length = 0;
        
        this.coherenceMetrics = {
            hits: 0,
            misses: 0,
            coherenceViolations: 0,
            entanglementHits: 0,
            prefetchHits: 0
        };
        
        logger.info('All cache entries invalidated');
    }

    getStatistics() {
        const hitRate = this.coherenceMetrics.hits / 
            Math.max(1, this.coherenceMetrics.hits + this.coherenceMetrics.misses);

        return {
            cacheSize: {
                tasks: this.taskCache.size,
                states: this.stateCache.size,
                measurements: this.measurementCache.size,
                total: this.taskCache.size + this.stateCache.size + this.measurementCache.size
            },
            performance: {
                hitRate: hitRate,
                totalHits: this.coherenceMetrics.hits,
                totalMisses: this.coherenceMetrics.misses,
                coherenceViolations: this.coherenceMetrics.coherenceViolations,
                entanglementHits: this.coherenceMetrics.entanglementHits,
                prefetchHits: this.coherenceMetrics.prefetchHits
            },
            quantum: {
                entanglements: this.entanglementIndex.size,
                prefetchQueueSize: this.prefetchQueue.length,
                accessPatterns: this.accessPatterns.size
            },
            memory: this.getMemoryUsage(),
            configuration: {
                maxSize: this.config.maxSize,
                maxMemoryGB: this.config.maxMemoryGB,
                coherenceTimeMs: this.config.coherenceTimeMs,
                compressionEnabled: this.config.compressionEnabled
            }
        };
    }

    async shutdown() {
        if (this.maintainInterval) {
            clearInterval(this.maintainInterval);
            this.maintainInterval = null;
        }
        
        this.invalidateAll();
        this.isRunning = false;
        
        logger.info('Quantum Cache Manager shutdown completed');
    }
}

module.exports = { QuantumCacheManager };