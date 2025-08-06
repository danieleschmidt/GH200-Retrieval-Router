# GH200-Retrieval-Router Deployment Guide

## Overview

This guide covers deployment of the GH200-Retrieval-Router in various environments, from development to production-scale GH200 clusters.

## System Requirements

### Hardware Requirements

**Minimum (Development)**:
- 8GB RAM
- 4 CPU cores
- 50GB storage
- Network: 1Gbps

**Recommended (Production)**:
- NVIDIA GH200 Grace Hopper Superchip
- 480GB unified memory
- NVLink-C2C interconnect for multi-node
- InfiniBand HDR or better for scale-out
- NVMe SSD storage: 1TB+
- Network: 100Gbps+ with RDMA support

### Software Requirements

- **OS**: Ubuntu 22.04 LTS or RHEL 8.5+
- **Node.js**: 16.0.0+
- **NPM**: 8.0.0+
- **Docker**: 24.0+ (optional)
- **Kubernetes**: 1.25+ (optional)

**GH200-Specific**:
- CUDA 12.3+ with Grace Hopper support
- NVIDIA HPC SDK 24.3+
- UCX 1.15+ (unified communication)
- NCCL 2.19+ for multi-GPU

## Environment Setup

### Development Environment

```bash
# Clone repository
git clone https://github.com/terragon-labs/gh200-retrieval-router
cd gh200-retrieval-router

# Install dependencies
npm install

# Set environment variables
export NODE_ENV=development
export LOG_LEVEL=debug
export PORT=8080

# Start development server
npm run dev
```

### Production Environment

```bash
# Install production dependencies only
npm ci --only=production

# Set production environment variables
export NODE_ENV=production
export LOG_LEVEL=info
export PORT=8080
export WORKERS=4

# Start production server
npm start
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment (development/production) | development | No |
| `PORT` | Server port | 8080 | No |
| `HOST` | Server host | 0.0.0.0 | No |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | info | No |
| `WORKERS` | Number of worker processes | 1 | No |
| `GRACE_MEMORY_GB` | Grace memory allocation in GB | 480 | No |
| `NVLINK_ENABLED` | Enable NVLink optimizations | true | No |
| `RATE_LIMIT_MAX` | Max requests per window | 1000 | No |
| `CACHE_SIZE_MB` | Cache size in MB | 1024 | No |

### Configuration Files

**config/production.js**:
```javascript
module.exports = {
  server: {
    port: process.env.PORT || 8080,
    workers: process.env.WORKERS || 4
  },
  graceMemory: {
    totalMemoryGB: 480,
    embeddingsPoolGB: 300,
    cachePoolGB: 100,
    workspacePoolGB: 80
  },
  sharding: {
    initialShards: 32,
    maxShards: 64,
    autoRebalance: true
  },
  performance: {
    connectionPool: {
      min: 10,
      max: 100
    },
    cache: {
      levels: ['L1', 'L2', 'L3'],
      ttl: 3600000
    }
  }
};
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Create non-root user
RUN groupadd -r ghrouter && useradd -r -g ghrouter ghrouter
RUN chown -R ghrouter:ghrouter /app
USER ghrouter

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node scripts/health-check.js

EXPOSE 8080

CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  gh200-router:
    build: .
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - GRACE_MEMORY_GB=480
    volumes:
      - ./logs:/app/logs
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "scripts/health-check.js"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-storage:/var/lib/grafana

volumes:
  grafana-storage:
```

## Kubernetes Deployment

### Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: gh200-router
  labels:
    name: gh200-router
```

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: gh200-router-config
  namespace: gh200-router
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  GRACE_MEMORY_GB: "480"
  NVLINK_ENABLED: "true"
  RATE_LIMIT_MAX: "10000"
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gh200-router
  namespace: gh200-router
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gh200-router
  template:
    metadata:
      labels:
        app: gh200-router
    spec:
      nodeSelector:
        nvidia.com/gpu.product: NVIDIA-GH200-480GB
      containers:
      - name: gh200-router
        image: ghcr.io/terragon-labs/gh200-router:latest
        ports:
        - containerPort: 8080
          name: http
        envFrom:
        - configMapRef:
            name: gh200-router-config
        resources:
          requests:
            nvidia.com/gpu: 1
            memory: "32Gi"
            cpu: "4"
          limits:
            nvidia.com/gpu: 1
            memory: "64Gi"
            cpu: "8"
        livenessProbe:
          httpGet:
            path: /ping
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/v1/health
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 5
        volumeMounts:
        - name: data
          mountPath: /app/data
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: gh200-router-data
      - name: logs
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: gh200-router-service
  namespace: gh200-router
spec:
  selector:
    app: gh200-router
  ports:
  - port: 8080
    targetPort: 8080
    name: http
  type: ClusterIP
```

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: gh200-router-ingress
  namespace: gh200-router
  annotations:
    nginx.ingress.kubernetes.io/rate-limit: "1000"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  rules:
  - host: gh200-router.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: gh200-router-service
            port:
              number: 8080
```

## GH200 Multi-Node Cluster Setup

### SLURM Job Script

