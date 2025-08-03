/**
 * Mock for faiss-node library for testing
 */

const IndexFlatIP = jest.fn().mockImplementation(() => ({
  add: jest.fn(),
  search: jest.fn().mockReturnValue({
    distances: new Float32Array([0.95, 0.87, 0.82]),
    labels: new BigInt64Array([1n, 2n, 3n])
  }),
  ntotal: 0,
  d: 512,
  train: jest.fn(),
  write: jest.fn(),
  read: jest.fn()
}));

const IndexIVFFlat = jest.fn().mockImplementation(() => ({
  add: jest.fn(),
  search: jest.fn().mockReturnValue({
    distances: new Float32Array([0.95, 0.87, 0.82]),
    labels: new BigInt64Array([1n, 2n, 3n])
  }),
  ntotal: 0,
  d: 512,
  nlist: 100,
  train: jest.fn(),
  write: jest.fn(),
  read: jest.fn()
}));

module.exports = {
  IndexFlatIP,
  IndexIVFFlat
};