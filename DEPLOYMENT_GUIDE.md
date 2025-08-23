# GH200-Retrieval-Router Deployment Guide

## 🚀 Production Deployment Options

### Option 1: Kubernetes with Helm (Recommended)

```bash
# 1. Install Helm chart
helm install gh200-retrieval-router ./helm/gh200-retrieval-router/ \
  --set replicaCount=4 \
  --set resources.limits.memory=480Gi \
  --set resources.limits."nvidia.com/gpu"=1

# 2. Verify deployment
kubectl get pods -l app=gh200-retrieval-router
kubectl get services

# 3. Check system status
kubectl port-forward svc/gh200-retrieval-router 8080:8080
curl http://localhost:8080/api/v1/health
```

### Option 2: Kubernetes with Kustomize

```bash
# 1. Deploy base configuration
kubectl apply -k k8s/base/

# 2. Deploy monitoring stack
kubectl apply -k k8s/monitoring/

# 3. Verify deployment
kubectl get statefulsets
kubectl logs -l app=gh200-retrieval-router
```

### Option 3: Docker Compose (Development/Testing)

```bash
# 1. Start development environment
docker-compose up -d

# 2. Start production environment
docker-compose -f docker-compose.prod.yml up -d

# 3. View logs
docker-compose logs -f retrieval-router
```

### Option 4: Ansible Automation

```bash
# 1. Configure inventory
cp ansible/inventory/production.yml.example ansible/inventory/production.yml
# Edit with your GH200 node details

# 2. Deploy with Ansible
cd ansible/
ansible-playbook -i inventory/production.yml playbooks/site.yml

# 3. Verify installation
ansible all -i inventory/production.yml -m shell -a "systemctl status gh200-retrieval-router"
```

### Option 5: Terraform Infrastructure

```bash
# 1. Initialize Terraform
cd terraform/
terraform init

# 2. Plan infrastructure
terraform plan -var="cluster_size=8"

# 3. Apply infrastructure
terraform apply

# 4. Get cluster endpoints
terraform output cluster_endpoints
```

## 🔧 Configuration Management

### Environment Variables

```bash
# Core Configuration
export NODE_ENV=production
export PORT=8080
export LOG_LEVEL=info

# Performance Tuning
export TARGET_QPS=125000
export TARGET_RAG_QPS=450
export TARGET_P99_LATENCY=200

# Auto-scaling
export MIN_INSTANCES=2
export MAX_INSTANCES=32
export TARGET_CPU_UTILIZATION=70

# Security
export RATE_LIMIT_MAX=1000
export ALLOWED_ORIGINS="https://your-domain.com"
```

### Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: gh200-config
data:
  NODE_ENV: "production"
  TARGET_QPS: "125000"
  ENABLE_GPU_ACCELERATION: "true"
  ENABLE_MONITORING: "true"
```

## 📊 Health Monitoring

### Readiness Probe
```bash
curl http://pod-ip:8080/api/v1/health
# Expected: {"status":"healthy","generation":3}
```

### Liveness Probe  
```bash
curl http://pod-ip:8080/ping
# Expected: {"status":"ok","timestamp":"...","version":"..."}
```

### Metrics Endpoint
```bash
curl http://pod-ip:8080/api/v1/metrics
# Returns Prometheus-compatible metrics
```

## 🎯 Performance Validation

### Basic Load Test
```bash
# Install Apache Bench or similar
ab -n 1000 -c 10 http://pod-ip:8080/api/v1/health

# Expected results:
# - Requests per second: >1000
# - Time per request: <100ms
# - Failed requests: 0
```

### Generation 3 Feature Test
```bash
# Test auto-scaling
node generation3-demo.js

# Expected output:
# ✅ System initialized with 2 instances
# ✅ Load balancer configured with 2 backends
# 📈 Auto-scaling to 3 instances based on CPU utilization
# 📡 Requests distributed via weighted round-robin
```

## 🛡️ Security Checklist

- [x] Security headers enabled (X-Frame-Options: DENY, CSP, HSTS)
- [x] Input sanitization prevents XSS attacks
- [x] Rate limiting configured (1000 req/15min)
- [x] Request size limits enforced (10MB)
- [x] HTTPS/TLS encryption in production
- [x] RBAC policies applied
- [x] Network policies restrict traffic
- [x] Secrets managed securely

## 🔄 Scaling Operations

### Manual Scaling
```bash
# Kubernetes
kubectl scale statefulset gh200-retrieval-router --replicas=8

# Helm
helm upgrade gh200-retrieval-router ./helm/gh200-retrieval-router/ \
  --set replicaCount=8
```

### Auto-scaling (HPA)
```bash
# Apply HPA configuration
kubectl apply -f k8s/base/hpa.yaml

# Check auto-scaling status
kubectl get hpa
kubectl describe hpa gh200-retrieval-router
```

## 🔍 Troubleshooting

### Common Issues

1. **Memory Allocation Failures**
   ```bash
   # Check Grace memory usage
   kubectl exec -it pod-name -- curl localhost:8080/api/v1/health
   # Look for memoryUtilization in response
   ```

2. **NVLink Bandwidth Issues**
   ```bash
   # Check NVLink status on nodes
   nvidia-smi nvlink -s
   ```

3. **Performance Degradation**
   ```bash
   # Check system metrics
   kubectl port-forward svc/gh200-retrieval-router 8080:8080
   curl http://localhost:8080/api/v1/metrics | grep generation3
   ```

### Log Analysis
```bash
# View application logs
kubectl logs -f statefulset/gh200-retrieval-router

# Filter for errors
kubectl logs statefulset/gh200-retrieval-router | grep ERROR

# View metrics
kubectl logs statefulset/gh200-retrieval-router | grep "Auto-scaling\|Load balancing"
```

## 🎉 Deployment Success Verification

After deployment, verify these endpoints return expected responses:

```bash
# 1. Root endpoint
curl https://your-domain.com/
# Expected: {"name":"GH200 Retrieval Router","status":"running"}

# 2. Health check
curl https://your-domain.com/api/v1/health  
# Expected: {"status":"healthy","generation":3,"components":...}

# 3. Metrics endpoint
curl https://your-domain.com/api/v1/metrics
# Expected: Prometheus metrics with generation3 labels

# 4. Search endpoint (with auth if required)
curl -X POST https://your-domain.com/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test search","k":5}'
# Expected: {"query":"test search","results":[...],"processingTime":...}
```

**🚀 Deployment Complete!** Your GH200-Retrieval-Router is now running in production with full Generation 1-3 autonomous SDLC capabilities.