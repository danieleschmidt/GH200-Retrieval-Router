/**
 * Default configuration for GH200-Retrieval-Router
 * Optimized for Grace Hopper architecture with 480GB unified memory
 */

module.exports = {
    // Grace Hopper Memory Configuration
    graceMemory: {
        totalMemoryGB: 480,
        embeddingsPoolGB: 300,  // 62.5% for vector storage
        cachePoolGB: 100,       // 20.8% for caching
        workspacePoolGB: 80,    // 16.7% for computations
        enableZeroCopy: true,
        memoryAlignment: 64,
        
        // Memory pool optimization
        poolGrowthFactor: 1.2,
        maxPoolFragmentation: 0.15,
        gcThreshold: 0.85
    },
    
    // NVLink Configuration
    nvlink: {
        enabled: true,
        bandwidth: 900,         // 900GB/s Grace Hopper bandwidth
        rings: 4,
        algorithm: 'RING,TREE',
        
        // Communication optimization
        chunkSizeKB: 1024,
        compression: false,
        asyncTransfer: true
    },
    
    // Sharding Strategy
    sharding: {
        strategy: 'SEMANTIC_CLUSTERING',
        minShardSizeGB: 100,
        maxShardSizeGB: 800,
        replicationFactor: 2,
        autoBalance: true,
        
        // Balancing parameters
        imbalanceThreshold: 0.2,
        rebalanceInterval: 3600000, // 1 hour
        migrationBatchSize: 1000000
    },
    
    // Embedding Configuration
    embedding: {
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        dimensions: 1536,
        similarity: 'cosine',
        batchSize: 32,
        
        // Optimization settings
        cacheEmbeddings: true,
        normalizeVectors: true,
        useGPUEncoding: true
    },
    
    // Query Optimization
    optimization: {
        cacheSize: 1000000,     // 1M cached queries
        prefetchFactor: 4,
        batchSize: 512,
        numWorkers: 16,
        
        // Cache settings
        cacheTTL: 3600000,      // 1 hour
        cacheCompression: true,
        maxCacheMemoryGB: 20
    },
    
    // Load Balancing
    loadBalancing: {
        strategy: 'ADAPTIVE',
        healthCheckInterval: 5000,
        maxRetries: 3,
        
        // Adaptive parameters
        latencyThreshold: 100,  // ms
        cpuThreshold: 80,       // %
        memoryThreshold: 90     // %
    },
    
    // Monitoring and Observability
    monitoring: {
        enabled: true,
        interval: 10000,        // 10 seconds
        metricsPort: 9090,
        tracingEnabled: true,
        
        // Metrics collection
        collectGraceMetrics: true,
        collectNVLinkMetrics: true,
        detailedProfiling: false
    },
    
    // Vector Database Defaults
    database: {
        indexType: 'faiss',
        metric: 'cosine',
        compression: 'pq',
        
        // FAISS specific
        faiss: {
            indexFactory: 'IVF4096,PQ64',
            nprobe: 256,
            useGPU: true,
            gpuMemoryFraction: 0.8
        },
        
        // ScaNN specific
        scann: {
            numLeaves: 2000,
            numLeavesToSearch: 100,
            trainingSize: 100000
        },
        
        // RAPIDS cuVS specific
        cuvs: {
            indexType: 'ivf_pq',
            clusters: 1024,
            codebookDim: 64
        }
    },
    
    // Network Configuration
    network: {
        port: 8080,
        host: '0.0.0.0',
        maxConnections: 1000,
        
        // Request handling
        requestTimeout: 30000,  // 30 seconds
        keepAliveTimeout: 5000,
        maxRequestSize: '100mb'
    },
    
    // Security Configuration
    security: {
        enableAuth: false,
        apiKeyRequired: false,
        rateLimiting: {
            enabled: true,
            maxRequests: 1000,
            windowMs: 60000     // 1 minute
        },
        
        // Input validation
        maxQueryLength: 10000,
        maxResultCount: 1000,
        sanitizeInputs: true
    },
    
    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'json',
        
        // Performance logging
        logQueries: true,
        logSlowQueries: true,
        slowQueryThreshold: 1000, // 1 second
        
        // File rotation
        maxFileSize: '100mb',
        maxFiles: 10
    },
    
    // Health Check Configuration
    health: {
        endpoint: '/health',
        interval: 30000,        // 30 seconds
        
        // Health check parameters
        memoryThreshold: 90,    // %
        diskThreshold: 85,      // %
        responseTimeThreshold: 1000 // ms
    },
    
    // Development/Debug Configuration
    development: {
        enableProfiling: false,
        enableDebugEndpoints: false,
        mockGraceHopper: process.env.MOCK_GRACE_HOPPER === 'true',
        
        // Testing parameters
        syntheticLoad: false,
        benchmarkMode: false
    },
    
    // Feature Flags
    features: {
        hybridSearch: true,
        semanticRouting: true,
        adaptiveSharding: true,
        continuousLearning: false,
        federatedRetrieval: false,
        
        // Experimental features
        quantizedIndices: false,
        dynamicCompression: false,
        predictivePrefetching: false
    },
    
    // Performance Targets
    performance: {
        targetLatencyMs: 50,
        targetThroughputQPS: 125000,
        targetMemoryEfficiency: 0.85,
        
        // SLA requirements
        availabilityTarget: 0.999,
        errorRateTarget: 0.001
    }
};
