# GH200 Retrieval Router Terraform Variables

variable "aws_region" {
  description = "AWS region for the infrastructure"
  type        = string
  default     = "us-west-2"
  
  validation {
    condition = can(regex("^[a-z0-9-]+$", var.aws_region))
    error_message = "AWS region must be a valid region identifier."
  }
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "gh200-retrieval-router"
  
  validation {
    condition     = can(regex("^[a-zA-Z][-a-zA-Z0-9]*$", var.cluster_name))
    error_message = "Cluster name must start with a letter and contain only alphanumeric characters and hyphens."
  }
}

variable "kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.27"
  
  validation {
    condition     = can(regex("^[0-9]+\\.[0-9]+$", var.kubernetes_version))
    error_message = "Kubernetes version must be in format X.Y (e.g., 1.27)."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access the cluster"
  type        = list(string)
  default     = ["0.0.0.0/0"]
  
  validation {
    condition = alltrue([
      for cidr in var.allowed_cidr_blocks : can(cidrhost(cidr, 0))
    ])
    error_message = "All CIDR blocks must be valid IPv4 CIDR blocks."
  }
}

# Node Group Configuration
variable "desired_capacity" {
  description = "Desired number of GH200 nodes"
  type        = number
  default     = 4
  
  validation {
    condition     = var.desired_capacity >= 1 && var.desired_capacity <= 100
    error_message = "Desired capacity must be between 1 and 100."
  }
}

variable "min_capacity" {
  description = "Minimum number of GH200 nodes"
  type        = number
  default     = 4
  
  validation {
    condition     = var.min_capacity >= 1 && var.min_capacity <= 100
    error_message = "Minimum capacity must be between 1 and 100."
  }
}

variable "max_capacity" {
  description = "Maximum number of GH200 nodes"
  type        = number
  default     = 32
  
  validation {
    condition     = var.max_capacity >= 1 && var.max_capacity <= 100
    error_message = "Maximum capacity must be between 1 and 100."
  }
}

variable "node_instance_types" {
  description = "Instance types for GH200 nodes"
  type        = list(string)
  default     = ["p5.48xlarge", "p4de.24xlarge"]
  
  validation {
    condition = alltrue([
      for instance_type in var.node_instance_types :
      contains(["p5.48xlarge", "p4de.24xlarge", "p3dn.24xlarge"], instance_type)
    ])
    error_message = "Instance types must be suitable for GPU workloads."
  }
}

# Storage Configuration
variable "prometheus_storage_size" {
  description = "Storage size for Prometheus in GB"
  type        = number
  default     = 100
  
  validation {
    condition     = var.prometheus_storage_size >= 20 && var.prometheus_storage_size <= 1000
    error_message = "Prometheus storage size must be between 20 and 1000 GB."
  }
}

variable "grafana_admin_password" {
  description = "Admin password for Grafana"
  type        = string
  default     = ""
  sensitive   = true
  
  validation {
    condition     = length(var.grafana_admin_password) >= 8 || var.grafana_admin_password == ""
    error_message = "Grafana admin password must be at least 8 characters long if provided."
  }
}

# Feature Flags
variable "enable_monitoring" {
  description = "Enable monitoring stack (Prometheus, Grafana, etc.)"
  type        = bool
  default     = true
}

variable "enable_logging" {
  description = "Enable centralized logging (ELK stack)"
  type        = bool
  default     = true
}

variable "enable_service_mesh" {
  description = "Enable service mesh (Istio)"
  type        = bool
  default     = false
}

variable "enable_auto_scaling" {
  description = "Enable cluster auto-scaling"
  type        = bool
  default     = true
}

variable "enable_spot_instances" {
  description = "Use spot instances for cost optimization"
  type        = bool
  default     = false
}

# Security Configuration
variable "enable_private_cluster" {
  description = "Enable private EKS cluster endpoint"
  type        = bool
  default     = true
}

variable "enable_irsa" {
  description = "Enable IAM Roles for Service Accounts"
  type        = bool
  default     = true
}

variable "enable_network_policy" {
  description = "Enable Kubernetes network policies"
  type        = bool
  default     = true
}

# Performance Configuration
variable "enable_gpu_sharing" {
  description = "Enable GPU sharing for better resource utilization"
  type        = bool
  default     = false
}

variable "enable_nvlink" {
  description = "Enable NVLink optimization for GH200"
  type        = bool
  default     = true
}

variable "grace_memory_size" {
  description = "Grace memory size in GB per node"
  type        = number
  default     = 480
  
  validation {
    condition     = var.grace_memory_size >= 240 && var.grace_memory_size <= 480
    error_message = "Grace memory size must be between 240 and 480 GB for GH200."
  }
}

# Backup and Disaster Recovery
variable "enable_backup" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 30
  
  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 365
    error_message = "Backup retention must be between 1 and 365 days."
  }
}

# Multi-region Configuration
variable "enable_multi_region" {
  description = "Enable multi-region deployment"
  type        = bool
  default     = false
}

variable "secondary_regions" {
  description = "List of secondary regions for multi-region deployment"
  type        = list(string)
  default     = ["us-east-1", "eu-west-1"]
}

# Compliance and Governance
variable "enable_compliance_monitoring" {
  description = "Enable compliance monitoring (GDPR, CCPA, etc.)"
  type        = bool
  default     = true
}

variable "enable_audit_logging" {
  description = "Enable Kubernetes audit logging"
  type        = bool
  default     = true
}

variable "data_residency_region" {
  description = "Region for data residency compliance"
  type        = string
  default     = ""
}

# Cost Optimization
variable "enable_cost_optimization" {
  description = "Enable cost optimization features"
  type        = bool
  default     = true
}

variable "reserved_instance_percentage" {
  description = "Percentage of capacity to cover with reserved instances"
  type        = number
  default     = 50
  
  validation {
    condition     = var.reserved_instance_percentage >= 0 && var.reserved_instance_percentage <= 100
    error_message = "Reserved instance percentage must be between 0 and 100."
  }
}

# Development and Testing
variable "enable_development_tools" {
  description = "Enable development and debugging tools"
  type        = bool
  default     = false
}

variable "enable_performance_testing" {
  description = "Enable performance testing infrastructure"
  type        = bool
  default     = true
}

# Tags
variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
  
  validation {
    condition = alltrue([
      for key, value in var.additional_tags :
      can(regex("^[a-zA-Z0-9\\s\\-_.:+/=\\\\@]+$", key)) &&
      can(regex("^[a-zA-Z0-9\\s\\-_.:+/=\\\\@]+$", value))
    ])
    error_message = "Tag keys and values must contain only valid characters."
  }
}