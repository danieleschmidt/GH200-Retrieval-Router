/**
 * Database connection management for Grace Hopper optimized data storage
 * Handles PostgreSQL, Redis, and vector database connections
 */

const { Pool } = require('pg');
const Redis = require('ioredis');
const { logger } = require('../utils/logger');
// Validation utilities imported but not used - keeping for future use
const { validateConfig } = require('../utils/validators');

class DatabaseConnectionManager {
    constructor(config = {}) {
        this.config = config;
        this.connections = {
            postgres: null,
            redis: null,
            redisCluster: null
        };
        this.initialized = false;
    }
    
    /**
     * Initialize all database connections
     */
    async initialize() {
        if (this.initialized) {
            throw new Error('DatabaseConnectionManager already initialized');
        }
        
        logger.info('Initializing database connections');
        
        try {
            // Initialize PostgreSQL connection
            if (this.config.postgres?.enabled !== false) {
                await this._initializePostgreSQL();
            }
            
            // Initialize Redis connection
            if (this.config.redis?.enabled !== false) {
                await this._initializeRedis();
            }
            
            this.initialized = true;
            logger.info('All database connections initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize database connections', { error: error.message });
            await this.shutdown();
            throw error;
        }
    }
    
    /**
     * Initialize PostgreSQL connection pool
     */
    async _initializePostgreSQL() {
        const pgConfig = {
            connectionString: this.config.postgres?.url || process.env.POSTGRES_URL,
            max: this.config.postgres?.poolSize || 20,
            idleTimeoutMillis: this.config.postgres?.idleTimeout || 30000,
            connectionTimeoutMillis: this.config.postgres?.connectionTimeout || 10000,
            query_timeout: this.config.postgres?.queryTimeout || 30000,
            statement_timeout: this.config.postgres?.statementTimeout || 30000,
            
            // Grace Hopper optimizations
            application_name: 'gh200-retrieval-router',
            ssl: this.config.postgres?.ssl || false
        };
        
        logger.debug('Initializing PostgreSQL connection', {
            host: this._extractHost(pgConfig.connectionString),
            poolSize: pgConfig.max
        });
        
        this.connections.postgres = new Pool(pgConfig);
        
        // Test connection
        const client = await this.connections.postgres.connect();
        try {
            const result = await client.query('SELECT version(), current_database(), current_user');
            logger.info('PostgreSQL connection established', {
                version: result.rows[0].version.split(' ')[1],
                database: result.rows[0].current_database,
                user: result.rows[0].current_user
            });
            
            // Create extensions if needed
            await this._setupPostgreSQLExtensions(client);
            
        } finally {
            client.release();
        }
        
        // Set up connection event handlers
        this.connections.postgres.on('connect', () => {
            logger.debug('New PostgreSQL client connected');
        });
        
        this.connections.postgres.on('error', (err) => {
            logger.error('PostgreSQL pool error', { error: err.message });
        });
    }
    
    /**
     * Initialize Redis connection
     */
    async _initializeRedis() {
        const redisConfig = {
            host: this.config.redis?.host || 'localhost',
            port: this.config.redis?.port || 6379,
            password: this.config.redis?.password || process.env.REDIS_PASSWORD,
            db: this.config.redis?.db || 0,
            
            // Connection settings
            connectTimeout: this.config.redis?.connectTimeout || 10000,
            commandTimeout: this.config.redis?.commandTimeout || 5000,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            
            // Performance optimizations for Grace Hopper
            lazyConnect: true,
            keepAlive: 30000,
            enableOfflineQueue: false,
            
            // Memory optimization
            maxMemoryPolicy: 'allkeys-lru'
        };
        
        logger.debug('Initializing Redis connection', {
            host: redisConfig.host,
            port: redisConfig.port,
            db: redisConfig.db
        });
        
        // Check if cluster mode is enabled
        if (this.config.redis?.cluster?.enabled) {
            await this._initializeRedisCluster();
        } else {
            this.connections.redis = new Redis(redisConfig);
            
            // Test connection
            await this.connections.redis.connect();
            
            const info = await this.connections.redis.info('server');
            const version = info.match(/redis_version:([\d.]+)/)?.[1] || 'unknown';
            
            logger.info('Redis connection established', {
                version,
                host: redisConfig.host,
                port: redisConfig.port
            });
            
            // Configure Redis for Grace Hopper optimization
            await this._configureRedisForGraceHopper();
            
            // Set up event handlers
            this.connections.redis.on('connect', () => {
                logger.debug('Redis connected');
            });
            
            this.connections.redis.on('error', (err) => {
                logger.error('Redis connection error', { error: err.message });
            });
            
            this.connections.redis.on('close', () => {
                logger.warn('Redis connection closed');
            });
        }
    }
    
