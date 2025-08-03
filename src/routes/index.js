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
      metrics: '/metrics'
    },
    documentation: 'https://github.com/terragon-labs/gh200-retrieval-router'
  });
});

// Mount route modules
router.use('/health', healthRoutes);
router.use('/search', searchRoutes);
router.use('/vectors', vectorRoutes);
router.use('/metrics', metricsRoutes);

module.exports = router;