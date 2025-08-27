# Generation 5 Cluster Variables

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "cluster_version" {
  description = "Kubernetes cluster version"
  type        = string
  default     = "1.28"
}

variable "quantum_node_count" {
  description = "Number of quantum research nodes"
  type = object({
    desired = number
    min     = number
    max     = number
  })
  default = {
    desired = 3
    min     = 1
    max     = 6
  }
}

variable "evolution_node_count" {
  description = "Number of evolution engine nodes"
  type = object({
    desired = number
    min     = number
    max     = number
  })
  default = {
    desired = 2
    min     = 1
    max     = 4
  }
}

variable "quantum_research_config" {
  description = "Quantum research system configuration"
  type = object({
    quantum_state_count     = number
    coherence_threshold     = number
    entanglement_depth      = number
    target_latency_ms       = number
    target_throughput_qps   = number
    experimental_features   = bool
    benchmarking_enabled    = bool
  })
  default = {
    quantum_state_count     = 4096
    coherence_threshold     = 0.97
    entanglement_depth      = 12
    target_latency_ms       = 5
    target_throughput_qps   = 2000000
    experimental_features   = true
    benchmarking_enabled    = true
  }
}

variable "self_evolution_config" {
  description = "Self-evolution engine configuration"
  type = object({
    evolution_cycles        = number
    mutation_rate          = number
    crossover_rate         = number
    selection_pressure     = number
    performance_threshold  = number
    max_evolution_depth    = number
    safety_checks_enabled  = bool
    autonomous_code_gen    = bool
  })
  default = {
    evolution_cycles        = 1000
    mutation_rate          = 0.08
    crossover_rate         = 0.7
    selection_pressure     = 0.8
    performance_threshold  = 0.03
    max_evolution_depth    = 15
    safety_checks_enabled  = true
    autonomous_code_gen    = true
  }
}

variable "cross_system_integration" {
  description = "Cross-system learning and integration settings"
  type = object({
    enabled           = bool
    integration_mode  = string
    synergy_detection = bool
    learning_rate     = number
  })
  default = {
    enabled           = true
    integration_mode  = "synergistic"
    synergy_detection = true
    learning_rate     = 0.01
  }
}

variable "storage_config" {
  description = "Storage configuration for quantum research and evolution"
  type = object({
    quantum_research_storage_size = string
    evolution_models_storage_size = string
    research_results_storage_size = string
    storage_class                 = string
    backup_enabled               = bool
    encryption_enabled           = bool
  })
  default = {
    quantum_research_storage_size = "1Ti"
    evolution_models_storage_size = "500Gi"
    research_results_storage_size = "2Ti"
    storage_class                 = "gp3"
    backup_enabled               = true
    encryption_enabled           = true
  }
}

variable "networking_config" {
  description = "Advanced networking configuration for Generation 5"
  type = object({
    vpc_cidr                = string
    enable_nvlink_fabric    = bool
    quantum_communication   = bool
    high_bandwidth_inter_az = bool
    dedicated_tenancy       = bool
  })
  default = {
    vpc_cidr                = "10.5.0.0/16"
    enable_nvlink_fabric    = true
    quantum_communication   = true
    high_bandwidth_inter_az = true
    dedicated_tenancy       = false
  }
}

variable "monitoring_config" {
  description = "Monitoring and observability configuration"
  type = object({
    enable_prometheus         = bool
    enable_grafana           = bool
    enable_jaeger_tracing    = bool
    enable_quantum_metrics   = bool
    enable_evolution_metrics = bool
    metrics_retention_days   = number
    alert_manager_enabled    = bool
  })
  default = {
    enable_prometheus         = true
    enable_grafana           = true
    enable_jaeger_tracing    = true
    enable_quantum_metrics   = true
    enable_evolution_metrics = true
    metrics_retention_days   = 90
    alert_manager_enabled    = true
  }
}

variable "security_config" {
  description = "Security configuration for Generation 5 cluster"
  type = object({
    enable_pod_security_policy = bool
    enable_network_policies    = bool
    enable_rbac               = bool
    enable_encryption_at_rest = bool
    enable_encryption_in_transit = bool
    quantum_security_level    = string
    compliance_framework      = string
  })
  default = {
    enable_pod_security_policy = true
    enable_network_policies    = true
    enable_rbac               = true
    enable_encryption_at_rest = true
    enable_encryption_in_transit = true
    quantum_security_level    = "maximum"
    compliance_framework      = "SOC2-GDPR-HIPAA"
  }
}

variable "autoscaling_config" {
  description = "Autoscaling configuration for dynamic resource management"
  type = object({
    enable_cluster_autoscaler = bool
    enable_vpa               = bool
    enable_hpa               = bool
    scale_down_delay         = string
    scale_down_unneeded_time = string
    quantum_scaling_factor   = number
    evolution_scaling_factor = number
  })
  default = {
    enable_cluster_autoscaler = true
    enable_vpa               = true
    enable_hpa               = true
    scale_down_delay         = "10m"
    scale_down_unneeded_time = "10m"
    quantum_scaling_factor   = 1.5
    evolution_scaling_factor = 1.3
  }
}

variable "backup_config" {
  description = "Backup and disaster recovery configuration"
  type = object({
    enable_etcd_backup       = bool
    enable_volume_snapshots  = bool
    backup_schedule         = string
    retention_period_days   = number
    cross_region_backup     = bool
    quantum_state_backup    = bool
    evolution_model_backup  = bool
  })
  default = {
    enable_etcd_backup       = true
    enable_volume_snapshots  = true
    backup_schedule         = "0 2 * * *"
    retention_period_days   = 30
    cross_region_backup     = true
    quantum_state_backup    = true
    evolution_model_backup  = true
  }
}

variable "cost_optimization" {
  description = "Cost optimization settings"
  type = object({
    enable_spot_instances    = bool
    spot_instance_percentage = number
    enable_fargate          = bool
    rightsizing_enabled     = bool
    idle_resource_cleanup   = bool
    cost_allocation_tags    = map(string)
  })
  default = {
    enable_spot_instances    = false  # Disabled for quantum research stability
    spot_instance_percentage = 0
    enable_fargate          = false  # Not suitable for GPU workloads
    rightsizing_enabled     = true
    idle_resource_cleanup   = true
    cost_allocation_tags    = {}
  }
}

variable "research_priorities" {
  description = "Research focus areas and priorities for Generation 5"
  type = object({
    quantum_error_correction     = bool
    neuromorphic_integration     = bool
    edge_quantum_hybrid         = bool
    autonomous_discovery        = bool
    self_replicating_algorithms = bool
    breakthrough_detection      = bool
    cross_domain_transfer       = bool
  })
  default = {
    quantum_error_correction     = true
    neuromorphic_integration     = true
    edge_quantum_hybrid         = true
    autonomous_discovery        = true
    self_replicating_algorithms = true
    breakthrough_detection      = true
    cross_domain_transfer       = true
  }
}

variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}