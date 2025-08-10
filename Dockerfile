# Multi-stage Production Dockerfile for GH200 Retrieval Router
# Optimized for NVIDIA GH200 Grace Hopper Superchip production deployments

# Build stage
FROM node:18-bullseye-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    python3-pip \
    git \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY docs/ ./docs/
COPY *.md ./

# Production runtime stage
FROM nvcr.io/nvidia/cuda:12.2-runtime-ubuntu22.04 AS runtime

# Install Node.js and system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install NVIDIA tools for GH200 monitoring
RUN apt-get update && apt-get install -y \
    nvidia-utils-535 \
    nvidia-ml-py3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r gh200 && useradd -r -g gh200 gh200

# Set working directory
WORKDIR /app

# Copy application from builder stage
COPY --from=builder --chown=gh200:gh200 /app .

# Create directories for data and logs
RUN mkdir -p /app/data /app/logs /app/tmp && \
    chown -R gh200:gh200 /app

# Set environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    LOG_LEVEL=info \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    CUDA_VISIBLE_DEVICES=all

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Switch to non-root user
USER gh200

# Expose port
EXPOSE 8080

# Start application
CMD ["npm", "start"]

# Metadata labels
LABEL maintainer="Terragon Labs <support@terragon-labs.com>"
LABEL version="1.0.0"
LABEL description="GH200 Retrieval Router - High-bandwidth retrieval-augmented inference engine"
LABEL org.opencontainers.image.title="GH200 Retrieval Router"
LABEL org.opencontainers.image.description="Optimized for NVIDIA GH200 Grace Hopper Superchip NVL32 nodes"
LABEL org.opencontainers.image.vendor="Terragon Labs"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.url="https://github.com/terragon-labs/gh200-retrieval-router"
LABEL org.opencontainers.image.source="https://github.com/terragon-labs/gh200-retrieval-router"