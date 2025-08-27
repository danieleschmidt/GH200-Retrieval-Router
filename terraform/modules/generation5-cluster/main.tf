# Generation 5 Advanced AI Cluster Configuration
# Terraform module for quantum research and autonomous evolution infrastructure

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

# Local values for configuration
locals {
  cluster_name = "gh200-generation5-cluster"
  
  # Generation 5 specific configurations
  quantum_node_specs = {
    instance_type = "p5.48xlarge" # 8x H100 GPUs with NVLink
    quantum_memory = "2048" # 2TB memory for quantum states
    nvlink_bandwidth = "900" # GB/s
    quantum_coherence = "0.97"
  }
  
  evolution_node_specs = {
    instance_type = "p4d.24xlarge" # 8x A100 GPUs
    evolution_memory = "1152" # 1.152TB memory
    mutation_acceleration = "enabled"
    genetic_programming = "enabled"
  }
  
  # Availability zones for quantum entanglement distribution
  quantum_azs = ["us-west-2a", "us-west-2b", "us-west-2c"]
  
  common_tags = {
    Project = "GH200-Generation5-Advanced-AI"
    Generation = "5"
    Capability = "quantum-research-evolution"
    Environment = var.environment
    ManagedBy = "terragon-autonomous-sdlc"
  }
}

# VPC for Generation 5 quantum networking
resource "aws_vpc" "generation5_vpc" {
  cidr_block           = "10.5.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-vpc"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
    "generation5.terragon.ai/quantum-network" = "true"
  })
}

# Internet Gateway for external connectivity
resource "aws_internet_gateway" "generation5_igw" {
  vpc_id = aws_vpc.generation5_vpc.id
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-igw"
  })
}

# Subnets for quantum nodes across multiple AZs
resource "aws_subnet" "quantum_subnets" {
  count = length(local.quantum_azs)
  
  vpc_id                  = aws_vpc.generation5_vpc.id
  cidr_block              = "10.5.${count.index + 1}.0/24"
  availability_zone       = local.quantum_azs[count.index]
  map_public_ip_on_launch = true
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-quantum-subnet-${count.index + 1}"
    "kubernetes.io/cluster/${local.cluster_name}" = "owned"
    "kubernetes.io/role/elb" = "1"
    "generation5.terragon.ai/quantum-zone" = "true"
    "generation5.terragon.ai/coherence-group" = "primary"
  })
}

# Subnets for evolution nodes
resource "aws_subnet" "evolution_subnets" {
  count = length(local.quantum_azs)
  
  vpc_id                  = aws_vpc.generation5_vpc.id
  cidr_block              = "10.5.${count.index + 10}.0/24"
  availability_zone       = local.quantum_azs[count.index]
  map_public_ip_on_launch = true
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-evolution-subnet-${count.index + 1}"
    "kubernetes.io/cluster/${local.cluster_name}" = "owned"
    "generation5.terragon.ai/evolution-zone" = "true"
    "generation5.terragon.ai/mutation-capable" = "true"
  })
}

# Route table for quantum networking
resource "aws_route_table" "generation5_rt" {
  vpc_id = aws_vpc.generation5_vpc.id
  
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.generation5_igw.id
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-rt"
  })
}

# Associate subnets with route table
resource "aws_route_table_association" "quantum_rta" {
  count = length(aws_subnet.quantum_subnets)
  
  subnet_id      = aws_subnet.quantum_subnets[count.index].id
  route_table_id = aws_route_table.generation5_rt.id
}

resource "aws_route_table_association" "evolution_rta" {
  count = length(aws_subnet.evolution_subnets)
  
  subnet_id      = aws_subnet.evolution_subnets[count.index].id
  route_table_id = aws_route_table.generation5_rt.id
}

# Security group for Generation 5 quantum communication
resource "aws_security_group" "generation5_quantum_sg" {
  name_prefix = "${local.cluster_name}-quantum-"
  vpc_id      = aws_vpc.generation5_vpc.id
  
  # Quantum entanglement communication
  ingress {
    from_port   = 9000
    to_port     = 9100
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.generation5_vpc.cidr_block]
    description = "Quantum state synchronization"
  }
  
  # Evolution algorithm communication
  ingress {
    from_port   = 9200
    to_port     = 9300
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.generation5_vpc.cidr_block]
    description = "Evolution algorithm exchange"
  }
  
  # Cross-system learning protocols
  ingress {
    from_port   = 9400
    to_port     = 9500
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.generation5_vpc.cidr_block]
    description = "Cross-system learning"
  }
  
  # High-bandwidth NVLink communication
  ingress {
    from_port   = 10000
    to_port     = 11000
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.generation5_vpc.cidr_block]
    description = "NVLink fabric communication"
  }
  
  # Standard Kubernetes communication
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS API access"
  }
  
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP API access"
  }
  
  # Research WebSocket endpoints
  ingress {
    from_port   = 8081
    to_port     = 8082
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Research WebSocket endpoints"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-quantum-sg"
    "generation5.terragon.ai/quantum-security" = "enabled"
  })
}

