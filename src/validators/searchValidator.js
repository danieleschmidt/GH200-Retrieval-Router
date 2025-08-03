/**
 * Search request validation schemas for GH200 Retrieval Router
 */

const Joi = require('joi');
const { validate } = require('../middleware/validation');

// Base embedding schema
const embeddingSchema = Joi.array()
  .items(Joi.number().min(-1).max(1))
  .min(1)
  .max(2048)
  .description('Vector embedding array');

// Search query schema
const searchQuerySchema = Joi.object({
  query: Joi.alternatives()
    .try(
      Joi.string().min(1).max(10000).trim(),
      embeddingSchema
    )
    .required()
    .description('Search query as text string or embedding vector'),

  k: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(10)
    .description('Number of results to return'),

  filters: Joi.object({
    source: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ),
    category: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ),
    author: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ),
    dateRange: Joi.object({
      start: Joi.date().iso(),
      end: Joi.date().iso().min(Joi.ref('start'))
    }),
    metadata: Joi.object().pattern(
      Joi.string(),
      Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean())
    )
  }).default({}),

  options: Joi.object({
    threshold: Joi.number().min(0).max(1).description('Similarity threshold'),
    rerank: Joi.boolean().default(false).description('Enable reranking'),
    reranker: Joi.string().valid('cross-encoder', 'bge-reranker').when('rerank', {
      is: true,
      then: Joi.required()
    }),
    includeMetadata: Joi.boolean().default(true),
    includeEmbeddings: Joi.boolean().default(false),
    timeout: Joi.number().integer().min(100).max(30000).default(10000),
    preferGraceMemory: Joi.boolean().default(true)
  }).default({})
}).options({ stripUnknown: false });

// Batch search schema
const batchSearchSchema = Joi.object({
  queries: Joi.array()
    .items(
      Joi.alternatives().try(
        Joi.string().min(1).max(10000).trim(),
        embeddingSchema
      )
    )
    .min(1)
    .max(100)
    .required()
    .description('Array of search queries'),

  k: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10),

  filters: Joi.object({
    source: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ),
    category: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ),
    dateRange: Joi.object({
      start: Joi.date().iso(),
      end: Joi.date().iso().min(Joi.ref('start'))
    }),
    metadata: Joi.object().pattern(
      Joi.string(),
      Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean())
    )
  }).default({}),

  options: Joi.object({
    parallel: Joi.boolean().default(true),
    timeout: Joi.number().integer().min(1000).max(60000).default(30000),
    includeMetadata: Joi.boolean().default(true),
    preferGraceMemory: Joi.boolean().default(true)
  }).default({})
});

// Hybrid search schema
const hybridSearchSchema = searchQuerySchema.keys({
  alpha: Joi.number()
    .min(0)
    .max(1)
    .default(0.7)
    .description('Weight for dense retrieval (0=sparse only, 1=dense only)')
});

// RAG search schema
const ragSearchSchema = searchQuerySchema.keys({
  model: Joi.string()
    .valid('llama3-70b', 'llama3-8b', 'mistral-7b', 'claude-3-sonnet')
    .default('llama3-70b')
    .description('Language model for generation'),

  temperature: Joi.number()
    .min(0)
    .max(2)
    .default(0.7)
    .description('Generation temperature'),

  maxTokens: Joi.number()
    .integer()
    .min(1)
    .max(4096)
    .default(512)
    .description('Maximum tokens to generate'),

  systemPrompt: Joi.string()
    .max(2000)
    .description('Optional system prompt'),

  context: Joi.object({
    includeSource: Joi.boolean().default(true),
    maxContextLength: Joi.number().integer().min(100).max(8000).default(2000),
    contextFormat: Joi.string().valid('markdown', 'plaintext', 'json').default('markdown')
  }).default({})
});

// Performance analytics query schema
const analyticsQuerySchema = Joi.object({
  timeRange: Joi.string()
    .valid('1h', '6h', '12h', '1d', '3d', '7d', '30d')
    .default('1h')
    .description('Time range for analytics'),

  granularity: Joi.string()
    .valid('1m', '5m', '15m', '1h', '6h', '1d')
    .default('1m')
    .description('Data granularity'),

  metrics: Joi.array()
    .items(Joi.string().valid(
      'latency',
      'throughput',
      'memory_usage',
      'cache_hit_ratio',
      'error_rate'
    ))
    .min(1)
    .default(['latency', 'throughput'])
}).options({ stripUnknown: true });

// Validation middleware functions
const validateSearchQuery = validate(searchQuerySchema);
const validateBatchSearch = validate(batchSearchSchema);
const validateHybridSearch = validate(hybridSearchSchema);
const validateRAGSearch = validate(ragSearchSchema);
const validateAnalyticsQuery = validate(analyticsQuerySchema, 'query');

module.exports = {
  // Schemas
  searchQuerySchema,
  batchSearchSchema,
  hybridSearchSchema,
  ragSearchSchema,
  analyticsQuerySchema,
  embeddingSchema,

  // Validation middleware
  validateSearchQuery,
  validateBatchSearch,
  validateHybridSearch,
  validateRAGSearch,
  validateAnalyticsQuery
};