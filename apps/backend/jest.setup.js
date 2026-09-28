// Jest setup file - runs before all tests
process.env.NODE_ENV = 'test';
process.env.TEST_USER_ID = 'test-user-entra-id';
process.env.MONGODB_URI = 'mongodb://localhost:27017/bw-test';

// Suppress console.error for expected auth errors in tests
const originalConsoleError = console.error;
console.error = (...args) => {
  // Don't log expected authentication errors during tests
  const message = args[0];
  if (typeof message === 'string' &&
      (message.includes('[AuthenticationError]') ||
       message.includes('Context creation error'))) {
    return;
  }
  originalConsoleError.apply(console, args);
};
