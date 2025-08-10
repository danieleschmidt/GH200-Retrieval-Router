#!/bin/bash

# Blue-Green Deployment Script for GH200 Retrieval Router
# Provides zero-downtime deployments with automatic rollback capability

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
NAMESPACE="${NAMESPACE:-gh200-system}"
RELEASE_NAME="${RELEASE_NAME:-gh200-retrieval-router}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ENVIRONMENT="${ENVIRONMENT:-production}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-300}"
TRAFFIC_SWITCH_WAIT="${TRAFFIC_SWITCH_WAIT:-60}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Validate prerequisites
validate_prerequisites() {
    log_info "Validating prerequisites..."
    
    local required_commands=("kubectl" "helm" "jq" "curl")
    for cmd in "${required_commands[@]}"; do
        if ! command_exists "$cmd"; then
            log_error "Required command '$cmd' not found"
            exit 1
        fi
    done
    
    # Check kubectl connection
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check namespace exists
    if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
        log_error "Namespace '$NAMESPACE' does not exist"
        exit 1
    fi
    
    log_success "Prerequisites validated"
}

# Function to determine current active color
get_current_color() {
    local current_service
    current_service=$(kubectl get ingress gh200-ingress -n "$NAMESPACE" -o json 2>/dev/null | jq -r '.spec.rules[0].http.paths[0].backend.service.name' 2>/dev/null || echo "")
    
    if [[ "$current_service" == *"-blue" ]]; then
        echo "blue"
    elif [[ "$current_service" == *"-green" ]]; then
        echo "green"
    else
        # Default to blue if no specific color found
        echo "blue"
    fi
}

# Function to get inactive color
get_inactive_color() {
    local current_color="$1"
    if [[ "$current_color" == "blue" ]]; then
        echo "green"
    else
        echo "blue"
    fi
}

# Function to backup current deployment
backup_deployment() {
    local backup_dir="$PROJECT_ROOT/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    log_info "Creating backup in $backup_dir"
    
    # Backup Helm values
    if helm get values "$RELEASE_NAME" -n "$NAMESPACE" > "$backup_dir/helm-values.yaml" 2>/dev/null; then
        log_success "Helm values backed up"
    else
        log_warn "Could not backup Helm values (release may not exist)"
    fi
    
    # Backup Kubernetes resources
    kubectl get statefulset,service,ingress,configmap,secret -n "$NAMESPACE" -o yaml > "$backup_dir/k8s-resources.yaml" 2>/dev/null || log_warn "Could not backup all resources"
    
    echo "$backup_dir" > /tmp/gh200_backup_path
    log_success "Backup created at $backup_dir"
}

# Function to deploy to inactive environment
deploy_inactive() {
    local target_color="$1"
    local release_name="${RELEASE_NAME}-${target_color}"
    
    log_info "Deploying to $target_color environment ($release_name)"
    
    # Prepare Helm values
    local values_file="/tmp/gh200-values-${target_color}.yaml"
    cat > "$values_file" <<EOF
nameOverride: gh200-retrieval-router-${target_color}
fullnameOverride: gh200-retrieval-router-${target_color}

image:
  tag: ${IMAGE_TAG}

environment: ${ENVIRONMENT}

ingress:
  enabled: false  # We'll manage ingress separately

service:
  name: gh200-retrieval-router-${target_color}

resources:
  requests:
    memory: "200Gi"
    cpu: "8"
  limits:
    memory: "400Gi"
    cpu: "16"

autoscaling:
  enabled: true
  minReplicas: 4
  maxReplicas: 32

nodeSelector:
  nvidia.com/gpu.product: "NVIDIA-GH200-480GB"

tolerations:
  - key: nvidia.com/gpu
    operator: Exists
    effect: NoSchedule
  - key: gh200-node
    operator: Equal
    value: "true"
    effect: NoSchedule

config:
  performance:
    targetQps: 125000
    targetRagQps: 450
    graceMemorySize: 480
EOF

    # Deploy with Helm
    if helm upgrade --install "$release_name" "$PROJECT_ROOT/helm/gh200-retrieval-router" \
        --namespace "$NAMESPACE" \
        --values "$values_file" \
        --wait \
        --timeout=15m; then
        log_success "Deployment to $target_color environment completed"
    else
        log_error "Deployment to $target_color environment failed"
        return 1
    fi
    
    # Clean up temporary values file
    rm -f "$values_file"
}

