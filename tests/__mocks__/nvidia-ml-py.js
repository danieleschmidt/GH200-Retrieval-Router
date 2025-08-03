/**
 * Mock for nvidia-ml-py library for testing
 */

module.exports = {
  nvmlInit: jest.fn(),
  nvmlShutdown: jest.fn(),
  nvmlDeviceGetCount: jest.fn().mockReturnValue(1),
  nvmlDeviceGetHandleByIndex: jest.fn(),
  nvmlDeviceGetName: jest.fn().mockReturnValue('NVIDIA GH200 Grace Hopper Superchip'),
  nvmlDeviceGetMemoryInfo: jest.fn().mockReturnValue({
    total: 480 * 1024 * 1024 * 1024, // 480GB
    used: 100 * 1024 * 1024 * 1024,  // 100GB
    free: 380 * 1024 * 1024 * 1024   // 380GB
  }),
  nvmlDeviceGetTemperature: jest.fn().mockReturnValue(65),
  nvmlDeviceGetPowerUsage: jest.fn().mockReturnValue(350000), // 350W
  nvmlDeviceGetUtilizationRates: jest.fn().mockReturnValue({
    gpu: 75,
    memory: 60
  })
};