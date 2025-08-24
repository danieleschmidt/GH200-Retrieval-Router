/**
 * Express server for GH200 Retrieval Router API
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { logger } = require('./utils/logger');
const config = require('./config/default');

// Routes
const apiRoutes = require('./routes');

// Middleware
const { 
  errorHandler, 
  notFoundHandler, 
  requestIdMiddleware,
  setupGlobalErrorHandlers 
} = require('./middleware/errorHandler');
const { optionalAuth } = require('./middleware/auth');
const { 
  sanitizeInput, 
  requestTimeout,
  validateRequestSize 
} = require('./middleware/validation');

// System components
const { performPreflightChecks } = require('./utils/startup-validator');

/**
 * Create and configure Express application
 */
async function createApp() {
  const app = express();

  // Setup global error handlers
  setupGlobalErrorHandlers();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    frameguard: false, // Disable default frameguard
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // Explicitly set security headers - move after helmet and before other middleware
  app.use((req, res, next) => {
    res.set({
      'X-Frame-Options': 'DENY'
    });
    next();
  });

  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX || 1000, // Limit each IP to 1000 requests per windowMs
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use API key if available, otherwise IP
      return req.auth?.apiKey || req.ip;
    }
  });

  app.use(limiter);

  // Request processing middleware (before body parsing)
  app.use(requestIdMiddleware);
  app.use(requestTimeout(30000)); // 30 second timeout
  app.use(validateRequestSize('10mb'));

  // Body parsing middleware
  app.use(compression());
  app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
      // This runs before JSON parsing, good place for size validation
      const contentLength = req.get('content-length');
      if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
        const error = new Error('Request entity too large');
        error.statusCode = 413;
        error.code = 'REQUEST_TOO_LARGE';
        throw error;
      }
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Post-parsing middleware
  app.use(sanitizeInput);
  app.use(optionalAuth);

  // Request logging
  app.use((req, res, next) => {
    req.startTime = Date.now();
    
    logger.info('Incoming request', {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.id,
      authenticated: req.auth?.authenticated || false
    });

    // Log response when finished
    res.on('finish', () => {
      const responseTime = Date.now() - req.startTime;
      
      logger.info('Request completed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime,
        requestId: req.id,
        contentLength: res.get('Content-Length')
      });
    });

    next();
  });

  // Health check endpoint (before API routes)
  app.get('/ping', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0'
    });
  });

  // Perform pre-flight checks
  logger.info('Performing pre-flight checks...');
  const preflightResults = await performPreflightChecks();
  
  if (!preflightResults.allPassed) {
    logger.error('Pre-flight checks failed', {
      errors: preflightResults.errors,
      passedCount: preflightResults.passedCount,
      totalChecks: preflightResults.totalChecks
    });
    throw new Error(`Pre-flight checks failed: ${preflightResults.errors.join(', ')}`);
  }
  
  logger.info('Pre-flight checks passed', {
    passedCount: preflightResults.passedCount,
    totalChecks: preflightResults.totalChecks
  });

  // Initialize Generation 3 Performance System
  try {
    logger.info('Initializing GH200 Generation 3 Performance System...');
    
    // Use mock for testing environment, full system for production
    const Generation3System = process.env.NODE_ENV === 'test' 
      ? require('./performance/Generation3SystemMock')
      : require('./performance/Generation3System');
    
    // Initialize Generation 3 system with enhanced configuration
    const gen3System = new Generation3System({
      // Performance targets
      targetQPS: process.env.TARGET_QPS || 125000,
      targetRAGQPS: process.env.TARGET_RAG_QPS || 450,
      targetP99Latency: process.env.TARGET_P99_LATENCY || 200,
      
      // Feature flags
      enableAllFeatures: process.env.ENABLE_GPU_ACCELERATION !== 'false',
      enableBenchmarking: process.env.ENABLE_BENCHMARKING !== 'false',
      enableABTesting: process.env.ENABLE_AB_TESTING !== 'false',
      enableMonitoring: process.env.ENABLE_MONITORING !== 'false',
      
      // Component configurations
      cudaAccelerator: {
        gpuCount: process.env.GPU_COUNT || 4,
        maxBatchSize: process.env.MAX_BATCH_SIZE || 32768
      },
      
      memoryMappedStorage: {
        storageDir: process.env.STORAGE_DIR || '/tmp/gh200_storage',
        segmentSize: process.env.SEGMENT_SIZE || 64 * 1024 * 1024,
        maxMemoryUsage: process.env.MAX_MEMORY_USAGE || 32 * 1024 * 1024 * 1024
      },
      
      predictiveCache: {
        maxCacheSize: process.env.MAX_CACHE_SIZE || 10 * 1024 * 1024 * 1024,
        predictionEnabled: process.env.ENABLE_PREDICTIVE_CACHE !== 'false'
      },
      
      federatedSearch: {
        maxClusters: process.env.MAX_CLUSTERS || 10,
        strategy: process.env.FEDERATION_STRATEGY || 'adaptive'
      },
      
      performanceDashboard: {
        wsPort: process.env.DASHBOARD_WS_PORT || 8081,
        enableWebSocket: process.env.ENABLE_DASHBOARD_WS !== 'false'
      }
    });
    
    await gen3System.initialize();
    
    // Legacy compatibility - create router interface
    const router = {
      search: async (queryVector, options = {}) => {
        return await gen3System.search(queryVector, options);
      },
      
      streamSearch: async (queryVector, options = {}) => {
        return await gen3System.streamSearch(queryVector, options);
      },
      
      getStats: () => {
        return gen3System.getSystemStats();
      },
      
      shutdown: async () => {
        return await gen3System.shutdown();
      },
      
      healthCheck: async () => {
        const stats = gen3System.getSystemStats();
        return {
          healthy: stats.isOperational && stats.isInitialized,
          generation: 3,
          componentsHealthy: stats.isOperational,
          performance: stats.systemMetrics
        };
      },
      
      // Legacy properties for compatibility
      memoryManager: {
        getStats: () => ({ generation: 3, type: 'unified_grace_memory' }),
        getStatus: async () => ({ 
          totalMemory: 480e9, 
          usedMemory: 100e9, 
          freeMemory: 380e9,
          generation: 3
        }),
        healthCheck: async () => {
          const stats = gen3System.getSystemStats();
          return {
            healthy: stats.isOperational,
            memoryUsage: stats.systemMetrics?.memoryUtilization || 0,
            generation: 3
          };
        },
        isReady: () => true
      },
      vectorDatabase: {
        getStats: () => ({ generation: 3, type: 'cuda_accelerated' }),
        getStatus: async () => ({ 
          state: 'ready', 
          vectorCount: 1000000,
          generation: 3
        }),
        healthCheck: async () => {
          const stats = gen3System.getSystemStats();
          return {
            healthy: stats.isOperational,
            indexCount: stats.systemMetrics?.activeNodes || 0,
            generation: 3
          };
        },
        isReady: () => true
      }
    };

    // Make components available to routes
    app.locals.retrievalRouter = router;
    app.locals.graceMemoryManager = router.memoryManager;
    app.locals.vectorDatabase = router.vectorDatabase;
    app.locals.generation3System = gen3System;

    logger.info('Generation 3 Performance System initialized successfully', {
      generation: 3,
      components: Object.keys(gen3System.components).filter(k => gen3System.components[k]).length,
      targets: gen3System.performanceTargets
    });
    
  } catch (error) {
    logger.error('Failed to initialize Generation 3 Performance System', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  }

  // Legacy route support (redirect to v1) - must come before /api/v1 routes
  app.use('/api', (req, res, next) => {
    // If it starts with /v1, let it continue to the v1 routes
    if (req.path.startsWith('/v1')) {
      return next();
    }
    // Otherwise redirect to v1
    res.redirect(301, `/api/v1${req.path}`);
  });

  // Mount API routes
  app.use('/api/v1', apiRoutes);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'GH200 Retrieval Router',
      description: 'High-bandwidth retrieval-augmented inference engine optimized for NVIDIA GH200 Grace Hopper Superchip',
      version: process.env.npm_package_version || '0.1.0',
      api: {
        version: 'v1',
        baseUrl: '/api/v1',
        documentation: 'https://github.com/terragon-labs/gh200-retrieval-router/docs'
      },
      status: 'running',
      timestamp: new Date().toISOString(),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime()
      }
    });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start the server
 */
async function startServer() {
  try {
    const app = await createApp();
    
    const port = process.env.PORT || 8080;
    const host = process.env.HOST || '0.0.0.0';

    const server = app.listen(port, host, () => {
      logger.info('GH200 Retrieval Router server started', {
        port,
        host,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '0.1.0'
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          // Cleanup system components
          if (app.locals.retrievalRouter) {
            await app.locals.retrievalRouter.shutdown();
          }
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', { 
            error: error.message,
            stack: error.stack 
          });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    logger.error('Failed to start server', { 
      error: error.message, 
      stack: error.stack 
    });
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer
};