# EKS Cluster for Generation 5
resource "aws_eks_cluster" "generation5_cluster" {
  name     = local.cluster_name
  role_arn = aws_iam_role.generation5_cluster_role.arn
  version  = "1.28"
  
  vpc_config {
    subnet_ids = concat(
      aws_subnet.quantum_subnets[*].id,
      aws_subnet.evolution_subnets[*].id
    )
    security_group_ids = [aws_security_group.generation5_quantum_sg.id]
    
    endpoint_config {
      private_access = true
      public_access  = true
      public_access_cidrs = ["0.0.0.0/0"]
    }
  }
  
  enabled_cluster_log_types = [
    "api", "audit", "authenticator", "controllerManager", "scheduler"
  ]
  
  encryption_config {
    provider {
      key_arn = aws_kms_key.generation5_encryption.arn
    }
    resources = ["secrets"]
  }
  
  tags = merge(local.common_tags, {
    Name = local.cluster_name
    "generation5.terragon.ai/quantum-cluster" = "true"
  })
  
  depends_on = [
    aws_iam_role_policy_attachment.generation5_cluster_AmazonEKSClusterPolicy,
    aws_iam_role_policy_attachment.generation5_cluster_AmazonEKSVPCResourceController,
  ]
}

# Quantum Node Group
resource "aws_eks_node_group" "quantum_nodes" {
  cluster_name    = aws_eks_cluster.generation5_cluster.name
  node_group_name = "quantum-research-nodes"
  node_role_arn   = aws_iam_role.generation5_node_role.arn
  
  subnet_ids = aws_subnet.quantum_subnets[*].id
  
  capacity_type  = "ON_DEMAND"
  instance_types = [local.quantum_node_specs.instance_type]
  
  scaling_config {
    desired_size = 3
    max_size     = 6
    min_size     = 1
  }
  
  update_config {
    max_unavailable = 1
  }
  
  # Advanced quantum configuration
  launch_template {
    id      = aws_launch_template.quantum_node_template.id
    version = aws_launch_template.quantum_node_template.latest_version
  }
  
  labels = {
    "generation5.terragon.ai/node-type" = "quantum-research"
    "generation5.terragon.ai/quantum-capable" = "true"
    "generation5.terragon.ai/coherence-level" = "high"
    "nvidia.com/gpu.product" = "NVIDIA-H100-80GB"
  }
  
  taints {
    key    = "generation5.terragon.ai/quantum-workload"
    value  = "true"
    effect = "NO_SCHEDULE"
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-quantum-nodes"
    "generation5.terragon.ai/quantum-nodes" = "true"
  })
  
  depends_on = [
    aws_iam_role_policy_attachment.generation5_node_AmazonEKSWorkerNodePolicy,
    aws_iam_role_policy_attachment.generation5_node_AmazonEKS_CNI_Policy,
    aws_iam_role_policy_attachment.generation5_node_AmazonEC2ContainerRegistryReadOnly,
  ]
}

# Evolution Node Group
resource "aws_eks_node_group" "evolution_nodes" {
  cluster_name    = aws_eks_cluster.generation5_cluster.name
  node_group_name = "evolution-engine-nodes"
  node_role_arn   = aws_iam_role.generation5_node_role.arn
  
  subnet_ids = aws_subnet.evolution_subnets[*].id
  
  capacity_type  = "ON_DEMAND"
  instance_types = [local.evolution_node_specs.instance_type]
  
  scaling_config {
    desired_size = 2
    max_size     = 4
    min_size     = 1
  }
  
  update_config {
    max_unavailable = 1
  }
  
  launch_template {
    id      = aws_launch_template.evolution_node_template.id
    version = aws_launch_template.evolution_node_template.latest_version
  }
  
  labels = {
    "generation5.terragon.ai/node-type" = "evolution-engine"
    "generation5.terragon.ai/evolution-capable" = "true"
    "generation5.terragon.ai/mutation-rate" = "adaptive"
    "nvidia.com/gpu.product" = "NVIDIA-A100-40GB"
  }
  
  taints {
    key    = "generation5.terragon.ai/evolution-workload"
    value  = "true"
    effect = "NO_SCHEDULE"
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-evolution-nodes"
    "generation5.terragon.ai/evolution-nodes" = "true"
  })
  
  depends_on = [
    aws_iam_role_policy_attachment.generation5_node_AmazonEKSWorkerNodePolicy,
    aws_iam_role_policy_attachment.generation5_node_AmazonEKS_CNI_Policy,
    aws_iam_role_policy_attachment.generation5_node_AmazonEC2ContainerRegistryReadOnly,
  ]
}