```bash
#!/bin/bash
#SBATCH --job-name=gh200-router
#SBATCH --nodes=4
#SBATCH --ntasks-per-node=1
#SBATCH --gres=gpu:gh200:1
#SBATCH --time=24:00:00
#SBATCH --partition=gh200

# Load modules
module load cuda/12.3
module load nccl/2.19
module load nodejs/18

# Set environment
export NCCL_SOCKET_IFNAME=ib0
export NCCL_IB_DISABLE=0
export CUDA_VISIBLE_DEVICES=0

# Start router on each node
srun --ntasks=$SLURM_NNODES --ntasks-per-node=1 \
  node src/server.js --cluster --node-rank=$SLURM_PROCID
```

### Multi-Node Configuration

```javascript
// config/cluster.js
module.exports = {
  cluster: {
    enabled: true,
    nodes: process.env.SLURM_NNODES || 4,
    nodeRank: process.env.SLURM_PROCID || 0,
    masterNode: 0
  },
  nccl: {
    backend: 'nccl',
    initMethod: 'env://',
    worldSize: process.env.SLURM_NNODES || 4,
    rank: process.env.SLURM_PROCID || 0
  },
  nvlink: {
    enabled: true,
    topology: 'all_to_all',
    bandwidthGBs: 900
  },
  sharding: {
    distributionStrategy: 'semantic',
    replicationFactor: 2,
    autoRebalance: true
  }
};
```

## Monitoring Setup

### Prometheus Configuration

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'gh200-router'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/api/v1/metrics'
    scrape_interval: 5s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'nvidia-gpu'
    static_configs:
      - targets: ['localhost:9445']
```

### Grafana Dashboard

Key metrics to monitor:
- Query latency (P50, P95, P99)
- Throughput (QPS)
- Grace memory utilization
- NVLink bandwidth utilization
- Error rates
- Cache hit rates
- Connection pool statistics

## Security

### TLS Configuration

```javascript
// config/tls.js
const fs = require('fs');

module.exports = {
  https: {
    enabled: true,
    port: 8443,
    options: {
      key: fs.readFileSync('certs/private-key.pem'),
      cert: fs.readFileSync('certs/certificate.pem'),
      ca: fs.readFileSync('certs/ca-certificate.pem')
    }
  }
};
```

### Authentication

```javascript
// config/auth.js
module.exports = {
  auth: {
    enabled: true,
    method: 'jwt', // jwt, api-key, oauth
    secret: process.env.JWT_SECRET,
    expiresIn: '24h'
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // requests per window
    skipSuccessfulRequests: false
  }
};
```

## Troubleshooting

### Common Issues

1. **Memory allocation errors**
   ```bash
   # Check available memory
   free -h
   
   # Check Grace memory status
   nvidia-smi
   ```

2. **NVLink connectivity issues**
   ```bash
   # Check NVLink status
   nvidia-smi nvlink -s
   
   # Test NVLink bandwidth
   nvidia-smi nvlink -g 0
   ```

3. **Performance issues**
   ```bash
   # Check system resources
   htop
   
   # Monitor network I/O
   iotop
   
   # Check application metrics
   curl http://localhost:8080/api/v1/metrics
   ```

### Logs

```bash
# View application logs
tail -f logs/gh200-router-combined.log

# View error logs only
tail -f logs/gh200-router-error.log

# Filter by component
grep "GraceMemoryManager" logs/gh200-router-combined.log
```

### Health Checks

```bash
# Basic health check
node scripts/health-check.js

# Detailed health check with JSON output
node scripts/health-check.js --json --verbose

# Health check with custom endpoint
node scripts/health-check.js --url http://cluster-node:8080
```

## Performance Tuning

### System-Level Tuning

```bash
# Increase file descriptor limits
ulimit -n 65536

# Optimize network settings
echo 'net.core.rmem_max = 134217728' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 134217728' >> /etc/sysctl.conf
sysctl -p

# Set CPU governor to performance
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

### Application-Level Tuning

```javascript
// config/performance.js
module.exports = {
  clustering: {
    workers: 'auto', // or specific number
    restartThreshold: 10
  },
  gc: {
    maxOldSpaceSize: 8192, // MB
    maxSemiSpaceSize: 512   // MB
  },
  v8: {
    optimizeForSize: false,
    maxCallStackSize: 10000
  }
};
```

### Benchmarking

```bash
# Run performance benchmark
npm run benchmark

# Custom benchmark
node scripts/benchmark.js --users 100 --duration 60s

# Load test specific endpoints
curl -X POST http://localhost:8080/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test query", "k": 10}'
```

## Backup and Recovery

### Data Backup

```bash
# Backup vector indices
tar -czf backup-$(date +%Y%m%d).tar.gz data/indices/

# Backup configuration
tar -czf config-backup-$(date +%Y%m%d).tar.gz config/
```

### Disaster Recovery

```bash
# Restore from backup
tar -xzf backup-20250101.tar.gz -C data/

# Restart services
systemctl restart gh200-router
```

## Scaling Guidelines

### Vertical Scaling
- Increase Grace memory allocation
- Add more CPU cores
- Upgrade to faster storage

### Horizontal Scaling
- Add more GH200 nodes
- Implement load balancing
- Use distributed caching

### Auto-scaling
- Monitor queue depth
- Scale based on latency thresholds
- Use Kubernetes HPA for automatic scaling

## Support

- **Documentation**: [GitHub Wiki](https://github.com/terragon-labs/gh200-retrieval-router/wiki)
- **Issues**: [GitHub Issues](https://github.com/terragon-labs/gh200-retrieval-router/issues)
- **Community**: [Discord Server](https://discord.gg/terragon)
- **Enterprise Support**: support@terragon.ai