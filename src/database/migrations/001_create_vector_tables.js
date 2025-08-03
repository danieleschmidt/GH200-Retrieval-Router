/**
 * Migration: Create vector database tables
 * Creates the foundational tables for managing vector databases and shards
 */

const { logger } = require('../../utils/logger');

/**
 * Apply migration - create vector database tables
 * @param {Object} client - PostgreSQL client
 */
async function up(client) {
    logger.info('Running migration: 001_create_vector_tables');
    
    try {
        // Enable UUID extension
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
        
        // Enable vector extension if available (pgvector)
        try {
            await client.query('CREATE EXTENSION IF NOT EXISTS vector');
            logger.info('pgvector extension enabled');
        } catch (error) {
            logger.warn('pgvector extension not available', { error: error.message });
        }
        
        // Create vector_databases table
        await client.query(`
            CREATE TABLE IF NOT EXISTS vector_databases (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(255) UNIQUE NOT NULL,
                index_type VARCHAR(50) NOT NULL CHECK (index_type IN ('faiss', 'scann', 'cuvs')),
                dimensions INTEGER NOT NULL CHECK (dimensions > 0 AND dimensions <= 4096),
                metric VARCHAR(50) NOT NULL CHECK (metric IN ('cosine', 'euclidean', 'dot', 'l2')),
                vector_count BIGINT DEFAULT 0 CHECK (vector_count >= 0),
                memory_usage BIGINT DEFAULT 0 CHECK (memory_usage >= 0),
                index_size BIGINT DEFAULT 0 CHECK (index_size >= 0),
                compression VARCHAR(50) DEFAULT 'none' CHECK (compression IN ('none', 'pq', 'sq', 'ivf')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                config JSONB DEFAULT '{}',
                metadata JSONB DEFAULT '{}',
                active BOOLEAN DEFAULT true,
                
                -- Grace Hopper specific fields
                grace_memory_pool VARCHAR(50) DEFAULT 'embeddings',
                nvlink_enabled BOOLEAN DEFAULT true,
                zero_copy_enabled BOOLEAN DEFAULT true,
                memory_alignment INTEGER DEFAULT 64
            )
        `);
        
        // Create vector_shards table
        await client.query(`
            CREATE TABLE IF NOT EXISTS vector_shards (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                database_id UUID REFERENCES vector_databases(id) ON DELETE CASCADE,
                shard_id VARCHAR(255) NOT NULL,
                node_id VARCHAR(255),
                index_path VARCHAR(1000),
                vector_count BIGINT DEFAULT 0 CHECK (vector_count >= 0),
                memory_usage BIGINT DEFAULT 0 CHECK (memory_usage >= 0),
                index_size BIGINT DEFAULT 0 CHECK (index_size >= 0),
                load_factor DECIMAL(5,4) DEFAULT 0.0 CHECK (load_factor >= 0.0 AND load_factor <= 1.0),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                active BOOLEAN DEFAULT true,
                
                -- Shard-specific configuration
                min_vectors BIGINT DEFAULT 0,
                max_vectors BIGINT DEFAULT 1000000000,
                replication_factor INTEGER DEFAULT 1,
                backup_enabled BOOLEAN DEFAULT false,
                
                -- Performance metrics
                avg_query_latency DECIMAL(10,3) DEFAULT 0.0,
                total_queries BIGINT DEFAULT 0,
                cache_hit_rate DECIMAL(5,4) DEFAULT 0.0,
                
                UNIQUE(database_id, shard_id)
            )
        `);
        
        // Create query_metrics table for performance tracking
        await client.query(`
            CREATE TABLE IF NOT EXISTS query_metrics (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                query_id VARCHAR(255) NOT NULL,
                database_name VARCHAR(255),
                shard_ids TEXT[],
                query_text TEXT,
                query_hash VARCHAR(64),
                k INTEGER CHECK (k > 0 AND k <= 10000),
                
                -- Performance metrics
                latency_ms INTEGER CHECK (latency_ms >= 0),
                retrieval_latency_ms INTEGER CHECK (retrieval_latency_ms >= 0),
                generation_latency_ms INTEGER CHECK (generation_latency_ms >= 0),
                total_latency_ms INTEGER CHECK (total_latency_ms >= 0),
                
                -- Resource usage
                vectors_searched BIGINT DEFAULT 0,
                shards_queried INTEGER DEFAULT 0,
                cache_hit BOOLEAN DEFAULT false,
                memory_usage BIGINT DEFAULT 0,
                cpu_usage DECIMAL(5,2) DEFAULT 0.0,
                gpu_usage DECIMAL(5,2) DEFAULT 0.0,
                
                -- Grace Hopper specific metrics
                grace_memory_usage BIGINT DEFAULT 0,
                grace_bandwidth_usage DECIMAL(10,2) DEFAULT 0.0,
                nvlink_usage DECIMAL(5,2) DEFAULT 0.0,
                zero_copy_operations INTEGER DEFAULT 0,
                
                -- Result quality
                result_count INTEGER DEFAULT 0,
                avg_similarity_score DECIMAL(10,8),
                min_similarity_score DECIMAL(10,8),
                max_similarity_score DECIMAL(10,8),
                
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                metadata JSONB DEFAULT '{}',
                
                -- User context
                user_id VARCHAR(255),
                session_id VARCHAR(255),
                request_id VARCHAR(255)
            )
        `);
        
        // Create node_status table for cluster management
        await client.query(`
            CREATE TABLE IF NOT EXISTS node_status (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                node_id VARCHAR(255) UNIQUE NOT NULL,
                hostname VARCHAR(255),
                ip_address INET,
                port INTEGER,
                
                -- Hardware specifications
                grace_memory_total BIGINT,
                grace_memory_available BIGINT,
                gpu_count INTEGER DEFAULT 0,
                gpu_memory_total BIGINT DEFAULT 0,
                gpu_memory_available BIGINT DEFAULT 0,
                nvlink_bandwidth DECIMAL(10,2) DEFAULT 0.0,
                
                -- Performance metrics
                cpu_usage DECIMAL(5,2) DEFAULT 0.0,
                memory_usage DECIMAL(5,2) DEFAULT 0.0,
                gpu_usage DECIMAL(5,2) DEFAULT 0.0,
                network_io BIGINT DEFAULT 0,
                disk_io BIGINT DEFAULT 0,
                
                -- Status tracking
                status VARCHAR(20) DEFAULT 'unknown' CHECK (status IN ('online', 'offline', 'degraded', 'maintenance', 'unknown')),
                last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                uptime_seconds BIGINT DEFAULT 0,
                
                -- Capacity and load
                max_concurrent_queries INTEGER DEFAULT 1000,
                current_query_load INTEGER DEFAULT 0,
                total_shards INTEGER DEFAULT 0,
                active_shards INTEGER DEFAULT 0,
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                metadata JSONB DEFAULT '{}'
            )
        `);
        
        // Create embedding_cache table for query result caching
        await client.query(`
            CREATE TABLE IF NOT EXISTS embedding_cache (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                cache_key VARCHAR(64) UNIQUE NOT NULL,
                query_text TEXT NOT NULL,
                query_hash VARCHAR(64) NOT NULL,
                database_name VARCHAR(255),
                k INTEGER,
                
                -- Cached results
                results JSONB NOT NULL,
                result_count INTEGER DEFAULT 0,
                
                -- Cache metadata
                hit_count INTEGER DEFAULT 0,
                last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                expires_at TIMESTAMP WITH TIME ZONE,
                
                -- Performance tracking
                original_latency_ms INTEGER,
                cache_size_bytes INTEGER,
                compression_ratio DECIMAL(5,4) DEFAULT 1.0
            )
        `);
        
        logger.info('Created vector database tables successfully');
        
    } catch (error) {
        logger.error('Failed to create vector database tables', { error: error.message });
        throw error;
    }
}

/**
 * Rollback migration - drop vector database tables
 * @param {Object} client - PostgreSQL client
 */
async function down(client) {
    logger.info('Rolling back migration: 001_create_vector_tables');
    
    try {
        // Drop tables in reverse order (due to foreign key constraints)
        await client.query('DROP TABLE IF EXISTS embedding_cache CASCADE');
        await client.query('DROP TABLE IF EXISTS node_status CASCADE');
        await client.query('DROP TABLE IF EXISTS query_metrics CASCADE');
        await client.query('DROP TABLE IF EXISTS vector_shards CASCADE');
        await client.query('DROP TABLE IF EXISTS vector_databases CASCADE');
        
        logger.info('Dropped vector database tables successfully');
        
    } catch (error) {
        logger.error('Failed to drop vector database tables', { error: error.message });
        throw error;
    }
}

module.exports = {
    up,
    down,
    description: 'Create vector database tables with Grace Hopper optimizations'
};