# Launch template for quantum nodes
resource "aws_launch_template" "quantum_node_template" {
  name_prefix = "${local.cluster_name}-quantum-"
  description = "Launch template for Generation 5 quantum research nodes"
  
  vpc_security_group_ids = [aws_security_group.generation5_quantum_sg.id]
  
  # Advanced instance configuration for quantum workloads
  instance_type = local.quantum_node_specs.instance_type
  
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 500
      volume_type          = "gp3"
      iops                 = 16000
      throughput           = 1000
      encrypted            = true
      kms_key_id          = aws_kms_key.generation5_encryption.arn
      delete_on_termination = true
    }
  }
  
  # Quantum-specific NVME storage
  block_device_mappings {
    device_name = "/dev/nvme1n1"
    ebs {
      volume_size           = 2000
      volume_type          = "gp3"
      iops                 = 32000
      throughput           = 2000
      encrypted            = true
      kms_key_id          = aws_kms_key.generation5_encryption.arn
      delete_on_termination = false
    }
  }
  
  user_data = base64encode(templatefile("${path.module}/user_data_quantum.sh", {
    cluster_name = local.cluster_name
    quantum_memory = local.quantum_node_specs.quantum_memory
    coherence_threshold = local.quantum_node_specs.quantum_coherence
    nvlink_bandwidth = local.quantum_node_specs.nvlink_bandwidth
  }))
  
  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name = "${local.cluster_name}-quantum-node"
      "generation5.terragon.ai/quantum-instance" = "true"
    })
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-quantum-template"
  })
}

# Launch template for evolution nodes
resource "aws_launch_template" "evolution_node_template" {
  name_prefix = "${local.cluster_name}-evolution-"
  description = "Launch template for Generation 5 evolution engine nodes"
  
  vpc_security_group_ids = [aws_security_group.generation5_quantum_sg.id]
  
  instance_type = local.evolution_node_specs.instance_type
  
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 200
      volume_type          = "gp3"
      iops                 = 16000
      throughput           = 1000
      encrypted            = true
      kms_key_id          = aws_kms_key.generation5_encryption.arn
      delete_on_termination = true
    }
  }
  
  # Evolution model storage
  block_device_mappings {
    device_name = "/dev/nvme1n1"
    ebs {
      volume_size           = 1000
      volume_type          = "gp3"
      iops                 = 16000
      throughput           = 1000
      encrypted            = true
      kms_key_id          = aws_kms_key.generation5_encryption.arn
      delete_on_termination = false
    }
  }
  
  user_data = base64encode(templatefile("${path.module}/user_data_evolution.sh", {
    cluster_name = local.cluster_name
    evolution_memory = local.evolution_node_specs.evolution_memory
  }))
  
  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name = "${local.cluster_name}-evolution-node"
      "generation5.terragon.ai/evolution-instance" = "true"
    })
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-evolution-template"
  })
}

# KMS key for Generation 5 encryption
resource "aws_kms_key" "generation5_encryption" {
  description             = "KMS key for Generation 5 quantum research encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Generation 5 services"
        Effect = "Allow"
        Principal = {
          Service = [
            "eks.amazonaws.com",
            "ec2.amazonaws.com",
            "s3.amazonaws.com"
          ]
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey*",
          "kms:ReEncrypt*",
          "kms:CreateGrant",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })
  
  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-encryption-key"
    "generation5.terragon.ai/encryption" = "quantum-grade"
  })
}

resource "aws_kms_alias" "generation5_encryption" {
  name          = "alias/${local.cluster_name}-encryption"
  target_key_id = aws_kms_key.generation5_encryption.key_id
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# IAM roles and policies (continued in iam.tf)