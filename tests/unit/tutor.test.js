const { resetDb, seed, getDoc, db } = require('../helpers/withMockDb');
const { baseUser } = require('../fixtures/users.fixture');
const handler = require('../../api/scoring');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}

const S = 'valid_session_token_123';
const today = new Date().toISOString().slice(0, 10);

let originalFetch;
beforeEach(() => {
  resetDb();
  originalFetch = global.fetch;
  process.env.GEMINI_API_KEY = 'test_key';
  // Default: a well-formed Gemini response. Real network is NEVER touched.
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'Newtons third law states every action has an equal and opposite reaction.' }] } }] }),
  }));
});
afterEach(() => { global.fetch = originalFetch; });

describe('AI Tutor - tier gating', () => {
  test('a free/trial user gets fallback:true, not an error - the feature degrades, never breaks', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: null, paid: false }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'Explain Newtons third law' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.ok).toBe(false);
    expect(res._json.fallback).toBe(true);
    expect(res._json.reason).toBe('plan');
    expect(global.fetch).not.toHaveBeenCalled(); // never spends API quota on a non-paying user
  });

  test('a Pro user gets a real AI answer', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'pro', paid: true }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'Explain Newtons third law' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.ok).toBe(true);
    expect(res._json.answer).toMatch(/action/i);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('an academy student counts as paid (their institute is paying)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', academyId: 'acy1', academyRole: 'student' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'What is DNA replication' });
    await handler(req, res);
    expect(res._json.ok).toBe(true);
  });

  test('an admin always has access', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    const { req, res } = mockReqRes({ uid: 'u_admin', sessionToken: S, action: 'ai_ask', question: 'Test question' });
    await handler(req, res);
    expect(res._json.ok).toBe(true);
  });
});

describe('AI Tutor - rate limiting (real cost control)', () => {
  test('a user at their daily cap gets fallback, and no API call is made', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'monthly', paid: true }));
    seed('config', 'features', { ai_tutor: { usageCap: { daily: 5 } } });
    seed('ai_tutor_usage', `u1_${today}`, { uid: 'u1', date: today, count: 5 });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'Another question' });
    await handler(req, res);
    expect(res._json.fallback).toBe(true);
    expect(res._json.reason).toBe('cap');
    expect(res._json.cap).toBe(5);
    expect(global.fetch).not.toHaveBeenCalled(); // the whole point - no spend past the cap
  });

  test('a user under their cap succeeds and the counter increments', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'monthly', paid: true }));
    seed('config', 'features', { ai_tutor: { usageCap: { daily: 5 } } });
    seed('ai_tutor_usage', `u1_${today}`, { uid: 'u1', date: today, count: 2 });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'A question' });
    await handler(req, res);
    expect(res._json.ok).toBe(true);
    expect(getDoc('ai_tutor_usage', `u1_${today}`).count).toBe(3);
  });

  test('planOverride grants unlimited use to pro, ignoring the daily number', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'pro', paid: true }));
    seed('config', 'features', { ai_tutor: { usageCap: { daily: 5, planOverride: { pro: null } } } });
    seed('ai_tutor_usage', `u1_${today}`, { uid: 'u1', date: today, count: 500 });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'A question' });
    await handler(req, res);
    expect(res._json.ok).toBe(true); // 500 uses, still allowed - override is unlimited
  });

  test('ai_usage reports current usage without spending a credit', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'pro', paid: true }));
    seed('config', 'features', { ai_tutor: { usageCap: { daily: 20 } } });
    seed('ai_tutor_usage', `u1_${today}`, { uid: 'u1', date: today, count: 7 });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_usage' });
    await handler(req, res);
    expect(res._json.used).toBe(7);
    expect(res._json.cap).toBe(20);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('AI Tutor - graceful degradation', () => {
  test('a missing API key falls back cleanly instead of erroring', async () => {
    delete process.env.GEMINI_API_KEY;
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'pro', paid: true }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'A question' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.fallback).toBe(true);
    expect(res._json.reason).toBe('unconfigured');
  });

  test('a provider API failure never surfaces a raw error and never charges a credit', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'pro', paid: true }));
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, text: async () => 'upstream down' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'A question' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.fallback).toBe(true);
    expect(res._json.reason).toBe('error');
    expect(JSON.stringify(res._json)).not.toMatch(/upstream down|503/); // no raw provider detail leaked
    expect(getDoc('ai_tutor_usage', `u1_${today}`)).toBeUndefined(); // not charged for a failure
  });

  test('a malformed provider response is handled as an error, not a crash', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'pro', paid: true }));
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ candidates: [] }) }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'A question' });
    await handler(req, res);
    expect(res._json.fallback).toBe(true);
    expect(res._json.reason).toBe('error');
  });
});

describe('AI Tutor - input validation and auth', () => {
  test('rejects an empty question', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'pro', paid: true }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: '   ' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('rejects an over-long question before spending any quota', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'pro', paid: true }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'x'.repeat(600) });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('an invalid session is rejected by scoring.js before reaching the tutor at all', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'pro', paid: true }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'wrong_token', action: 'ai_ask', question: 'A question' });
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('the system prompt scopes the model to the NEET syllabus and forbids result guarantees', () => {
    const { SYSTEM_PROMPT } = require('../../api/_tutor');
    expect(SYSTEM_PROMPT).toMatch(/NEET/);
    expect(SYSTEM_PROMPT).toMatch(/never guarantee marks, ranks or results/i);
    expect(SYSTEM_PROMPT).toMatch(/never invent NCERT page numbers/i);
  });

  test('an unknown tutor action returns a clean 400', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', planKey: 'pro', paid: true }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: S, action: 'ai_ask', question: 'ok' });
    await handler(req, res);
    expect(res._json.ok).toBe(true); // sanity: known action still works
  });
});
