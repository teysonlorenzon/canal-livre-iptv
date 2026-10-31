process.env.TZ = 'UTC';

export default {
  roots: ['<rootDir>/tests/unit'],
  testMatch: ['**/*.test.ts'],
  testEnvironment: '<rootDir>/tests/unit/support/environment.ts',
  testEnvironmentOptions: { url: 'http://127.0.0.1:8765/', pretendToBeVisual: true },
  setupFiles: ['<rootDir>/tests/unit/support/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: { '\\.css$': '<rootDir>/tests/unit/support/style-mock.ts' },
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' }, sourceMaps: 'inline' },
    ],
  },
  coverageProvider: 'babel',
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', 'apps/tv-webos/*.ts', 'apps/mobile/*.ts', 'apps/desktop/*.ts', 'tools/*.ts', '!**/*.d.ts'],
  coverageThreshold: { global: { lines: 100, functions: 100 } },
};
