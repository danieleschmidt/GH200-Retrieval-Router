/**
 * Streaming Response Manager for Large Vector Search Result Sets
 * Optimized for GH200 high-bandwidth processing with adaptive streaming
 */

const { Readable, Transform, PassThrough } = require('stream');
const { EventEmitter } = require('events');
const zlib = require('zlib');
const { logger } = require('../utils/logger');

/**
 * Adaptive streaming transform for vector results
 */
class VectorResultStream extends Transform {
    constructor(options = {}) {
        super({
            objectMode: true,
            highWaterMark: options.highWaterMark || 16
        });
        
        this.config = {
            batchSize: options.batchSize || 100,
            compressionEnabled: options.compression !== false,
            compressionLevel: options.compressionLevel || 6,
            includeMetadata: options.includeMetadata !== false,
            adaptiveBatching: options.adaptiveBatching !== false,
            ...options
        };
        
        this.currentBatch = [];
        this.processedCount = 0;
        this.startTime = Date.now();
        this.metrics = {
            totalVectors: 0,
            totalBatches: 0,
            avgBatchSize: 0,
            compressionRatio: 1,
            throughput: 0
        };
    }
    
    _transform(vector, encoding, callback) {
        try {
            // Add vector to current batch
            this.currentBatch.push(this._formatVector(vector));
            this.processedCount++;
            
            // Check if batch is ready
            const batchSize = this.config.adaptiveBatching ? 
                this._getAdaptiveBatchSize() : this.config.batchSize;
            
            if (this.currentBatch.length >= batchSize) {
                this._flushBatch(callback);
            } else {
                callback();
            }
            
        } catch (error) {
            callback(error);
        }
    }
    
    _flush(callback) {
        if (this.currentBatch.length > 0) {
            this._flushBatch(callback);
        } else {
            callback();
        }
    }
    
    async _flushBatch(callback) {
        try {
            const batch = {
                vectors: [...this.currentBatch],
                metadata: {
                    batchId: this.metrics.totalBatches,
                    batchSize: this.currentBatch.length,
                    timestamp: Date.now(),
                    processed: this.processedCount,
                    compressionEnabled: this.config.compressionEnabled
                }
            };
            
            // Clear current batch
            this.currentBatch = [];
            this.metrics.totalBatches++;
            this.metrics.totalVectors += batch.vectors.length;
            this.metrics.avgBatchSize = this.metrics.totalVectors / this.metrics.totalBatches;
            
            // Compress if enabled
            if (this.config.compressionEnabled) {
                batch.compressed = await this._compressBatch(batch);
                batch.metadata.compressed = true;
                batch.metadata.originalSize = Buffer.byteLength(JSON.stringify(batch.vectors));
                batch.metadata.compressedSize = batch.compressed.length;
                this.metrics.compressionRatio = 
                    batch.metadata.originalSize / batch.metadata.compressedSize;
            }
            
            // Calculate throughput
            const elapsed = (Date.now() - this.startTime) / 1000;
            this.metrics.throughput = this.metrics.totalVectors / elapsed;
            
            this.push(batch);
            callback();
            
        } catch (error) {
            callback(error);
        }
    }
    
