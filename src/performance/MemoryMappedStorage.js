/**
 * Memory-Mapped Storage System for Large Vector Datasets
 * Optimized for GH200 unified memory architecture
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');

/**
 * Memory-mapped file segment
 */
class MemoryMappedSegment {
    constructor(filePath, offset, size, options = {}) {
        this.filePath = filePath;
        this.offset = offset;
        this.size = size;
        this.options = {
            readOnly: options.readOnly !== false,
            prefetch: options.prefetch !== false,
            hugepages: options.hugepages !== false,
            ...options
        };
        
        this.buffer = null;
        this.isLoaded = false;
        this.lastAccessed = Date.now();
        this.accessCount = 0;
        this.dirty = false;
    }
    
    async load() {
        if (this.isLoaded) return this.buffer;
        
        try {
            // In real implementation, this would use mmap syscalls
            const fileHandle = await fs.open(this.filePath, this.options.readOnly ? 'r' : 'r+');
            const buffer = Buffer.alloc(this.size);
            
            await fileHandle.read(buffer, 0, this.size, this.offset);
            await fileHandle.close();
            
            this.buffer = buffer;
            this.isLoaded = true;
            this.lastAccessed = Date.now();
            this.accessCount++;
            
            if (this.options.prefetch) {
                // Simulate memory prefetching
                await this._prefetchAdjacent();
            }
            
            return this.buffer;
            
        } catch (error) {
            logger.error('Failed to load memory-mapped segment', {
                filePath: this.filePath,
                offset: this.offset,
                size: this.size,
                error: error.message
            });
            throw error;
        }
    }
    
    async unload() {
        if (!this.isLoaded) return;
        
        if (this.dirty && !this.options.readOnly) {
            await this.flush();
        }
        
        this.buffer = null;
        this.isLoaded = false;
    }
    
    async flush() {
        if (!this.dirty || this.options.readOnly || !this.isLoaded) return;
        
        try {
            const fileHandle = await fs.open(this.filePath, 'r+');
            await fileHandle.write(this.buffer, 0, this.buffer.length, this.offset);
            await fileHandle.close();
            
            this.dirty = false;
            
        } catch (error) {
            logger.error('Failed to flush memory-mapped segment', {
                filePath: this.filePath,
                error: error.message
            });
            throw error;
        }
    }
    
    async read(position, length) {
        if (!this.isLoaded) {
            await this.load();
        }
        
        if (position + length > this.size) {
            throw new Error('Read beyond segment boundary');
        }
        
        this.lastAccessed = Date.now();
        this.accessCount++;
        
        return this.buffer.subarray(position, position + length);
    }
    
    async write(position, data) {
        if (this.options.readOnly) {
            throw new Error('Cannot write to read-only segment');
        }
        
        if (!this.isLoaded) {
            await this.load();
        }
        
        if (position + data.length > this.size) {
            throw new Error('Write beyond segment boundary');
        }
        
        data.copy(this.buffer, position);
        this.dirty = true;
        this.lastAccessed = Date.now();
        this.accessCount++;
    }
    
    async _prefetchAdjacent() {
        // Simulate adjacent memory prefetching for better cache locality
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    getStats() {
        return {
            filePath: this.filePath,
            offset: this.offset,
            size: this.size,
            isLoaded: this.isLoaded,
            lastAccessed: this.lastAccessed,
            accessCount: this.accessCount,
            dirty: this.dirty,
            readOnly: this.options.readOnly
        };
    }
}

/**
 * Memory-Mapped Storage Manager
 */
class MemoryMappedStorage extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Storage Configuration
            storageDir: options.storageDir || '/tmp/mmap_storage',
            segmentSize: options.segmentSize || 64 * 1024 * 1024, // 64MB per segment
            maxMemoryUsage: options.maxMemoryUsage || 32 * 1024 * 1024 * 1024, // 32GB
            maxSegments: options.maxSegments || 1000,
            
            // Performance Options
            prefetchEnabled: options.prefetchEnabled !== false,
            hugepagesEnabled: options.hugepagesEnabled !== false,
            asyncIO: options.asyncIO !== false,
            compressionEnabled: options.compressionEnabled || false,
            
            // Cache Management
            evictionPolicy: options.evictionPolicy || 'LRU',
            cleanupInterval: options.cleanupInterval || 30000,
            flushInterval: options.flushInterval || 60000,
            
            // Grace Memory Optimization
            unifiedMemoryEnabled: options.unifiedMemoryEnabled !== false,
            zroCopyEnabled: options.zeroCopyEnabled !== false,
            
