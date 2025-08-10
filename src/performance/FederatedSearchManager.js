/**
 * Federated Search Manager for Multi-Cluster Vector Search
 * Coordinates searches across distributed GH200 clusters with intelligent routing
 */

const EventEmitter = require('events');
const { logger } = require('../utils/logger');

/**
 * Cluster connection manager
 */
class ClusterConnection {
    constructor(clusterId, config) {
        this.clusterId = clusterId;
        this.config = {
            endpoint: config.endpoint,
            region: config.region || 'default',
            datacenter: config.datacenter || 'default',
            capabilities: config.capabilities || [],
            maxConcurrency: config.maxConcurrency || 100,
            timeout: config.timeout || 30000,
            retries: config.retries || 3,
            ...config
        };
        
        this.status = 'disconnected';
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            avgResponseTime: 0,
            currentLoad: 0,
            lastHealthCheck: 0,
            uptime: 0
        };
        
        this.activeRequests = new Set();
        this.healthCheckTimer = null;
    }
    
    async connect() {
        try {
            // Simulate connection setup
            logger.debug(`Connecting to cluster ${this.clusterId}`, {
                endpoint: this.config.endpoint,
                region: this.config.region
            });
            
            // Health check
            const isHealthy = await this._performHealthCheck();
            
            if (isHealthy) {
                this.status = 'connected';
                this._startHealthChecking();
                logger.info(`Connected to cluster ${this.clusterId}`);
                return true;
            } else {
                throw new Error('Health check failed');
            }
            
        } catch (error) {
            this.status = 'error';
            logger.error(`Failed to connect to cluster ${this.clusterId}`, {
                error: error.message
            });
            throw error;
        }
    }
    
    async disconnect() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        
        this.status = 'disconnected';
        logger.info(`Disconnected from cluster ${this.clusterId}`);
    }
    
    async search(query, options = {}) {
        if (this.status !== 'connected') {
            throw new Error(`Cluster ${this.clusterId} is not connected`);
        }
        
        if (this.activeRequests.size >= this.config.maxConcurrency) {
            throw new Error(`Cluster ${this.clusterId} is at maximum capacity`);
        }
        
        const requestId = this._generateRequestId();
        const startTime = Date.now();
        
        try {
            this.activeRequests.add(requestId);
            this.metrics.totalRequests++;
            this.metrics.currentLoad = this.activeRequests.size;
            
            // Perform search request
            const result = await this._performSearch(query, options, requestId);
            
            // Update metrics
            const responseTime = Date.now() - startTime;
            this.metrics.successfulRequests++;
            this._updateResponseTime(responseTime);
            
            return {
                ...result,
                clusterId: this.clusterId,
                responseTime,
                requestId
            };
            
        } catch (error) {
            this.metrics.failedRequests++;
            logger.error(`Search failed on cluster ${this.clusterId}`, {
                requestId,
                error: error.message
            });
            throw error;
            
        } finally {
            this.activeRequests.delete(requestId);
            this.metrics.currentLoad = this.activeRequests.size;
        }
    }
    
    async _performSearch(query, options, requestId) {
        // Simulate network latency based on region
        const regionLatency = this._getRegionLatency();
        const searchTime = 50 + Math.random() * 200 + regionLatency;
        
        await new Promise(resolve => setTimeout(resolve, searchTime));
        
        // Simulate search results
        const k = options.k || 10;
        const vectors = [];
        const similarities = [];
        
        for (let i = 0; i < k; i++) {
            vectors.push({
                id: `${this.clusterId}_vec_${i}_${requestId}`,
                vector: Array.from({ length: 768 }, () => Math.random() - 0.5),
                metadata: {
                    source: this.clusterId,
                    region: this.config.region,
                    datacenter: this.config.datacenter,
                    indexed: Date.now() - Math.random() * 86400000
                }
            });
            
            similarities.push(Math.random() * 0.3 + 0.7);
        }
        
        // Sort by similarity
        const combined = vectors.map((v, i) => ({ vector: v, similarity: similarities[i] }));
        combined.sort((a, b) => b.similarity - a.similarity);
        
        return {
            vectors: combined.map(c => c.vector),
            similarities: combined.map(c => c.similarity),
            totalResults: k,
            searchTime,
            metadata: {
                region: this.config.region,
                datacenter: this.config.datacenter,
                capabilities: this.config.capabilities
            }
        };
    }
    
    _getRegionLatency() {
        const regionLatencies = {
            'us-west': 10,
            'us-east': 15,
            'eu-west': 80,
            'ap-southeast': 120,
            'default': 5
        };
        
        return regionLatencies[this.config.region] || regionLatencies.default;
    }
    
    async _performHealthCheck() {
        try {
            // Simulate health check
            const healthCheckTime = Math.random() * 100 + 50;
            await new Promise(resolve => setTimeout(resolve, healthCheckTime));
            
            const isHealthy = Math.random() > 0.05; // 95% health rate
            this.metrics.lastHealthCheck = Date.now();
            
            return isHealthy;
            
        } catch (error) {
            return false;
        }
    }
    
    _startHealthChecking() {
        this.healthCheckTimer = setInterval(async () => {
            const isHealthy = await this._performHealthCheck();
            
            if (!isHealthy && this.status === 'connected') {
                this.status = 'unhealthy';
                logger.warn(`Cluster ${this.clusterId} health check failed`);
            } else if (isHealthy && this.status === 'unhealthy') {
                this.status = 'connected';
                logger.info(`Cluster ${this.clusterId} recovered`);
            }
        }, 30000); // Every 30 seconds
    }
    
    _updateResponseTime(responseTime) {
        const totalRequests = this.metrics.totalRequests;
        this.metrics.avgResponseTime = 
            (this.metrics.avgResponseTime * (totalRequests - 1) + responseTime) / totalRequests;
    }
    
    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getStats() {
        return {
            clusterId: this.clusterId,
            status: this.status,
            config: {
                endpoint: this.config.endpoint,
                region: this.config.region,
                datacenter: this.config.datacenter,
                capabilities: this.config.capabilities
            },
            metrics: { ...this.metrics },
            activeRequests: this.activeRequests.size
        };
    }
    
    isHealthy() {
        return this.status === 'connected';
    }
    
    getLoad() {
        return this.metrics.currentLoad / this.config.maxConcurrency;
    }
}

