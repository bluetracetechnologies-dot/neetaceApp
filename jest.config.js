// jest.config.js
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/tests/**/*.test.js'],
  // Every require('./_firebase') from inside api/*.js resolves to the mock -
  // real Firebase Admin is never initialized during any test run, by construction.
  moduleNameMapper: {
    '^\\./_firebase$': '<rootDir>/tests/mocks/_firebase.mock.js',
    // auth.js and admin.js both do require('./notifications') to fire real
    // dispatch()/sendEmail() calls. Mapped to a jest.fn()-based mock so tests
    // can assert on exactly what was called, with what arguments - this is
    // how "the email fires" gets PROVEN, not just traced by reading code.
    '^\\./notifications$': '<rootDir>/tests/mocks/notifications.mock.js',
  },
  collectCoverage: false, // enabled via --coverage flag (npm run test:coverage), not by default
  collectCoverageFrom: [
    'api/scoring.js',
    'api/adaptive.js',
    'api/academy.js',
    'api/admin.js',
    'api/features.js',
    'lib/**/*.js',
    '!lib/**/*.test.js',
  ],
  coverageThreshold: {
    // Thresholds updated to match what THIS pass actually achieved (was: adaptive.js 43%,
    // academy.js 64%, admin.js 43%, features.js 0% - all closed this session). Small
    // margin below the real achieved number so a future minor refactor doesn't
    // immediately fail CI on a 0.1% fluctuation.
    'api/scoring.js':   { statements: 90, branches: 80, functions: 84, lines: 94 },
    'api/adaptive.js':  { statements: 89, branches: 75, functions: 99, lines: 94 },
    'api/academy.js':   { statements: 87, branches: 76, functions: 99, lines: 97 },
    'api/admin.js':     { statements: 79, branches: 70, functions: 75, lines: 90 },
    'api/features.js':  { statements: 83, branches: 73, functions: 99, lines: 90 },
    'lib/chapter-mastery.js': { statements: 89, branches: 82, functions: 79, lines: 99 },
    'lib/galti-classify.js':  { statements: 94, branches: 83, functions: 99, lines: 97 },
    'lib/learning-dna.js':    { statements: 99, branches: 63, functions: 99, lines: 99 },
    'lib/score-predictor.js': { statements: 93, branches: 73, functions: 84, lines: 97 },
  },
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  verbose: true,
};
