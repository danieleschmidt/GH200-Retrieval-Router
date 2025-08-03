# Contributing to GH200-Retrieval-Router

We welcome contributions to the GH200-Retrieval-Router project! This guide will help you understand how to contribute effectively to our high-performance RAG system optimized for Grace Hopper architecture.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [Grace Hopper Setup](#grace-hopper-setup)
- [Code Guidelines](#code-guidelines)
- [Performance Requirements](#performance-requirements)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Performance Benchmarking](#performance-benchmarking)
- [Documentation](#documentation)

## Getting Started

### Prerequisites

- **Hardware**: Access to NVIDIA GH200 Grace Hopper Superchip (or simulation environment)
- **Software**: CUDA 12.3+, NVIDIA HPC SDK 24.3+, UCX 1.15+, Python 3.10+
- **Node.js**: Version 16.0.0 or higher
- **Git**: For version control

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/GH200-Retrieval-Router.git
   cd GH200-Retrieval-Router
   ```

3. Add the original repository as upstream:
   ```bash
   git remote add upstream https://github.com/terragon-labs/GH200-Retrieval-Router.git
   ```

## Development Environment

### Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Run tests to verify setup:
   ```bash
   npm test
   ```

### Development Scripts

- `npm run dev` - Start development server with hot reload
- `npm run test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Check code style
- `npm run format` - Format code
- `npm run benchmark` - Run performance benchmarks

## Grace Hopper Setup

### Hardware Configuration

For development on actual Grace Hopper hardware:

1. **Memory Configuration**:
   ```bash
   # Verify Grace memory availability
   nvidia-smi --query-gpu=memory.total --format=csv
   
   # Check NVLink status
   nvidia-smi nvlink -s
   ```

2. **CUDA Environment**:
   ```bash
   # Verify CUDA installation
   nvcc --version
   
   # Check Grace Hopper support
   nvidia-smi --query-gpu=compute_cap --format=csv
   ```

### Simulation Environment

For development without Grace Hopper hardware:

1. Set mock environment:
   ```bash
   export MOCK_GRACE_HOPPER=true
   export GRACE_MEMORY_SIZE=480GB
   export NVLINK_BANDWIDTH=900
   ```

2. Use simulation mode:
   ```javascript
   const config = {
     development: {
       mockGraceHopper: true
     }
   };
   ```

## Code Guidelines

### Code Style

- **ESLint**: Follow the configured ESLint rules
- **Prettier**: Use Prettier for code formatting
- **Naming**: Use descriptive names that reflect Grace Hopper optimizations
- **Comments**: Document performance-critical sections and Grace-specific optimizations

### Performance-Critical Code

When working with performance-critical components:

1. **Memory Management**:
   ```javascript
   // Good: Explicit Grace memory allocation
   const allocation = await memoryManager.allocate('embeddings', vectorSize, {
     pinned: true,
     zeroCopy: true
   });
   
   // Bad: Unmanaged memory usage
   const data = new Float32Array(vectorSize);
   ```

2. **NVLink Optimization**:
   ```javascript
   // Good: NVLink-aware data distribution
   await shardManager.distributeAcrossNVLink(vectors, {
     bandwidth: 900,
     rings: 4
   });
   
   // Bad: Ignoring NVLink topology
   shards.forEach(shard => shard.addVectors(vectors));
   ```

### Architecture Patterns

- **Memory Pools**: Use Grace memory pools for efficient allocation
- **Zero-Copy**: Leverage unified memory for zero-copy operations
- **Async Operations**: Use async/await for non-blocking operations
- **Error Handling**: Implement comprehensive error handling with graceful degradation

## Performance Requirements

### Benchmarking Standards

All contributions must meet these performance criteria:

- **Query Latency**: p99 < 50ms for single-node operations
- **Throughput**: > 125K QPS per GH200 node
- **Memory Efficiency**: > 85% Grace memory utilization
- **Scaling Efficiency**: > 85% linear scaling across nodes

### Performance Testing

1. **Run Benchmarks**:
   ```bash
   npm run benchmark
   ```

2. **Profile Performance**:
   ```bash
   npm run profile
   node --prof-process isolate-*.log > profile.txt
   ```

3. **Memory Analysis**:
   ```bash
   npm run test:memory
   ```

### Optimization Guidelines

- **Avoid Memory Copying**: Use zero-copy operations when possible
- **Batch Operations**: Group operations to maximize Grace memory bandwidth
- **Cache Locality**: Optimize data structures for Grace memory access patterns
- **NVLink Utilization**: Design algorithms to leverage 900GB/s bandwidth

## Testing

### Test Categories

1. **Unit Tests**: Test individual components
2. **Integration Tests**: Test component interactions
3. **Performance Tests**: Validate performance requirements
4. **Grace Hardware Tests**: Test on actual Grace Hopper hardware

### Writing Tests

```javascript
// Example performance test
describe('VectorDatabase Performance', () => {
  test('should achieve target latency', async () => {
    const startTime = process.hrtime.bigint();
    
    const results = await database.search({
      embedding: testEmbedding,
      k: 100
    });
    
    const latency = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    expect(latency).toBeLessThan(50); // 50ms target
    expect(results).toHaveLength(100);
  });
});
```

### Test Requirements

- **Coverage**: Minimum 90% code coverage
- **Performance**: All tests must pass performance benchmarks
- **Hardware**: Tests should work in both real and simulated environments
- **Isolation**: Tests must not interfere with each other

## Pull Request Process

### Before Submitting

1. **Update Documentation**: Ensure all changes are documented
2. **Run Full Test Suite**: `npm test`
3. **Performance Validation**: `npm run benchmark`
4. **Code Quality**: `npm run lint && npm run format`
5. **Rebase**: Rebase your branch on latest main

### Pull Request Template

```markdown
## Description
Brief description of changes and Grace Hopper optimizations

## Performance Impact
- Latency improvement: X ms
- Throughput improvement: X QPS
- Memory efficiency: X%
- NVLink utilization: X%

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Performance benchmarks pass
- [ ] Grace hardware validation (if applicable)

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Performance requirements met
```

### Review Process

1. **Automated Checks**: CI/CD pipeline validation
2. **Code Review**: Peer review for correctness and performance
3. **Performance Review**: Benchmark validation
4. **Architecture Review**: For significant changes

## Performance Benchmarking

### Benchmark Requirements

For performance-related contributions:

1. **Baseline Measurements**: Establish current performance
2. **Improvement Validation**: Demonstrate performance gains
3. **Regression Testing**: Ensure no performance degradation
4. **Scaling Analysis**: Test across multiple nodes (if applicable)

### Benchmark Format

```javascript
// benchmark/vector-search.js
const Benchmark = require('benchmark');
const { VectorDatabase } = require('../src/database/VectorDatabase');

const suite = new Benchmark.Suite();

suite
  .add('Vector Search - 1M vectors', async () => {
    await database.search({ embedding: testVector, k: 100 });
  })
  .on('cycle', (event) => {
    console.log(String(event.target));
  })
  .run({ async: true });
```

## Documentation

### Documentation Requirements

- **API Documentation**: JSDoc comments for all public APIs
- **Performance Notes**: Document Grace Hopper specific optimizations
- **Examples**: Provide usage examples with performance characteristics
- **Architecture**: Update architecture docs for significant changes

### Documentation Style

```javascript
/**
 * Performs high-performance vector search using Grace Hopper optimization
 * @param {Object} options - Search options
 * @param {Float32Array} options.embedding - Query embedding vector
 * @param {number} options.k - Number of results to return
 * @param {string} [options.database] - Target database name
 * @returns {Promise<Array>} Search results with similarity scores
 * 
 * @performance
 * - Latency: <50ms p99 for 1B vectors on single GH200 node
 * - Throughput: 125K+ QPS per node
 * - Memory: Zero-copy operations with Grace unified memory
 * 
 * @example
 * const results = await router.retrieve({
 *   embedding: queryVector,
 *   k: 100,
 *   database: 'wiki_20tb'
 * });
 */
async retrieve(options) {
  // Implementation
}
```

## Community

### Communication

- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions and community discussion
- **Discord**: Real-time community chat (link in README)
- **Monthly Meetings**: Community sync meetings (calendar link in README)

### Recognition

Contributors are recognized through:
- Contributor list in README
- Performance leaderboard for optimization contributions
- Annual contributor appreciation events
- Conference speaking opportunities

## Questions?

If you have questions about contributing:

1. Check existing [GitHub Issues](https://github.com/terragon-labs/GH200-Retrieval-Router/issues)
2. Join our [Discord community](https://discord.gg/terragon-labs)
3. Email us at [opensource@terragon-labs.com](mailto:opensource@terragon-labs.com)

Thank you for contributing to GH200-Retrieval-Router! Your contributions help advance the state of high-performance RAG systems.
