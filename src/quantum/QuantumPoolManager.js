/**
 * Quantum Pool Manager
 * Advanced resource pooling with quantum superposition optimization
 */

const EventEmitter = require('eventemitter3');
const { logger } = require('../utils/logger');

class QuantumPoolManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            initialSize: options.initialSize || 10,
            maxSize: options.maxSize || 100,
            minSize: options.minSize || 5,
            acquireTimeoutMs: options.acquireTimeoutMs || 30000,
            idleTimeoutMs: options.idleTimeoutMs || 300000, // 5 minutes
            quantumCoherence: options.quantumCoherence !== false,
            adaptiveScaling: options.adaptiveScaling !== false,
            resourceFactory: options.resourceFactory,
            resourceDestroyer: options.resourceDestroyer,
            resourceValidator: options.resourceValidator,
            ...options
        };

        this.resources = new Map();
        this.quantumStates = new Map();
        this.waitingQueue = [];
        this.metrics = {
            created: 0,
            acquired: 0,
            released: 0,
            destroyed: 0,
            timeouts: 0,
            errors: 0,
            averageAcquireTime: 0,
            peakSize: 0
        };

        this.isInitialized = false;
        this.maintenanceTimer = null;
        this.scalingTimer = null;
        
        if (!this.config.resourceFactory) {
            throw new Error('ResourceFactory is required for QuantumPoolManager');
        }
    }

    async initialize() {
        if (this.isInitialized) return;

        logger.info('Initializing Quantum Pool Manager', {
            initialSize: this.config.initialSize,
            maxSize: this.config.maxSize,
            quantumCoherence: this.config.quantumCoherence
        });

        await this.createInitialResources();
        
        this.maintenanceTimer = setInterval(() => {
            this.performMaintenance();
        }, 60000); // Every minute

        if (this.config.adaptiveScaling) {
            this.scalingTimer = setInterval(() => {
                this.performAdaptiveScaling();
            }, 30000); // Every 30 seconds
        }

        this.isInitialized = true;
        this.emit('initialized');
    }

    async createInitialResources() {
        const creationPromises = [];
        
        for (let i = 0; i < this.config.initialSize; i++) {
            creationPromises.push(this.createResource());
        }

        const results = await Promise.allSettled(creationPromises);
        const successful = results.filter(result => result.status === 'fulfilled').length;
        
        logger.info('Initial resource pool created', {
            requested: this.config.initialSize,
            successful: successful,
            failed: this.config.initialSize - successful
        });

        if (successful === 0) {
            throw new Error('Failed to create any initial resources');
        }
        
        // If we didn't create enough resources due to failures, attempt to create more
        const deficit = this.config.initialSize - successful;
        if (deficit > 0 && successful > 0) {
            logger.info('Creating additional resources to meet initial size requirement', { deficit });
            
            for (let i = 0; i < deficit; i++) {
                try {
                    await this.createResource();
                } catch (error) {
                    logger.warn('Failed to create additional resource', { error: error.message });
                }
            }
        }
    }

    async createResource() {
        try {
            const resource = await this.config.resourceFactory();
            const resourceId = this.generateResourceId();
            
            const resourceWrapper = {
                id: resourceId,
                resource: resource,
                state: 'idle',
                createdAt: Date.now(),
                lastUsed: Date.now(),
                usageCount: 0,
                totalUsageTime: 0,
                errors: 0,
                quantumProperties: {
                    coherence: 1.0,
                    phase: Math.random() * 2 * Math.PI,
                    superposition: this.generateResourceSuperposition(),
                    lastMeasurement: Date.now()
                }
            };

            this.resources.set(resourceId, resourceWrapper);
            
            if (this.config.quantumCoherence) {
                this.initializeQuantumState(resourceId, resourceWrapper);
            }

            this.metrics.created++;
            this.metrics.peakSize = Math.max(this.metrics.peakSize, this.resources.size);

            logger.debug('Resource created', { resourceId });
            this.emit('resourceCreated', resourceWrapper);
            
            return resourceWrapper;

        } catch (error) {
            this.metrics.errors++;
            logger.error('Failed to create resource', { error: error.message });
            throw error;
        }
    }

    generateResourceSuperposition() {
        return [
            { state: 'idle', probability: 0.7, efficiency: 1.0 },
            { state: 'active', probability: 0.2, efficiency: 0.9 },
            { state: 'stressed', probability: 0.08, efficiency: 0.7 },
            { state: 'error', probability: 0.02, efficiency: 0.3 }
        ];
    }

    initializeQuantumState(resourceId, resource) {
        const quantumState = {
            resourceId: resourceId,
            superposition: resource.quantumProperties.superposition,
            coherence: resource.quantumProperties.coherence,
            entanglements: [],
            measurements: [],
            lastMeasurement: Date.now()
        };

        this.quantumStates.set(resourceId, quantumState);
        this.updateQuantumEntanglements(resourceId);
    }

    updateQuantumEntanglements(resourceId) {
        const resource = this.resources.get(resourceId);
        if (!resource) return;

        for (const [otherId, otherResource] of this.resources) {
            if (otherId === resourceId) continue;

            const correlation = this.calculateResourceCorrelation(resource, otherResource);
            
            if (correlation > 0.6) {
                this.createQuantumEntanglement(resourceId, otherId, correlation);
            }
        }
    }

    calculateResourceCorrelation(resource1, resource2) {
        let correlation = 0;
        let factors = 0;

        const usageDiff = Math.abs(resource1.usageCount - resource2.usageCount);
        const maxUsage = Math.max(resource1.usageCount, resource2.usageCount, 1);
        correlation += 1 - (usageDiff / maxUsage);
        factors++;

        const errorDiff = Math.abs(resource1.errors - resource2.errors);
        const maxErrors = Math.max(resource1.errors, resource2.errors, 1);
        correlation += 1 - (errorDiff / maxErrors);
        factors++;

        const ageDiff = Math.abs(resource1.createdAt - resource2.createdAt);
        const maxAge = Math.max(resource1.createdAt, resource2.createdAt) - Math.min(resource1.createdAt, resource2.createdAt);
        if (maxAge > 0) {
            correlation += 1 - (ageDiff / maxAge);
            factors++;
        }

        return factors > 0 ? correlation / factors : 0;
    }

    createQuantumEntanglement(resourceId1, resourceId2, correlation) {
        const state1 = this.quantumStates.get(resourceId1);
        const state2 = this.quantumStates.get(resourceId2);
        
        if (!state1 || !state2) return;

        const entanglement = {
            id: `${resourceId1}-${resourceId2}`,
            resources: [resourceId1, resourceId2],
            correlation: correlation,
            strength: correlation,
            createdAt: Date.now()
        };

        state1.entanglements.push(entanglement);
        state2.entanglements.push(entanglement);

        logger.debug('Quantum entanglement created between resources', {
            resourceId1, resourceId2, correlation: correlation.toFixed(3)
        });
    }

    async acquire(timeoutMs = null) {
        const timeout = timeoutMs || this.config.acquireTimeoutMs;
        const startTime = Date.now();

        try {
            logger.debug('Acquiring resource from quantum pool');

            const resource = await this.findAvailableResource(timeout);
            
            if (!resource) {
                this.metrics.timeouts++;
                throw new Error('Resource acquisition timeout');
            }

            resource.state = 'active';
            resource.lastUsed = Date.now();
            resource.usageCount++;

            const acquireTime = Date.now() - startTime;
            this.updateAverageAcquireTime(acquireTime);

            this.metrics.acquired++;

            if (this.config.quantumCoherence) {
                await this.performQuantumMeasurement(resource.id);
            }

            logger.debug('Resource acquired', { 
                resourceId: resource.id, 
                acquireTime: acquireTime 
            });

            this.emit('resourceAcquired', { resource, acquireTime });
            return this.createResourceProxy(resource);

        } catch (error) {
            this.metrics.errors++;
            logger.error('Failed to acquire resource', { 
                error: error.message, 
                timeout: timeout 
            });
            throw error;
        }
    }

    async findAvailableResource(timeout) {
        const idleResources = Array.from(this.resources.values())
            .filter(resource => resource.state === 'idle');

        if (idleResources.length > 0) {
            return this.selectOptimalResource(idleResources);
        }

        if (this.resources.size < this.config.maxSize) {
            try {
                const newResource = await this.createResource();
                return newResource;
            } catch (error) {
                logger.warn('Failed to create new resource, waiting for existing ones');
            }
        }

        return await this.waitForResource(timeout);
    }

    selectOptimalResource(availableResources) {
        if (!this.config.quantumCoherence) {
            return availableResources[0];
        }

        let bestResource = null;
        let bestScore = -1;

        for (const resource of availableResources) {
            const quantumState = this.quantumStates.get(resource.id);
            let score = resource.quantumProperties.coherence;

            if (quantumState) {
                const idleStateProb = quantumState.superposition
                    .find(s => s.state === 'idle')?.probability || 0;
                score *= idleStateProb;

                const entanglementBonus = quantumState.entanglements.length * 0.1;
                score += entanglementBonus;
            }

            const freshness = 1 - ((Date.now() - resource.lastUsed) / this.config.idleTimeoutMs);
            score *= Math.max(0.1, freshness);

            const reliability = 1 - (resource.errors / Math.max(1, resource.usageCount));
            score *= reliability;

            if (score > bestScore) {
                bestScore = score;
                bestResource = resource;
            }
        }

        return bestResource;
    }

    async waitForResource(timeout) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
                if (index !== -1) {
                    this.waitingQueue.splice(index, 1);
                }
                reject(new Error('Resource acquisition timeout'));
            }, timeout);

            this.waitingQueue.push({
                resolve,
                reject,
                timeoutId,
                startTime: Date.now()
            });
        });
    }

    processWaitingQueue() {
        if (this.waitingQueue.length === 0) return;

        const idleResources = Array.from(this.resources.values())
            .filter(resource => resource.state === 'idle');

        for (const resource of idleResources) {
            if (this.waitingQueue.length === 0) break;

            const waiter = this.waitingQueue.shift();
            clearTimeout(waiter.timeoutId);
            
            const acquireTime = Date.now() - waiter.startTime;
            this.updateAverageAcquireTime(acquireTime);

            waiter.resolve(resource);
        }
    }

    async performQuantumMeasurement(resourceId) {
        const quantumState = this.quantumStates.get(resourceId);
        const resource = this.resources.get(resourceId);
        
        if (!quantumState || !resource) return;

        const collapsedState = this.collapseWavefunction(quantumState.superposition);
        const measurement = {
            resourceId: resourceId,
            timestamp: Date.now(),
            collapsedState: collapsedState,
            coherence: quantumState.coherence
        };

        quantumState.measurements.push(measurement);
        quantumState.lastMeasurement = Date.now();

        resource.quantumProperties.coherence *= 0.95; // Slight coherence decay
        
        this.updateEntangledResources(resourceId, measurement);

        if (quantumState.measurements.length > 50) {
            quantumState.measurements.shift();
        }

        logger.debug('Quantum measurement performed on resource', {
            resourceId,
            collapsedState: collapsedState.state,
            coherence: quantumState.coherence.toFixed(3)
        });
    }

    collapseWavefunction(superposition) {
        const random = Math.random();
        let cumulativeProbability = 0;
        
        for (const state of superposition) {
            cumulativeProbability += state.probability;
            if (random <= cumulativeProbability) {
                return state;
            }
        }
        
        return superposition[superposition.length - 1];
    }

    updateEntangledResources(resourceId, measurement) {
        const quantumState = this.quantumStates.get(resourceId);
        if (!quantumState) return;

        for (const entanglement of quantumState.entanglements) {
            const partnerResourceId = entanglement.resources.find(id => id !== resourceId);
            const partnerState = this.quantumStates.get(partnerResourceId);
            const partnerResource = this.resources.get(partnerResourceId);
            
            if (partnerState && partnerResource) {
                this.applyEntanglementEffect(partnerState, partnerResource, measurement, entanglement.strength);
            }
        }
    }

    applyEntanglementEffect(partnerState, partnerResource, measurement, strength) {
        const effectStrength = strength * 0.1;
        
        partnerState.superposition.forEach(state => {
            if (state.state === measurement.collapsedState.state) {
                state.probability += effectStrength;
            } else {
                state.probability *= (1 - effectStrength * 0.1);
            }
        });

        partnerState.superposition = this.normalizeStateProbabilities(partnerState.superposition);
        partnerResource.quantumProperties.coherence = Math.max(0.1, 
            partnerResource.quantumProperties.coherence - effectStrength * 0.05);
    }

    normalizeStateProbabilities(superposition) {
        const totalProbability = superposition.reduce((sum, state) => sum + state.probability, 0);
        
        return superposition.map(state => ({
            ...state,
            probability: state.probability / Math.max(totalProbability, 0.001)
        }));
    }

    createResourceProxy(resourceWrapper) {
        return {
            id: resourceWrapper.id,
            resource: resourceWrapper.resource,
            
            release: () => {
                this.release(resourceWrapper.id);
            },
            
            destroy: () => {
                this.destroyResource(resourceWrapper.id);
            },
            
            getStatistics: () => ({
                usageCount: resourceWrapper.usageCount,
                totalUsageTime: resourceWrapper.totalUsageTime,
                errors: resourceWrapper.errors,
                createdAt: resourceWrapper.createdAt,
                lastUsed: resourceWrapper.lastUsed,
                coherence: resourceWrapper.quantumProperties.coherence
            })
        };
    }

    async release(resourceId) {
        const resource = this.resources.get(resourceId);
        if (!resource) {
            logger.warn('Attempt to release non-existent resource', { resourceId });
            return false;
        }

        const usageTime = Date.now() - resource.lastUsed;
        resource.totalUsageTime += usageTime;
        resource.state = 'idle';
        resource.lastUsed = Date.now();

        if (this.config.resourceValidator) {
            try {
                const isValid = await this.config.resourceValidator(resource.resource);
                if (!isValid) {
                    logger.warn('Resource failed validation, destroying', { resourceId });
                    await this.destroyResource(resourceId);
                    return true;
                }
            } catch (error) {
                logger.warn('Resource validation error, destroying', { 
                    resourceId, 
                    error: error.message 
                });
                await this.destroyResource(resourceId);
                return true;
            }
        }

        this.metrics.released++;
        
        if (this.config.quantumCoherence) {
            this.updateQuantumCoherence(resourceId);
        }

        this.processWaitingQueue();

        logger.debug('Resource released', { 
            resourceId, 
            usageTime: usageTime 
        });

        this.emit('resourceReleased', { resource, usageTime });
        return true;
    }

    updateQuantumCoherence(resourceId) {
        const resource = this.resources.get(resourceId);
        const quantumState = this.quantumStates.get(resourceId);
        
        if (!resource || !quantumState) return;

        resource.quantumProperties.coherence += 0.05; // Small coherence recovery
        resource.quantumProperties.coherence = Math.min(1.0, resource.quantumProperties.coherence);

        const reliability = 1 - (resource.errors / Math.max(1, resource.usageCount));
        resource.quantumProperties.coherence *= reliability;

        quantumState.coherence = resource.quantumProperties.coherence;
    }

    async destroyResource(resourceId) {
        const resource = this.resources.get(resourceId);
        if (!resource) {
            return false;
        }

        try {
            if (this.config.resourceDestroyer) {
                await this.config.resourceDestroyer(resource.resource);
            }

            this.resources.delete(resourceId);
            this.quantumStates.delete(resourceId);

            this.metrics.destroyed++;

            logger.debug('Resource destroyed', { resourceId });
            this.emit('resourceDestroyed', resource);

            return true;

        } catch (error) {
            logger.error('Failed to destroy resource', { 
                resourceId, 
                error: error.message 
            });
            return false;
        }
    }

    updateAverageAcquireTime(acquireTime) {
        if (this.metrics.averageAcquireTime === 0) {
            this.metrics.averageAcquireTime = acquireTime;
        } else {
            this.metrics.averageAcquireTime = 
                (this.metrics.averageAcquireTime * 0.9) + (acquireTime * 0.1);
        }
    }

    performMaintenance() {
        this.cleanupIdleResources();
        this.detectAnomalies();
        this.updateQuantumStates();
        this.logMaintenanceMetrics();
    }

    cleanupIdleResources() {
        const now = Date.now();
        const resourcesToDestroy = [];

        for (const [resourceId, resource] of this.resources) {
            const idleTime = now - resource.lastUsed;
            const shouldDestroy = (
                resource.state === 'idle' && 
                idleTime > this.config.idleTimeoutMs &&
                this.resources.size > this.config.minSize
            ) || (
                resource.errors > 5 && resource.errors / resource.usageCount > 0.1
            );

            if (shouldDestroy) {
                resourcesToDestroy.push(resourceId);
            }
        }

        for (const resourceId of resourcesToDestroy) {
            this.destroyResource(resourceId);
        }

        if (resourcesToDestroy.length > 0) {
            logger.info('Maintenance cleanup completed', {
                destroyed: resourcesToDestroy.length,
                remainingResources: this.resources.size
            });
        }
    }

    detectAnomalies() {
        const now = Date.now();
        const recentMeasurements = [];

        for (const quantumState of this.quantumStates.values()) {
            const recent = quantumState.measurements.filter(
                m => now - m.timestamp < 300000 // 5 minutes
            );
            recentMeasurements.push(...recent);
        }

        if (recentMeasurements.length === 0) return;

        const errorStateMeasurements = recentMeasurements.filter(
            m => m.collapsedState.state === 'error'
        );

        const errorRate = errorStateMeasurements.length / recentMeasurements.length;
        
        if (errorRate > 0.1) {
            logger.warn('High error rate detected in quantum measurements', {
                errorRate: (errorRate * 100).toFixed(1) + '%',
                totalMeasurements: recentMeasurements.length,
                errorMeasurements: errorStateMeasurements.length
            });
            
            this.emit('anomalyDetected', {
                type: 'high_error_rate',
                errorRate: errorRate,
                timestamp: now
            });
        }

        const lowCoherenceResources = Array.from(this.resources.values())
            .filter(r => r.quantumProperties.coherence < 0.3);

        if (lowCoherenceResources.length > this.resources.size * 0.2) {
            logger.warn('Multiple resources with low quantum coherence detected', {
                count: lowCoherenceResources.length,
                totalResources: this.resources.size
            });
            
            this.emit('anomalyDetected', {
                type: 'low_coherence',
                affectedResources: lowCoherenceResources.length,
                timestamp: now
            });
        }
    }

    updateQuantumStates() {
        const now = Date.now();
        
        for (const [resourceId, quantumState] of this.quantumStates) {
            const resource = this.resources.get(resourceId);
            if (!resource) continue;

            const timeSinceLastMeasurement = now - quantumState.lastMeasurement;
            const coherenceDecay = Math.exp(-timeSinceLastMeasurement / 600000); // 10 minute decay
            
            resource.quantumProperties.coherence *= coherenceDecay;
            resource.quantumProperties.coherence = Math.max(0.01, resource.quantumProperties.coherence);
            
            quantumState.coherence = resource.quantumProperties.coherence;

            resource.quantumProperties.superposition = this.updateSuperpositionBasedOnUsage(
                resource.quantumProperties.superposition, 
                resource
            );
        }
    }

    updateSuperpositionBasedOnUsage(superposition, resource) {
        const reliability = 1 - (resource.errors / Math.max(1, resource.usageCount));
        const usage = resource.usageCount;

        return superposition.map(state => {
            let probability = state.probability;

            if (state.state === 'idle' && resource.state === 'idle') {
                probability *= 1.1;
            } else if (state.state === 'active' && resource.state === 'active') {
                probability *= 1.1;
            } else if (state.state === 'error' && reliability < 0.9) {
                probability *= 1.2;
            } else if (state.state === 'stressed' && usage > 100) {
                probability *= 1.1;
            }

            return { ...state, probability };
        });
    }

    performAdaptiveScaling() {
        const utilizationRate = this.calculateUtilizationRate();
        const waitingQueueSize = this.waitingQueue.length;
        const averageAcquireTime = this.metrics.averageAcquireTime;
        const currentSize = this.resources.size;

        let shouldScaleUp = false;
        let shouldScaleDown = false;

        // More aggressive scaling up if we're below minimum expected size
        if (currentSize < this.config.initialSize && currentSize < this.config.maxSize) {
            shouldScaleUp = true;
        } else if (utilizationRate > 0.8 || waitingQueueSize > 5 || averageAcquireTime > 5000) {
            shouldScaleUp = true;
        } else if (utilizationRate < 0.3 && waitingQueueSize === 0 && currentSize > this.config.minSize) {
            shouldScaleDown = true;
        }

        if (shouldScaleUp && currentSize < this.config.maxSize) {
            const deficit = Math.max(1, this.config.initialSize - currentSize);
            const scalingAmount = Math.min(Math.max(3, deficit), this.config.maxSize - currentSize);
            this.scaleUp(scalingAmount);
        } else if (shouldScaleDown) {
            const scalingAmount = Math.min(2, currentSize - this.config.minSize);
            this.scaleDown(scalingAmount);
        }
    }

    calculateUtilizationRate() {
        const activeResources = Array.from(this.resources.values())
            .filter(resource => resource.state === 'active').length;
        
        return activeResources / Math.max(1, this.resources.size);
    }

    async scaleUp(amount) {
        logger.info('Scaling up resource pool', { 
            amount, 
            currentSize: this.resources.size 
        });

        const creationPromises = [];
        for (let i = 0; i < amount; i++) {
            creationPromises.push(this.createResource().catch(error => {
                logger.warn('Failed to create resource during scale up', { error: error.message });
                return null;
            }));
        }

        const results = await Promise.allSettled(creationPromises);
        const successful = results.filter(result => 
            result.status === 'fulfilled' && result.value !== null
        ).length;

        this.emit('scaledUp', { 
            requested: amount, 
            successful, 
            newSize: this.resources.size 
        });
    }

    async scaleDown(amount) {
        logger.info('Scaling down resource pool', { 
            amount, 
            currentSize: this.resources.size 
        });

        const idleResources = Array.from(this.resources.values())
            .filter(resource => resource.state === 'idle')
            .sort((a, b) => a.lastUsed - b.lastUsed) // Oldest first
            .slice(0, amount);

        let destroyed = 0;
        for (const resource of idleResources) {
            if (await this.destroyResource(resource.id)) {
                destroyed++;
            }
        }

        this.emit('scaledDown', { 
            requested: amount, 
            destroyed, 
            newSize: this.resources.size 
        });
    }

    logMaintenanceMetrics() {
        const utilizationRate = this.calculateUtilizationRate();
        const avgCoherence = Array.from(this.resources.values())
            .reduce((sum, r) => sum + r.quantumProperties.coherence, 0) / this.resources.size;

        logger.debug('Pool maintenance metrics', {
            poolSize: this.resources.size,
            utilizationRate: (utilizationRate * 100).toFixed(1) + '%',
            waitingQueue: this.waitingQueue.length,
            averageAcquireTime: Math.round(this.metrics.averageAcquireTime),
            averageCoherence: avgCoherence.toFixed(3),
            totalCreated: this.metrics.created,
            totalDestroyed: this.metrics.destroyed,
            errors: this.metrics.errors
        });
    }

    generateResourceId() {
        return `qres_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getStatistics() {
        const utilizationRate = this.calculateUtilizationRate();
        const avgCoherence = this.resources.size > 0 ? 
            Array.from(this.resources.values())
                .reduce((sum, r) => sum + r.quantumProperties.coherence, 0) / this.resources.size : 0;

        return {
            pool: {
                size: this.resources.size,
                minSize: this.config.minSize,
                maxSize: this.config.maxSize,
                utilizationRate: utilizationRate,
                waitingQueue: this.waitingQueue.length
            },
            metrics: { ...this.metrics },
            quantum: {
                averageCoherence: avgCoherence,
                quantumStates: this.quantumStates.size,
                totalEntanglements: Array.from(this.quantumStates.values())
                    .reduce((sum, state) => sum + state.entanglements.length, 0)
            },
            performance: {
                averageAcquireTime: this.metrics.averageAcquireTime,
                errorRate: this.metrics.errors / Math.max(1, this.metrics.acquired),
                throughput: this.metrics.acquired / Math.max(1, (Date.now() - (this.startTime || Date.now())) / 1000)
            }
        };
    }

    async drain() {
        logger.info('Draining resource pool');
        
        // Wait for all active resources to be released
        const maxWaitTime = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (this.hasActiveResources() && Date.now() - startTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Destroy all remaining resources
        const resourceIds = Array.from(this.resources.keys());
        for (const resourceId of resourceIds) {
            await this.destroyResource(resourceId);
        }
        
        // Clear waiting queue
        for (const waiter of this.waitingQueue) {
            clearTimeout(waiter.timeoutId);
            waiter.reject(new Error('Pool is being drained'));
        }
        this.waitingQueue.length = 0;
        
        logger.info('Resource pool drained');
        this.emit('drained');
    }

    hasActiveResources() {
        return Array.from(this.resources.values()).some(resource => resource.state === 'active');
    }

    async shutdown() {
        if (this.maintenanceTimer) {
            clearInterval(this.maintenanceTimer);
            this.maintenanceTimer = null;
        }

        if (this.scalingTimer) {
            clearInterval(this.scalingTimer);
            this.scalingTimer = null;
        }

        await this.drain();

        this.isInitialized = false;
        this.emit('shutdown');
        
        logger.info('Quantum Pool Manager shutdown completed');
    }
}

module.exports = { QuantumPoolManager };