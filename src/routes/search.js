/**
 * Search routes for GH200 Retrieval Router
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { validateSearchQuery } = require('../validators/searchValidator');

/**
 * Vector similarity search endpoint
 */
router.post('/', validateSearchQuery, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { query, k = 10, filters = {}, options = {} } = req.body;

    if (!req.app.locals.retrievalRouter) {
      return res.status(503).json({
        error: 'RETRIEVAL_SERVICE_UNAVAILABLE',
        message: 'Retrieval router not initialized'
      });
    }

    // Perform vector search
    const searchResults = await req.app.locals.retrievalRouter.search({
      query,
      k,
      filters,
      options
    });

    const processingTime = Date.now() - startTime;

    // Log search metrics
    logger.info('Search completed', {
      query: typeof query === 'string' ? query.substring(0, 100) : JSON.stringify(query), 
      resultsCount: searchResults.results.length,
      processingTime,
      k,
      filters
    });

    res.json({
      query,
      results: searchResults.results,
      totalResults: searchResults.total,
      processingTime,
      retrievalMethod: searchResults.method,
      metadata: {
        k,
        filters,
        options,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Search failed', {
      error: error.message,
      stack: error.stack,
      query: typeof req.body.query === 'string' ? req.body.query.substring(0, 100) : JSON.stringify(req.body.query),
      processingTime
    });

    // Determine appropriate error response
    let statusCode = 500;
    let errorCode = 'SEARCH_ERROR';

    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorCode = 'INVALID_QUERY';
    } else if (error.name === 'MemoryError') {
      statusCode = 503;
      errorCode = 'MEMORY_EXHAUSTED';
    } else if (error.name === 'IndexError') {
      statusCode = 503;
      errorCode = 'INDEX_UNAVAILABLE';
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
 * Batch search endpoint for multiple queries
 */
router.post('/batch', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { queries, k = 10, filters = {}, options = {} } = req.body;

    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({
        error: 'INVALID_BATCH_REQUEST',
        message: 'Queries must be a non-empty array'
      });
    }

    if (queries.length > 100) {
      return res.status(400).json({
        error: 'BATCH_SIZE_EXCEEDED',
        message: 'Maximum batch size is 100 queries'
      });
    }

    if (!req.app.locals.retrievalRouter) {
      return res.status(503).json({
        error: 'RETRIEVAL_SERVICE_UNAVAILABLE',
        message: 'Retrieval router not initialized'
      });
    }

    // Perform batch search
    const batchResults = await req.app.locals.retrievalRouter.batchSearch({
      queries,
      k,
      filters,
      options
    });

    const processingTime = Date.now() - startTime;

    logger.info('Batch search completed', {
      queryCount: queries.length,
      totalResults: batchResults.reduce((sum, result) => sum + result.results.length, 0),
      processingTime,
      k
    });

    res.json({
      results: batchResults,
      totalQueries: queries.length,
      processingTime,
      metadata: {
        k,
        filters,
        options,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Batch search failed', {
      error: error.message,
      stack: error.stack,
      queryCount: req.body.queries?.length,
      processingTime
    });

    res.status(500).json({
      error: 'BATCH_SEARCH_ERROR',
      message: error.message,
      processingTime,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Hybrid search endpoint (dense + sparse)
 */
router.post('/hybrid', validateSearchQuery, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { query, k = 10, alpha = 0.7, filters = {}, options = {} } = req.body;

    if (!req.app.locals.retrievalRouter) {
      return res.status(503).json({
        error: 'RETRIEVAL_SERVICE_UNAVAILABLE',
        message: 'Retrieval router not initialized'
      });
    }

    // Perform hybrid search
    const searchResults = await req.app.locals.retrievalRouter.hybridSearch({
      query,
      k,
      alpha,
      filters,
      options
    });

    const processingTime = Date.now() - startTime;

    logger.info('Hybrid search completed', {
      query: query.substring(0, 100),
      resultsCount: searchResults.results.length,
      processingTime,
      alpha,
      k
    });

    res.json({
      query,
      results: searchResults.results,
      totalResults: searchResults.total,
      processingTime,
      retrievalMethod: 'hybrid',
      hybridWeights: {
        dense: alpha,
        sparse: 1 - alpha
      },
      metadata: {
        k,
        filters,
        options,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Hybrid search failed', {
      error: error.message,
      stack: error.stack,
      query: req.body.query?.substring(0, 100),
      processingTime
    });

    res.status(500).json({
      error: 'HYBRID_SEARCH_ERROR',
      message: error.message,
      processingTime,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * RAG endpoint with generation
 */
router.post('/rag', validateSearchQuery, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      query, 
      k = 10, 
      model = 'llama3-70b',
      temperature = 0.7,
      maxTokens = 512,
      filters = {},
      options = {}
    } = req.body;

    if (!req.app.locals.retrievalRouter) {
      return res.status(503).json({
        error: 'RETRIEVAL_SERVICE_UNAVAILABLE',
        message: 'Retrieval router not initialized'
      });
    }

    // Perform retrieval-augmented generation
    const ragResults = await req.app.locals.retrievalRouter.retrieveAndGenerate({
      query,
      k,
      model,
      temperature,
      maxTokens,
      filters,
      options
    });

    const processingTime = Date.now() - startTime;

    logger.info('RAG completed', {
      query: query.substring(0, 100),
      retrievedDocs: ragResults.retrievedDocuments.length,
      generatedTokens: ragResults.response.length,
      processingTime,
      model
    });

    res.json({
      query,
      response: ragResults.response,
      retrievedDocuments: ragResults.retrievedDocuments,
      citations: ragResults.citations,
      processingTime,
      metadata: {
        model,
        temperature,
        maxTokens,
        retrievalCount: k,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('RAG failed', {
      error: error.message,
      stack: error.stack,
      query: req.body.query?.substring(0, 100),
      processingTime
    });

    res.status(500).json({
      error: 'RAG_ERROR',
      message: error.message,
      processingTime,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;