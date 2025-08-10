# GH200 Incident Response Runbook

## Overview

This runbook provides step-by-step procedures for responding to incidents in the GH200 Retrieval Router production environment. Follow these procedures to minimize downtime and ensure rapid recovery.

## Incident Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| **P0 - Critical** | Complete service outage, data loss, security breach | 5 minutes | Immediate |
| **P1 - High** | Significant performance degradation, partial outage | 15 minutes | Within 1 hour |
| **P2 - Medium** | Minor performance issues, non-critical functionality affected | 1 hour | Within 4 hours |
| **P3 - Low** | Cosmetic issues, enhancement requests | 24 hours | Next business day |

## General Incident Response Process

### 1. Detection and Alert
- Monitor alerts from Prometheus/Grafana
- Check PagerDuty notifications
- Review health check failures
- Validate with external monitoring tools

### 2. Initial Response (0-5 minutes)
1. **Acknowledge the Alert**
   ```bash
   # Acknowledge in PagerDuty
   # Post in Slack: #gh200-incidents
   ```

2. **Quick Status Check**
   ```bash
   # Check overall system health
   curl -s https://api.gh200.terragon-labs.com/health
   
   # Verify Kubernetes cluster
   kubectl cluster-info
   kubectl get nodes
   kubectl get pods -n gh200-system
   ```

3. **Create Incident Channel**
   ```
   Slack Channel: #incident-YYYY-MM-DD-HHMM
   Zoom Room: https://terragon-labs.zoom.us/j/emergency
   ```

### 3. Assessment Phase (5-15 minutes)
1. **Determine Scope and Impact**
2. **Check Recent Changes**
3. **Review Error Logs**
4. **Identify Root Cause**

### 4. Mitigation and Recovery
1. **Execute Recovery Procedures**
2. **Monitor System Response**
3. **Verify Full Recovery**
4. **Document Actions Taken**

### 5. Post-Incident
1. **Update Status Page**
2. **Send Customer Communications**
3. **Schedule Post-Mortem**
4. **Create Incident Report**

## P0 - Critical Incidents

### Service Complete Outage

**Symptoms:**
- All health checks failing
- No response from API endpoints
- 100% error rate in monitoring

**Investigation Steps:**
```bash
# 1. Check pod status
kubectl get pods -n gh200-system -o wide

# 2. Check node status
kubectl get nodes -o wide
kubectl describe nodes

# 3. Check recent events
kubectl get events -n gh200-system --sort-by=.metadata.creationTimestamp

# 4. Review application logs
kubectl logs -n gh200-system -l app.kubernetes.io/name=gh200-retrieval-router --tail=100
```

**Recovery Actions:**

**Option 1: Pod Restart**
```bash
# Restart all pods in the StatefulSet
kubectl rollout restart statefulset gh200-retrieval-router -n gh200-system

# Wait for rollout to complete
kubectl rollout status statefulset gh200-retrieval-router -n gh200-system --timeout=300s
```

**Option 2: Scale Up**
```bash
# Scale up the StatefulSet
kubectl scale statefulset gh200-retrieval-router --replicas=8 -n gh200-system

# Monitor pod creation
watch kubectl get pods -n gh200-system
```

**Option 3: Emergency Rollback**
```bash
# Check rollout history
kubectl rollout history statefulset gh200-retrieval-router -n gh200-system

# Rollback to previous version
kubectl rollout undo statefulset gh200-retrieval-router -n gh200-system

# Monitor rollback progress
kubectl rollout status statefulset gh200-retrieval-router -n gh200-system
```

**Option 4: Blue-Green Failover**
```bash
# Switch to backup environment
./scripts/deployment/blue-green-deployment.sh --rollback

# Update DNS if necessary
aws route53 change-resource-record-sets --cli-input-json file://dns-failover.json
```

### GPU Hardware Failure

**Symptoms:**
- CUDA out of memory errors
- GPU temperature alerts
- nvidia-smi command failures

**Investigation Steps:**
```bash
# 1. Check GPU status on all nodes
for node in $(kubectl get nodes -l nvidia.com/gpu.product=NVIDIA-GH200-480GB -o name); do
  echo "=== $node ==="
  kubectl debug $node -it --image=nvidia/cuda:12.2-runtime-ubuntu22.04 -- nvidia-smi
done

# 2. Check GPU temperatures
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- nvidia-smi -q -d temperature

# 3. Review DCGM metrics
kubectl exec -it dcgm-exporter-xxxx -n kube-system -- dcgmi diag -r 1
```

**Recovery Actions:**