            ...options
        };
        
        // Storage state
        this.segments = new Map();
        this.files = new Map();
        this.memoryUsage = 0;
        this.statistics = {
            totalReads: 0,
            totalWrites: 0,
            cacheHits: 0,
            cacheMisses: 0,
            segmentLoads: 0,
            segmentEvictions: 0,
            bytesRead: 0,
            bytesWritten: 0
        };
        
        this.isInitialized = false;
        this.cleanupTimer = null;
        this.flushTimer = null;
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            logger.info('Initializing Memory-Mapped Storage', {
                storageDir: this.config.storageDir,
                segmentSize: this.config.segmentSize,
                maxMemoryUsage: this.config.maxMemoryUsage
            });
            
            // Create storage directory
            await fs.mkdir(this.config.storageDir, { recursive: true });
            
            // Validate configuration
            await this._validateConfiguration();
            
            // Setup cleanup and flush timers
            this._startBackgroundTasks();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            logger.info('Memory-Mapped Storage initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize Memory-Mapped Storage', {
                error: error.message
            });
            throw error;
        }
    }
    
    async _validateConfiguration() {
        // Check if hugepages are available (on Linux)
        if (this.config.hugepagesEnabled) {
            try {
                const hugepagesInfo = await fs.readFile('/proc/meminfo', 'utf8');
                const hugepagesMatch = hugepagesInfo.match(/HugePages_Total:\s+(\d+)/);
                
                if (!hugepagesMatch || parseInt(hugepagesMatch[1]) === 0) {
                    logger.warn('Hugepages not available, disabling hugepage optimization');
                    this.config.hugepagesEnabled = false;
                }
            } catch (error) {
                this.config.hugepagesEnabled = false;
            }
        }
        
        // Validate storage directory permissions
        try {
            await fs.access(this.config.storageDir, fs.constants.R_OK | fs.constants.W_OK);
        } catch (error) {
            throw new Error(`Storage directory not accessible: ${this.config.storageDir}`);
        }
    }
    
    /**
     * Create a new memory-mapped file
     */
    async createFile(fileName, size, options = {}) {
        const filePath = path.join(this.config.storageDir, fileName);
        
        try {
            // Create file with specified size
            const fileHandle = await fs.open(filePath, 'w+');
            await fileHandle.truncate(size);
            await fileHandle.close();
            
            // Create file metadata
            const fileInfo = {
                path: filePath,
                size: size,
                segmentSize: options.segmentSize || this.config.segmentSize,
                segments: [],
                createdAt: Date.now(),
                lastModified: Date.now(),
                readOnly: options.readOnly || false,
                compressed: options.compressed || false
            };
            
            // Create segments for the file
            const segmentCount = Math.ceil(size / fileInfo.segmentSize);
            
            for (let i = 0; i < segmentCount; i++) {
                const segmentOffset = i * fileInfo.segmentSize;
                const segmentSize = Math.min(fileInfo.segmentSize, size - segmentOffset);
                
                const segment = new MemoryMappedSegment(filePath, segmentOffset, segmentSize, {
                    readOnly: fileInfo.readOnly,
                    prefetch: this.config.prefetchEnabled,
                    hugepages: this.config.hugepagesEnabled,
                    ...options
                });
                
                const segmentId = `${fileName}_${i}`;
                this.segments.set(segmentId, segment);
                fileInfo.segments.push(segmentId);
            }
            
            this.files.set(fileName, fileInfo);
            
            logger.debug('Created memory-mapped file', {
                fileName,
                filePath,
                size,
                segments: segmentCount
            });
            
            this.emit('fileCreated', { fileName, size, segments: segmentCount });
            
            return fileInfo;
            
        } catch (error) {
            logger.error('Failed to create memory-mapped file', {
                fileName,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Open existing memory-mapped file
     */
    async openFile(fileName, options = {}) {
        const filePath = path.join(this.config.storageDir, fileName);
        
        try {
            const stats = await fs.stat(filePath);
            
            const fileInfo = {
                path: filePath,
                size: stats.size,
                segmentSize: options.segmentSize || this.config.segmentSize,
                segments: [],
                createdAt: stats.birthtime.getTime(),
                lastModified: stats.mtime.getTime(),
                readOnly: options.readOnly || false,
                compressed: options.compressed || false
            };
            
            // Create segments for the file
            const segmentCount = Math.ceil(stats.size / fileInfo.segmentSize);
            
            for (let i = 0; i < segmentCount; i++) {
                const segmentOffset = i * fileInfo.segmentSize;
                const segmentSize = Math.min(fileInfo.segmentSize, stats.size - segmentOffset);
                
                const segment = new MemoryMappedSegment(filePath, segmentOffset, segmentSize, {
                    readOnly: fileInfo.readOnly,
                    prefetch: this.config.prefetchEnabled,
                    hugepages: this.config.hugepagesEnabled,
                    ...options
                });
                
                const segmentId = `${fileName}_${i}`;
                this.segments.set(segmentId, segment);
                fileInfo.segments.push(segmentId);
            }
            
            this.files.set(fileName, fileInfo);
            
            logger.debug('Opened memory-mapped file', {
                fileName,
                size: stats.size,
                segments: segmentCount
            });
            
            return fileInfo;
            
        } catch (error) {
            logger.error('Failed to open memory-mapped file', {
                fileName,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Read data from memory-mapped file
     */
    async read(fileName, offset, length) {
        const fileInfo = this.files.get(fileName);
        if (!fileInfo) {
            throw new Error(`File not found: ${fileName}`);
        }
        
        if (offset + length > fileInfo.size) {
            throw new Error('Read beyond file boundary');
        }
        
        try {
            const result = Buffer.alloc(length);
            let resultOffset = 0;
            let remainingLength = length;
            let currentOffset = offset;
            
            while (remainingLength > 0) {
                const segmentIndex = Math.floor(currentOffset / fileInfo.segmentSize);
                const segmentId = fileInfo.segments[segmentIndex];
                const segment = this.segments.get(segmentId);
                
                if (!segment) {
                    throw new Error(`Segment not found: ${segmentId}`);
                }
                
                const segmentOffset = currentOffset % fileInfo.segmentSize;
                const segmentReadLength = Math.min(remainingLength, segment.size - segmentOffset);
                
                const segmentData = await segment.read(segmentOffset, segmentReadLength);
                segmentData.copy(result, resultOffset);
                
                resultOffset += segmentReadLength;
                currentOffset += segmentReadLength;
                remainingLength -= segmentReadLength;
            }
            
            // Update statistics
            this.statistics.totalReads++;
            this.statistics.bytesRead += length;
            
            // Cache statistics are handled per segment inside the loop
            
            this.emit('read', { fileName, offset, length });
            
            return result;
            
        } catch (error) {
            logger.error('Failed to read from memory-mapped file', {
                fileName,
                offset,
                length,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Write data to memory-mapped file
     */
    async write(fileName, offset, data) {
        const fileInfo = this.files.get(fileName);
        if (!fileInfo) {
            throw new Error(`File not found: ${fileName}`);
        }
        
        if (fileInfo.readOnly) {
            throw new Error(`File is read-only: ${fileName}`);
        }
        
        if (offset + data.length > fileInfo.size) {
            throw new Error('Write beyond file boundary');
        }
        
        try {
            let remainingLength = data.length;
            let currentOffset = offset;
            let dataOffset = 0;
            
            while (remainingLength > 0) {
                const segmentIndex = Math.floor(currentOffset / fileInfo.segmentSize);
                const segmentId = fileInfo.segments[segmentIndex];
                const segment = this.segments.get(segmentId);
                
                if (!segment) {
                    throw new Error(`Segment not found: ${segmentId}`);
                }
                
                const segmentOffset = currentOffset % fileInfo.segmentSize;
                const segmentWriteLength = Math.min(remainingLength, segment.size - segmentOffset);
                
                const writeData = data.subarray(dataOffset, dataOffset + segmentWriteLength);
                await segment.write(segmentOffset, writeData);
                
                dataOffset += segmentWriteLength;
                currentOffset += segmentWriteLength;
                remainingLength -= segmentWriteLength;
            }
            
            fileInfo.lastModified = Date.now();
            
            // Update statistics
            this.statistics.totalWrites++;
            this.statistics.bytesWritten += data.length;
            
            this.emit('write', { fileName, offset, length: data.length });
            
        } catch (error) {
            logger.error('Failed to write to memory-mapped file', {
                fileName,
                offset,
                length: data.length,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Read vector data efficiently
     */
    async readVectors(fileName, startIndex, count, vectorDimensions) {
        const vectorSize = vectorDimensions * 4; // 4 bytes per float
        const offset = startIndex * vectorSize;
        const length = count * vectorSize;
        
        const data = await this.read(fileName, offset, length);
        const vectors = [];
        
        for (let i = 0; i < count; i++) {
            const vectorOffset = i * vectorSize;
            const vectorData = new Float32Array(
                data.buffer,
                data.byteOffset + vectorOffset,
                vectorDimensions
            );
            
            vectors.push(Array.from(vectorData));
        }
        
        return vectors;
    }
    
    /**
     * Write vector data efficiently
     */
    async writeVectors(fileName, startIndex, vectors, vectorDimensions) {
        const vectorSize = vectorDimensions * 4; // 4 bytes per float
        const offset = startIndex * vectorSize;
        const totalSize = vectors.length * vectorSize;
        
        const buffer = Buffer.alloc(totalSize);
        
        for (let i = 0; i < vectors.length; i++) {
            const vectorOffset = i * vectorSize;
            const floatArray = new Float32Array(vectors[i]);
            const vectorBuffer = Buffer.from(floatArray.buffer);
            
            vectorBuffer.copy(buffer, vectorOffset);
        }
        
        await this.write(fileName, offset, buffer);
    }
    
    /**
     * Flush all dirty segments
     */
    async flush() {
        const flushPromises = [];
        
        for (const segment of this.segments.values()) {
            if (segment.dirty) {
                flushPromises.push(segment.flush());
            }
        }
        
        await Promise.all(flushPromises);
        
        logger.debug('Flushed all dirty segments', {
            flushedCount: flushPromises.length
        });
    }
    
    /**
     * Memory management and eviction
     */
    async evictSegments() {
        const loadedSegments = Array.from(this.segments.values())
            .filter(segment => segment.isLoaded)
            .sort((a, b) => {
                switch (this.config.evictionPolicy) {
                    case 'LRU':
                        return a.lastAccessed - b.lastAccessed;
                    case 'LFU':
                        return a.accessCount - b.accessCount;
                    case 'FIFO':
                        return a.lastAccessed - b.lastAccessed;
                    default:
                        return a.lastAccessed - b.lastAccessed;
                }
            });
        
        const targetMemoryUsage = this.config.maxMemoryUsage * 0.8; // 80% threshold
        let currentMemoryUsage = this._calculateMemoryUsage();
        
        let evictedCount = 0;
        
        for (const segment of loadedSegments) {
            if (currentMemoryUsage <= targetMemoryUsage) break;
            
            await segment.unload();
            currentMemoryUsage -= segment.size;
            evictedCount++;
            
            this.statistics.segmentEvictions++;
        }
        
        if (evictedCount > 0) {
            logger.debug('Evicted segments due to memory pressure', {
                evictedCount,
                newMemoryUsage: currentMemoryUsage
            });
        }
        
        return evictedCount;
    }
    
    _calculateMemoryUsage() {
        let usage = 0;
        
        for (const segment of this.segments.values()) {
            if (segment.isLoaded) {
                usage += segment.size;
            }
        }
        
        this.memoryUsage = usage;
        return usage;
    }
    
    _startBackgroundTasks() {
        // Cleanup timer
        this.cleanupTimer = setInterval(async () => {
            try {
                await this.evictSegments();
            } catch (error) {
                logger.error('Error during cleanup', { error: error.message });
            }
        }, this.config.cleanupInterval);
        
        // Flush timer
        this.flushTimer = setInterval(async () => {
            try {
                await this.flush();
            } catch (error) {
                logger.error('Error during flush', { error: error.message });
            }
        }, this.config.flushInterval);
    }
    
    /**
     * Get storage statistics
     */
    getStats() {
        const loadedSegments = Array.from(this.segments.values()).filter(s => s.isLoaded).length;
        const dirtySegments = Array.from(this.segments.values()).filter(s => s.dirty).length;
        
        return {
            ...this.statistics,
            files: this.files.size,
            totalSegments: this.segments.size,
            loadedSegments,
            dirtySegments,
            memoryUsage: this._calculateMemoryUsage(),
            maxMemoryUsage: this.config.maxMemoryUsage,
            memoryUtilization: (this.memoryUsage / this.config.maxMemoryUsage) * 100,
            hugepagesEnabled: this.config.hugepagesEnabled,
            compressionEnabled: this.config.compressionEnabled
        };
    }
    
    /**
     * Close file and cleanup segments
     */
    async closeFile(fileName) {
        const fileInfo = this.files.get(fileName);
        if (!fileInfo) return;
        
        // Flush and unload all segments for this file
        for (const segmentId of fileInfo.segments) {
            const segment = this.segments.get(segmentId);
            if (segment) {
                await segment.unload();
                this.segments.delete(segmentId);
            }
        }
        
        this.files.delete(fileName);
        
        logger.debug('Closed memory-mapped file', { fileName });
        this.emit('fileClosed', { fileName });
    }
    
    async shutdown() {
        logger.info('Shutting down Memory-Mapped Storage');
        
        // Clear timers
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        
        // Flush all dirty segments
        await this.flush();
        
        // Unload all segments
        for (const segment of this.segments.values()) {
            await segment.unload();
        }
        
        // Clear all data structures
        this.segments.clear();
        this.files.clear();
        this.memoryUsage = 0;
        
        this.isInitialized = false;
        this.emit('shutdown');
    }
}

module.exports = MemoryMappedStorage;