    /**
     * Initialize Redis cluster
     */
    async _initializeRedisCluster() {
        const clusterNodes = this.config.redis.cluster.nodes || [
            { host: 'localhost', port: 7000 },
            { host: 'localhost', port: 7001 },
            { host: 'localhost', port: 7002 }
        ];
        
        const clusterConfig = {
            enableOfflineQueue: false,
            redisOptions: {
                password: this.config.redis?.password || process.env.REDIS_PASSWORD,
                connectTimeout: 10000,
                commandTimeout: 5000
            },
            
            // Cluster-specific options
            scaleReads: 'slave',
            maxRedirections: 16,
            retryDelayOnFailover: 100
        };
        
        logger.debug('Initializing Redis cluster', {
            nodes: clusterNodes.length,
            scaleReads: clusterConfig.scaleReads
        });
        
        this.connections.redisCluster = new Redis.Cluster(clusterNodes, clusterConfig);
        
        await new Promise((resolve, reject) => {
            this.connections.redisCluster.on('ready', () => {
                logger.info('Redis cluster ready', {
                    nodes: this.connections.redisCluster.nodes().length
                });
                resolve();
            });
            
            this.connections.redisCluster.on('error', (err) => {
                logger.error('Redis cluster error', { error: err.message });
                reject(err);
            });
        });
    }
    
    /**
     * Setup PostgreSQL extensions for vector operations
     */
    async _setupPostgreSQLExtensions(client) {
        try {
            // Create vector extension if available (pgvector)
            await client.query('CREATE EXTENSION IF NOT EXISTS vector');
            logger.debug('pgvector extension created/verified');
        } catch (error) {
            logger.debug('pgvector extension not available (optional)', { error: error.message });
        }
        
        try {
            // Create UUID extension
            await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
            logger.debug('uuid-ossp extension created/verified');
        } catch (error) {
            logger.debug('uuid-ossp extension not available (optional)', { error: error.message });
        }
        
        // Create metadata tables for vector management
        await this._createMetadataTables(client);
    }
    
