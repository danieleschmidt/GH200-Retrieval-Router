#!/bin/bash
set -e

echo "🔄 Starting GH200-Retrieval-Router development environment..."

# Check CUDA availability
if command -v nvidia-smi &> /dev/null; then
    echo "✅ NVIDIA GPU detected:"
    nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
else
    echo "⚠️  No NVIDIA GPU detected - using simulation mode"
    export MOCK_GRACE_HOPPER=true
fi

# Check NVLink status (Grace Hopper specific)
if command -v nvidia-smi &> /dev/null; then
    echo "🔗 Checking NVLink status..."
    nvidia-smi nvlink --status 2>/dev/null || echo "NVLink not available (expected in simulation)"
fi

# Start background services for development
echo "🛠️ Starting development services..."

# Start Redis for caching (if available)
if command -v redis-server &> /dev/null; then
    echo "🟥 Starting Redis server..."
    redis-server --daemonize yes --port 6379 --maxmemory 1gb --maxmemory-policy allkeys-lru
fi

# Start PostgreSQL for metadata (if available)
if command -v pg_ctl &> /dev/null; then
    echo "🐘 Starting PostgreSQL server..."
    su postgres -c 'pg_ctl start -D /var/lib/postgresql/data' 2>/dev/null || echo "PostgreSQL not configured"
fi

# Create development data directories with proper permissions
echo "📁 Setting up data directories..."
mkdir -p /workspace/data/{embeddings,indices,metadata,cache,logs}
mkdir -p /workspace/benchmarks/results
mkdir -p /workspace/tests/fixtures

# Set up development environment variables
echo "⚙️ Configuring environment..."
export NODE_ENV=development
export LOG_LEVEL=debug
export GRACE_MEMORY_SIZE=480GB
export NVLINK_BANDWIDTH=900

# Check if .env file exists, create if not
if [ ! -f /workspace/.env ]; then
    echo "📝 Creating .env file..."
    cat > /workspace/.env << 'EOF'
# GH200-Retrieval-Router Development Environment
NODE_ENV=development
LOG_LEVEL=debug

# Grace Hopper Configuration
MOCK_GRACE_HOPPER=true
GRACE_MEMORY_SIZE=480GB
NVLINK_BANDWIDTH=900
UNIFIED_MEMORY_ENABLED=true

# Server Configuration
PORT=8080
HOST=0.0.0.0

# Database Configuration
REDIS_URL=redis://localhost:6379
POSTGRES_URL=postgresql://postgres:password@localhost:5432/gh200_router

# Security Configuration
JWT_SECRET=development-secret-key-change-in-production
API_KEY_REQUIRED=false

# Performance Configuration
MAX_MEMORY_POOL_GB=100
MAX_CACHE_SIZE=1000000
MAX_WORKERS=8

# Monitoring Configuration
METRICS_PORT=9090
TRACING_ENABLED=true
JAEGER_ENDPOINT=http://localhost:14268/api/traces

# Feature Flags
ENABLE_BENCHMARKING=true
ENABLE_PROFILING=true
ENABLE_DEBUG_ENDPOINTS=true
EOF
fi

# Start file watcher for automatic restarts
echo "👁️ Setting up file watching..."
if [ ! -f /workspace/nodemon.json ]; then
    cat > /workspace/nodemon.json << 'EOF'
{
  "watch": ["src/"],
  "ext": "js,json",
  "ignore": [
    "src/**/*.test.js",
    "node_modules/",
    "data/",
    "logs/",
    "coverage/"
  ],
  "delay": 1000,
  "env": {
    "NODE_ENV": "development",
    "LOG_LEVEL": "debug"
  },
  "verbose": true
}
EOF
fi

# Check Node.js and npm versions
echo "📦 Checking Node.js environment..."
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"

# Install/update dependencies if package.json has changed
if [ package.json -nt node_modules/.package-lock.json ] 2>/dev/null; then
    echo "📦 Package.json updated, installing dependencies..."
    npm install
    touch node_modules/.package-lock.json
fi

# Run health checks
echo "🎯 Running health checks..."

# Check if all required Node.js dependencies are available
node -e "console.log('Node.js modules check:', require('./package.json').name)" 2>/dev/null || echo "Package.json not found"

# Check memory and disk space
echo "Available memory: $(free -h | grep Mem | awk '{print $7}')"
echo "Available disk space: $(df -h /workspace | tail -1 | awk '{print $4}')"

# Display development server URLs
echo ""
echo "🌐 Development URLs:"
echo "  API Server: http://localhost:8080"
echo "  Metrics: http://localhost:9090/metrics"
echo "  Health Check: http://localhost:8080/health"
echo ""
echo "🚀 Development environment ready!"
echo ""
echo "Available commands:"
echo "  npm run dev        - Start development server with hot reload"
echo "  npm test           - Run test suite"
echo "  npm run benchmark  - Run performance benchmarks"
echo "  npm run lint       - Check code quality"
echo "  npm run format     - Format code"
echo "  npm run profile    - Start with profiling enabled"
echo ""