**Option 1: Node Cordoning and Draining**
```bash
# Identify problematic node
PROBLEM_NODE="ip-10-0-1-100.us-west-2.compute.internal"

# Cordon the node
kubectl cordon $PROBLEM_NODE

# Drain the node
kubectl drain $PROBLEM_NODE --ignore-daemonsets --delete-emptydir-data --force

# Verify pods rescheduled
kubectl get pods -n gh200-system -o wide
```

**Option 2: Force Pod Rescheduling**
```bash
# Delete pods on problematic node
kubectl delete pod -n gh200-system -l app.kubernetes.io/name=gh200-retrieval-router \
  --field-selector spec.nodeName=$PROBLEM_NODE

# Monitor pod rescheduling
watch kubectl get pods -n gh200-system -o wide
```

**Option 3: Emergency Node Replacement**
```bash
# Terminate problematic node (AWS Auto Scaling will replace)
aws ec2 terminate-instances --instance-ids i-1234567890abcdef0

# Wait for new node to join cluster
watch kubectl get nodes
```

### Database/Redis Failure

**Symptoms:**
- Cache miss rate at 100%
- Connection timeouts to Redis
- Data inconsistency errors

**Investigation Steps:**
```bash
# 1. Check Redis pod status
kubectl get pods -n gh200-system -l app=redis

# 2. Check Redis connectivity
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- \
  redis-cli -h redis ping

# 3. Review Redis logs
kubectl logs -n gh200-system -l app=redis --tail=100

# 4. Check Redis metrics
kubectl exec -it redis-0 -n gh200-system -- redis-cli info memory
```

**Recovery Actions:**

**Option 1: Redis Restart**
```bash
# Restart Redis pods
kubectl delete pod -n gh200-system -l app=redis

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=redis -n gh200-system --timeout=300s

# Verify Redis connectivity
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- \
  redis-cli -h redis ping
```

**Option 2: Redis Data Recovery**
```bash
# Check if Redis data is corrupted
kubectl exec -it redis-0 -n gh200-system -- redis-cli --rdb /data/dump.rdb

# Restore from backup if necessary
kubectl cp redis-backup.rdb gh200-system/redis-0:/data/dump.rdb

# Restart Redis to load backup
kubectl delete pod redis-0 -n gh200-system
```

## P1 - High Priority Incidents

### Performance Degradation

**Symptoms:**
- Response times > 200ms (P99)
- QPS below 50K
- High error rates (>5%)

**Investigation Steps:**
```bash
# 1. Check current performance metrics
curl -s https://api.gh200.terragon-labs.com/api/v1/metrics | grep -E "(response_time|requests_total|errors_total)"

# 2. Check resource utilization
kubectl top nodes
kubectl top pods -n gh200-system

# 3. Review slow query logs
kubectl logs -n gh200-system -l app.kubernetes.io/name=gh200-retrieval-router | grep "slow_query"
```

**Recovery Actions:**

**Option 1: Horizontal Scaling**
```bash
# Increase replica count
kubectl patch hpa gh200-hpa -n gh200-system -p '{"spec":{"minReplicas":8,"maxReplicas":16}}'

# Monitor scaling progress
watch kubectl get pods -n gh200-system
```

**Option 2: Resource Adjustment**
```bash
# Increase resource limits
kubectl patch statefulset gh200-retrieval-router -n gh200-system -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"retrieval-router","resources":{"limits":{"memory":"500Gi","cpu":"20"}}}]}}}}'

# Wait for rollout
kubectl rollout status statefulset gh200-retrieval-router -n gh200-system
```

**Option 3: Cache Optimization**
```bash
# Clear cache to force refresh
kubectl exec -it redis-0 -n gh200-system -- redis-cli flushall

# Restart application to reinitialize cache
kubectl rollout restart statefulset gh200-retrieval-router -n gh200-system
```

### Memory Leak Detection

**Symptoms:**
- Increasing memory usage over time
- Out of Memory (OOM) kills
- Grace memory utilization > 95%

**Investigation Steps:**
```bash
# 1. Check memory usage trends
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- \
  curl localhost:8080/api/v1/metrics | grep memory

# 2. Generate heap dump
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- \
  node --heapsnapshot --max-old-space-size=8192 scripts/heap-snapshot.js

# 3. Check for memory leaks
kubectl exec -it gh200-retrieval-router-0 -n gh200-system -- \
  node --inspect=0.0.0.0:9229 src/index.js
```

**Recovery Actions:**

