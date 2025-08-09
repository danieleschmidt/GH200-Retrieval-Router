/**
 * Validation utilities for GH200-Retrieval-Router
 * Provides comprehensive input validation with performance optimization
 */

const Joi = require('joi');

// Configuration validation schemas
const configSchema = Joi.object({
    graceMemory: Joi.object({
        totalMemoryGB: Joi.number().min(1).max(2048).default(480),
        embeddingsPoolGB: Joi.number().min(1).default(300),
        cachePoolGB: Joi.number().min(1).default(100),
        workspacePoolGB: Joi.number().min(1).default(80),
        enableZeroCopy: Joi.boolean().default(true),
        memoryAlignment: Joi.number().min(8).max(128).default(64)
    }).default(),
    
    nvlink: Joi.object({
        enabled: Joi.boolean().default(true),
        bandwidth: Joi.number().min(1).max(900).default(900),
        rings: Joi.number().min(1).max(8).default(4),
        algorithm: Joi.string().valid('RING', 'TREE', 'RING,TREE').default('RING,TREE')
    }).default(),
    
    sharding: Joi.object({
        strategy: Joi.string().valid('ROUND_ROBIN', 'SEMANTIC_CLUSTERING', 'HASH_BASED').default('SEMANTIC_CLUSTERING'),
        minShardSize: Joi.number().min(1).default(100),
        maxShardSize: Joi.number().min(1).default(800),
        replicationFactor: Joi.number().min(1).max(5).default(2),
        autoBalance: Joi.boolean().default(true)
    }).default(),
    
    embedding: Joi.object({
        model: Joi.string().default('sentence-transformers/all-MiniLM-L6-v2'),
        dimensions: Joi.number().min(64).max(4096).default(1536),
        similarity: Joi.string().valid('cosine', 'euclidean', 'dot').default('cosine'),
        batchSize: Joi.number().min(1).max(1024).default(32)
    }).default(),
    
    optimization: Joi.object({
        cacheSize: Joi.number().min(1).default(1000000),
        prefetchFactor: Joi.number().min(1).max(10).default(4),
        batchSize: Joi.number().min(1).max(1024).default(512),
        numWorkers: Joi.number().min(1).max(64).default(16)
    }).default(),
    
    loadBalancing: Joi.object({
        strategy: Joi.string().valid('ROUND_ROBIN', 'LEAST_CONNECTIONS', 'WEIGHTED', 'ADAPTIVE').default('ADAPTIVE'),
        healthCheckInterval: Joi.number().min(1000).default(5000),
        maxRetries: Joi.number().min(1).max(10).default(3)
    }).default(),
    
    monitoring: Joi.object({
        enabled: Joi.boolean().default(true),
        interval: Joi.number().min(1000).default(10000),
        metricsPort: Joi.number().min(1024).max(65535).default(9090),
        tracingEnabled: Joi.boolean().default(true)
    }).default()
});

// Memory configuration validation
const memoryConfigSchema = Joi.object({
    totalMemoryGB: Joi.number().min(1).max(2048).required(),
    embeddingsPoolGB: Joi.number().min(1).required(),
    cachePoolGB: Joi.number().min(1).required(),
    workspacePoolGB: Joi.number().min(1).required(),
    enableZeroCopy: Joi.boolean().default(true),
    memoryAlignment: Joi.number().min(8).max(128).default(64)
}).custom((value, helpers) => {
    // Validate that pool sizes don't exceed total memory
    const totalPools = value.embeddingsPoolGB + value.cachePoolGB + value.workspacePoolGB;
    if (totalPools > value.totalMemoryGB) {
        return helpers.error('custom.totalPoolsExceedTotal', {
            totalPools,
            totalMemory: value.totalMemoryGB
        });
    }
    return value;
}).messages({
    'custom.totalPoolsExceedTotal': 'Total pool sizes ({#totalPools}GB) exceed total memory ({#totalMemory}GB)'
});

// Vector database configuration validation
const vectorConfigSchema = Joi.object({
    indexType: Joi.string().valid('faiss', 'scann', 'cuvs').required(),
    dimensions: Joi.number().min(1).max(4096).required(),
    metric: Joi.string().valid('cosine', 'euclidean', 'dot', 'l2').required(),
    shardCount: Joi.number().min(1).max(1000).default(1),
    graceMemory: Joi.boolean().default(true),
    compression: Joi.string().valid('none', 'pq', 'sq', 'ivf').default('pq')
});

