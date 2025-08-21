/**
 * RetrievalRouter - Core routing engine for GH200 Grace Hopper optimization
 * Handles intelligent query routing, load balancing, and semantic search
 */

const EventEmitter = require('events');
const { SemanticRouter } = require('./SemanticRouter');
const { QueryOptimizer } = require('./QueryOptimizer');
const { LoadBalancer } = require('./LoadBalancer');
const { PerformanceMonitor } = require('../monitoring/PerformanceMonitor');
const { logger } = require('../utils/logger');
const { validateQuery, validateConfig } = require('../utils/validators');

class RetrievalRouter extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = options.config || {};
        this.memoryManager = options.memoryManager;
        this.shardManager = options.shardManager;
        
        // Core components
        this.semanticRouter = null;
        this.queryOptimizer = null;
        this.loadBalancer = null;
        this.performanceMonitor = null;
        
        // State
        this.initialized = false;
        this.databases = new Map();
        this.activeConnections = new Set();
        
        // Circuit breakers for components
        this.circuitBreakers = new Map();
        
        // Performance tracking
        this.stats = {
            totalQueries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            averageLatency: 0,
            throughput: 0,
            circuitBreakerTrips: 0
        };
        
        validateConfig(this.config);
    }
    
    /**
     * Initialize the retrieval router
     */
    async initialize() {
        if (this.initialized) {
            throw new Error('Router already initialized');
        }
        
        logger.info('Initializing RetrievalRouter components');
        
        try {
            // Initialize semantic router
            this.semanticRouter = new SemanticRouter({
                embeddingModel: this.config.embedding.model,
                similarity: this.config.embedding.similarity,
                graceMemory: this.memoryManager
            });
            await this.semanticRouter.initialize();
            
            // Initialize query optimizer
            this.queryOptimizer = new QueryOptimizer({
                cacheSize: this.config.optimization.cacheSize,
                memoryManager: this.memoryManager
            });
            await this.queryOptimizer.initialize();
            
            // Initialize load balancer
            this.loadBalancer = new LoadBalancer({
                strategy: this.config.loadBalancing.strategy,
                shardManager: this.shardManager
            });
            await this.loadBalancer.initialize();
            
            // Initialize performance monitor
            this.performanceMonitor = new PerformanceMonitor({
                metricsInterval: this.config.monitoring.interval,
                router: this
            });
            await this.performanceMonitor.start();
            
            this.initialized = true;
            this.emit('initialized');
            
            logger.info('RetrievalRouter initialization complete');
            
        } catch (error) {
            logger.error('RetrievalRouter initialization failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Add a vector database to the router
     * @param {VectorDatabase} database - Vector database instance
     * @param {string} name - Database identifier
     */
    async addDatabase(database, name) {
        if (!this.initialized) {
            throw new Error('Router not initialized');
        }
        
        if (this.databases.has(name)) {
            throw new Error(`Database '${name}' already exists`);
        }
        
        logger.info(`Adding database '${name}' to router`);
        
        try {
            await database.initialize();
            this.databases.set(name, database);
            
            // Register database with shard manager
            await this.shardManager.registerDatabase(name, database);
            
            this.emit('databaseAdded', { name, database });
            
            logger.info(`Database '${name}' added successfully`, {
                vectorCount: database.getVectorCount(),
                dimensions: database.getDimensions()
            });
            
        } catch (error) {
            logger.error(`Failed to add database '${name}'`, { error: error.message });
            throw error;
        }
    }
    
    /**
     * Perform retrieval with generation
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Results with retrieved documents and generated response
     */
    async retrieveAndGenerate(options = {}) {
        const startTime = Date.now();
        const queryId = this._generateQueryId();
        let retryCount = 0;
        const maxRetries = this.config.query?.maxRetries || 3;
        const retryDelay = this.config.query?.retryDelay || 1000;
        
        while (retryCount <= maxRetries) {
            try {
                validateQuery(options);
                
                const { query, k = 10, model, temperature = 0.7, database, timeout = 30000 } = options;
                
                logger.debug('Processing retrieve and generate request', {
                    queryId,
                    query: query.substring(0, 100),
                    k,
                    model,
                    database,
                    retryCount
                });
                
                // Add timeout wrapper for the entire operation
                const operationPromise = this._executeRetrievalPipeline({
                    query, k, model, temperature, database, queryId, optimizedQuery: null
                });
                
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout);
                });
                
                const result = await Promise.race([operationPromise, timeoutPromise]);
                
                const latency = Date.now() - startTime;
                result.metadata.latency = latency;
                result.metadata.retryCount = retryCount;
                
                // Update statistics
                this._updateStats({
                    queryId,
                    latency,
                    success: true,
                    retrievedCount: result.documents.length
                });
                
                this.emit('queryCompleted', result);
                return result;
                
            } catch (error) {
                const latency = Date.now() - startTime;
                retryCount++;
                
                // Check if error is retryable
                const isRetryable = this._isRetryableError(error);
                
                if (retryCount <= maxRetries && isRetryable) {
                    logger.warn('Retryable error occurred, retrying', {
                        queryId,
                        error: error.message,
                        retryCount,
                        maxRetries,
                        isRetryable
                    });
                    
                    // Exponential backoff with jitter
                    const delay = retryDelay * Math.pow(2, retryCount - 1) + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                // Final failure
                this._updateStats({
                    queryId,
                    latency,
                    success: false,
                    error: error.message
                });
                
                logger.error('Retrieve and generate failed after retries', {
                    queryId,
                    error: error.message,
                    stack: error.stack,
                    latency,
                    retryCount,
                    finalFailure: true
                });
                
                this.emit('queryFailed', { queryId, error, latency, retryCount });
                throw error;
            }
        }
    }
    
    /**
     * Execute the main retrieval pipeline
     * @private
     */
    async _executeRetrievalPipeline({ query, k, model, temperature, database, queryId }) {
        // Step 1: Optimize query with circuit breaker
        const optimizedQuery = await this._withCircuitBreaker('queryOptimizer', 
            () => this.queryOptimizer.optimize(query, {
                k,
                database,
                cacheKey: this._generateCacheKey(query, { k, database })
            })
        );
        
        // Step 2: Route to appropriate shards with circuit breaker
        const targetShards = await this._withCircuitBreaker('semanticRouter',
            () => this.semanticRouter.route(optimizedQuery.embedding, {
                database,
                k: Math.ceil(k * 1.5) // Retrieve more for better quality
            })
        );
        
        // Step 3: Perform retrieval with circuit breaker
        const retrievalResults = await this._withCircuitBreaker('retrieval',
            () => this._performRetrieval({
                embedding: optimizedQuery.embedding,
                shards: targetShards,
                k,
                database
            })
        );
        
        // Step 4: Generate response with circuit breaker
        const generationResult = await this._withCircuitBreaker('generation',
            () => this._performGeneration({
                query: optimizedQuery.text,
                context: retrievalResults.documents,
                model,
                temperature
            })
        );
        
        return {
            queryId,
            response: generationResult.text,
            documents: retrievalResults.documents,
            metadata: {
                retrievedCount: retrievalResults.documents.length,
                shardsQueried: targetShards.length,
                cacheHit: optimizedQuery.fromCache,
                optimizationTime: optimizedQuery.processingTime || 0,
                routingTime: targetShards.processingTime || 0,
                retrievalTime: retrievalResults.processingTime || 0,
                generationTime: generationResult.processingTime || 0
            }
        };
    }
    
    /**
     * Perform retrieval only (no generation)
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Retrieved documents
     */
    async retrieve(options = {}) {
        const { query, k = 10, database } = options;
        
        validateQuery({ query, k });
        
        const optimizedQuery = await this.queryOptimizer.optimize(query, { k, database });
        const targetShards = await this.semanticRouter.route(optimizedQuery.embedding, { database, k });
        
        return await this._performRetrieval({
            embedding: optimizedQuery.embedding,
            shards: targetShards,
            k,
            database
        });
    }
    
    /**
     * Internal method to perform retrieval across shards
     */
    async _performRetrieval({ embedding, shards, k, database }) {
        const retrievalPromises = shards.map(async (shard) => {
            const db = database ? this.databases.get(database) : Array.from(this.databases.values())[0];
            
            if (!db) {
                throw new Error('No database available for retrieval');
            }
            
            return await db.search({
                embedding,
                k: Math.ceil(k / shards.length * 1.2),
                shardId: shard.id,
                filters: shard.filters
            });
        });
        
        const shardResults = await Promise.all(retrievalPromises);
        
        // Merge and rank results
        const allDocuments = shardResults.flat();
        const sortedDocuments = allDocuments
            .sort((a, b) => b.score - a.score)
            .slice(0, k);
        
        return {
            documents: sortedDocuments,
            shardsQueried: shards.length,
            totalResults: allDocuments.length
        };
    }
    
    /**
     * Internal method to perform text generation
     */
    async _performGeneration({ query, context, model, temperature }) {
        // Placeholder for generation - would integrate with actual LLM
        const contextText = context.map(doc => doc.content).join('\n\n');
        
        // This would be replaced with actual LLM integration
        return {
            text: `Based on the context provided, here is a response to: ${query}\n\nContext summary: Found ${context.length} relevant documents.`,
            model,
            temperature,
            tokensGenerated: 50
        };
    }
    
    /**
     * Get router statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeDatabases: this.databases.size,
            activeConnections: this.activeConnections.size,
            uptime: process.uptime()
        };
    }
    
    /**
     * Get database by name
     */
    getDatabase(name) {
        return this.databases.get(name);
    }
    
    /**
     * List all registered databases
     */
    listDatabases() {
        return Array.from(this.databases.keys());
    }
    
    /**
     * Update performance statistics
     */
    _updateStats({ queryId, latency, success, retrievedCount, error }) {
        this.stats.totalQueries++;
        
        if (success) {
            this.stats.successfulQueries++;
            this.stats.averageLatency = (
                (this.stats.averageLatency * (this.stats.successfulQueries - 1) + latency) /
                this.stats.successfulQueries
            );
        } else {
            this.stats.failedQueries++;
        }
        
        // Calculate throughput (queries per second)
        this.stats.throughput = this.stats.totalQueries / (process.uptime() || 1);
    }
    
    /**
     * Generate unique query ID
     */
    _generateQueryId() {
        return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Generate cache key for query
     */
    _generateCacheKey(query, options) {
        const keyData = {
            query: query.trim().toLowerCase(),
            k: options.k,
            database: options.database
        };
        
        return require('crypto')
            .createHash('sha256')
            .update(JSON.stringify(keyData))
            .digest('hex')
            .substring(0, 16);
    }
    
    /**
     * Gracefully shutdown the router
     */
    async shutdown() {
        if (!this.initialized) {
            return;
        }
        
        logger.info('Shutting down RetrievalRouter');
        
        try {
            // Stop performance monitoring
            if (this.performanceMonitor) {
                await this.performanceMonitor.stop();
            }
            
            // Shutdown components
            if (this.semanticRouter) {
                await this.semanticRouter.shutdown();
            }
            
            if (this.queryOptimizer) {
                await this.queryOptimizer.shutdown();
            }
            
            if (this.loadBalancer) {
                await this.loadBalancer.shutdown();
            }
            
            // Close database connections
            for (const [name, database] of this.databases) {
                await database.shutdown();
            }
            
            this.databases.clear();
            this.activeConnections.clear();
            this.initialized = false;
            
            this.emit('shutdown');
            
            logger.info('RetrievalRouter shutdown complete');
            
        } catch (error) {
            logger.error('Error during RetrievalRouter shutdown', { error: error.message });
            throw error;
        }
    }

    /**
     * Health check for the retrieval router
     * @returns {Object} Health status information
     */
    async healthCheck() {
        const healthStatus = {
            healthy: true,
            timestamp: new Date().toISOString(),
            components: {},
            errors: []
        };

        try {
            // Check initialization status
            if (!this.initialized) {
                healthStatus.healthy = false;
                healthStatus.errors.push('Router not initialized');
                return healthStatus;
            }

            // Check semantic router
            if (this.semanticRouter) {
                try {
                    const semanticHealth = await this.semanticRouter.healthCheck();
                    healthStatus.components.semanticRouter = semanticHealth;
                    if (!semanticHealth.healthy) {
                        healthStatus.healthy = false;
                        healthStatus.errors.push('Semantic router unhealthy');
                    }
                } catch (error) {
                    healthStatus.components.semanticRouter = { healthy: false, error: error.message };
                    healthStatus.healthy = false;
                    healthStatus.errors.push(`Semantic router error: ${error.message}`);
                }
            }

            // Check query optimizer
            if (this.queryOptimizer) {
                try {
                    const optimizerHealth = await this.queryOptimizer.healthCheck();
                    healthStatus.components.queryOptimizer = optimizerHealth;
                    if (!optimizerHealth.healthy) {
                        healthStatus.healthy = false;
                        healthStatus.errors.push('Query optimizer unhealthy');
                    }
                } catch (error) {
                    healthStatus.components.queryOptimizer = { healthy: false, error: error.message };
                    healthStatus.healthy = false;
                    healthStatus.errors.push(`Query optimizer error: ${error.message}`);
                }
            }

            // Check load balancer
            if (this.loadBalancer) {
                try {
                    const balancerHealth = await this.loadBalancer.healthCheck();
                    healthStatus.components.loadBalancer = balancerHealth;
                    if (!balancerHealth.healthy) {
                        healthStatus.healthy = false;
                        healthStatus.errors.push('Load balancer unhealthy');
                    }
                } catch (error) {
                    healthStatus.components.loadBalancer = { healthy: false, error: error.message };
                    healthStatus.healthy = false;
                    healthStatus.errors.push(`Load balancer error: ${error.message}`);
                }
            }

            // Check databases
            for (const [name, database] of this.databases) {
                try {
                    const dbHealth = await database.healthCheck();
                    healthStatus.components[`database_${name}`] = dbHealth;
                    if (!dbHealth.healthy) {
                        healthStatus.healthy = false;
                        healthStatus.errors.push(`Database ${name} unhealthy`);
                    }
                } catch (error) {
                    healthStatus.components[`database_${name}`] = { healthy: false, error: error.message };
                    healthStatus.healthy = false;
                    healthStatus.errors.push(`Database ${name} error: ${error.message}`);
                }
            }

            // Add performance metrics
            healthStatus.metrics = {
                totalQueries: this.stats.totalQueries,
                successfulQueries: this.stats.successfulQueries,
                failedQueries: this.stats.failedQueries,
                averageLatency: this.stats.averageLatency,
                throughput: this.stats.throughput,
                activeDatabases: this.databases.size,
                activeConnections: this.activeConnections.size
            };

        } catch (error) {
            healthStatus.healthy = false;
            healthStatus.errors.push(`Health check error: ${error.message}`);
            logger.error('Router health check failed', { error: error.message });
        }

        return healthStatus;
    }

    /**
     * Check if router is ready to serve requests
     * @returns {boolean} Readiness status
     */
    async isReady() {
        try {
            if (!this.initialized) {
                return false;
            }

            // Check if critical components are ready
            const checks = [];
            
            if (this.semanticRouter && typeof this.semanticRouter.isReady === 'function') {
                checks.push(this.semanticRouter.isReady());
            }
            
            if (this.queryOptimizer && typeof this.queryOptimizer.isReady === 'function') {
                checks.push(this.queryOptimizer.isReady());
            }
            
            if (this.loadBalancer && typeof this.loadBalancer.isReady === 'function') {
                checks.push(this.loadBalancer.isReady());
            }

            const results = await Promise.all(checks);
            return results.every(ready => ready === true);
        } catch (error) {
            logger.error('Router readiness check failed', { error: error.message });
            return false;
        }
    }
    
    /**
     * Execute function with circuit breaker protection
     * @private
     */
    async _withCircuitBreaker(componentName, fn) {
        if (!this.circuitBreakers.has(componentName)) {
            this.circuitBreakers.set(componentName, {
                state: 'CLOSED',
                failureCount: 0,
                lastFailureTime: null,
                successCount: 0,
                timeout: this.config.circuitBreaker?.timeout || 60000,
                failureThreshold: this.config.circuitBreaker?.failureThreshold || 5,
                successThreshold: this.config.circuitBreaker?.successThreshold || 3
            });
        }
        
        const breaker = this.circuitBreakers.get(componentName);
        const now = Date.now();
        
        // Check circuit breaker state
        if (breaker.state === 'OPEN') {
            if (now - breaker.lastFailureTime < breaker.timeout) {
                this.stats.circuitBreakerTrips++;
                throw new Error(`Circuit breaker OPEN for ${componentName}`);
            } else {
                breaker.state = 'HALF_OPEN';
                breaker.successCount = 0;
            }
        }
        
        try {
            const result = await fn();
            
            // Success - reset or partially reset breaker
            if (breaker.state === 'HALF_OPEN') {
                breaker.successCount++;
                if (breaker.successCount >= breaker.successThreshold) {
                    breaker.state = 'CLOSED';
                    breaker.failureCount = 0;
                }
            } else {
                breaker.failureCount = Math.max(0, breaker.failureCount - 1);
            }
            
            return result;
            
        } catch (error) {
            // Failure - increment counter and potentially open breaker
            breaker.failureCount++;
            breaker.lastFailureTime = now;
            
            if (breaker.failureCount >= breaker.failureThreshold) {
                breaker.state = 'OPEN';
                logger.warn(`Circuit breaker OPEN for ${componentName}`, {
                    failureCount: breaker.failureCount,
                    threshold: breaker.failureThreshold
                });
            }
            
            throw error;
        }
    }
    
    /**
     * Check if error is retryable
     * @private
     */
    _isRetryableError(error) {
        const retryableErrors = [
            'ECONNRESET',
            'ENOTFOUND', 
            'ECONNREFUSED',
            'ETIMEDOUT',
            'Query timeout',
            'Circuit breaker OPEN',
            'Service Unavailable'
        ];
        
        return retryableErrors.some(retryableError => 
            error.message.includes(retryableError) || 
            error.code === retryableError
        );
    }
    
    /**
     * Get circuit breaker status for all components
     */
    getCircuitBreakerStatus() {
        const status = {};
        for (const [component, breaker] of this.circuitBreakers) {
            status[component] = {
                state: breaker.state,
                failureCount: breaker.failureCount,
                lastFailureTime: breaker.lastFailureTime,
                successCount: breaker.successCount
            };
        }
        return status;
    }
}

module.exports = { RetrievalRouter };
