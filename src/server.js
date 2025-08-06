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
const { initializeRouter } = require('./index');

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
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

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

  app.use('/api', limiter);

  // Body parsing middleware
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request processing middleware
  app.use(requestIdMiddleware);
  app.use(requestTimeout(30000)); // 30 second timeout
  app.use(validateRequestSize('10mb'));
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

  // Initialize system components
  try {
    logger.info('Initializing GH200 Retrieval Router components...');
    
    const router = await initializeRouter({
      ...config,
      server: {
        port: process.env.PORT || 8080,
        host: process.env.HOST || '0.0.0.0'
      }
    });

    // Make components available to routes
    app.locals.retrievalRouter = router;
    app.locals.graceMemoryManager = router.memoryManager;
    app.locals.vectorDatabase = router.vectorDatabase;

    logger.info('System components initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize system components', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  }

  // Mount API routes
  app.use('/api/v1', apiRoutes);

  // Legacy route support (redirect to v1)
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/v1')) {
      return next();
    }
    res.redirect(301, `/api/v1${req.path}`);
  });

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