// Query validation schema
const querySchema = Joi.object({
    query: Joi.string().min(1).max(10000).required(),
    k: Joi.number().min(1).max(1000).default(10),
    database: Joi.string().optional(),
    model: Joi.string().optional(),
    temperature: Joi.number().min(0).max(2).optional(),
    maxTokens: Joi.number().min(1).max(4096).optional(),
    filters: Joi.object().optional()
});

// Search query validation schema
const searchQuerySchema = Joi.object({
    embedding: Joi.alternatives().try(
        Joi.array().items(Joi.number()),
        Joi.object().instance(Float32Array)
    ).required(),
    k: Joi.number().min(1).max(1000).default(10),
    shardId: Joi.alternatives().try(
        Joi.number().min(0),
        Joi.string(),
        Joi.allow(null)
    ).optional(),
    filters: Joi.object().optional(),
    includeMetadata: Joi.boolean().default(true)
});

// Shard configuration validation
const shardConfigSchema = Joi.object({
    id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    indexPath: Joi.string().required(),
    vectorCount: Joi.number().min(0).required(),
    memoryUsage: Joi.number().min(0).required(),
    loadTime: Joi.number().min(0).optional(),
    active: Joi.boolean().default(true)
});

// Performance metrics validation
const metricsSchema = Joi.object({
    queryId: Joi.string().required(),
    latencyMs: Joi.number().min(0).required(),
    throughputQPS: Joi.number().min(0).optional(),
    vectorsSearched: Joi.number().min(0).optional(),
    shardsQueried: Joi.number().min(0).optional(),
    cacheHit: Joi.boolean().optional(),
    retrievalLatencyMs: Joi.number().min(0).optional(),
    generationLatencyMs: Joi.number().min(0).optional(),
    memoryUsageBytes: Joi.number().min(0).optional(),
    cpuUtilization: Joi.number().min(0).max(100).optional(),
    gpuUtilization: Joi.number().min(0).max(100).optional()
});

/**
 * Validate router configuration
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validated configuration
 * @throws {Error} Validation error
 */
function validateConfig(config) {
    const { error, value } = configSchema.validate(config, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
    });
    
    if (error) {
        const errorMessage = error.details.map(detail => detail.message).join('; ');
        throw new Error(`Configuration validation failed: ${errorMessage}`);
    }
    
    return value;
}

/**
 * Validate memory configuration
 * @param {Object} memoryConfig - Memory configuration object
 * @returns {Object} Validated memory configuration
 * @throws {Error} Validation error
 */
function validateMemoryConfig(memoryConfig) {
    const { error, value } = memoryConfigSchema.validate(memoryConfig, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
    });
    
    if (error) {
        const errorMessage = error.details.map(detail => detail.message).join('; ');
        throw new Error(`Memory configuration validation failed: ${errorMessage}`);
    }
    
    return value;
}

/**
 * Validate vector database configuration
 * @param {Object} vectorConfig - Vector database configuration
 * @returns {Object} Validated vector configuration
 * @throws {Error} Validation error
 */
function validateVectorConfig(vectorConfig) {
    const { error, value } = vectorConfigSchema.validate(vectorConfig, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
    });
    
    if (error) {
        const errorMessage = error.details.map(detail => detail.message).join('; ');
        throw new Error(`Vector configuration validation failed: ${errorMessage}`);
    }
    
    return value;
}

/**
 * Validate query parameters
 * @param {Object} query - Query object to validate
 * @returns {Object} Validated query
 * @throws {Error} Validation error
 */
function validateQuery(query) {
    const { error, value } = querySchema.validate(query, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
    });
    
    if (error) {
        const errorMessage = error.details.map(detail => detail.message).join('; ');
        throw new Error(`Query validation failed: ${errorMessage}`);
    }
    
    return value;
}

/**
 * Validate search query parameters
 * @param {Object} searchQuery - Search query object to validate
 * @returns {Object} Validated search query
 * @throws {Error} Validation error
 */
function validateSearchQuery(searchQuery) {
    const { error, value } = searchQuerySchema.validate(searchQuery, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
    });
    
    if (error) {
        const errorMessage = error.details.map(detail => detail.message).join('; ');
        throw new Error(`Search query validation failed: ${errorMessage}`);
    }
    
    return value;
}

/**
 * Validate shard configuration
 * @param {Object} shardConfig - Shard configuration object
 * @returns {Object} Validated shard configuration
 * @throws {Error} Validation error
 */
function validateShardConfig(shardConfig) {
    const { error, value } = shardConfigSchema.validate(shardConfig, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
    });
    
    if (error) {
        const errorMessage = error.details.map(detail => detail.message).join('; ');
        throw new Error(`Shard configuration validation failed: ${errorMessage}`);
    }
    
    return value;
}

