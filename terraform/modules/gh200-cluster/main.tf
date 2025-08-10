# GH200 Cluster Module - EKS cluster optimized for NVIDIA GH200 Grace Hopper

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20"
    }
  }
}

# KMS key for EKS cluster encryption
resource "aws_kms_key" "eks" {
  description             = "EKS Secret Encryption Key for ${var.cluster_name}"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = merge(var.tags, {
    Name = "${var.cluster_name}-eks-encryption-key"
  })
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${var.cluster_name}-eks-encryption-key"
  target_key_id = aws_kms_key.eks.key_id
}

# CloudWatch Log Group for EKS Cluster Logging
resource "aws_cloudwatch_log_group" "eks_cluster" {
  name              = "/aws/eks/${var.cluster_name}/cluster"
  retention_in_days = 14
  
  tags = merge(var.tags, {
    Name = "${var.cluster_name}-eks-cluster-logs"
  })
}

# EKS Cluster Service Role
resource "aws_iam_role" "cluster_service_role" {
  name = "${var.cluster_name}-cluster-service-role"
  
  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
    Version = "2012-10-17"
  })
  
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "cluster_service_role_AmazonEKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster_service_role.name
}

resource "aws_iam_role_policy_attachment" "cluster_service_role_AmazonEKSVPCResourceController" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  role       = aws_iam_role.cluster_service_role.name
}

# EKS Cluster
resource "aws_eks_cluster" "this" {
  name     = var.cluster_name
  role_arn = aws_iam_role.cluster_service_role.arn
  version  = var.cluster_version
  
  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = var.endpoint_public_access
    public_access_cidrs     = var.endpoint_public_access ? var.public_access_cidrs : []
    security_group_ids      = var.security_groups
  }
  
  # Enable EKS Cluster logging
  enabled_cluster_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]
  
  # Encryption configuration
  encryption_config {
    provider {
      key_arn = aws_kms_key.eks.arn
    }
    resources = ["secrets"]
  }
  
  tags = merge(var.tags, {
    Name = var.cluster_name
  })
  
  depends_on = [
    aws_iam_role_policy_attachment.cluster_service_role_AmazonEKSClusterPolicy,
    aws_iam_role_policy_attachment.cluster_service_role_AmazonEKSVPCResourceController,
    aws_cloudwatch_log_group.eks_cluster,
  ]
}

# EKS Add-ons
resource "aws_eks_addon" "addons" {
  for_each = var.cluster_addons
  
  cluster_name             = aws_eks_cluster.this.name
  addon_name               = each.key
  addon_version            = each.value.version
  resolve_conflicts        = "OVERWRITE"
  service_account_role_arn = try(each.value.service_account_role_arn, null)
  
  tags = var.tags
  
  depends_on = [aws_eks_cluster.this]
}

# Data source for EKS cluster auth
data "aws_eks_cluster_auth" "this" {
  name = aws_eks_cluster.this.name
}

# Node Group IAM Role
resource "aws_iam_role" "node_group_role" {
  name = "${var.cluster_name}-node-group-role"
  
  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
    Version = "2012-10-17"
  })
  
  tags = var.tags
}

# Node Group IAM Policies
resource "aws_iam_role_policy_attachment" "node_group_AmazonEKSWorkerNodePolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node_group_role.name
}

resource "aws_iam_role_policy_attachment" "node_group_AmazonEKS_CNI_Policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node_group_role.name
}

resource "aws_iam_role_policy_attachment" "node_group_AmazonEC2ContainerRegistryReadOnly" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node_group_role.name
}

resource "aws_iam_role_policy_attachment" "node_group_AmazonSSMManagedInstanceCore" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  role       = aws_iam_role.node_group_role.name
}

# Custom policy for GH200 specific permissions
resource "aws_iam_policy" "gh200_node_policy" {
  name        = "${var.cluster_name}-gh200-node-policy"
  description = "Additional permissions for GH200 nodes"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceTypes",
          "ec2:DescribeInstanceAttribute",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeVolumes",
          "ec2:DescribeSnapshots",
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "cloudwatch:PutMetricData",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "*"
      }
    ]
  })
  
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "node_group_gh200_policy" {
  policy_arn = aws_iam_policy.gh200_node_policy.arn
  role       = aws_iam_role.node_group_role.name
}

# Launch template for GH200 optimized instances
resource "aws_launch_template" "gh200_template" {
  name_prefix = "${var.cluster_name}-gh200-"
  
  vpc_security_group_ids = var.security_groups
  
  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    cluster_name        = var.cluster_name
    endpoint            = aws_eks_cluster.this.endpoint
    ca_certificate      = aws_eks_cluster.this.certificate_authority[0].data
    bootstrap_arguments = "--container-runtime containerd --b64-cluster-ca ${aws_eks_cluster.this.certificate_authority[0].data} --apiserver-endpoint ${aws_eks_cluster.this.endpoint}"
  }))
  
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 200
      volume_type = "gp3"
      iops        = 3000
      throughput  = 125
      encrypted   = true
    }
  }
  
  # GH200 specific instance metadata
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }
  
  monitoring {
    enabled = true
  }
  
  tag_specifications {
    resource_type = "instance"
    tags = merge(var.tags, {
      Name = "${var.cluster_name}-gh200-node"
      "k8s.io/cluster-autoscaler/${var.cluster_name}" = "owned"
      "k8s.io/cluster-autoscaler/enabled" = "true"
    })
  }
  
  tags = var.tags
}

# EKS Node Groups
resource "aws_eks_node_group" "node_groups" {
  for_each = var.node_groups
  
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = each.key
  node_role_arn   = aws_iam_role.node_group_role.arn
  subnet_ids      = var.subnet_ids
  
  capacity_type  = each.value.capacity_type
  instance_types = each.value.instance_types
  ami_type       = "AL2_x86_64_GPU"  # GPU-optimized AMI
  
  # Use launch template for GH200 nodes
  launch_template {
    id      = aws_launch_template.gh200_template.id
    version = aws_launch_template.gh200_template.latest_version
  }
  
  scaling_config {
    desired_size = each.value.scaling_config.desired_size
    max_size     = each.value.scaling_config.max_size
    min_size     = each.value.scaling_config.min_size
  }
  
  # Enable remote access for debugging (optional)
  dynamic "remote_access" {
    for_each = var.enable_node_group_remote_access ? [1] : []
    content {
      ec2_ssh_key = var.node_group_ssh_key
    }
  }
  
  # Node group configuration
  labels = each.value.labels
  
  dynamic "taint" {
    for_each = try(each.value.taints, [])
    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect
    }
  }
  
  tags = merge(var.tags, {
    Name = "${var.cluster_name}-${each.key}"
  })
  
  depends_on = [
    aws_iam_role_policy_attachment.node_group_AmazonEKSWorkerNodePolicy,
    aws_iam_role_policy_attachment.node_group_AmazonEKS_CNI_Policy,
    aws_iam_role_policy_attachment.node_group_AmazonEC2ContainerRegistryReadOnly,
    aws_iam_role_policy_attachment.node_group_AmazonSSMManagedInstanceCore,
    aws_iam_role_policy_attachment.node_group_gh200_policy,
  ]
  
  # Ensure that IAM Role permissions are created before and deleted after EKS Node Group handling.
  # Otherwise, EKS will not be able to properly delete EC2 Instances and Elastic Network Interfaces.
  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }
}

# OIDC Identity Provider for IRSA
data "tls_certificate" "cluster" {
  url = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "cluster" {
  count = var.enable_irsa ? 1 : 0
  
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.cluster.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.this.identity[0].oidc[0].issuer
  
  tags = var.tags
}