**Option 1: Restart Affected Pods**
```bash
# Identify high-memory pods
kubectl top pods -n gh200-system --sort-by=memory

# Restart high-memory pods one by one
kubectl delete pod gh200-retrieval-router-0 -n gh200-system
kubectl wait --for=condition=ready pod gh200-retrieval-router-0 -n gh200-system --timeout=300s
```

**Option 2: Increase Memory Limits**
```bash
# Temporarily increase memory limits
kubectl patch statefulset gh200-retrieval-router -n gh200-system -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"retrieval-router","resources":{"limits":{"memory":"600Gi"}}}]}}}}'
```

## P2 - Medium Priority Incidents

### Security Alert Response

**Symptoms:**
- Falco security alerts
- Unusual network traffic patterns
- Failed authentication attempts spike

**Investigation Steps:**
```bash
# 1. Review security alerts
kubectl logs -n falco-system -l app=falco --since=1h | grep ALERT

# 2. Check authentication logs
kubectl logs -n gh200-system -l app.kubernetes.io/name=gh200-retrieval-router | grep "auth_failure"

# 3. Review network policies
kubectl get networkpolicies -n gh200-system
```

**Response Actions:**

**Option 1: Enable Security Mode**
```bash
# Enable strict security mode
kubectl patch configmap gh200-config -n gh200-system -p \
  '{"data":{"ENABLE_STRICT_SECURITY":"true","RATE_LIMIT_MAX":"1000"}}'

# Restart application to apply changes
kubectl rollout restart statefulset gh200-retrieval-router -n gh200-system
```

**Option 2: Block Suspicious IPs**
```bash
# Add IP to blocklist
kubectl patch configmap gh200-config -n gh200-system -p \
  '{"data":{"BLOCKED_IPS":"192.168.1.100,10.0.0.50"}}'
```

### Certificate Expiration

**Symptoms:**
- TLS certificate warnings
- HTTPS connection failures
- Certificate expiry alerts

**Investigation Steps:**
```bash
# 1. Check certificate expiration
kubectl get secret gh200-tls -n gh200-system -o json | \
  jq -r '.data."tls.crt"' | base64 -d | openssl x509 -text -noout

# 2. Verify cert-manager status
kubectl get certificates -n gh200-system
kubectl describe certificate gh200-tls -n gh200-system
```

**Recovery Actions:**

**Option 1: Force Certificate Renewal**
```bash
# Delete certificate to trigger renewal
kubectl delete certificate gh200-tls -n gh200-system

# Wait for new certificate
kubectl wait --for=condition=ready certificate gh200-tls -n gh200-system --timeout=300s
```

## Post-Incident Procedures

### Immediate Cleanup
1. **Verify Full Service Recovery**
2. **Update Status Page**
3. **Notify Stakeholders**
4. **Document Timeline**

### Follow-up Actions
1. **Schedule Post-Mortem Meeting**
2. **Create Incident Report**
3. **Identify Preventive Measures**
4. **Update Monitoring/Alerting**

### Post-Mortem Template
```markdown
# Incident Post-Mortem - YYYY-MM-DD

## Summary
- **Incident Date**: 
- **Duration**: 
- **Severity**: 
- **Impact**: 

## Timeline
- **XX:XX UTC** - Incident detected
- **XX:XX UTC** - Initial response
- **XX:XX UTC** - Root cause identified
- **XX:XX UTC** - Mitigation applied
- **XX:XX UTC** - Full recovery

## Root Cause
- **Primary Cause**: 
- **Contributing Factors**: 

## Resolution
- **Actions Taken**: 
- **Effectiveness**: 

## Lessons Learned
- **What went well**: 
- **What could be improved**: 

## Action Items
- [ ] Preventive measure 1
- [ ] Monitoring improvement 2
- [ ] Process enhancement 3
```

## Emergency Contacts

### Internal Teams
- **On-Call Engineer**: +1-555-GH200-OPS
- **Engineering Manager**: +1-555-GH200-MGR
- **Security Team**: security@terragon-labs.com
- **Executive On-Call**: +1-555-EXEC-ONC

### External Vendors
- **AWS Enterprise Support**: Case Priority High
- **NVIDIA Enterprise Support**: Priority Support Portal
- **Kubernetes Support**: CNCF Slack #support

### Communication Channels
- **Status Updates**: https://status.terragon-labs.com
- **Customer Communications**: support@terragon-labs.com
- **Internal Incidents**: #gh200-incidents (Slack)
- **Executive Updates**: #executive-alerts (Slack)

---

**Document Version**: 1.0  
**Last Updated**: 2024-01-01  
**Owner**: Terragon Labs SRE Team  
**Review Cycle**: Quarterly