/**
 * Validate performance metrics
 * @param {Object} metrics - Performance metrics object
 * @returns {Object} Validated metrics
 * @throws {Error} Validation error
 */
function validateMetrics(metrics) {
    const { error, value } = metricsSchema.validate(metrics, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
    });
    
    if (error) {
        const errorMessage = error.details.map(detail => detail.message).join('; ');
        throw new Error(`Metrics validation failed: ${errorMessage}`);
    }
    
    return value;
}

/**
 * Validate vector dimensions and format
 * @param {Array|Float32Array} vectors - Vector data
 * @param {number} expectedDimensions - Expected vector dimensions
 * @returns {boolean} Validation result
 * @throws {Error} Validation error
 */
function validateVectors(vectors, expectedDimensions) {
    if (!vectors) {
        throw new Error('Vectors are required');
    }
    
    if (!Array.isArray(vectors) && !(vectors instanceof Float32Array)) {
        throw new Error('Vectors must be an array or Float32Array');
    }
    
    const vectorCount = Array.isArray(vectors) ? 
        vectors.length / expectedDimensions : 
        vectors.length / expectedDimensions;
    
    if (!Number.isInteger(vectorCount)) {
        throw new Error(`Vector data length (${vectors.length}) is not divisible by dimensions (${expectedDimensions})`);
    }
    
    if (vectorCount === 0) {
        throw new Error('At least one vector is required');
    }
    
    // Validate vector values
    for (let i = 0; i < vectors.length; i++) {
        const value = vectors[i];
        if (typeof value !== 'number' || !isFinite(value)) {
            throw new Error(`Invalid vector value at index ${i}: ${value}`);
        }
    }
    
    return true;
}

/**
 * Validate embedding vector
 * @param {Array|Float32Array} embedding - Embedding vector
 * @param {number} expectedDimensions - Expected dimensions
 * @returns {boolean} Validation result
 * @throws {Error} Validation error
 */
function validateEmbedding(embedding, expectedDimensions) {
    if (!embedding) {
        throw new Error('Embedding is required');
    }
    
    if (!Array.isArray(embedding) && !(embedding instanceof Float32Array)) {
        throw new Error('Embedding must be an array or Float32Array');
    }
    
    if (embedding.length !== expectedDimensions) {
        throw new Error(`Embedding dimensions (${embedding.length}) do not match expected (${expectedDimensions})`);
    }
    
    // Validate embedding values
    for (let i = 0; i < embedding.length; i++) {
        const value = embedding[i];
        if (typeof value !== 'number' || !isFinite(value)) {
            throw new Error(`Invalid embedding value at index ${i}: ${value}`);
        }
    }
    
    return true;
}

/**
 * Sanitize user input to prevent injection attacks
 * @param {string} input - User input string
 * @returns {string} Sanitized input
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return String(input);
    }
    
    // Remove potentially dangerous characters
    return input
        .replace(/[<>"'&]/g, '') // Remove HTML/XML chars
        .replace(/\\0/g, '') // Remove null bytes
        .replace(/\\x[0-9a-fA-F]{2}/g, '') // Remove hex sequences
        .trim();
}

/**
 * Validate file path for security
 * @param {string} filePath - File path to validate
 * @returns {boolean} Validation result
 * @throws {Error} Validation error
 */
function validateFilePath(filePath) {
    if (typeof filePath !== 'string') {
        throw new Error('File path must be a string');
    }
    
    // Check for path traversal attempts
    if (filePath.includes('..') || filePath.includes('~')) {
        throw new Error('Invalid file path: path traversal detected');
    }
    
    // Check for absolute paths outside allowed directories
    const allowedPaths = ['/data', '/tmp', '/var/lib/gh200-router'];
    const isAllowed = allowedPaths.some(allowed => filePath.startsWith(allowed));
    
    if (filePath.startsWith('/') && !isAllowed) {
        throw new Error('Invalid file path: access denied to this location');
    }
    
    return true;
}

module.exports = {
    validateConfig,
    validateMemoryConfig,
    validateVectorConfig,
    validateQuery,
    validateSearchQuery,
    validateShardConfig,
    validateMetrics,
    validateVectors,
    validateEmbedding,
    sanitizeInput,
    validateFilePath,
    // Export schemas for advanced usage
    schemas: {
        config: configSchema,
        memoryConfig: memoryConfigSchema,
        vectorConfig: vectorConfigSchema,
        query: querySchema,
        searchQuery: searchQuerySchema,
        shardConfig: shardConfigSchema,
        metrics: metricsSchema
    }
};
