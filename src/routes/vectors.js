/**
 * Vector management routes for GH200 Retrieval Router
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { validateVectorData } = require('../validators/vectorValidator');

/**
 * Add new vectors to the database
 */
router.post('/', validateVectorData, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { vectors, metadata = {} } = req.body;

    if (!req.app.locals.vectorDatabase) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Vector database not initialized'
      });
    }

    // Add vectors to database
    const result = await req.app.locals.vectorDatabase.addVectors(vectors, metadata);

    const processingTime = Date.now() - startTime;

    logger.info('Vectors added', {
      count: vectors.length,
      processingTime,
      indexSize: result.totalVectors
    });

    res.status(201).json({
      message: 'Vectors added successfully',
      added: vectors.length,
      totalVectors: result.totalVectors,
      processingTime,
      metadata: {
        timestamp: new Date().toISOString(),
        indexVersion: result.version
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Failed to add vectors', {
      error: error.message,
      stack: error.stack,
      vectorCount: req.body.vectors?.length,
      processingTime
    });

    let statusCode = 500;
    let errorCode = 'ADD_VECTORS_ERROR';

    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorCode = 'INVALID_VECTOR_DATA';
    } else if (error.name === 'MemoryError') {
      statusCode = 507;
      errorCode = 'INSUFFICIENT_STORAGE';
    }

    res.status(statusCode).json({
      error: errorCode,
      message: error.message,
      processingTime,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get vector by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.app.locals.vectorDatabase) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Vector database not initialized'
      });
    }

    const vector = await req.app.locals.vectorDatabase.getVector(id);

    if (!vector) {
      return res.status(404).json({
        error: 'VECTOR_NOT_FOUND',
        message: `Vector with ID ${id} not found`
      });
    }

    res.json({
      id: vector.id,
      embedding: vector.embedding,
      metadata: vector.metadata,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get vector', {
      error: error.message,
      stack: error.stack,
      vectorId: req.params.id
    });

    res.status(500).json({
      error: 'GET_VECTOR_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Update vector metadata
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { metadata } = req.body;

    if (!metadata || typeof metadata !== 'object') {
      return res.status(400).json({
        error: 'INVALID_METADATA',
        message: 'Metadata must be a valid object'
      });
    }

    if (!req.app.locals.vectorDatabase) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Vector database not initialized'
      });
    }

    const result = await req.app.locals.vectorDatabase.updateMetadata(id, metadata);

    if (!result.success) {
      return res.status(404).json({
        error: 'VECTOR_NOT_FOUND',
        message: `Vector with ID ${id} not found`
      });
    }

    logger.info('Vector metadata updated', {
      vectorId: id,
      metadataKeys: Object.keys(metadata)
    });

    res.json({
      message: 'Vector metadata updated successfully',
      id,
      updatedFields: Object.keys(metadata),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to update vector metadata', {
      error: error.message,
      stack: error.stack,
      vectorId: req.params.id
    });

    res.status(500).json({
      error: 'UPDATE_METADATA_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Delete vector by ID
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.app.locals.vectorDatabase) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Vector database not initialized'
      });
    }

    const result = await req.app.locals.vectorDatabase.deleteVector(id);

    if (!result.success) {
      return res.status(404).json({
        error: 'VECTOR_NOT_FOUND',
        message: `Vector with ID ${id} not found`
      });
    }

    logger.info('Vector deleted', {
      vectorId: id,
      remainingVectors: result.totalVectors
    });

    res.json({
      message: 'Vector deleted successfully',
      id,
      totalVectors: result.totalVectors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to delete vector', {
      error: error.message,
      stack: error.stack,
      vectorId: req.params.id
    });

    res.status(500).json({
      error: 'DELETE_VECTOR_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get database statistics
 */
router.get('/stats/summary', async (req, res) => {
  try {
    if (!req.app.locals.vectorDatabase) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Vector database not initialized'
      });
    }

    const stats = await req.app.locals.vectorDatabase.getStatistics();

    res.json({
      statistics: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get database statistics', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'STATS_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Reindex vectors (maintenance operation)
 */
router.post('/reindex', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { force = false, options = {} } = req.body;

    if (!req.app.locals.vectorDatabase) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Vector database not initialized'
      });
    }

    logger.info('Starting reindex operation', { force, options });

    const result = await req.app.locals.vectorDatabase.reindex({ force, ...options });

    const processingTime = Date.now() - startTime;

    logger.info('Reindex completed', {
      vectorsReindexed: result.vectorsProcessed,
      processingTime,
      indexVersion: result.newVersion
    });

    res.json({
      message: 'Reindex completed successfully',
      vectorsReindexed: result.vectorsProcessed,
      processingTime,
      indexVersion: result.newVersion,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Reindex failed', {
      error: error.message,
      stack: error.stack,
      processingTime
    });

    res.status(500).json({
      error: 'REINDEX_ERROR',
      message: error.message,
      processingTime,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;