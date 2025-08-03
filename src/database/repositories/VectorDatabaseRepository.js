/**
 * VectorDatabaseRepository - Data access layer for vector database metadata
 * Optimized for Grace Hopper performance with efficient queries
 */

const { logger } = require('../../utils/logger');
const { validateVectorConfig } = require('../../utils/validators');

class VectorDatabaseRepository {
    constructor(connectionManager) {
        this.db = connectionManager.getPostgreSQL();
        this.redis = connectionManager.getRedis();
    }
    
    /**
     * Create a new vector database entry
     * @param {Object} dbConfig - Database configuration
     * @returns {Promise<Object>} Created database record
     */
    async create(dbConfig) {
        validateVectorConfig(dbConfig);
        
        const query = `
            INSERT INTO vector_databases (
                name, index_type, dimensions, metric, compression,
                config, grace_memory_pool, nvlink_enabled, zero_copy_enabled
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        
        const values = [
            dbConfig.name,
            dbConfig.indexType,
            dbConfig.dimensions,
            dbConfig.metric,
            dbConfig.compression || 'none',
            JSON.stringify(dbConfig.config || {}),
            dbConfig.graceMemoryPool || 'embeddings',
            dbConfig.nvlinkEnabled !== false,
            dbConfig.zeroCopyEnabled !== false
        ];
        
        try {
            const result = await this.db.query(query, values);
            const database = result.rows[0];
            
            // Cache database info in Redis
            await this._cacheDatabase(database);
            
            logger.info('Vector database created', {
                id: database.id,
                name: database.name,
                indexType: database.index_type
            });
            
            return database;
            
        } catch (error) {
            logger.error('Failed to create vector database', {
                name: dbConfig.name,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Find database by name
     * @param {string} name - Database name
     * @returns {Promise<Object|null>} Database record or null
     */
    async findByName(name) {
        // Try cache first
        const cacheKey = `db:${name}`;
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (error) {
            logger.debug('Cache miss for database', { name, error: error.message });
        }
        
        const query = `
            SELECT * FROM vector_databases 
            WHERE name = $1 AND active = true
        `;
        
        try {
            const result = await this.db.query(query, [name]);
            const database = result.rows[0] || null;
            
            if (database) {
                await this._cacheDatabase(database);
            }
            
            return database;
            
        } catch (error) {
            logger.error('Failed to find database by name', {
                name,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Update vector database metadata
     * @param {string} id - Database ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated database record
     */
    async update(id, updates) {
        const allowedFields = [
            'vector_count', 'memory_usage', 'index_size', 'config',
            'metadata', 'updated_at'
        ];
        
        const updateFields = [];
        const values = [];
        let paramIndex = 1;
        
        for (const [field, value] of Object.entries(updates)) {
            if (allowedFields.includes(field)) {
                updateFields.push(`${field} = $${paramIndex}`);
                values.push(field === 'config' || field === 'metadata' ? JSON.stringify(value) : value);
                paramIndex++;
            }
        }
        
        if (updateFields.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        updateFields.push(`updated_at = NOW()`);
        values.push(id);
        
        const query = `
            UPDATE vector_databases 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        
        try {
            const result = await this.db.query(query, values);
            const database = result.rows[0];
            
            if (database) {
                // Update cache
                await this._cacheDatabase(database);
                
                logger.debug('Vector database updated', {
                    id: database.id,
                    name: database.name,
                    fields: Object.keys(updates)
                });
            }
            
            return database;
            
        } catch (error) {
            logger.error('Failed to update vector database', {
                id,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * List all active databases with optional filtering
     * @param {Object} filters - Filter criteria
     * @returns {Promise<Array>} Array of database records
     */
    async list(filters = {}) {
        let query = `
            SELECT * FROM vector_databases 
            WHERE active = true
        `;
        
        const values = [];
        let paramIndex = 1;
        
        if (filters.indexType) {
            query += ` AND index_type = $${paramIndex}`;
            values.push(filters.indexType);
            paramIndex++;
        }
        
        if (filters.metric) {
            query += ` AND metric = $${paramIndex}`;
            values.push(filters.metric);
            paramIndex++;
        }
        
        if (filters.minVectorCount) {
            query += ` AND vector_count >= $${paramIndex}`;
            values.push(filters.minVectorCount);
            paramIndex++;
        }
        
        query += ` ORDER BY updated_at DESC`;
        
        if (filters.limit) {
            query += ` LIMIT $${paramIndex}`;
            values.push(filters.limit);
        }
        
        try {
            const result = await this.db.query(query, values);
            return result.rows;
            
        } catch (error) {
            logger.error('Failed to list vector databases', {
                filters,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Get database statistics
     * @param {string} name - Database name
     * @returns {Promise<Object>} Database statistics
     */
    async getStats(name) {
        const query = `
            SELECT 
                vd.*,
                COUNT(vs.id) as shard_count,
                SUM(vs.vector_count) as total_vectors,
                SUM(vs.memory_usage) as total_memory_usage,
                AVG(vs.load_factor) as avg_load_factor,
                AVG(vs.avg_query_latency) as avg_query_latency,
                AVG(vs.cache_hit_rate) as avg_cache_hit_rate
            FROM vector_databases vd
            LEFT JOIN vector_shards vs ON vd.id = vs.database_id AND vs.active = true
            WHERE vd.name = $1 AND vd.active = true
            GROUP BY vd.id
        `;
        
        try {
            const result = await this.db.query(query, [name]);
            return result.rows[0] || null;
            
        } catch (error) {
            logger.error('Failed to get database stats', {
                name,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Delete database (soft delete)
     * @param {string} name - Database name
     * @returns {Promise<boolean>} Success status
     */
    async delete(name) {
        const query = `
            UPDATE vector_databases 
            SET active = false, updated_at = NOW()
            WHERE name = $1 AND active = true
            RETURNING id
        `;
        
        try {
            const result = await this.db.query(query, [name]);
            
            if (result.rows.length > 0) {
                // Remove from cache
                await this.redis.del(`db:${name}`);
                
                logger.info('Vector database deleted', { name });
                return true;
            }
            
            return false;
            
        } catch (error) {
            logger.error('Failed to delete vector database', {
                name,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Record query metrics
     * @param {Object} metrics - Query performance metrics
     * @returns {Promise<void>}
     */
    async recordQueryMetrics(metrics) {
        const query = `
            INSERT INTO query_metrics (
                query_id, database_name, shard_ids, query_text, query_hash, k,
                latency_ms, retrieval_latency_ms, generation_latency_ms, total_latency_ms,
                vectors_searched, shards_queried, cache_hit, memory_usage,
                cpu_usage, gpu_usage, grace_memory_usage, grace_bandwidth_usage,
                nvlink_usage, zero_copy_operations, result_count,
                avg_similarity_score, min_similarity_score, max_similarity_score,
                user_id, session_id, request_id, metadata
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18,
                $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
            )
        `;
        
        const values = [
            metrics.queryId,
            metrics.databaseName,
            metrics.shardIds || [],
            metrics.queryText,
            metrics.queryHash,
            metrics.k,
            metrics.latencyMs,
            metrics.retrievalLatencyMs,
            metrics.generationLatencyMs,
            metrics.totalLatencyMs,
            metrics.vectorsSearched,
            metrics.shardsQueried,
            metrics.cacheHit,
            metrics.memoryUsage,
            metrics.cpuUsage,
            metrics.gpuUsage,
            metrics.graceMemoryUsage,
            metrics.graceBandwidthUsage,
            metrics.nvlinkUsage,
            metrics.zeroCopyOperations,
            metrics.resultCount,
            metrics.avgSimilarityScore,
            metrics.minSimilarityScore,
            metrics.maxSimilarityScore,
            metrics.userId,
            metrics.sessionId,
            metrics.requestId,
            JSON.stringify(metrics.metadata || {})
        ];
        
        try {
            await this.db.query(query, values);
            
            // Also update database-level metrics
            if (metrics.databaseName) {
                await this._updateDatabaseMetrics(metrics.databaseName, metrics);
            }
            
        } catch (error) {
            logger.error('Failed to record query metrics', {
                queryId: metrics.queryId,
                error: error.message
            });
            // Don't throw - metrics recording shouldn't fail queries
        }
    }
    
    /**
     * Get performance analytics
     * @param {string} databaseName - Database name
     * @param {Object} timeRange - Time range for analytics
     * @returns {Promise<Object>} Performance analytics
     */
    async getPerformanceAnalytics(databaseName, timeRange = {}) {
        const { startTime = '24 hours', endTime = 'now' } = timeRange;
        
        const query = `
            SELECT 
                COUNT(*) as total_queries,
                AVG(total_latency_ms) as avg_latency,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_latency_ms) as p50_latency,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_latency_ms) as p95_latency,
                PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY total_latency_ms) as p99_latency,
                AVG(grace_bandwidth_usage) as avg_grace_bandwidth,
                AVG(nvlink_usage) as avg_nvlink_usage,
                SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as cache_hit_rate,
                AVG(vectors_searched) as avg_vectors_searched,
                AVG(shards_queried) as avg_shards_queried
            FROM query_metrics 
            WHERE database_name = $1 
            AND timestamp >= NOW() - INTERVAL '${startTime}'
            AND timestamp <= ${endTime === 'now' ? 'NOW()' : '$2'}
        `;
        
        const values = [databaseName];
        if (endTime !== 'now') {
            values.push(endTime);
        }
        
        try {
            const result = await this.db.query(query, values);
            return result.rows[0];
            
        } catch (error) {
            logger.error('Failed to get performance analytics', {
                databaseName,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Cache database info in Redis
     * @private
     */
    async _cacheDatabase(database) {
        try {
            const cacheKey = `db:${database.name}`;
            await this.redis.setex(cacheKey, 3600, JSON.stringify(database)); // 1 hour TTL
        } catch (error) {
            logger.debug('Failed to cache database', {
                name: database.name,
                error: error.message
            });
        }
    }
    
    /**
     * Update database-level metrics
     * @private
     */
    async _updateDatabaseMetrics(databaseName, metrics) {
        // This could aggregate metrics and update the database record
        // For now, we'll just log for debugging
        logger.debug('Database metrics updated', {
            databaseName,
            latency: metrics.totalLatencyMs,
            cacheHit: metrics.cacheHit
        });
    }
}

module.exports = { VectorDatabaseRepository };
