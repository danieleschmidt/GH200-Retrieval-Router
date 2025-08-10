# GH200 Retrieval Router Terraform Configuration
# High-performance infrastructure for NVIDIA GH200 Grace Hopper Superchip deployments

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.10"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
  
  backend "s3" {
    # Configure your S3 backend
    bucket = "gh200-terraform-state"
    key    = "infrastructure/terraform.tfstate"
    region = "us-west-2"
    
    dynamodb_table = "gh200-terraform-locks"
    encrypt        = true
  }
}

# Configure AWS Provider
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "GH200-Retrieval-Router"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Team        = "Terragon-Labs"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
  
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "aws_caller_identity" "current" {}

# Random suffix for unique resource names
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# Local values
locals {
  cluster_name = "${var.cluster_name}-${var.environment}-${random_string.suffix.result}"
  
  common_tags = {
    ClusterName = local.cluster_name
    Environment = var.environment
    Project     = "GH200-Retrieval-Router"
    ManagedBy   = "Terraform"
  }
  
  # GH200 specific instance types
  gh200_instance_types = [
    "p5.48xlarge",   # 8x GH200 GPUs
    "p4de.24xlarge", # Alternative for testing
  ]
}

# Networking Module
module "networking" {
  source = "./modules/networking"
  
  cluster_name        = local.cluster_name
  vpc_cidr           = var.vpc_cidr
  availability_zones = data.aws_availability_zones.available.names
  environment        = var.environment
  
  tags = local.common_tags
}

# Security Module  
module "security" {
  source = "./modules/security"
  
  cluster_name = local.cluster_name
  vpc_id       = module.networking.vpc_id
  environment  = var.environment
  
  allowed_cidr_blocks = var.allowed_cidr_blocks
  
  tags = local.common_tags
}

# GH200 Cluster Module
module "gh200_cluster" {
  source = "./modules/gh200-cluster"
  
  cluster_name    = local.cluster_name
  cluster_version = var.kubernetes_version
  
  # Networking
  vpc_id          = module.networking.vpc_id
  subnet_ids      = module.networking.private_subnet_ids
  security_groups = [module.security.cluster_security_group_id]
  
  # Node groups
  node_groups = {
    gh200_nodes = {
      instance_types = local.gh200_instance_types
      capacity_type  = "ON_DEMAND"
      
      scaling_config = {
        desired_size = var.desired_capacity
        max_size     = var.max_capacity
        min_size     = var.min_capacity
      }
      
      # GH200 specific configuration
      labels = {
        "nvidia.com/gpu.product" = "NVIDIA-GH200-480GB"
        "node.kubernetes.io/instance-type" = "gh200"
        "terragon.com/workload" = "vector-search"
      }
      
      taints = [
        {
          key    = "nvidia.com/gpu"
          value  = "true"
          effect = "NO_SCHEDULE"
        },
        {
          key    = "gh200-node"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]
    }
    
    system_nodes = {
      instance_types = ["c5.2xlarge", "c5.4xlarge"]
      capacity_type  = "SPOT"
      
      scaling_config = {
        desired_size = 3
        max_size     = 6
        min_size     = 3
      }
      
      labels = {
        "node.kubernetes.io/instance-type" = "system"
        "terragon.com/workload" = "system"
      }
    }
  }
  
  # Cluster add-ons
  cluster_addons = {
    vpc-cni = {
      version = "v1.13.4-eksbuild.1"
    }
    coredns = {
      version = "v1.10.1-eksbuild.1"
    }
    kube-proxy = {
      version = "v1.27.3-eksbuild.1"
    }
    aws-ebs-csi-driver = {
      version = "v1.20.0-eksbuild.1"
    }
  }
  
  environment = var.environment
  tags        = local.common_tags
  
  depends_on = [
    module.networking,
    module.security
  ]
}

# Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"
  
  cluster_name     = local.cluster_name
  cluster_endpoint = module.gh200_cluster.cluster_endpoint
  cluster_ca_cert  = module.gh200_cluster.cluster_certificate_authority_data
  
  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.private_subnet_ids
  
  # Monitoring configuration
  prometheus_storage_size = var.prometheus_storage_size
  grafana_admin_password  = var.grafana_admin_password
  
  environment = var.environment
  tags        = local.common_tags
  
  depends_on = [module.gh200_cluster]
}

# Outputs
output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.gh200_cluster.cluster_endpoint
}

output "cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.gh200_cluster.cluster_security_group_id
}

output "cluster_iam_role_arn" {
  description = "IAM role ARN associated with EKS cluster"
  value       = module.gh200_cluster.cluster_iam_role_arn
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = module.gh200_cluster.cluster_certificate_authority_data
}

output "cluster_name" {
  description = "The name of the EKS cluster"
  value       = local.cluster_name
}

output "vpc_id" {
  description = "ID of the VPC where the cluster is deployed"
  value       = module.networking.vpc_id
}

output "private_subnet_ids" {
  description = "List of IDs of the private subnets"
  value       = module.networking.private_subnet_ids
}

output "public_subnet_ids" {
  description = "List of IDs of the public subnets"
  value       = module.networking.public_subnet_ids
}

output "prometheus_endpoint" {
  description = "Prometheus endpoint URL"
  value       = module.monitoring.prometheus_endpoint
}

output "grafana_endpoint" {
  description = "Grafana endpoint URL"
  value       = module.monitoring.grafana_endpoint
}

output "kubectl_config_command" {
  description = "Command to configure kubectl"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${local.cluster_name}"
}