# Function to wait for deployment readiness
wait_for_readiness() {
    local color="$1"
    local service_name="gh200-retrieval-router-${color}"
    
    log_info "Waiting for $color environment to be ready..."
    
    # Wait for pods to be ready
    if kubectl wait --for=condition=ready pod \
        -l "app.kubernetes.io/name=gh200-retrieval-router-${color}" \
        -n "$NAMESPACE" \
        --timeout="${HEALTH_CHECK_TIMEOUT}s"; then
        log_success "Pods in $color environment are ready"
    else
        log_error "Pods in $color environment failed to become ready"
        return 1
    fi
    
    # Wait for service endpoints
    local max_attempts=30
    local attempt=0
    while [[ $attempt -lt $max_attempts ]]; do
        local endpoints
        endpoints=$(kubectl get endpoints "$service_name" -n "$NAMESPACE" -o json 2>/dev/null | jq -r '.subsets[0].addresses // [] | length' 2>/dev/null || echo "0")
        
        if [[ "$endpoints" -gt 0 ]]; then
            log_success "Service endpoints ready in $color environment"
            return 0
        fi
        
        attempt=$((attempt + 1))
        log_info "Waiting for service endpoints... ($attempt/$max_attempts)"
        sleep 10
    done
    
    log_error "Service endpoints not ready in $color environment"
    return 1
}

# Function to run health checks
run_health_checks() {
    local color="$1"
    local service_name="gh200-retrieval-router-${color}"
    
    log_info "Running health checks for $color environment"
    
    # Port-forward for testing
    local local_port=18080
    kubectl port-forward "service/$service_name" "$local_port:8080" -n "$NAMESPACE" >/dev/null 2>&1 &
    local port_forward_pid=$!
    
    # Give port-forward time to establish
    sleep 5
    
    local health_check_passed=false
    local max_attempts=10
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -f -s "http://localhost:$local_port/health" >/dev/null; then
            log_success "Health check passed for $color environment"
            health_check_passed=true
            break
        fi
        
        attempt=$((attempt + 1))
        log_info "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep 10
    done
    
    # Clean up port-forward
    kill $port_forward_pid 2>/dev/null || true
    
    if [[ "$health_check_passed" == "false" ]]; then
        log_error "Health checks failed for $color environment"
        return 1
    fi
    
    return 0
}

# Function to run smoke tests
run_smoke_tests() {
    local color="$1"
    local service_name="gh200-retrieval-router-${color}"
    
    log_info "Running smoke tests for $color environment"
    
    # Port-forward for testing
    local local_port=18081
    kubectl port-forward "service/$service_name" "$local_port:8080" -n "$NAMESPACE" >/dev/null 2>&1 &
    local port_forward_pid=$!
    
    sleep 5
    
    local tests_passed=true
    
    # Test API endpoints
    local endpoints=("/health" "/ping" "/api/v1/metrics")
    for endpoint in "${endpoints[@]}"; do
        if ! curl -f -s "http://localhost:$local_port$endpoint" >/dev/null; then
            log_error "Smoke test failed for endpoint: $endpoint"
            tests_passed=false
        else
            log_success "Smoke test passed for endpoint: $endpoint"
        fi
    done
    
    # Clean up port-forward
    kill $port_forward_pid 2>/dev/null || true
    
    if [[ "$tests_passed" == "false" ]]; then
        log_error "Smoke tests failed for $color environment"
        return 1
    fi
    
    log_success "All smoke tests passed for $color environment"
    return 0
}

# Function to switch traffic
switch_traffic() {
    local target_color="$1"
    local service_name="gh200-retrieval-router-${target_color}"
    
    log_info "Switching traffic to $target_color environment"
    
    # Update ingress to point to new service
    if kubectl patch ingress gh200-ingress -n "$NAMESPACE" --type='json' \
        -p="[{\"op\": \"replace\", \"path\": \"/spec/rules/0/http/paths/0/backend/service/name\", \"value\": \"$service_name\"}]"; then
        log_success "Ingress updated to point to $target_color environment"
    else
        log_error "Failed to update ingress"
        return 1
    fi
    
    # Wait for traffic to switch
    log_info "Waiting ${TRAFFIC_SWITCH_WAIT}s for traffic to switch..."
    sleep "$TRAFFIC_SWITCH_WAIT"
    
    return 0
}

# Function to verify production traffic
verify_production_traffic() {
    log_info "Verifying production traffic"
    
    # Get ingress hostname
    local hostname
    hostname=$(kubectl get ingress gh200-ingress -n "$NAMESPACE" -o json | jq -r '.spec.rules[0].host' 2>/dev/null || echo "")
    
    if [[ -z "$hostname" ]]; then
        log_warn "Could not determine ingress hostname, skipping traffic verification"
        return 0
    fi
    
    # Test external access
    local max_attempts=5
    local attempt=0
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -f -s "https://$hostname/health" >/dev/null; then
            log_success "Production traffic verification successful"
            return 0
        fi
        
        attempt=$((attempt + 1))
        log_info "Production traffic verification attempt $attempt/$max_attempts failed, retrying..."
        sleep 10
    done
    
    log_error "Production traffic verification failed"
    return 1
}

