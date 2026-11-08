/** API tests against a real Oracle database; run via `nx run api:integration`. */
module.exports = {
  displayName: 'api-integration',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
  testTimeout: 120000,
  maxWorkers: 1,
};
