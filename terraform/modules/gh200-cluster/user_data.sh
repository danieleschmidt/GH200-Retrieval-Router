#!/bin/bash

# GH200 Node User Data Script
# Optimized for NVIDIA GH200 Grace Hopper Superchip

set -o xtrace

# Update system packages
yum update -y

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install

# Install NVIDIA drivers and CUDA toolkit
# Note: These should be pre-installed in the AMI for production use
amazon-linux-extras install -y kernel-ng
yum groupinstall -y "Development Tools"

# Install Docker and configure for GPU support
yum install -y docker
systemctl enable docker
systemctl start docker

# Configure Docker daemon for GPU support
cat <<EOF > /etc/docker/daemon.json
{
    "default-runtime": "nvidia",
    "runtimes": {
        "nvidia": {
            "path": "nvidia-container-runtime",
            "runtimeArgs": []
        }
    },
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2",
    "storage-opts": [
        "overlay2.override_kernel_check=true"
    ]
}
EOF

systemctl restart docker

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.repo | tee /etc/yum.repos.d/nvidia-docker.repo

yum clean expire-cache
yum install -y nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

# Install kubelet, kubectl, and AWS IAM Authenticator
cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF

yum install -y kubelet kubectl
systemctl enable kubelet

# Configure kubelet for GH200 optimizations
cat <<EOF > /etc/kubernetes/kubelet/kubelet-config.json
{
    "kind": "KubeletConfiguration",
    "apiVersion": "kubelet.config.k8s.io/v1beta1",
    "address": "0.0.0.0",
    "port": 10250,
    "readOnlyPort": 0,
    "cgroupDriver": "systemd",
    "cgroupsPerQOS": true,
    "enforceNodeAllocatable": ["pods"],
    "authentication": {
        "anonymous": {
            "enabled": false
        },
        "webhook": {
            "enabled": true,
            "cacheTTL": "2m0s"
        },
        "x509": {
            "clientCAFile": "/etc/kubernetes/pki/ca.crt"
        }
    },
    "authorization": {
        "mode": "Webhook",
        "webhook": {
            "cacheAuthorizedTTL": "5m0s",
            "cacheUnauthorizedTTL": "30s"
        }
    },
    "clusterDNS": ["169.254.20.10"],
    "clusterDomain": "cluster.local",
    "containerLogMaxSize": "10Mi",
    "containerLogMaxFiles": 5,
    "maxPods": 110,
    "kubeReserved": {
        "cpu": "100m",
        "memory": "1Gi",
        "ephemeral-storage": "1Gi"
    },
    "systemReserved": {
        "cpu": "100m",
        "memory": "1Gi",
        "ephemeral-storage": "1Gi"
    },
    "evictionHard": {
        "memory.available": "100Mi",
        "nodefs.available": "10%",
        "nodefs.inodesFree": "5%",
        "imagefs.available": "15%"
    },
    "featureGates": {
        "GPUResourceFence": true,
        "DevicePlugins": true
    }
}
EOF

# Install and configure the NVIDIA device plugin
mkdir -p /etc/kubernetes/manifests
cat <<EOF > /etc/kubernetes/manifests/nvidia-device-plugin.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: nvidia-device-plugin-daemonset
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: nvidia-device-plugin-ds
  updateStrategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        name: nvidia-device-plugin-ds
    spec:
      tolerations:
      - key: nvidia.com/gpu
        operator: Exists
        effect: NoSchedule
      priorityClassName: "system-node-critical"
      containers:
      - image: nvcr.io/nvidia/k8s-device-plugin:v0.14.1
        name: nvidia-device-plugin-ctr
        args: ["--fail-on-init-error=false"]
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop: ["ALL"]
        volumeMounts:
          - name: device-plugin
            mountPath: /var/lib/kubelet/device-plugins
      volumes:
        - name: device-plugin
          hostPath:
            path: /var/lib/kubelet/device-plugins
EOF

# Configure Grace Hopper specific optimizations
echo "# GH200 Grace Hopper Optimizations" >> /etc/sysctl.conf
echo "vm.swappiness = 1" >> /etc/sysctl.conf
echo "vm.dirty_ratio = 15" >> /etc/sysctl.conf
echo "vm.dirty_background_ratio = 5" >> /etc/sysctl.conf
echo "net.core.rmem_max = 134217728" >> /etc/sysctl.conf
echo "net.core.wmem_max = 134217728" >> /etc/sysctl.conf
echo "net.ipv4.tcp_rmem = 4096 65536 134217728" >> /etc/sysctl.conf
echo "net.ipv4.tcp_wmem = 4096 65536 134217728" >> /etc/sysctl.conf
echo "net.core.netdev_max_backlog = 5000" >> /etc/sysctl.conf
sysctl -p