    /**
     * Create metadata tables for vector database management
     */
    async _createMetadataTables(client) {
        // Vector databases registry
        await client.query(`
            CREATE TABLE IF NOT EXISTS vector_databases (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(255) UNIQUE NOT NULL,
                index_type VARCHAR(50) NOT NULL,
                dimensions INTEGER NOT NULL,
                metric VARCHAR(50) NOT NULL,
                vector_count BIGINT DEFAULT 0,
                memory_usage BIGINT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                config JSONB DEFAULT '{}',
                active BOOLEAN DEFAULT true
            )
        `);
        
        // Shards registry
        await client.query(`
            CREATE TABLE IF NOT EXISTS vector_shards (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                database_id UUID REFERENCES vector_databases(id) ON DELETE CASCADE,
                shard_id VARCHAR(255) NOT NULL,
                node_id VARCHAR(255),
                index_path VARCHAR(1000),
                vector_count BIGINT DEFAULT 0,
                memory_usage BIGINT DEFAULT 0,
                load_factor DECIMAL(5,4) DEFAULT 0.0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                active BOOLEAN DEFAULT true,
                UNIQUE(database_id, shard_id)
            )
        `);
        
        // Query performance metrics
        await client.query(`
            CREATE TABLE IF NOT EXISTS query_metrics (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                query_id VARCHAR(255) NOT NULL,
                database_name VARCHAR(255),
                query_text TEXT,
                k INTEGER,
                latency_ms INTEGER,
                vectors_searched BIGINT,
                shards_queried INTEGER,
                cache_hit BOOLEAN DEFAULT false,
                memory_usage BIGINT,
                cpu_usage DECIMAL(5,2),
                gpu_usage DECIMAL(5,2),
                grace_bandwidth_usage DECIMAL(10,2),
                nvlink_usage DECIMAL(5,2),
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                metadata JSONB DEFAULT '{}'
            )
        `);
        
        // Create indices for performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_vector_databases_name ON vector_databases(name);
            CREATE INDEX IF NOT EXISTS idx_vector_shards_database_id ON vector_shards(database_id);
            CREATE INDEX IF NOT EXISTS idx_vector_shards_node_id ON vector_shards(node_id);
            CREATE INDEX IF NOT EXISTS idx_query_metrics_timestamp ON query_metrics(timestamp);
            CREATE INDEX IF NOT EXISTS idx_query_metrics_database_name ON query_metrics(database_name);
            CREATE INDEX IF NOT EXISTS idx_query_metrics_latency ON query_metrics(latency_ms);
        `);
        
        logger.debug('Metadata tables created/verified');
    }
    
    /**
     * Configure Redis for Grace Hopper optimization
     */
    async _configureRedisForGraceHopper() {
        try {
            // Set memory policies optimized for Grace Hopper
            await this.connections.redis.config('SET', 'maxmemory-policy', 'allkeys-lru');
            await this.connections.redis.config('SET', 'maxmemory-samples', '10');
            
            // Configure for high throughput
            await this.connections.redis.config('SET', 'tcp-keepalive', '300');
            await this.connections.redis.config('SET', 'timeout', '0');
            
            // Set optimal client buffer limits
            await this.connections.redis.config('SET', 'client-output-buffer-limit', 
                'normal 0 0 0 slave 268435456 67108864 60 pubsub 33554432 8388608 60');
            
            logger.debug('Redis configured for Grace Hopper optimization');
            
        } catch (error) {
            logger.warn('Could not configure Redis optimizations', { error: error.message });
        }
    }
    
    /**
     * Get PostgreSQL connection
     */
    getPostgreSQL() {
        if (!this.connections.postgres) {
            throw new Error('PostgreSQL connection not initialized');
        }
        return this.connections.postgres;
    }
    
    /**
     * Get Redis connection
     */
    getRedis() {
        if (!this.connections.redis && !this.connections.redisCluster) {
            throw new Error('Redis connection not initialized');
        }
        return this.connections.redisCluster || this.connections.redis;
    }
    
    /**
     * Test all connections
     */
    async testConnections() {
        const results = {};
        
        // Test PostgreSQL
        if (this.connections.postgres) {
            try {
                const client = await this.connections.postgres.connect();
                await client.query('SELECT 1');
                client.release();
                results.postgres = { status: 'connected', error: null };
            } catch (error) {
                results.postgres = { status: 'error', error: error.message };
            }
        }
        
        // Test Redis
        if (this.connections.redis || this.connections.redisCluster) {
            try {
                const redis = this.getRedis();
                await redis.ping();
                results.redis = { status: 'connected', error: null };
            } catch (error) {
                results.redis = { status: 'error', error: error.message };
            }
        }
        
        return results;
    }
    
    /**
     * Get connection statistics
     */
    async getStats() {
        const stats = {
            postgres: null,
            redis: null
        };
        
        // PostgreSQL stats
        if (this.connections.postgres) {
            stats.postgres = {
                totalCount: this.connections.postgres.totalCount,
                idleCount: this.connections.postgres.idleCount,
                waitingCount: this.connections.postgres.waitingCount
            };
        }
        
        // Redis stats
        if (this.connections.redis || this.connections.redisCluster) {
            try {
                const redis = this.getRedis();
                const info = await redis.info('stats');
                
                const parseInfo = (infoStr) => {
                    const obj = {};
                    infoStr.split('\r\n').forEach(line => {
                        const [key, value] = line.split(':');
                        if (key && value) obj[key] = value;
                    });
                    return obj;
                };
                
                const redisStats = parseInfo(info);
                stats.redis = {
                    connected_clients: redisStats.connected_clients,
                    total_commands_processed: redisStats.total_commands_processed,
                    keyspace_hits: redisStats.keyspace_hits,
                    keyspace_misses: redisStats.keyspace_misses,
                    used_memory: redisStats.used_memory,
                    used_memory_human: redisStats.used_memory_human
                };
            } catch (error) {
                stats.redis = { error: error.message };
            }
        }
        
        return stats;
    }
    
    /**
     * Extract hostname from connection string
     */
    _extractHost(connectionString) {
        try {
            const url = new URL(connectionString);
            return url.hostname;
        } catch {
            return 'unknown';
        }
    }
    
    /**
     * Gracefully shutdown all connections
     */
    async shutdown() {
        logger.info('Shutting down database connections');
        
        const shutdownPromises = [];
        
        // Shutdown PostgreSQL
        if (this.connections.postgres) {
            shutdownPromises.push(
                this.connections.postgres.end().catch(err => 
                    logger.error('Error closing PostgreSQL connection', { error: err.message })
                )
            );
        }
        
        // Shutdown Redis
        if (this.connections.redis) {
            shutdownPromises.push(
                this.connections.redis.disconnect().catch(err => 
                    logger.error('Error closing Redis connection', { error: err.message })
                )
            );
        }
        
        // Shutdown Redis cluster
        if (this.connections.redisCluster) {
            shutdownPromises.push(
                this.connections.redisCluster.disconnect().catch(err => 
                    logger.error('Error closing Redis cluster connection', { error: err.message })
                )
            );
        }
        
        await Promise.all(shutdownPromises);
        
        this.connections = {
            postgres: null,
            redis: null,
            redisCluster: null
        };
        
        this.initialized = false;
        
        logger.info('All database connections closed');
    }
}

module.exports = { DatabaseConnectionManager };
