/**
 * Vector data validation schemas for GH200 Retrieval Router
 */

const Joi = require('joi');
const { validate } = require('../middleware/validation');

// Base embedding schema
const embeddingSchema = Joi.array()
  .items(Joi.number())
  .min(1)
  .max(2048)
  .required()
  .description('Vector embedding array');

// Metadata schema
const metadataSchema = Joi.object({
  source: Joi.string().max(1000).description('Source document/file path'),
  title: Joi.string().max(500).description('Document title'),
  author: Joi.string().max(200).description('Document author'),
  category: Joi.string().max(100).description('Document category'),
  timestamp: Joi.date().iso().description('Document timestamp'),
  tags: Joi.array().items(Joi.string().max(50)).max(20).description('Document tags'),
  language: Joi.string().length(2).description('ISO 639-1 language code'),
  content_type: Joi.string().valid('text', 'image', 'audio', 'video', 'pdf', 'html'),
  chunk_index: Joi.number().integer().min(0).description('Chunk index for document splits'),
  parent_id: Joi.string().description('Parent document ID for chunks'),
  
  // Custom metadata fields (flexible)
  custom: Joi.object().pattern(
    Joi.string().max(100),
    Joi.alternatives().try(
      Joi.string().max(1000),
      Joi.number(),
      Joi.boolean(),
      Joi.date().iso()
    )
  ).description('Custom metadata fields')
}).options({ stripUnknown: false });

// Single vector schema
const singleVectorSchema = Joi.object({
  id: Joi.alternatives()
    .try(Joi.string(), Joi.number().integer())
    .description('Vector unique identifier'),
  
  embedding: embeddingSchema,
  
  metadata: metadataSchema.default({})
}).required();

// Vector batch schema
const vectorBatchSchema = Joi.object({
  vectors: Joi.array()
    .items(singleVectorSchema)
    .min(1)
    .max(10000)
    .required()
    .description('Array of vectors to add'),

  metadata: Joi.object({
    batch_id: Joi.string().description('Batch identifier'),
    source_file: Joi.string().description('Source file for batch'),
    processing_timestamp: Joi.date().iso().default(() => new Date()),
    embedding_model: Joi.string().description('Model used for embeddings'),
    embedding_dimension: Joi.number().integer().min(1).max(2048),
    
    // Batch-level configuration
    options: Joi.object({
      index_immediately: Joi.boolean().default(true),
      validate_duplicates: Joi.boolean().default(false),
      update_if_exists: Joi.boolean().default(false),
      grace_memory_allocation: Joi.string().valid('auto', 'prealloc', 'minimal').default('auto')
    }).default({})
  }).default({})
});

// Vector update schema
const vectorUpdateSchema = Joi.object({
  metadata: metadataSchema.required()
}).options({ stripUnknown: false });

// Vector search result schema (for validation of internal results)
const searchResultSchema = Joi.object({
  id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  score: Joi.number().min(0).max(1).required(),
  embedding: embeddingSchema.optional(),
  metadata: metadataSchema.optional(),
  rank: Joi.number().integer().min(1).optional()
});

// Bulk operation schema
const bulkOperationSchema = Joi.object({
  operations: Joi.array().items(
    Joi.object({
      action: Joi.string().valid('add', 'update', 'delete').required(),
      id: Joi.alternatives().try(Joi.string(), Joi.number()).when('action', {
        is: Joi.valid('update', 'delete'),
        then: Joi.required()
      }),
      vector: singleVectorSchema.when('action', {
        is: 'add',
        then: Joi.required()
      }),
      metadata: metadataSchema.when('action', {
        is: 'update',
        then: Joi.required()
      })
    })
  ).min(1).max(1000).required(),

  options: Joi.object({
    atomic: Joi.boolean().default(false).description('All operations succeed or all fail'),
    continue_on_error: Joi.boolean().default(true).description('Continue processing after errors'),
    return_results: Joi.boolean().default(true).description('Return detailed operation results'),
    batch_size: Joi.number().integer().min(1).max(100).default(50)
  }).default({})
});

// Reindex operation schema
const reindexSchema = Joi.object({
  force: Joi.boolean().default(false).description('Force reindex even if not needed'),
  
  options: Joi.object({
    index_type: Joi.string().valid('flat', 'ivf', 'hnsw', 'pq').description('Index type to use'),
    nlist: Joi.number().integer().min(1).when('index_type', {
      is: 'ivf',
      then: Joi.number().integer().min(1).default(100)
    }),
    m: Joi.number().integer().min(4).max(96).when('index_type', {
      is: 'pq',
      then: Joi.number().integer().min(4).max(96).default(64)
    }),
    ef_construction: Joi.number().integer().min(10).when('index_type', {
      is: 'hnsw',
      then: Joi.number().integer().min(10).default(200)
    }),
    preserve_ids: Joi.boolean().default(true),
    use_grace_memory: Joi.boolean().default(true),
    parallel_workers: Joi.number().integer().min(1).max(32).default(4)
  }).default({})
});

// Validation functions for dimension consistency
const validateEmbeddingDimension = (expectedDimension) => {
  return (value, helpers) => {
    if (value.length !== expectedDimension) {
      return helpers.error('array.length', {
        limit: expectedDimension,
        actual: value.length
      });
    }
    return value;
  };
};

// Custom validation for embedding normalization
const validateEmbeddingRange = (value, helpers) => {
  const magnitude = Math.sqrt(value.reduce((sum, val) => sum + val * val, 0));
  
  // Check if embedding is normalized (L2 norm ≈ 1)
  if (Math.abs(magnitude - 1.0) > 0.1) {
    return helpers.message('Embedding should be normalized (L2 norm ≈ 1.0)');
  }
  
  return value;
};

// Middleware validation functions
const validateVectorData = validate(vectorBatchSchema);
const validateSingleVector = validate(singleVectorSchema);
const validateVectorUpdate = validate(vectorUpdateSchema);
const validateBulkOperation = validate(bulkOperationSchema);
const validateReindex = validate(reindexSchema);

// Dimension-specific validators
const createDimensionValidator = (dimension) => {
  const dimensionSchema = vectorBatchSchema.keys({
    vectors: Joi.array().items(
      singleVectorSchema.keys({
        embedding: embeddingSchema.custom(validateEmbeddingDimension(dimension))
      })
    )
  });
  
  return validate(dimensionSchema);
};

// Normalized embedding validator
const validateNormalizedVectors = validate(
  vectorBatchSchema.keys({
    vectors: Joi.array().items(
      singleVectorSchema.keys({
        embedding: embeddingSchema.custom(validateEmbeddingRange)
      })
    )
  })
);

module.exports = {
  // Schemas
  embeddingSchema,
  metadataSchema,
  singleVectorSchema,
  vectorBatchSchema,
  vectorUpdateSchema,
  searchResultSchema,
  bulkOperationSchema,
  reindexSchema,

  // Validation middleware
  validateVectorData,
  validateSingleVector,
  validateVectorUpdate,
  validateBulkOperation,
  validateReindex,

  // Custom validators
  createDimensionValidator,
  validateNormalizedVectors,
  validateEmbeddingDimension,
  validateEmbeddingRange
};