    _formatVector(vector) {
        const formatted = {
            id: vector.id || `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            vector: vector.vector || vector,
            similarity: vector.similarity || 1.0
        };
        
        if (this.config.includeMetadata && vector.metadata) {
            formatted.metadata = vector.metadata;
        }
        
        return formatted;
    }
    
    _getAdaptiveBatchSize() {
        // Adapt batch size based on throughput and memory pressure
        const baseBatchSize = this.config.batchSize;
        const throughput = this.metrics.throughput;
        
        if (throughput > 10000) { // High throughput, increase batch size
            return Math.min(baseBatchSize * 2, 1000);
        } else if (throughput < 1000) { // Low throughput, decrease batch size
            return Math.max(Math.floor(baseBatchSize / 2), 10);
        }
        
        return baseBatchSize;
    }
    
    async _compressBatch(batch) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(batch.vectors);
            
            zlib.gzip(data, {
                level: this.config.compressionLevel,
                chunkSize: 16 * 1024 // 16KB chunks
            }, (error, compressed) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(compressed);
                }
            });
        });
    }
    
    getMetrics() {
        return { ...this.metrics };
    }
}

/**
 * Streaming Response Manager
 */
class StreamingResponseManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Streaming Configuration
            defaultBatchSize: options.defaultBatchSize || 100,
            maxConcurrentStreams: options.maxConcurrentStreams || 50,
            streamTimeout: options.streamTimeout || 300000, // 5 minutes
            backpressureThreshold: options.backpressureThreshold || 1000,
            
            // Performance Options
            compressionEnabled: options.compression !== false,
            adaptiveStreaming: options.adaptiveStreaming !== false,
            priorityQueueing: options.priorityQueueing !== false,
            
            // Memory Management
            maxMemoryUsage: options.maxMemoryUsage || 1024 * 1024 * 1024, // 1GB
            gcThreshold: options.gcThreshold || 0.8,
            
            // Error Handling
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000,
            
            ...options
        };
        
        // Stream management
        this.activeStreams = new Map();
        this.streamQueue = [];
        this.streamMetrics = new Map();
        
        // Global metrics
        this.globalMetrics = {
            totalStreams: 0,
            activeStreams: 0,
            completedStreams: 0,
            failedStreams: 0,
            totalVectorsStreamed: 0,
            avgStreamDuration: 0,
            throughput: 0,
            memoryUsage: 0,
            backpressureEvents: 0
        };
        
        this.isInitialized = false;
        this.cleanupInterval = null;
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            logger.info('Initializing Streaming Response Manager', {
                maxConcurrentStreams: this.config.maxConcurrentStreams,
                compressionEnabled: this.config.compressionEnabled,
                adaptiveStreaming: this.config.adaptiveStreaming
            });
            
            // Start background tasks
            this._startStreamCleanup();
            this._startMetricsCollection();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            logger.info('Streaming Response Manager initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize Streaming Response Manager', {
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Create a new streaming response
     */
    async createStream(searchResults, options = {}) {
        const streamId = this._generateStreamId();
        const startTime = Date.now();
        
        try {
            // Validate input
            if (!searchResults || (!Array.isArray(searchResults) && typeof searchResults[Symbol.iterator] !== 'function')) {
                throw new Error('Search results must be iterable');
            }
            
            // Check concurrent stream limits
            if (this.activeStreams.size >= this.config.maxConcurrentStreams) {
                throw new Error('Maximum concurrent streams exceeded');
            }
            
            const streamConfig = {
                ...this.config,
                ...options,
                streamId,
                startTime,
                priority: options.priority || 'normal'
            };
            
            // Create result stream
            const resultStream = this._createResultStream(searchResults, streamConfig);
            
            // Create response stream with appropriate encoding
            const responseStream = this._createResponseStream(resultStream, streamConfig);
            
            // Track stream
            this._trackStream(streamId, responseStream, streamConfig);
            
            logger.debug('Created streaming response', {
                streamId,
                resultCount: Array.isArray(searchResults) ? searchResults.length : 'unknown',
                compression: streamConfig.compressionEnabled,
                batchSize: streamConfig.batchSize || this.config.defaultBatchSize
            });
            
            this.emit('streamCreated', { streamId, options: streamConfig });
            
            return {
                streamId,
                stream: responseStream,
                metadata: {
                    created: startTime,
                    compression: streamConfig.compressionEnabled,
                    batchSize: streamConfig.batchSize || this.config.defaultBatchSize
                }
            };
            
        } catch (error) {
            logger.error('Failed to create streaming response', {
                streamId,
                error: error.message
            });
            throw error;
        }
    }
    
    _createResultStream(searchResults, config) {
        let sourceStream;
        
        if (Array.isArray(searchResults)) {
            // Convert array to readable stream
            sourceStream = Readable.from(searchResults, { objectMode: true });
        } else {
            // Assume it's already a stream or iterable
            sourceStream = Readable.from(searchResults, { objectMode: true });
        }
        
        // Add vector processing transform
        const vectorStream = new VectorResultStream({
            batchSize: config.batchSize || this.config.defaultBatchSize,
            compression: config.compressionEnabled,
            includeMetadata: config.includeMetadata,
            adaptiveBatching: this.config.adaptiveStreaming
        });
        
        // Handle backpressure
        const backpressureStream = new Transform({
            objectMode: true,
            highWaterMark: config.highWaterMark || 16,
            transform(chunk, encoding, callback) {
                // Monitor backpressure
                if (this._writableState.highWaterMark > this.config.backpressureThreshold) {
                    this.globalMetrics.backpressureEvents++;
                    this.emit('backpressure', { streamId: config.streamId });
                }
                
                callback(null, chunk);
            }
        });
        
        return sourceStream
            .pipe(vectorStream)
            .pipe(backpressureStream);
    }
    
    _createResponseStream(resultStream, config) {
        const responseStream = new PassThrough({ objectMode: false });
        let isFirstChunk = true;
        
        // Set timeout
        const timeout = setTimeout(() => {
            responseStream.emit('error', new Error('Stream timeout'));
        }, config.streamTimeout);
        
        resultStream.on('data', (batch) => {
            try {
                let responseData;
                
                if (config.format === 'json') {
                    if (isFirstChunk) {
                        responseStream.write('{"results":[');
                        isFirstChunk = false;
                    } else {
                        responseStream.write(',');
                    }
                    
                    if (batch.compressed) {
                        // Send compressed batch with metadata
                        responseData = JSON.stringify({
                            compressed: true,
                            data: batch.compressed.toString('base64'),
                            metadata: batch.metadata
                        });
                    } else {
                        responseData = JSON.stringify(batch);
                    }
                } else if (config.format === 'ndjson') {
                    responseData = JSON.stringify(batch) + '\n';
                } else {
                    // Binary format
                    responseData = this._serializeBinary(batch);
                }
                
                responseStream.write(responseData);
                
                // Update metrics
                const streamMetrics = this.streamMetrics.get(config.streamId);
                if (streamMetrics) {
                    streamMetrics.chunksStreamed++;
                    streamMetrics.vectorsStreamed += batch.vectors.length;
                }
                
            } catch (error) {
                responseStream.emit('error', error);
            }
        });
        
        resultStream.on('end', () => {
            clearTimeout(timeout);
            
            if (config.format === 'json' && !isFirstChunk) {
                responseStream.write(']}');
            }
            
            responseStream.end();
            this._completeStream(config.streamId);
        });
        
        resultStream.on('error', (error) => {
            clearTimeout(timeout);
            responseStream.emit('error', error);
            this._failStream(config.streamId, error);
        });
        
        return responseStream;
    }
    
    _serializeBinary(batch) {
        // Simple binary serialization for vectors
        const vectors = batch.vectors;
        const vectorCount = vectors.length;
        const dimensions = vectors[0] ? vectors[0].vector.length : 0;
        
        // Header: vector count (4 bytes) + dimensions (4 bytes)
        const headerBuffer = Buffer.allocUnsafe(8);
        headerBuffer.writeUInt32LE(vectorCount, 0);
        headerBuffer.writeUInt32LE(dimensions, 4);
        
        // Vector data
        const dataBuffer = Buffer.allocUnsafe(vectorCount * dimensions * 4 + vectorCount * 8); // 4 bytes per float + 8 bytes per ID/similarity
        let offset = 0;
        
        for (const vector of vectors) {
            // Write similarity (float32)
            dataBuffer.writeFloatLE(vector.similarity || 0, offset);
            offset += 4;
            
            // Write ID hash (uint32)
            const idHash = this._hashString(vector.id);
            dataBuffer.writeUInt32LE(idHash, offset);
            offset += 4;
            
            // Write vector data
            for (const value of vector.vector) {
                dataBuffer.writeFloatLE(value, offset);
                offset += 4;
            }
        }
        
        return Buffer.concat([headerBuffer, dataBuffer]);
    }
    
    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash >>> 0; // Convert to unsigned
    }
    
    _trackStream(streamId, stream, config) {
        // Store active stream
        this.activeStreams.set(streamId, {
            stream,
            config,
            startTime: config.startTime,
            status: 'active'
        });
        
        // Initialize metrics
        this.streamMetrics.set(streamId, {
            streamId,
            startTime: config.startTime,
            chunksStreamed: 0,
            vectorsStreamed: 0,
            bytesStreamed: 0,
            errors: 0,
            priority: config.priority,
            status: 'active'
        });
        
        // Update global metrics
        this.globalMetrics.totalStreams++;
        this.globalMetrics.activeStreams++;
        
        // Set up stream event handlers
        stream.on('close', () => {
            this._removeStream(streamId);
        });
        
        stream.on('error', (error) => {
            const metrics = this.streamMetrics.get(streamId);
            if (metrics) {
                metrics.errors++;
            }
            
            logger.error('Stream error', {
                streamId,
                error: error.message
            });
        });
    }
    
    _completeStream(streamId) {
        const activeStream = this.activeStreams.get(streamId);
        const metrics = this.streamMetrics.get(streamId);
        
        if (activeStream) {
            activeStream.status = 'completed';
            activeStream.endTime = Date.now();
            activeStream.duration = activeStream.endTime - activeStream.startTime;
        }
        
        if (metrics) {
            metrics.status = 'completed';
            metrics.endTime = Date.now();
            metrics.duration = metrics.endTime - metrics.startTime;
            
            // Update global metrics
            this.globalMetrics.completedStreams++;
            this.globalMetrics.totalVectorsStreamed += metrics.vectorsStreamed;
            
            // Update average duration
            const completedStreams = this.globalMetrics.completedStreams;
            this.globalMetrics.avgStreamDuration = 
                (this.globalMetrics.avgStreamDuration * (completedStreams - 1) + metrics.duration) / 
                completedStreams;
        }
        
        this.emit('streamCompleted', { streamId, metrics });
        
        logger.debug('Stream completed', {
            streamId,
            duration: metrics ? metrics.duration : null,
            vectorsStreamed: metrics ? metrics.vectorsStreamed : null
        });
    }
    
    _failStream(streamId, error) {
        const metrics = this.streamMetrics.get(streamId);
        
        if (metrics) {
            metrics.status = 'failed';
            metrics.error = error.message;
            metrics.endTime = Date.now();
            metrics.duration = metrics.endTime - metrics.startTime;
        }
        
        this.globalMetrics.failedStreams++;
        
        this.emit('streamFailed', { streamId, error, metrics });
        
        logger.error('Stream failed', {
            streamId,
            error: error.message,
            duration: metrics ? metrics.duration : null
        });
    }
    
    _removeStream(streamId) {
        this.activeStreams.delete(streamId);
        
        if (this.globalMetrics.activeStreams > 0) {
            this.globalMetrics.activeStreams--;
        }
    }
    
    /**
     * Get stream by ID
     */
    getStream(streamId) {
        return this.activeStreams.get(streamId);
    }
    
    /**
     * Cancel stream
     */
    cancelStream(streamId) {
        const activeStream = this.activeStreams.get(streamId);
        
        if (activeStream) {
            activeStream.stream.destroy();
            this._removeStream(streamId);
            
            logger.debug('Stream cancelled', { streamId });
            this.emit('streamCancelled', { streamId });
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Get streaming statistics
     */
    getStats() {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        return {
            ...this.globalMetrics,
            activeStreamCount: this.activeStreams.size,
            queuedStreams: this.streamQueue.length,
            throughput: this.globalMetrics.totalVectorsStreamed / uptime,
            memoryUsage: memoryUsage.heapUsed,
            memoryUtilization: (memoryUsage.heapUsed / this.config.maxMemoryUsage) * 100,
            averageStreamSize: this.globalMetrics.completedStreams > 0 ?
                this.globalMetrics.totalVectorsStreamed / this.globalMetrics.completedStreams : 0,
            successRate: this.globalMetrics.totalStreams > 0 ?
                this.globalMetrics.completedStreams / this.globalMetrics.totalStreams : 0
        };
    }
    
    /**
     * Get individual stream metrics
     */
    getStreamMetrics(streamId) {
        return this.streamMetrics.get(streamId);
    }
    
    /**
     * List active streams
     */
    getActiveStreams() {
        return Array.from(this.streamMetrics.values()).filter(metrics => 
            metrics.status === 'active'
        );
    }
    
    // Background tasks
    _startStreamCleanup() {
        this.cleanupInterval = setInterval(() => {
            this._cleanupCompletedStreams();
            this._checkMemoryUsage();
        }, 60000); // Every minute
    }
    
    _startMetricsCollection() {
        setInterval(() => {
            this._updateThroughputMetrics();
        }, 5000); // Every 5 seconds
    }
    
    _cleanupCompletedStreams() {
        const now = Date.now();
        const cleanupThreshold = 300000; // 5 minutes
        let cleanedCount = 0;
        
        for (const [streamId, metrics] of this.streamMetrics) {
            if (metrics.status !== 'active' && 
                metrics.endTime && 
                now - metrics.endTime > cleanupThreshold) {
                
                this.streamMetrics.delete(streamId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            logger.debug('Cleaned up completed stream metrics', { cleanedCount });
        }
    }
    
    _checkMemoryUsage() {
        const memUsage = process.memoryUsage();
        const memoryRatio = memUsage.heapUsed / this.config.maxMemoryUsage;
        
        if (memoryRatio > this.config.gcThreshold) {
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                logger.debug('Triggered garbage collection due to high memory usage', {
                    memoryUsage: memUsage.heapUsed,
                    threshold: this.config.maxMemoryUsage
                });
            }
        }
    }
    
    _updateThroughputMetrics() {
        const uptime = process.uptime();
        this.globalMetrics.throughput = this.globalMetrics.totalVectorsStreamed / uptime;
    }
    
    _generateStreamId() {
        return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Shutdown streaming manager
     */
    async shutdown() {
        logger.info('Shutting down Streaming Response Manager');
        
        // Clear cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Cancel all active streams
        const activeStreamIds = Array.from(this.activeStreams.keys());
        for (const streamId of activeStreamIds) {
            this.cancelStream(streamId);
        }
        
        // Clear all data
        this.activeStreams.clear();
        this.streamMetrics.clear();
        this.streamQueue.length = 0;
        
        this.isInitialized = false;
        this.emit('shutdown');
    }
}

module.exports = StreamingResponseManager;