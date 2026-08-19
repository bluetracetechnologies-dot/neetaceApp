const { resetDb, seed, getDoc } = require('../helpers/withMockDb');
const { baseUser } = require('../fixtures/users.fixture');
const handler = require('../../api/pricing');

function mockReqRes(body, method = 'POST') {
  const req = { method, body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}
beforeEach(() => resetDb());

describe('pricing.js — GET (public, no auth)', () => {
  test('seeds and returns DEFAULT_PRICING on first call when nothing exists yet', async () => {
    const { req, res } = mockReqRes({}, 'GET');
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.plan_pro.price_paise).toBe(79900);
    const stored = getDoc('config', 'pricing');
    expect(stored).toBeDefined(); // confirms it was actually persisted, not just returned
  });

  test('returns the real stored config on subsequent calls, not defaults', async () => {
    seed('config', 'pricing', { plan_pro: { price_paise: 55500, label: 'Custom Pro' } });
    const { req, res } = mockReqRes({}, 'GET');
    await handler(req, res);
    expect(res._json.plan_pro.price_paise).toBe(55500);
  });

  test('falls back to DEFAULT_PRICING gracefully if the read throws, never a 500', async () => {
    const { db } = require('../mocks/_firebase.mock');
    const original = db.collection;
    db.collection = () => { throw new Error('down'); };
    try {
      const { req, res } = mockReqRes({}, 'GET');
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.plan_pro.price_paise).toBe(79900);
    } finally {
      db.collection = original;
    }
  });
});

describe('pricing.js — POST update (admin only)', () => {
  test('rejects a non-admin user', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', role: 'user' }));
    const { req, res } = mockReqRes({ action: 'update', adminUid: 'u1', sessionToken: 'valid_session_token_123', config: { plan_pro: { price_paise: 50000 } } });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test('a real admin can update pricing, merges rather than overwrites', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    seed('config', 'pricing', { plan_starter: { price_paise: 29900 } });
    const { req, res } = mockReqRes({ action: 'update', adminUid: 'u_admin', sessionToken: 'valid_session_token_123', config: { plan_pro: { price_paise: 60000 } } });
    await handler(req, res);
    expect(res._status).toBe(200);
    const stored = getDoc('config', 'pricing');
    expect(stored.plan_pro.price_paise).toBe(60000);
    expect(stored.plan_starter.price_paise).toBe(29900); // untouched, merge preserved it
  });

  test('FIXED: rejects a negative price_paise instead of silently storing it', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    const { req, res } = mockReqRes({ action: 'update', adminUid: 'u_admin', sessionToken: 'valid_session_token_123', config: { plan_pro: { price_paise: -500 } } });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('FIXED: rejects a non-numeric price_paise (e.g. accidentally a string)', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    const { req, res } = mockReqRes({ action: 'update', adminUid: 'u_admin', sessionToken: 'valid_session_token_123', config: { plan_pro: { price_paise: '499' } } });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('reset restores DEFAULT_PRICING exactly', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    seed('config', 'pricing', { plan_pro: { price_paise: 1 } });
    const { req, res } = mockReqRes({ action: 'reset', adminUid: 'u_admin', sessionToken: 'valid_session_token_123' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('config', 'pricing').plan_pro.price_paise).toBe(79900);
  });

  test('rejects missing credentials', async () => {
    const { req, res } = mockReqRes({ action: 'update', config: {} });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('rejects an unrecognized action', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    const { req, res } = mockReqRes({ action: 'delete_everything', adminUid: 'u_admin', sessionToken: 'valid_session_token_123' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});

describe('pricing.js — method guard', () => {
  test('rejects DELETE/PUT/other methods', async () => {
    const { req, res } = mockReqRes({}, 'DELETE');
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