# Configure huge pages for better memory performance
echo "vm.nr_hugepages = 1024" >> /etc/sysctl.conf
sysctl -p

# Set up persistent logging
mkdir -p /var/log/gh200-node
chmod 755 /var/log/gh200-node

# Configure log rotation
cat <<EOF > /etc/logrotate.d/gh200-node
/var/log/gh200-node/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 root root
}
EOF

# Install monitoring agents
curl -O https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm

# Configure CloudWatch agent for GPU metrics
cat <<EOF > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
{
    "metrics": {
        "namespace": "GH200/Node",
        "metrics_collected": {
            "cpu": {
                "measurement": ["cpu_usage_idle", "cpu_usage_iowait", "cpu_usage_user", "cpu_usage_system"],
                "metrics_collection_interval": 60,
                "totalcpu": false
            },
            "disk": {
                "measurement": ["used_percent"],
                "metrics_collection_interval": 60,
                "resources": ["*"]
            },
            "diskio": {
                "measurement": ["io_time"],
                "metrics_collection_interval": 60,
                "resources": ["*"]
            },
            "mem": {
                "measurement": ["mem_used_percent"],
                "metrics_collection_interval": 60
            },
            "netstat": {
                "measurement": ["tcp_established", "tcp_time_wait"],
                "metrics_collection_interval": 60
            },
            "swap": {
                "measurement": ["swap_used_percent"],
                "metrics_collection_interval": 60
            }
        }
    },
    "logs": {
        "logs_collected": {
            "files": {
                "collect_list": [
                    {
                        "file_path": "/var/log/dmesg",
                        "log_group_name": "gh200-node-system-logs",
                        "log_stream_name": "{instance_id}/dmesg",
                        "timezone": "UTC"
                    },
                    {
                        "file_path": "/var/log/messages",
                        "log_group_name": "gh200-node-system-logs",
                        "log_stream_name": "{instance_id}/messages",
                        "timezone": "UTC"
                    },
                    {
                        "file_path": "/var/log/gh200-node/*.log",
                        "log_group_name": "gh200-node-app-logs",
                        "log_stream_name": "{instance_id}/gh200-app",
                        "timezone": "UTC"
                    }
                ]
            }
        }
    }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s

# Bootstrap the node to join the EKS cluster
/etc/eks/bootstrap.sh ${cluster_name} ${bootstrap_arguments}

# Configure automatic GPU health checks
cat <<EOF > /usr/local/bin/gpu-health-check.sh
#!/bin/bash
# GPU health monitoring script

LOGFILE="/var/log/gh200-node/gpu-health.log"
DATE=\$(date '+%Y-%m-%d %H:%M:%S')

# Check GPU status
nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,utilization.memory,memory.total,memory.used,memory.free --format=csv,noheader,nounits > /tmp/gpu-status

# Check for GPU errors
if [ \$? -ne 0 ]; then
    echo "[\$DATE] ERROR: nvidia-smi command failed" >> \$LOGFILE
    exit 1
fi

# Monitor temperature
while read line; do
    TEMP=\$(echo \$line | cut -d',' -f2 | tr -d ' ')
    if [ \$TEMP -gt 85 ]; then
        echo "[\$DATE] WARNING: GPU temperature high: \${TEMP}°C" >> \$LOGFILE
    fi
done < /tmp/gpu-status

# Check NVLink status (for GH200)
nvidia-smi nvlink --status > /tmp/nvlink-status 2>&1
if [ \$? -ne 0 ]; then
    echo "[\$DATE] ERROR: NVLink status check failed" >> \$LOGFILE
else
    echo "[\$DATE] INFO: NVLink status OK" >> \$LOGFILE
fi

# Cleanup
rm -f /tmp/gpu-status /tmp/nvlink-status
EOF

chmod +x /usr/local/bin/gpu-health-check.sh

# Set up cron job for GPU health monitoring
echo "*/5 * * * * root /usr/local/bin/gpu-health-check.sh" >> /etc/crontab

# Signal completion
/opt/aws/bin/cfn-signal -e $? --stack ${AWS::StackName} --resource NodeGroup --region ${AWS::Region}

echo "GH200 node initialization completed successfully" >> /var/log/gh200-node/init.log