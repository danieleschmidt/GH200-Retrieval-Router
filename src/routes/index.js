/**
 * Main route registry for GH200 Retrieval Router API
 */

const express = require('express');
const router = express.Router();

// Import route modules
const healthRoutes = require('./health');
const searchRoutes = require('./search');
const vectorRoutes = require('./vectors');
const metricsRoutes = require('./metrics');
const generation1Routes = require('./generation1-enhancements');
const generation3Routes = require('./generation3-status');

// API version and info
router.get('/', (req, res) => {
  res.json({
    name: 'GH200 Retrieval Router API',
    version: '0.1.0',
    description: 'High-bandwidth retrieval-augmented inference engine',
    architecture: 'Grace Hopper optimized',
    endpoints: {
      health: '/health',
      search: '/search',
      vectors: '/vectors',
      metrics: '/metrics',
      generation1: '/generation1',
      generation3: '/generation3'
    },
    documentation: 'https://github.com/terragon-labs/gh200-retrieval-router'
  });
});

// Mount route modules
router.use('/health', healthRoutes);
router.use('/search', searchRoutes);
router.use('/vectors', vectorRoutes);
router.use('/metrics', metricsRoutes);
router.use('/generation1', generation1Routes);
router.use('/generation3', generation3Routes);

module.exports = router;