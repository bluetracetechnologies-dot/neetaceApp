// tests/mocks/firestore.mock.js
//
// In-memory Firestore Admin SDK mock. Covers exactly the method surface confirmed
// (via grep against real api/*.js source) to be used across the codebase:
//   collection().doc().get/set/update
//   collection().doc().collection().doc()   (subcollections - academy batches/students)
//   collection().add()
//   collection().where().get() / .where().count().get() / .where().limit().get()
//   collection().orderBy().limit().get()
//   collection().count().get()
//   collectionGroup()
//   batch() with .set/.update/.delete/.commit
//
// SAFETY: this mock never makes a network call. It exists specifically so that
// requiring api/*.js in a test never touches real Firebase, regardless of what
// environment variables are or aren't present.

function makeSnap(id, data) {
  return {
    id,
    exists: data !== undefined && data !== null,
    data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
    ref: null, // set by caller where needed
  };
}

class MockDocRef {
  constructor(store, collPath, id) {
    this._store = store;
    this._collPath = collPath;
    this.id = id;
    this._key = `${collPath}/${id}`;
  }
  async get() {
    const data = this._store.docs[this._key];
    const snap = makeSnap(this.id, data);
    snap.ref = this;
    return snap;
  }
  async set(data, opts) {
    const existing = this._store.docs[this._key];
    if (opts && opts.merge && existing) {
      this._store.docs[this._key] = { ...existing, ...data };
    } else {
      this._store.docs[this._key] = { ...data };
    }
    return { writeTime: new Date() };
  }
  async update(data) {
    if (!this._store.docs[this._key]) {
      throw new Error(`MockFirestore: cannot update non-existent doc ${this._key}`);
    }
    // Support Firestore dot-path field updates, e.g. 'scores.global.rank'
    const target = this._store.docs[this._key];
    Object.entries(data).forEach(([k, v]) => {
      if (k.includes('.')) {
        const parts = k.split('.');
        let obj = target;
        for (let i = 0; i < parts.length - 1; i++) {
          obj[parts[i]] = obj[parts[i]] || {};
          obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = v;
      } else {
        target[k] = v;
      }
    });
    return { writeTime: new Date() };
  }
  collection(sub) {
    return new MockCollectionRef(this._store, `${this._collPath}/${this.id}/${sub}`);
  }
}

class MockQuery {
  constructor(store, collPath, filters = [], opts = {}) {
    this._store = store;
    this._collPath = collPath;
    this._filters = filters;
    this._opts = opts;
  }
  where(field, op, value) {
    return new MockQuery(this._store, this._collPath, [...this._filters, { field, op, value }], this._opts);
  }
  orderBy(field, dir = 'asc') {
    return new MockQuery(this._store, this._collPath, this._filters, { ...this._opts, orderBy: field, dir });
  }
  limit(n) {
    return new MockQuery(this._store, this._collPath, this._filters, { ...this._opts, limit: n });
  }
  startAfter(docSnapshot) {
    return new MockQuery(this._store, this._collPath, this._filters, { ...this._opts, startAfterDoc: docSnapshot });
  }
  _matchDocs(prefixMatch) {
    const entries = Object.entries(this._store.docs).filter(([key]) =>
      prefixMatch ? key.startsWith(this._collPath === '__group__' ? '' : this._collPath + '/') : key.startsWith(this._collPath + '/')
    );
    let results = entries.filter(([key, data]) => {
      if (prefixMatch && this._collPath !== '__group__') {
        // collectionGroup: match any doc whose path CONTAINS /<groupName>/ as a segment
        const groupName = this._store._lastGroupName;
        if (!key.includes(`/${groupName}/`)) return false;
      }
      return this._filters.every((f) => {
        const val = getPath(data, f.field);
        switch (f.op) {
          case '==': return val === f.value;
          case '!=': return val !== f.value && val !== undefined && val !== null;
          case '>': return val > f.value;
          case '>=': return val >= f.value;
          case '<': return val < f.value;
          case '<=': return val <= f.value;
          default: return true;
        }
      });
    });
    if (this._opts.orderBy) {
      results.sort((a, b) => {
        const av = getPath(a[1], this._opts.orderBy);
        const bv = getPath(b[1], this._opts.orderBy);
        return this._opts.dir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
      });
    }
    if (this._opts.startAfterDoc) {
      // Real Firestore semantics: skip everything up to and including the cursor doc,
      // in whatever order is currently active (orderBy field, or doc id as fallback).
      const cursorId = this._opts.startAfterDoc.id;
      const cursorIdx = results.findIndex(([key]) => key.split('/').pop() === cursorId);
      if (cursorIdx >= 0) results = results.slice(cursorIdx + 1);
    }
    if (this._opts.limit) results = results.slice(0, this._opts.limit);
    return results;
  }
  async get() {
    const isGroup = this._collPath === '__group__';
    const results = this._matchDocs(isGroup);
    const docs = results.map(([key, data]) => {
      const id = key.split('/').pop();
      const snap = makeSnap(id, data);
      snap.ref = new MockDocRef(this._store, key.substring(0, key.lastIndexOf('/')), id);
      return snap;
    });
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) };
  }
  count() {
    return { get: async () => ({ data: () => ({ count: this._matchDocs(this._collPath === '__group__').length }) }) };
  }
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

class MockCollectionRef extends MockQuery {
  constructor(store, collPath) {
    super(store, collPath);
    this._autoIdCounter = 0;
  }
  doc(id) {
    const docId = id || `auto_${this._collPath}_${++this._autoIdCounter}_${Date.now()}`;
    return new MockDocRef(this._store, this._collPath, docId);
  }
  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

class MockBatch {
  constructor(store) {
    this._store = store;
    this._ops = [];
  }
  set(ref, data, opts) { this._ops.push({ type: 'set', ref, data, opts }); return this; }
  update(ref, data) { this._ops.push({ type: 'update', ref, data }); return this; }
  delete(ref) { this._ops.push({ type: 'delete', ref }); return this; }
  async commit() {
    for (const op of this._ops) {
      if (op.type === 'set') await op.ref.set(op.data, op.opts);
      else if (op.type === 'update') await op.ref.update(op.data);
      else if (op.type === 'delete') delete this._store.docs[op.ref._key];
    }
    return [];
  }
}

function createMockFirestore(seedDocs = {}) {
  const store = { docs: { ...seedDocs }, _lastGroupName: null };
  return {
    _store: store, // exposed for test setup/assertions
    collection(path) {
      return new MockCollectionRef(store, path);
    },
    collectionGroup(name) {
      store._lastGroupName = name;
      return new MockQuery(store, '__group__');
    },
    batch() {
      return new MockBatch(store);
    },
  };
}

module.exports = { createMockFirestore, MockQueryForPatching: MockQuery };