# Function to cleanup old deployment
cleanup_old_deployment() {
    local old_color="$1"
    local old_release_name="${RELEASE_NAME}-${old_color}"
    
    log_info "Cleaning up old $old_color deployment"
    
    if helm list -n "$NAMESPACE" | grep -q "$old_release_name"; then
        if helm uninstall "$old_release_name" -n "$NAMESPACE"; then
            log_success "Old $old_color deployment cleaned up"
        else
            log_warn "Failed to cleanup old $old_color deployment, manual cleanup may be required"
        fi
    else
        log_info "No old $old_color deployment to cleanup"
    fi
}

# Function to rollback deployment
rollback_deployment() {
    local current_color="$1"
    local backup_dir="$2"
    
    log_error "Rolling back deployment"
    
    # Switch traffic back to previous environment if possible
    local previous_color
    previous_color=$(get_inactive_color "$current_color")
    
    if kubectl get service "gh200-retrieval-router-${previous_color}" -n "$NAMESPACE" >/dev/null 2>&1; then
        log_info "Switching traffic back to $previous_color environment"
        switch_traffic "$previous_color"
    fi
    
    # Remove failed deployment
    local failed_release="${RELEASE_NAME}-${current_color}"
    if helm list -n "$NAMESPACE" | grep -q "$failed_release"; then
        helm uninstall "$failed_release" -n "$NAMESPACE" || log_warn "Failed to remove failed deployment"
    fi
    
    log_error "Rollback completed. Check logs and backup at $backup_dir for investigation"
}

# Main deployment function
main() {
    log_info "Starting Blue-Green Deployment for GH200 Retrieval Router"
    log_info "Environment: $ENVIRONMENT"
    log_info "Image Tag: $IMAGE_TAG"
    log_info "Namespace: $NAMESPACE"
    
    # Validate prerequisites
    validate_prerequisites
    
    # Create backup
    backup_deployment
    local backup_dir
    backup_dir=$(cat /tmp/gh200_backup_path)
    
    # Determine current and target colors
    local current_color
    current_color=$(get_current_color)
    local target_color
    target_color=$(get_inactive_color "$current_color")
    
    log_info "Current active environment: $current_color"
    log_info "Deploying to environment: $target_color"
    
    # Deploy to inactive environment
    if ! deploy_inactive "$target_color"; then
        log_error "Deployment failed"
        exit 1
    fi
    
    # Wait for readiness
    if ! wait_for_readiness "$target_color"; then
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            rollback_deployment "$target_color" "$backup_dir"
        fi
        exit 1
    fi
    
    # Run health checks
    if ! run_health_checks "$target_color"; then
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            rollback_deployment "$target_color" "$backup_dir"
        fi
        exit 1
    fi
    
    # Run smoke tests
    if ! run_smoke_tests "$target_color"; then
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            rollback_deployment "$target_color" "$backup_dir"
        fi
        exit 1
    fi
    
    # Switch traffic
    if ! switch_traffic "$target_color"; then
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            rollback_deployment "$target_color" "$backup_dir"
        fi
        exit 1
    fi
    
    # Verify production traffic
    if ! verify_production_traffic; then
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            rollback_deployment "$target_color" "$backup_dir"
        fi
        exit 1
    fi
    
    # Cleanup old deployment
    cleanup_old_deployment "$current_color"
    
    log_success "Blue-Green Deployment completed successfully!"
    log_success "Active environment: $target_color"
    log_info "Backup location: $backup_dir"
    
    # Cleanup temp files
    rm -f /tmp/gh200_backup_path
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        cat << EOF
GH200 Blue-Green Deployment Script

Usage: $0 [options]

Environment Variables:
  NAMESPACE                 Kubernetes namespace (default: gh200-system)
  RELEASE_NAME             Helm release name (default: gh200-retrieval-router)  
  IMAGE_TAG                Docker image tag to deploy (default: latest)
  ENVIRONMENT              Deployment environment (default: production)
  HEALTH_CHECK_TIMEOUT     Health check timeout in seconds (default: 300)
  TRAFFIC_SWITCH_WAIT      Wait time after traffic switch in seconds (default: 60)
  ROLLBACK_ON_FAILURE      Auto-rollback on failure (default: true)

Examples:
  IMAGE_TAG=v1.2.3 $0
  ENVIRONMENT=staging ROLLBACK_ON_FAILURE=false $0

EOF
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac