// tests/mocks/_firebase.mock.js
//
// Drop-in replacement for api/_firebase.js during tests. jest.config.js maps
// any require('./_firebase') or require('../_firebase') from within api/*.js
// to THIS file instead - so requiring scoring.js/adaptive.js/etc. in a test
// never triggers real Firebase Admin initialization, regardless of what
// environment variables are or aren't set in the test/CI environment.
//
// Each test file creates its own fresh mock db via createMockFirestore() and
// injects it using jest.spyOn or by re-requiring with a seeded store - see
// tests/helpers/withMockDb.js for the standard pattern used across this suite.

const { createMockFirestore } = require('./firestore.mock');

// Shared default instance - individual tests that need isolation should use
// the withMockDb helper instead of relying on this shared one persisting state.
const db = createMockFirestore();

module.exports = {
  admin: { firestore: () => db },
  db,
  auth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
  },
};
