#!/bin/bash
set -e

echo "🚀 Setting up GH200-Retrieval-Router development environment..."

# Update system packages
echo "📦 Updating system packages..."
apt-get update && apt-get upgrade -y

# Install system dependencies
echo "🔧 Installing system dependencies..."
apt-get install -y \
    build-essential \
    cmake \
    git \
    curl \
    wget \
    vim \
    htop \
    tree \
    jq \
    unzip \
    software-properties-common \
    ca-certificates \
    gnupg \
    lsb-release \
    pkg-config \
    libnccl2 \
    libnccl-dev \
    libucx-dev \
    ucx-utils \
    libnuma-dev \
    libhwloc-dev \
    pciutils \
    nvidia-utils-535

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install -g nodemon prettier eslint

# Install Python dependencies for CUDA development
echo "🐍 Installing Python dependencies..."
pip3 install --upgrade pip
pip3 install \
    numpy \
    scipy \
    pandas \
    matplotlib \
    jupyter \
    ipython \
    cupy-cuda12x \
    numba \
    pyarrow \
    faiss-cpu \
    sentence-transformers \
    torch \
    transformers \
    datasets

# Install RAPIDS (if available)
echo "🏎️ Installing RAPIDS for GPU acceleration..."
pip3 install --extra-index-url=https://pypi.nvidia.com cudf-cu12 cuml-cu12 cugraph-cu12 cuspatial-cu12 cuproj-cu12 cuxfilter-cu12 cucim-cu12 pylibraft-cu12 rmm-cu12 || echo "RAPIDS installation failed, continuing..."

# Set up CUDA environment
echo "🔥 Configuring CUDA environment..."
export CUDA_HOME=/usr/local/cuda
export PATH=$CUDA_HOME/bin:$PATH
export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH

# Add CUDA paths to bashrc
echo 'export CUDA_HOME=/usr/local/cuda' >> ~/.bashrc
echo 'export PATH=$CUDA_HOME/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc

# Create development directories
echo "📁 Creating development directories..."
mkdir -p /workspace/data/{embeddings,indices,metadata,cache}
mkdir -p /workspace/logs
mkdir -p /workspace/benchmarks
mkdir -p /workspace/scripts
mkdir -p /workspace/tests/fixtures

# Set up Git configuration
echo "🔧 Configuring Git..."
git config --global init.defaultBranch main
git config --global pull.rebase false
git config --global core.autocrlf input
git config --global core.filemode false

# Install project dependencies
echo "📦 Installing project dependencies..."
cd /workspace
npm install

# Set up pre-commit hooks
echo "🪝 Setting up pre-commit hooks..."
npx husky install

# Create environment file from template
echo "⚙️ Creating environment configuration..."
cp .env.example .env 2>/dev/null || echo "No .env.example found"

# Set up VS Code workspace settings
echo "🔧 Configuring VS Code workspace..."
mkdir -p .vscode
cat > .vscode/settings.json << 'EOF'
{
  "terminal.integrated.defaultProfile.linux": "bash",
  "python.defaultInterpreterPath": "/usr/local/bin/python3",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true,
  "python.formatting.provider": "black",
  "eslint.alwaysShowStatus": true,
  "prettier.requireConfig": true,
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.associations": {
    "*.cu": "cuda-cpp",
    "*.cuh": "cuda-cpp",
    "*.cython": "python"
  },
  "C_Cpp.default.compilerPath": "/usr/local/cuda/bin/nvcc",
  "C_Cpp.default.includePath": [
    "/usr/local/cuda/include",
    "/usr/local/cuda/targets/x86_64-linux/include"
  ],
  "search.exclude": {
    "**/node_modules": true,
    "**/coverage": true,
    "**/dist": true,
    "**/build": true,
    "**/.git": true,
    "**/logs": true,
    "**/data": true
  },
  "files.watcherExclude": {
    "**/node_modules/**": true,
    "**/data/**": true,
    "**/logs/**": true
  }
}
EOF

# Create launch configuration for debugging
cat > .vscode/launch.json << 'EOF'
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug GH200 Router",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/index.js",
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug",
        "MOCK_GRACE_HOPPER": "true"
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "env": {
        "NODE_ENV": "test"
      }
    },
    {
      "name": "Debug Benchmark",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/scripts/benchmark.js",
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "benchmark",
        "MOCK_GRACE_HOPPER": "true"
      }
    }
  ]
}
EOF

# Set up tasks for common operations
cat > .vscode/tasks.json << 'EOF'
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "npm install",
      "type": "npm",
      "script": "install",
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "npm test",
      "type": "npm",
      "script": "test",
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "npm run benchmark",
      "type": "npm",
      "script": "benchmark",
      "group": "test",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "Check CUDA",
      "type": "shell",
      "command": "nvidia-smi && nvcc --version",
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    }
  ]
}
EOF

# Display system information
echo "ℹ️ System Information:"
echo "CUDA Version: $(nvcc --version 2>/dev/null | grep release || echo 'CUDA not found')"
echo "GPU Information: $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'No GPU detected')"
echo "Node.js Version: $(node --version)"
echo "Python Version: $(python3 --version)"
echo "Memory: $(free -h | grep Mem | awk '{print $2}')"

# Set permissions
chmod +x /workspace/scripts/* 2>/dev/null || true

echo "✅ Development environment setup complete!"
echo "🎯 Ready to develop GH200-Retrieval-Router"
echo ""
echo "Quick start commands:"
echo "  npm run dev        - Start development server"
echo "  npm test           - Run test suite"
echo "  npm run benchmark  - Run performance benchmarks"
echo "  npm run lint       - Check code style"
echo ""
