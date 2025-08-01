# ADR-0001: Choose NVIDIA Grace Hopper Architecture as Primary Platform

## Status
Accepted

## Context
Large-scale retrieval-augmented generation (RAG) systems face significant performance bottlenecks when processing massive vector databases (20TB+). Traditional CPU-GPU architectures suffer from memory bandwidth limitations and data transfer overhead between CPU and GPU memory spaces.

Key challenges:
- PCIe bandwidth limitations (32 GB/s) create bottlenecks for large vector transfers
- Separate CPU and GPU memory spaces require expensive data copying
- Traditional scaling approaches don't leverage unified memory advantages
- Memory capacity limitations prevent loading entire large vector databases

## Decision
Adopt NVIDIA GH200 Grace Hopper Superchip as the primary platform for the retrieval router system.

Key architectural choices:
- Leverage 480GB unified memory architecture
- Utilize 900 GB/s CPU-GPU memory bandwidth  
- Design around NVLink-C2C for multi-node scaling
- Optimize for zero-copy memory operations
- Target NVL32 clusters for maximum performance

## Consequences

### Positive Consequences
- **Massive Memory Capacity**: 480GB unified memory per node enables loading entire large vector databases in memory
- **Bandwidth Elimination**: 900 GB/s memory bandwidth removes traditional PCIe bottlenecks
- **Zero-Copy Operations**: Unified memory eliminates CPU-GPU data copying overhead
- **Scalability**: NVLink-C2C enables efficient multi-node scaling to 32+ nodes
- **Performance**: Enables 125K+ QPS per node with sub-15ms latency
- **Efficiency**: Unified memory reduces memory fragmentation and improves utilization

### Negative Consequences
- **Hardware Dependency**: System is tightly coupled to GH200 hardware availability
- **Cost**: GH200 systems have high acquisition and operational costs
- **Complexity**: Requires specialized knowledge of Grace Hopper architecture
- **Limited Adoption**: Smaller user base compared to traditional x86 systems
- **Vendor Lock-in**: Strong dependency on NVIDIA ecosystem
- **Software Maturity**: Newer platform with potentially less mature tooling

## Alternatives Considered

### Traditional CPU-GPU Architecture (x86 + A100/H100)
- **Pros**: Mature ecosystem, lower cost, wider availability
- **Cons**: PCIe bandwidth bottleneck, separate memory spaces, lower memory capacity
- **Rejected**: Cannot achieve the performance and scale requirements for 20TB+ vector databases

### CPU-Only Architecture (High-Memory x86)
- **Pros**: Mature software stack, predictable performance, lower complexity
- **Cons**: Limited compute capacity, slower vector operations, higher latency
- **Rejected**: Insufficient compute performance for real-time inference requirements

### AMD MI300X Architecture
- **Pros**: Unified memory, competitive performance, alternative vendor
- **Cons**: Smaller software ecosystem, less mature unified memory implementation
- **Rejected**: Less proven for RAG workloads, smaller community support

### Distributed CPU-GPU Clusters
- **Pros**: Flexible scaling, commodity hardware, proven architecture
- **Cons**: Network bottlenecks, complex data sharding, higher latency
- **Rejected**: Network bandwidth becomes bottleneck at scale, complex data management

## Links
- [NVIDIA GH200 Technical Specifications](https://www.nvidia.com/en-us/data-center/grace-hopper-superchip/)
- [Grace Hopper Programming Guide](https://docs.nvidia.com/grace-hopper-superchip/)
- [NVLink-C2C Architecture](https://docs.nvidia.com/nvlink-c2c/)