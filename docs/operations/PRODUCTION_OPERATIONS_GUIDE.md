# GH200 Retrieval Router Production Operations Guide

## Overview

This guide provides comprehensive operational procedures for the GH200 Retrieval Router production environment. The system is designed to handle 125K+ QPS vector search operations with 99.99% uptime SLA.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Deployment Architecture](#deployment-architecture)
3. [Monitoring and Alerting](#monitoring-and-alerting)
4. [Daily Operations](#daily-operations)
5. [Emergency Procedures](#emergency-procedures)
6. [Performance Tuning](#performance-tuning)
7. [Security Operations](#security-operations)
8. [Compliance Management](#compliance-management)
9. [Backup and Recovery](#backup-and-recovery)
10. [Troubleshooting](#troubleshooting)

## System Architecture

### GH200 Hardware Specifications
- **GPU**: NVIDIA GH200 Grace Hopper Superchip
- **Memory**: 480GB Grace unified memory per node
- **NVLink**: 900GB/s bandwidth
- **Architecture**: ARM64-based Grace CPU + Hopper GPU

### Production Cluster Configuration
- **Nodes**: 4-32 GH200 nodes (auto-scaling)
- **Kubernetes**: v1.27+
- **Container Runtime**: containerd with NVIDIA Container Toolkit
- **Storage**: NVMe SSD with 10TB capacity per node
- **Networking**: 400Gbps InfiniBand/Ethernet

## Deployment Architecture

### Multi-Region Setup
```
Primary Region (us-west-2):
├── Production Cluster (4-32 nodes)
├── Monitoring Stack (Prometheus, Grafana)
├── Security Stack (Falco, OPA Gatekeeper)
└── Data Storage (Vector indices, logs)

Secondary Region (us-east-1):
├── Disaster Recovery Cluster (2-16 nodes)
├── Cross-region replication
└── Backup storage

Tertiary Region (eu-west-1):
├── EU data residency compliance
├── GDPR compliant data processing
└── Regional load balancing
```

### Service Mesh Architecture
```
Internet → AWS ALB → NGINX Ingress → Service Mesh (Istio) → GH200 Pods
                                   ↓
                        Security Policies & Rate Limiting
                                   ↓
                        Redis Cache → Vector Database
                                   ↓
                        Monitoring & Logging
```

## Monitoring and Alerting

### Key Performance Indicators (KPIs)

| Metric | Target | Critical Threshold | Alert Level |
|--------|--------|--------------------|-------------|
| Request Rate | 125K+ QPS | <50K QPS | Critical |
| Response Time (P99) | <50ms | >200ms | Warning |
| Error Rate | <0.1% | >1% | Critical |
| GPU Utilization | 70-90% | <30% or >95% | Warning |
| Grace Memory Usage | <85% | >95% | Critical |
| Cache Hit Rate | >80% | <60% | Warning |
| NVLink Bandwidth | 50-90% | <20% | Info |

### Alerting Matrix

| Alert | Severity | PagerDuty | Slack | Email | SMS |
|-------|----------|-----------|-------|-------|-----|
| Service Down | Critical | ✅ | ✅ | ✅ | ✅ |
| High Error Rate | Critical | ✅ | ✅ | ✅ | ❌ |
| Performance Degradation | Warning | ❌ | ✅ | ✅ | ❌ |
| Security Threats | Critical | ✅ | ✅ | ✅ | ✅ |
| GPU Temperature High | Warning | ❌ | ✅ | ✅ | ❌ |

### Dashboard URLs
- **Production Overview**: https://grafana.gh200.terragon-labs.com/d/gh200-overview
- **GPU Metrics**: https://grafana.gh200.terragon-labs.com/d/gh200-gpu
- **Security Dashboard**: https://grafana.gh200.terragon-labs.com/d/gh200-security
- **Kubernetes Cluster**: https://grafana.gh200.terragon-labs.com/d/kubernetes-cluster

## Daily Operations

### Morning Checklist (08:00 UTC)
1. **System Health Check**
   ```bash
   kubectl get nodes -o wide
   kubectl get pods -n gh200-system
   kubectl top nodes
   kubectl top pods -n gh200-system
   ```

2. **Performance Validation**
   ```bash
   # Check current QPS
   curl -s https://api.gh200.terragon-labs.com/api/v1/metrics | grep gh200_requests_total
   
   # Verify response times
   curl -w "%{time_total}" https://api.gh200.terragon-labs.com/health
   ```

3. **GPU Health Verification**
   ```bash
   # Check GPU status on all nodes
   kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- nvidia-smi
   
   # Verify NVLink connectivity
   kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- nvidia-smi nvlink -s
   ```

4. **Security Event Review**
   ```bash
   # Check security alerts from last 24h
   kubectl logs -n falco-system -l app=falco --since=24h | grep ALERT
   
   # Review rate limiting events
   kubectl logs -n gh200-system -l app.kubernetes.io/name=gh200-retrieval-router --since=24h | grep "rate_limit"
   ```

### Afternoon Checklist (14:00 UTC)
1. **Resource Utilization Review**
2. **Cache Performance Analysis**
3. **Auto-scaling Metrics Review**
4. **Backup Verification**

### Evening Checklist (20:00 UTC)
1. **Traffic Pattern Analysis**
2. **Performance Trend Review**
3. **Capacity Planning Updates**
4. **Security Event Summary**

## Emergency Procedures

### Service Outage Response (CRITICAL)

**Immediate Actions (0-5 minutes):**
1. Acknowledge alert in PagerDuty
2. Join incident war room: https://terragon-labs.slack.com/channels/gh200-incidents
3. Check system status: `kubectl get pods -n gh200-system`
4. Verify external connectivity: `curl https://api.gh200.terragon-labs.com/health`

**Assessment Phase (5-15 minutes):**
1. Identify affected components
2. Check recent deployments
3. Review error logs
4. Assess impact scope

**Mitigation Phase (15-30 minutes):**
1. Execute rollback if recent deployment: `./scripts/rollback.sh`
2. Scale up pods if resource issue: `kubectl scale statefulset gh200-retrieval-router --replicas=8`
3. Restart affected pods: `kubectl delete pod gh200-retrieval-router-X`
4. Enable maintenance mode if necessary

**Recovery Verification:**
1. Monitor metrics for 15 minutes
2. Run smoke tests
3. Verify all alerts cleared
4. Document incident

### Performance Degradation Response (WARNING)

**Investigation Steps:**
1. Check resource utilization
2. Analyze slow query logs
3. Verify cache hit rates
4. Review GPU temperature and utilization

**Mitigation Options:**
1. Increase replica count
2. Restart underperforming pods
3. Clear cache if hit rate low
4. Adjust resource limits

### Security Incident Response (CRITICAL)

**Immediate Actions:**
1. Isolate affected components
2. Enable security monitoring mode
3. Review threat detection alerts
4. Contact security team

**Investigation Phase:**
1. Analyze security logs
2. Check for data breaches
3. Review access patterns
4. Assess compliance impact

## Performance Tuning

### GPU Optimization

**Memory Pool Tuning:**
```bash
# Optimal memory allocation for GH200
export GRACE_MEMORY_POOLS="embeddings:300,cache:100,workspace:80"
export CUDA_MEMORY_POOL_SIZE=32GB
export NVLINK_BANDWIDTH=900
```

**CUDA Streams Optimization:**
```bash
# Increase CUDA streams for higher throughput
export CUDA_STREAMS=16
export CUDA_STREAM_PRIORITY=high
```

### Cache Optimization

**Redis Configuration:**
```bash
# Optimal Redis settings for GH200
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli CONFIG SET maxmemory 100gb
redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

**Application Cache Tuning:**
```javascript
// Optimal cache configuration
{
  "maxCacheSize": 10737418240,  // 10GB
  "cacheTTL": 3600,             // 1 hour
  "prefetchEnabled": true,
  "compressionEnabled": true
}
```

## Security Operations

### Daily Security Checks
1. Review Falco alerts
2. Check failed authentication attempts
3. Verify certificate expiration dates
4. Review firewall logs
5. Validate backup encryption

### Weekly Security Tasks
1. Update security policies
2. Review access logs
3. Scan for vulnerabilities
4. Update secrets rotation
5. Compliance audit preparation

### Security Incident Escalation
- **L1**: Operations team (immediate response)
- **L2**: Security team (within 1 hour)
- **L3**: Legal/Compliance team (within 4 hours)
- **L4**: Executive team (within 8 hours)

## Compliance Management

### GDPR Compliance
- Data retention policies enforced automatically
- User rights requests processed via API
- Data anonymization runs weekly
- Audit logs maintained for 7 years

### CCPA Compliance
- Opt-out requests processed automatically
- Data sale tracking disabled by default
- Consumer rights portal available
- Regular compliance assessments

### Monitoring Compliance
```bash
# Check GDPR compliance status
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- \
  curl localhost:8080/api/v1/compliance/gdpr/status

# Verify data retention policies
kubectl logs -n gh200-system -l app=gdpr-cleanup --since=24h
```

## Backup and Recovery

### Backup Schedule
- **Incremental**: Every 4 hours
- **Full**: Daily at 02:00 UTC
- **Cross-region**: Weekly
- **Archive**: Monthly (1-year retention)

### Recovery Procedures

**Point-in-Time Recovery:**
```bash
# Restore from backup
./scripts/restore-backup.sh --timestamp=2024-01-01T12:00:00Z --region=us-west-2

# Verify restoration
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- \
  node scripts/verify-data-integrity.js
```

**Disaster Recovery:**
```bash
# Failover to secondary region
./scripts/disaster-recovery.sh --target-region=us-east-1

# Update DNS records
aws route53 change-resource-record-sets --hosted-zone-id Z123456 \
  --change-batch file://dns-failover.json
```

## Troubleshooting

### Common Issues

**High Memory Usage:**
```bash
# Check memory usage by component
kubectl top pods -n gh200-system --sort-by=memory

# Restart high-memory pods
kubectl delete pod <pod-name> -n gh200-system
```

**GPU Temperature Issues:**
```bash
# Check GPU temperature
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- nvidia-smi

# Verify cooling system
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- \
  sensors | grep temp
```

**Network Connectivity:**
```bash
# Test internal connectivity
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- \
  curl http://redis:6379

# Check external access
curl -I https://api.gh200.terragon-labs.com
```

### Log Analysis

**Application Logs:**
```bash
# View recent application logs
kubectl logs -n gh200-system -l app.kubernetes.io/name=gh200-retrieval-router --tail=1000

# Search for errors
kubectl logs -n gh200-system -l app.kubernetes.io/name=gh200-retrieval-router | grep ERROR
```

**System Logs:**
```bash
# Check node system logs
kubectl logs -n kube-system -l app=node-exporter

# Review kubelet logs
journalctl -u kubelet -f
```

## Contact Information

### On-Call Rotations
- **Primary**: +1-555-GH200-OPS
- **Secondary**: +1-555-GH200-DEV
- **Escalation**: +1-555-GH200-MGR

### Team Contacts
- **Operations Team**: ops@terragon-labs.com
- **Development Team**: dev@terragon-labs.com
- **Security Team**: security@terragon-labs.com
- **Compliance Team**: compliance@terragon-labs.com

### External Vendors
- **NVIDIA Support**: Enterprise Support Portal
- **AWS Support**: Enterprise Support (Case Priority: High)
- **Kubernetes Support**: CNCF Support Channels

## SLA Commitments

| Metric | Target | Measurement |
|--------|--------|-------------|
| Uptime | 99.99% | Monthly |
| Response Time (P99) | <50ms | 5-minute rolling average |
| Recovery Time Objective (RTO) | <1 hour | Per incident |
| Recovery Point Objective (RPO) | <5 minutes | Data loss maximum |
| Mean Time to Recovery (MTTR) | <30 minutes | Average per month |

---

**Document Version**: 1.0  
**Last Updated**: 2024-01-01  
**Next Review**: 2024-04-01  
**Owner**: Terragon Labs Operations Team