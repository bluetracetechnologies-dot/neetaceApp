const { resetDb, seed, db } = require('../helpers/withMockDb');
const { baseUser } = require('../fixtures/users.fixture');
const { verifySession, verifyAdminSession } = require('../../lib/session');

beforeEach(() => resetDb());

describe('verifySession', () => {
  test('succeeds for a real user with the correct sessionToken', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    const result = await verifySession(db, 'u1', 'real_token');
    expect(result.ok).toBe(true);
    expect(result.profile.uid).toBe('u1');
  });

  test('rejects a non-existent uid with 401 (normalized, not 404)', async () => {
    const result = await verifySession(db, 'ghost', 'anything');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  test('rejects a wrong sessionToken', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    const result = await verifySession(db, 'u1', 'wrong_token');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  test('rejects missing uid or sessionToken with 400, distinct from 401', async () => {
    const r1 = await verifySession(db, '', 'token');
    const r2 = await verifySession(db, 'u1', '');
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
  });
});

describe('verifyAdminSession', () => {
  test('succeeds for a real admin with the correct sessionToken', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', sessionToken: 'admin_token', role: 'admin' }));
    const result = await verifyAdminSession(db, 'u_admin', 'admin_token');
    expect(result.ok).toBe(true);
  });

  test('rejects a real user who is NOT an admin, even with a correct session token', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token', role: 'user' }));
    const result = await verifyAdminSession(db, 'u1', 'real_token');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  test('rejects an admin with the wrong session token', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', sessionToken: 'admin_token', role: 'admin' }));
    const result = await verifyAdminSession(db, 'u_admin', 'wrong');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  test('rejects a non-existent uid', async () => {
    const result = await verifyAdminSession(db, 'ghost', 'anything');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });
});
