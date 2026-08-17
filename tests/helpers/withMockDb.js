// tests/helpers/withMockDb.js
// Standard pattern for per-test Firestore isolation. The mock db is a shared
// singleton (see tests/mocks/_firebase.mock.js) because jest's moduleNameMapper
// resolves every require('./_firebase') to the same mock module instance across
// a test file. Isolation between tests is achieved by clearing the mock's
// internal store, not by creating new module instances (which would require
// jest.resetModules() + re-requiring api files per test - unnecessary overhead
// given the store is a plain mutable object).

const { db } = require('../mocks/_firebase.mock');

function resetDb() {
  db._store.docs = {};
}

function seed(collection, id, data) {
  db._store.docs[`${collection}/${id}`] = JSON.parse(JSON.stringify(data));
}

function seedNested(path, data) {
  // path e.g. 'academies/acy1/batches/b1'
  db._store.docs[path] = JSON.parse(JSON.stringify(data));
}

function getDoc(collection, id) {
  return db._store.docs[`${collection}/${id}`];
}

module.exports = { db, resetDb, seed, seedNested, getDoc };
