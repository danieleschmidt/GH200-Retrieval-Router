/**
 * Migration: Create performance indexes
 * Creates optimized indexes for Grace Hopper performance
 */

const { logger } = require('../../utils/logger');

/**
 * Apply migration - create performance indexes
 * @param {Object} client - PostgreSQL client
 */
async function up(client) {
    logger.info('Running migration: 002_create_indexes');
    
    try {
        // Indexes for vector_databases table
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_databases_name 
            ON vector_databases(name) 
            WHERE active = true
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_databases_type_metric 
            ON vector_databases(index_type, metric) 
            WHERE active = true
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_databases_updated_at 
            ON vector_databases(updated_at DESC)
        `);
        
        // Indexes for vector_shards table
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_shards_database_id 
            ON vector_shards(database_id) 
            WHERE active = true
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_shards_node_id 
            ON vector_shards(node_id) 
            WHERE active = true
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_shards_load_factor 
            ON vector_shards(load_factor ASC) 
            WHERE active = true
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_shards_performance 
            ON vector_shards(avg_query_latency ASC, cache_hit_rate DESC) 
            WHERE active = true
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_shards_last_accessed 
            ON vector_shards(last_accessed DESC)
        `);
        
        // Indexes for query_metrics table
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_timestamp 
            ON query_metrics(timestamp DESC)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_database_name 
            ON query_metrics(database_name, timestamp DESC)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_latency 
            ON query_metrics(total_latency_ms ASC)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_performance 
            ON query_metrics(database_name, total_latency_ms, timestamp DESC)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_query_hash 
            ON query_metrics(query_hash, timestamp DESC)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_user_session 
            ON query_metrics(user_id, session_id, timestamp DESC)
        `);
        
        // Grace Hopper specific performance indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_grace_performance 
            ON query_metrics(grace_bandwidth_usage DESC, nvlink_usage DESC, timestamp DESC)
        `);
        
        // Indexes for node_status table
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_node_status_node_id 
            ON node_status(node_id) 
            WHERE status = 'online'
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_node_status_heartbeat 
            ON node_status(last_heartbeat DESC)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_node_status_load 
            ON node_status(current_query_load ASC, grace_memory_available DESC) 
            WHERE status = 'online'
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_node_status_capacity 
            ON node_status(grace_memory_available DESC, gpu_memory_available DESC) 
            WHERE status = 'online'
        `);
        
        // Indexes for embedding_cache table
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_embedding_cache_key 
            ON embedding_cache(cache_key)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_embedding_cache_query_hash 
            ON embedding_cache(query_hash, database_name)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_embedding_cache_expires 
            ON embedding_cache(expires_at ASC) 
            WHERE expires_at IS NOT NULL
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_embedding_cache_accessed 
            ON embedding_cache(last_accessed DESC, hit_count DESC)
        `);
        
        // Partial indexes for frequently accessed data
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_recent 
            ON query_metrics(database_name, total_latency_ms) 
            WHERE timestamp > NOW() - INTERVAL '24 hours'
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_shards_high_load 
            ON vector_shards(database_id, load_factor) 
            WHERE load_factor > 0.8 AND active = true
        `);
        
        // Composite indexes for complex queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_composite 
            ON query_metrics(database_name, cache_hit, total_latency_ms, timestamp DESC)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_shards_composite 
            ON vector_shards(database_id, node_id, active, load_factor)
        `);
        
        // GIN indexes for JSONB columns
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_databases_config_gin 
            ON vector_databases USING GIN(config)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_metadata_gin 
            ON query_metrics USING GIN(metadata)
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_node_status_metadata_gin 
            ON node_status USING GIN(metadata)
        `);
        
        // Array indexes for shard_ids
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_query_metrics_shard_ids_gin 
            ON query_metrics USING GIN(shard_ids)
        `);
        
        logger.info('Created performance indexes successfully');
        
    } catch (error) {
        logger.error('Failed to create indexes', { error: error.message });
        throw error;
    }
}

/**
 * Rollback migration - drop performance indexes
 * @param {Object} client - PostgreSQL client
 */
async function down(client) {
    logger.info('Rolling back migration: 002_create_indexes');
    
    try {
        // Drop all indexes created in the up migration
        const indexes = [
            'idx_vector_databases_name',
            'idx_vector_databases_type_metric',
            'idx_vector_databases_updated_at',
            'idx_vector_shards_database_id',
            'idx_vector_shards_node_id',
            'idx_vector_shards_load_factor',
            'idx_vector_shards_performance',
            'idx_vector_shards_last_accessed',
            'idx_query_metrics_timestamp',
            'idx_query_metrics_database_name',
            'idx_query_metrics_latency',
            'idx_query_metrics_performance',
            'idx_query_metrics_query_hash',
            'idx_query_metrics_user_session',
            'idx_query_metrics_grace_performance',
            'idx_node_status_node_id',
            'idx_node_status_heartbeat',
            'idx_node_status_load',
            'idx_node_status_capacity',
            'idx_embedding_cache_key',
            'idx_embedding_cache_query_hash',
            'idx_embedding_cache_expires',
            'idx_embedding_cache_accessed',
            'idx_query_metrics_recent',
            'idx_vector_shards_high_load',
            'idx_query_metrics_composite',
            'idx_vector_shards_composite',
            'idx_vector_databases_config_gin',
            'idx_query_metrics_metadata_gin',
            'idx_node_status_metadata_gin',
            'idx_query_metrics_shard_ids_gin'
        ];
        
        for (const indexName of indexes) {
            await client.query(`DROP INDEX IF EXISTS ${indexName}`);
        }
        
        logger.info('Dropped performance indexes successfully');
        
    } catch (error) {
        logger.error('Failed to drop indexes', { error: error.message });
        throw error;
    }
}

module.exports = {
    up,
    down,
    description: 'Create performance indexes optimized for Grace Hopper queries'
};
