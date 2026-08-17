const { createMockFirestore } = require('./firestore.mock');

describe('Firestore mock smoke test (must pass before anything depends on it)', () => {
  test('set + get round-trip', async () => {
    const db = createMockFirestore();
    await db.collection('users').doc('u1').set({ name: 'Rahim', role: 'admin' });
    const snap = await db.collection('users').doc('u1').get();
    expect(snap.exists).toBe(true);
    expect(snap.data().name).toBe('Rahim');
  });

  test('get on non-existent doc returns exists=false', async () => {
    const db = createMockFirestore();
    const snap = await db.collection('users').doc('ghost').get();
    expect(snap.exists).toBe(false);
    expect(snap.data()).toBeUndefined();
  });

  test('update merges fields, throws if doc missing', async () => {
    const db = createMockFirestore();
    await db.collection('users').doc('u1').set({ a: 1 });
    await db.collection('users').doc('u1').update({ b: 2 });
    const snap = await db.collection('users').doc('u1').get();
    expect(snap.data()).toEqual({ a: 1, b: 2 });
    await expect(db.collection('users').doc('nope').update({ x: 1 })).rejects.toThrow();
  });

  test('dot-path update (e.g. scores.global.rank)', async () => {
    const db = createMockFirestore();
    await db.collection('users').doc('u1').set({ scores: { global: { weighted: 10 } } });
    await db.collection('users').doc('u1').update({ 'scores.global.rank': 5 });
    const snap = await db.collection('users').doc('u1').get();
    expect(snap.data().scores.global.rank).toBe(5);
    expect(snap.data().scores.global.weighted).toBe(10);
  });

  test('where + count', async () => {
    const db = createMockFirestore();
    await db.collection('users').doc('a').set({ paid: true });
    await db.collection('users').doc('b').set({ paid: true });
    await db.collection('users').doc('c').set({ paid: false });
    const countSnap = await db.collection('users').where('paid', '==', true).count().get();
    expect(countSnap.data().count).toBe(2);
  });

  test('where with > operator (rank query pattern)', async () => {
    const db = createMockFirestore();
    await db.collection('users').doc('a').set({ scores: { global: { rankScore: 100 } } });
    await db.collection('users').doc('b').set({ scores: { global: { rankScore: 50 } } });
    const snap = await db.collection('users').where('scores.global.rankScore', '>', 60).get();
    expect(snap.size).toBe(1);
  });

  test('add() auto-generates id', async () => {
    const db = createMockFirestore();
    const ref = await db.collection('sessions').add({ uid: 'u1', score: 5 });
    expect(ref.id).toBeTruthy();
    const snap = await ref.get();
    expect(snap.data().uid).toBe('u1');
  });

  test('subcollections (academy batches/students pattern)', async () => {
    const db = createMockFirestore();
    await db.collection('academies').doc('acy1').set({ name: 'Test Academy' });
    await db.collection('academies').doc('acy1').collection('batches').doc('b1').set({ batchCode: 'BT1' });
    const snap = await db.collection('academies').doc('acy1').collection('batches').doc('b1').get();
    expect(snap.data().batchCode).toBe('BT1');
  });

  test('collectionGroup finds nested docs across parents', async () => {
    const db = createMockFirestore();
    await db.collection('academies').doc('acy1').collection('batches').doc('b1').set({ batchCode: 'BT1', active: true });
    await db.collection('academies').doc('acy2').collection('batches').doc('b2').set({ batchCode: 'BT2', active: true });
    const snap = await db.collectionGroup('batches').where('batchCode', '==', 'BT2').limit(1).get();
    expect(snap.size).toBe(1);
    expect(snap.docs[0].data().batchCode).toBe('BT2');
  });

  test('batch commit applies multiple writes atomically', async () => {
    const db = createMockFirestore();
    const ref1 = db.collection('users').doc('a');
    const ref2 = db.collection('users').doc('b');
    await ref1.set({ v: 1 });
    await ref2.set({ v: 1 });
    const batch = db.batch();
    batch.update(ref1, { v: 2 });
    batch.delete(ref2);
    await batch.commit();
    expect((await ref1.get()).data().v).toBe(2);
    expect((await ref2.get()).exists).toBe(false);
  });

  test('orderBy + limit', async () => {
    const db = createMockFirestore();
    await db.collection('sessions').doc('s1').set({ playedAt: '2026-01-01' });
    await db.collection('sessions').doc('s2').set({ playedAt: '2026-01-03' });
    await db.collection('sessions').doc('s3').set({ playedAt: '2026-01-02' });
    const snap = await db.collection('sessions').orderBy('playedAt', 'asc').limit(2).get();
    expect(snap.size).toBe(2);
    expect(snap.docs[0].id).toBe('s1');
  });
});
