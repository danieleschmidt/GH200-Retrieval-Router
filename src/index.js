/**
 * GH200-Retrieval-Router - Main Entry Point
 * High-performance RAG system for Grace Hopper architecture
 */

const { RetrievalRouter } = require('./router/RetrievalRouter');
const { GraceMemoryManager } = require('./memory/GraceMemoryManager');
const { ShardManager } = require('./sharding/ShardManager');
const { VectorDatabase } = require('./database/VectorDatabase');
const { logger } = require('./utils/logger');
const config = require('./config/default');

/**
 * Initialize GH200-Retrieval-Router system
 * @param {Object} options - Configuration options
 * @returns {Promise<RetrievalRouter>} Initialized router instance
 */
async function initializeRouter(options = {}) {
    const mergedConfig = { ...config, ...options };
    
    logger.info('Initializing GH200-Retrieval-Router', {
        version: require('../package.json').version,
        graceMemoryEnabled: mergedConfig.graceMemory.enabled,
        nvlinkEnabled: mergedConfig.nvlink.enabled
    });

    try {
        // Initialize Grace memory manager
        const memoryManager = new GraceMemoryManager(mergedConfig.graceMemory);
        await memoryManager.initialize();
        
        // Initialize shard manager
        const shardManager = new ShardManager(mergedConfig.sharding);
        await shardManager.initialize();
        
        // Create router instance
        const router = new RetrievalRouter({
            config: mergedConfig,
            memoryManager,
            shardManager
        });
        
        await router.initialize();
        
        logger.info('GH200-Retrieval-Router initialized successfully', {
            availableMemory: await memoryManager.getAvailableMemory(),
            activeShards: shardManager.getActiveShardCount()
        });
        
        return router;
        
    } catch (error) {
        logger.error('Failed to initialize GH200-Retrieval-Router', { error: error.message });
        throw error;
    }
}

/**
 * Gracefully shutdown the router system
 * @param {RetrievalRouter} router - Router instance to shutdown
 */
async function shutdownRouter(router) {
    if (!router) return;
    
    logger.info('Shutting down GH200-Retrieval-Router');
    
    try {
        await router.shutdown();
        logger.info('GH200-Retrieval-Router shutdown complete');
    } catch (error) {
        logger.error('Error during router shutdown', { error: error.message });
        throw error;
    }
}

// Handle process signals for graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, initiating graceful shutdown');
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('Received SIGINT, initiating graceful shutdown');
    process.exit(0);
});

module.exports = {
    initializeRouter,
    shutdownRouter,
    RetrievalRouter,
    VectorDatabase,
    GraceMemoryManager,
    ShardManager
};