/**
 * Federated Search Manager
 */
class FederatedSearchManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Federation Strategy
            strategy: options.strategy || 'scatter_gather', // scatter_gather, selective, adaptive
            maxClusters: options.maxClusters || 10,
            minClusters: options.minClusters || 1,
            
            // Load Balancing
            loadBalancing: options.loadBalancing || 'weighted_round_robin',
            affinityEnabled: options.affinity !== false,
            
            // Performance Options
            parallelSearches: options.parallelSearches !== false,
            adaptiveRouting: options.adaptiveRouting !== false,
            resultMerging: options.resultMerging || 'similarity_weighted',
            
            // Timeouts and Retries
            searchTimeout: options.searchTimeout || 30000,
            clusterTimeout: options.clusterTimeout || 10000,
            maxRetries: options.maxRetries || 2,
            
            // Quality Control
            minSimilarityThreshold: options.minSimilarityThreshold || 0.1,
            maxResults: options.maxResults || 1000,
            diversityEnabled: options.diversity !== false,
            
            ...options
        };
        
        this.clusters = new Map();
        this.routingTable = new Map();
        this.searchHistory = [];
        
        // Global metrics
        this.globalMetrics = {
            totalSearches: 0,
            successfulSearches: 0,
            failedSearches: 0,
            avgResponseTime: 0,
            avgClustersUsed: 0,
            totalResultsMerged: 0,
            routingEfficiency: 0
        };
        
        this.isInitialized = false;
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            logger.info('Initializing Federated Search Manager', {
                strategy: this.config.strategy,
                maxClusters: this.config.maxClusters,
                parallelSearches: this.config.parallelSearches
            });
            
            // Start background tasks
            this._startMetricsCollection();
            this._startRouteOptimization();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            logger.info('Federated Search Manager initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize Federated Search Manager', {
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Register a new cluster
     */
    async addCluster(clusterId, config) {
        if (this.clusters.has(clusterId)) {
            throw new Error(`Cluster ${clusterId} already exists`);
        }
        
        if (this.clusters.size >= this.config.maxClusters) {
            throw new Error('Maximum number of clusters reached');
        }
        
        const cluster = new ClusterConnection(clusterId, config);
        
        try {
            await cluster.connect();
            this.clusters.set(clusterId, cluster);
            
            // Update routing table
            this._updateRoutingTable();
            
            logger.info('Cluster added to federation', {
                clusterId,
                region: config.region,
                capabilities: config.capabilities
            });
            
            this.emit('clusterAdded', { clusterId, cluster: cluster.getStats() });
            
            return cluster;
            
        } catch (error) {
            logger.error('Failed to add cluster to federation', {
                clusterId,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Remove cluster from federation
     */
    async removeCluster(clusterId) {
        const cluster = this.clusters.get(clusterId);
        
        if (!cluster) {
            throw new Error(`Cluster ${clusterId} not found`);
        }
        
        await cluster.disconnect();
        this.clusters.delete(clusterId);
        
        // Update routing table
        this._updateRoutingTable();
        
        logger.info('Cluster removed from federation', { clusterId });
        this.emit('clusterRemoved', { clusterId });
        
        return true;
    }
    
    /**
     * Perform federated search across clusters
     */
    async search(queryVector, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Federated Search Manager not initialized');
        }
        
        const searchId = this._generateSearchId();
        const startTime = Date.now();
        
        try {
            const searchConfig = {
                ...options,
                searchId,
                strategy: options.strategy || this.config.strategy,
                k: options.k || 10,
                timeout: options.timeout || this.config.searchTimeout
            };
            
            // Select clusters for search
            const selectedClusters = await this._selectClusters(queryVector, searchConfig);
            
            if (selectedClusters.length === 0) {
                throw new Error('No healthy clusters available for search');
            }
            
            logger.debug('Starting federated search', {
                searchId,
                selectedClusters: selectedClusters.map(c => c.clusterId),
                strategy: searchConfig.strategy
            });
            
            // Perform searches
            let results;
            
            switch (searchConfig.strategy) {
                case 'scatter_gather':
                    results = await this._scatterGatherSearch(queryVector, selectedClusters, searchConfig);
                    break;
                case 'selective':
                    results = await this._selectiveSearch(queryVector, selectedClusters, searchConfig);
                    break;
                case 'adaptive':
                    results = await this._adaptiveSearch(queryVector, selectedClusters, searchConfig);
                    break;
                default:
                    results = await this._scatterGatherSearch(queryVector, selectedClusters, searchConfig);
            }
            
            // Merge and rank results
            const finalResults = await this._mergeResults(results, searchConfig);
            
            // Update metrics
            const responseTime = Date.now() - startTime;
            this._updateGlobalMetrics(responseTime, selectedClusters.length, finalResults.vectors.length, true);
            
            // Record search for routing optimization
            this._recordSearch(queryVector, selectedClusters, responseTime, finalResults.vectors.length);
            
            this.emit('searchCompleted', {
                searchId,
                responseTime,
                clustersUsed: selectedClusters.length,
                resultsCount: finalResults.vectors.length
            });
            
            return {
                ...finalResults,
                searchId,
                metadata: {
                    strategy: searchConfig.strategy,
                    clustersUsed: selectedClusters.map(c => c.clusterId),
                    responseTime,
                    totalClusters: this.clusters.size,
                    searchTime: Date.now()
                }
            };
            
        } catch (error) {
            this._updateGlobalMetrics(Date.now() - startTime, 0, 0, false);
            
            logger.error('Federated search failed', {
                searchId,
                error: error.message
            });
            
            this.emit('searchFailed', { searchId, error });
            throw error;
        }
    }
    
    async _selectClusters(queryVector, searchConfig) {
        const availableClusters = Array.from(this.clusters.values())
            .filter(cluster => cluster.isHealthy());
        
        if (availableClusters.length === 0) {
            return [];
        }
        
        let selectedClusters;
        
        switch (searchConfig.strategy) {
            case 'scatter_gather':
                // Use all available healthy clusters
                selectedClusters = availableClusters;
                break;
                
            case 'selective':
                // Select clusters based on capabilities and load
                selectedClusters = this._selectBestClusters(availableClusters, queryVector, searchConfig);
                break;
                
            case 'adaptive':
                // Use learning to select optimal clusters
                selectedClusters = await this._adaptiveSelection(availableClusters, queryVector, searchConfig);
                break;
                
            default:
                selectedClusters = availableClusters;
        }
        
        // Apply cluster limits
        const maxClusters = Math.min(searchConfig.maxClusters || this.config.maxClusters, selectedClusters.length);
        const minClusters = Math.max(searchConfig.minClusters || this.config.minClusters, 1);
        
        selectedClusters = selectedClusters.slice(0, Math.max(minClusters, maxClusters));
        
        return selectedClusters;
    }
    
    _selectBestClusters(clusters, queryVector, searchConfig) {
        return clusters
            .map(cluster => ({
                cluster,
                score: this._calculateClusterScore(cluster, queryVector, searchConfig)
            }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.cluster);
    }
    
    _calculateClusterScore(cluster, queryVector, searchConfig) {
        let score = 0;
        
        // Load balancing score (lower load is better)
        const loadScore = (1 - cluster.getLoad()) * 0.3;
        score += loadScore;
        
        // Response time score (faster is better)
        const responseScore = cluster.metrics.avgResponseTime > 0 ? 
            Math.min(1, 1000 / cluster.metrics.avgResponseTime) * 0.3 : 0.3;
        score += responseScore;
        
        // Success rate score
        const totalRequests = cluster.metrics.totalRequests;
        const successRate = totalRequests > 0 ? 
            cluster.metrics.successfulRequests / totalRequests : 1;
        score += successRate * 0.2;
        
        // Capability matching score
        const capabilityScore = this._calculateCapabilityMatch(cluster.config.capabilities, searchConfig);
        score += capabilityScore * 0.2;
        
        return score;
    }
    
    _calculateCapabilityMatch(clusterCapabilities, searchConfig) {
        // Simple capability matching - in real implementation, this would be more sophisticated
        if (!clusterCapabilities || clusterCapabilities.length === 0) return 0.5;
        
        let matchScore = 0.5; // Base score
        
        if (clusterCapabilities.includes('gpu_accelerated')) matchScore += 0.2;
        if (clusterCapabilities.includes('large_scale')) matchScore += 0.2;
        if (clusterCapabilities.includes('low_latency')) matchScore += 0.1;
        
        return Math.min(1, matchScore);
    }
    
    async _adaptiveSelection(clusters, queryVector, searchConfig) {
        // Use historical performance to select clusters
        const clusterPerformance = this._getClusterPerformanceHistory();
        
        return clusters
            .map(cluster => ({
                cluster,
                score: this._calculateAdaptiveScore(cluster, clusterPerformance, queryVector)
            }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.cluster);
    }
    
    _calculateAdaptiveScore(cluster, performanceHistory, queryVector) {
        const clusterId = cluster.clusterId;
        const history = performanceHistory.get(clusterId) || {
            avgResponseTime: 1000,
            successRate: 0.5,
            avgResultQuality: 0.5
        };
        
        // Weighted score based on historical performance
        const responseScore = Math.min(1, 1000 / history.avgResponseTime) * 0.4;
        const successScore = history.successRate * 0.3;
        const qualityScore = history.avgResultQuality * 0.3;
        
        return responseScore + successScore + qualityScore;
    }
    
    async _scatterGatherSearch(queryVector, clusters, searchConfig) {
        const searchPromises = clusters.map(async (cluster) => {
            try {
                const result = await cluster.search(queryVector, {
                    k: searchConfig.k,
                    timeout: this.config.clusterTimeout
                });
                
                return {
                    success: true,
                    clusterId: cluster.clusterId,
                    result
                };
            } catch (error) {
                logger.warn('Cluster search failed', {
                    clusterId: cluster.clusterId,
                    error: error.message
                });
                
                return {
                    success: false,
                    clusterId: cluster.clusterId,
                    error
                };
            }
        });
        
        const results = await Promise.allSettled(searchPromises);
        
        return results
            .filter(result => result.status === 'fulfilled' && result.value.success)
            .map(result => result.value);
    }
    
    async _selectiveSearch(queryVector, clusters, searchConfig) {
        // Search clusters one by one until we have enough results or reach limit
        const results = [];
        const maxClusters = Math.min(3, clusters.length); // Limit to top 3 clusters
        
        for (let i = 0; i < maxClusters; i++) {
            const cluster = clusters[i];
            
            try {
                const result = await cluster.search(queryVector, {
                    k: searchConfig.k,
                    timeout: this.config.clusterTimeout
                });
                
                results.push({
                    success: true,
                    clusterId: cluster.clusterId,
                    result
                });
                
                // Check if we have enough high-quality results
                if (this._hasEnoughResults(results, searchConfig)) {
                    break;
                }
                
            } catch (error) {
                logger.warn('Selective search failed on cluster', {
                    clusterId: cluster.clusterId,
                    error: error.message
                });
            }
        }
        
        return results;
    }
    
    async _adaptiveSearch(queryVector, clusters, searchConfig) {
        // Start with best cluster, add more based on initial results
        const bestCluster = clusters[0];
        const results = [];
        
        try {
            // First search on best cluster
            const firstResult = await bestCluster.search(queryVector, {
                k: searchConfig.k,
                timeout: this.config.clusterTimeout
            });
            
            results.push({
                success: true,
                clusterId: bestCluster.clusterId,
                result: firstResult
            });
            
            // Decide if we need more clusters based on result quality
            if (this._needsMoreClusters(firstResult, searchConfig)) {
                // Search additional clusters in parallel
                const additionalClusters = clusters.slice(1, 3); // Up to 2 more clusters
                const additionalResults = await this._scatterGatherSearch(queryVector, additionalClusters, searchConfig);
                
                results.push(...additionalResults);
            }
            
        } catch (error) {
            logger.error('Adaptive search failed', { error: error.message });
            
            // Fallback to scatter-gather with remaining clusters
            return await this._scatterGatherSearch(queryVector, clusters.slice(1), searchConfig);
        }
        
        return results;
    }
    
    _hasEnoughResults(results, searchConfig) {
        const totalResults = results.reduce((sum, r) => 
            sum + (r.success ? r.result.vectors.length : 0), 0);
        
        return totalResults >= searchConfig.k;
    }
    
    _needsMoreClusters(firstResult, searchConfig) {
        // Check if we need more clusters based on result quality
        const avgSimilarity = firstResult.similarities.reduce((sum, sim) => sum + sim, 0) / 
                             firstResult.similarities.length;
        
        return avgSimilarity < 0.8 || firstResult.vectors.length < searchConfig.k;
    }
    
    async _mergeResults(searchResults, searchConfig) {
        const allVectors = [];
        const allSimilarities = [];
        const metadata = {
            clusters: [],
            totalSearchTime: 0,
            resultsByCluster: {}
        };
        
        // Collect all results
        for (const searchResult of searchResults) {
            if (!searchResult.success) continue;
            
            const { result, clusterId } = searchResult;
            
            metadata.clusters.push(clusterId);
            metadata.totalSearchTime += result.searchTime;
            metadata.resultsByCluster[clusterId] = result.vectors.length;
            
            // Add cluster information to vectors
            for (let i = 0; i < result.vectors.length; i++) {
                allVectors.push({
                    ...result.vectors[i],
                    metadata: {
                        ...result.vectors[i].metadata,
                        sourceCluster: clusterId,
                        clusterSimilarity: result.similarities[i]
                    }
                });
                allSimilarities.push(result.similarities[i]);
            }
        }
        
        if (allVectors.length === 0) {
            return {
                vectors: [],
                similarities: [],
                totalResults: 0,
                metadata
            };
        }
        
        // Merge and rank results
        let finalResults;
        
        switch (this.config.resultMerging) {
            case 'similarity_weighted':
                finalResults = this._mergeBySimilarity(allVectors, allSimilarities, searchConfig);
                break;
            case 'cluster_weighted':
                finalResults = this._mergeByClusterWeight(allVectors, allSimilarities, searchConfig);
                break;
            case 'diversity_optimized':
                finalResults = this._mergeWithDiversity(allVectors, allSimilarities, searchConfig);
                break;
            default:
                finalResults = this._mergeBySimilarity(allVectors, allSimilarities, searchConfig);
        }
        
        return {
            ...finalResults,
            metadata
        };
    }
    
    _mergeBySimilarity(vectors, similarities, searchConfig) {
        const combined = vectors.map((vector, i) => ({
            vector,
            similarity: similarities[i]
        }));
        
        // Sort by similarity (descending)
        combined.sort((a, b) => b.similarity - a.similarity);
        
        // Apply diversity filter if enabled
        const finalCombined = this.config.diversityEnabled ?
            this._applyDiversityFilter(combined, searchConfig) : combined;
        
        // Limit results
        const limitedResults = finalCombined.slice(0, searchConfig.k);
        
        return {
            vectors: limitedResults.map(item => item.vector),
            similarities: limitedResults.map(item => item.similarity),
            totalResults: limitedResults.length
        };
    }
    
    _mergeByClusterWeight(vectors, similarities, searchConfig) {
        // Weight results by cluster performance
        const clusterWeights = this._calculateClusterWeights();
        
        const weightedCombined = vectors.map((vector, i) => {
            const clusterId = vector.metadata.sourceCluster;
            const clusterWeight = clusterWeights.get(clusterId) || 1.0;
            const weightedSimilarity = similarities[i] * clusterWeight;
            
            return {
                vector,
                similarity: similarities[i],
                weightedSimilarity
            };
        });
        
        // Sort by weighted similarity
        weightedCombined.sort((a, b) => b.weightedSimilarity - a.weightedSimilarity);
        
        const limitedResults = weightedCombined.slice(0, searchConfig.k);
        
        return {
            vectors: limitedResults.map(item => item.vector),
            similarities: limitedResults.map(item => item.similarity),
            totalResults: limitedResults.length
        };
    }
    
    _mergeWithDiversity(vectors, similarities, searchConfig) {
        const combined = vectors.map((vector, i) => ({
            vector,
            similarity: similarities[i]
        }));
        
        // Sort by similarity first
        combined.sort((a, b) => b.similarity - a.similarity);
        
        // Apply aggressive diversity filtering
        const diverseResults = this._applyDiversityFilter(combined, {
            ...searchConfig,
            diversityThreshold: 0.8 // Higher threshold for diversity
        });
        
        return {
            vectors: diverseResults.map(item => item.vector),
            similarities: diverseResults.map(item => item.similarity),
            totalResults: diverseResults.length
        };
    }
    
    _applyDiversityFilter(combined, searchConfig) {
        const diversityThreshold = searchConfig.diversityThreshold || 0.9;
        const filtered = [];
        
        for (const candidate of combined) {
            let isDiverse = true;
            
            // Check diversity against already selected results
            for (const selected of filtered) {
                const similarity = this._calculateVectorSimilarity(
                    candidate.vector.vector,
                    selected.vector.vector
                );
                
                if (similarity > diversityThreshold) {
                    isDiverse = false;
                    break;
                }
            }
            
            if (isDiverse) {
                filtered.push(candidate);
            }
            
            // Stop if we have enough diverse results
            if (filtered.length >= searchConfig.k) {
                break;
            }
        }
        
        return filtered;
    }
    
    _calculateVectorSimilarity(vec1, vec2) {
        if (vec1.length !== vec2.length) return 0;
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }
        
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }
    
    _calculateClusterWeights() {
        const weights = new Map();
        
        for (const [clusterId, cluster] of this.clusters) {
            let weight = 1.0;
            
            // Weight based on success rate
            const totalRequests = cluster.metrics.totalRequests;
            if (totalRequests > 0) {
                const successRate = cluster.metrics.successfulRequests / totalRequests;
                weight *= successRate;
            }
            
            // Weight based on response time (faster is better)
            if (cluster.metrics.avgResponseTime > 0) {
                weight *= Math.min(1, 500 / cluster.metrics.avgResponseTime);
            }
            
            weights.set(clusterId, weight);
        }
        
        return weights;
    }
    
    // Analytics and optimization
    _recordSearch(queryVector, clusters, responseTime, resultCount) {
        const searchRecord = {
            timestamp: Date.now(),
            querySignature: this._calculateQuerySignature(queryVector),
            clusters: clusters.map(c => c.clusterId),
            responseTime,
            resultCount,
            clustersUsed: clusters.length
        };
        
        this.searchHistory.push(searchRecord);
        
        // Maintain history size
        if (this.searchHistory.length > 1000) {
            this.searchHistory.shift();
        }
    }
    
    _calculateQuerySignature(queryVector) {
        // Simple signature for pattern recognition
        const buckets = 8;
        const bucketSize = Math.ceil(queryVector.length / buckets);
        const signature = [];
        
        for (let i = 0; i < buckets; i++) {
            const start = i * bucketSize;
            const end = Math.min(start + bucketSize, queryVector.length);
            const sum = queryVector.slice(start, end).reduce((a, b) => a + b, 0);
            const avg = sum / (end - start);
            
            signature.push(avg > 0 ? 1 : -1);
        }
        
        return signature.join(',');
    }
    
    _getClusterPerformanceHistory() {
        const performance = new Map();
        
        for (const record of this.searchHistory) {
            for (const clusterId of record.clusters) {
                if (!performance.has(clusterId)) {
                    performance.set(clusterId, {
                        totalSearches: 0,
                        totalResponseTime: 0,
                        totalResults: 0,
                        successCount: 0
                    });
                }
                
                const stats = performance.get(clusterId);
                stats.totalSearches++;
                stats.totalResponseTime += record.responseTime / record.clustersUsed;
                stats.totalResults += record.resultCount / record.clustersUsed;
                stats.successCount++;
            }
        }
        
        // Calculate averages
        const result = new Map();
        for (const [clusterId, stats] of performance) {
            result.set(clusterId, {
                avgResponseTime: stats.totalResponseTime / stats.totalSearches,
                successRate: stats.successCount / stats.totalSearches,
                avgResultQuality: Math.min(1, stats.totalResults / stats.totalSearches / 10)
            });
        }
        
        return result;
    }
    
    _updateRoutingTable() {
        // Update routing table based on cluster capabilities and performance
        this.routingTable.clear();
        
        for (const [clusterId, cluster] of this.clusters) {
            const route = {
                clusterId,
                region: cluster.config.region,
                datacenter: cluster.config.datacenter,
                capabilities: cluster.config.capabilities,
                load: cluster.getLoad(),
                health: cluster.isHealthy(),
                performance: cluster.metrics.avgResponseTime
            };
            
            this.routingTable.set(clusterId, route);
        }
    }
    
    _updateGlobalMetrics(responseTime, clustersUsed, resultsCount, success) {
        this.globalMetrics.totalSearches++;
        
        if (success) {
            this.globalMetrics.successfulSearches++;
            
            // Update averages
            const successCount = this.globalMetrics.successfulSearches;
            this.globalMetrics.avgResponseTime = 
                (this.globalMetrics.avgResponseTime * (successCount - 1) + responseTime) / successCount;
            
            this.globalMetrics.avgClustersUsed = 
                (this.globalMetrics.avgClustersUsed * (successCount - 1) + clustersUsed) / successCount;
            
            this.globalMetrics.totalResultsMerged += resultsCount;
        } else {
            this.globalMetrics.failedSearches++;
        }
        
        // Calculate routing efficiency
        const totalSearches = this.globalMetrics.totalSearches;
        this.globalMetrics.routingEfficiency = 
            this.globalMetrics.successfulSearches / totalSearches;
    }
    
    // Background tasks
    _startMetricsCollection() {
        setInterval(() => {
            this._updateRoutingTable();
            this.emit('metricsUpdated', this.getStats());
        }, 30000); // Every 30 seconds
    }
    
    _startRouteOptimization() {
        setInterval(() => {
            this._optimizeRouting();
        }, 300000); // Every 5 minutes
    }
    
    _optimizeRouting() {
        // Analyze search history to optimize routing decisions
        const performanceHistory = this._getClusterPerformanceHistory();
        
        logger.debug('Optimizing federated routing', {
            totalSearches: this.searchHistory.length,
            clustersAnalyzed: performanceHistory.size
        });
        
        // This would implement more sophisticated routing optimization
        // For now, it's a placeholder for learning-based optimization
    }
    
    _generateSearchId() {
        return `fed_search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Public API
    getStats() {
        return {
            globalMetrics: { ...this.globalMetrics },
            clusters: Array.from(this.clusters.values()).map(cluster => cluster.getStats()),
            routingTable: Array.from(this.routingTable.values()),
            searchHistory: this.searchHistory.length,
            isInitialized: this.isInitialized
        };
    }
    
    getCluster(clusterId) {
        return this.clusters.get(clusterId);
    }
    
    getHealthyClusters() {
        return Array.from(this.clusters.values()).filter(cluster => cluster.isHealthy());
    }
    
    async shutdown() {
        logger.info('Shutting down Federated Search Manager');
        
        // Disconnect all clusters
        const disconnectPromises = Array.from(this.clusters.values())
            .map(cluster => cluster.disconnect());
        
        await Promise.allSettled(disconnectPromises);
        
        // Clear all data
        this.clusters.clear();
        this.routingTable.clear();
        this.searchHistory.length = 0;
        
        this.isInitialized = false;
        this.emit('shutdown');
    }
}

module.exports = FederatedSearchManager;