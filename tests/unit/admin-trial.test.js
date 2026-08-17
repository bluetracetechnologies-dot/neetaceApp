const { resetDb, seed, getDoc } = require('../helpers/withMockDb');
const { baseUser, ADMIN_USER } = require('../fixtures/users.fixture');
const handler = require('../../api/admin');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}

beforeEach(() => resetDb());

describe('Priority 11: Trial System - get_trial_config (public exception)', () => {
  test('REGRESSION: get_trial_config works with the anonymous placeholder uid/sessionToken used on every page load', async () => {
    // This exact shape (uid:"anon", sessionToken:"anon") is what index.html's
    // loadTrialConfig() sends before login. Before the fix this always 403'd -
    // admin-configured trial settings never reached a single real user.
    const { req, res } = mockReqRes({ action: 'get_trial_config', uid: 'anon', sessionToken: 'anon' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json).toHaveProperty('days');
  });

  test('returns config/trial doc contents when it exists', async () => {
    seed('config', 'trial', { days: 10, dailyQuestionCap: 15, allFeatures: false });
    const { req, res } = mockReqRes({ action: 'get_trial_config', uid: 'anon', sessionToken: 'anon' });
    await handler(req, res);
    expect(res._json.days).toBe(10);
    expect(res._json.dailyQuestionCap).toBe(15);
  });

  test('returns sensible defaults when config/trial does not exist yet', async () => {
    const { req, res } = mockReqRes({ action: 'get_trial_config', uid: 'anon', sessionToken: 'anon' });
    await handler(req, res);
    expect(res._json).toEqual({ days: 7, dailyQuestionCap: 10, allFeatures: true });
  });

  test('works even without uid/sessionToken present at all (fully anonymous)', async () => {
    const { req, res } = mockReqRes({ action: 'get_trial_config' });
    await handler(req, res);
    expect(res._status).toBe(200);
  });

  test('does not leak any user or admin data - response is only trial config fields', async () => {
    seed('users', 'u_secret', baseUser({ uid: 'u_secret', email: 'private@example.com' }));
    const { req, res } = mockReqRes({ action: 'get_trial_config', uid: 'anon', sessionToken: 'anon' });
    await handler(req, res);
    expect(JSON.stringify(res._json)).not.toContain('private@example.com');
  });
});

describe('Priority 11 + Security: every OTHER admin action requires real admin auth', () => {
  const dangerousActions = [
    { action: 'list_users', extra: {} },
    { action: 'disable', extra: { targetUid: 'someone' } },
    { action: 'grant_pro', extra: { targetUid: 'someone' } },
    { action: 'kill_all', extra: {} },
    { action: 'set_custom_price', extra: { targetUid: 'someone', customPriceRupees: 1 } },
  ];

  test.each(dangerousActions)('$action rejects the anon placeholder (must NOT be public like get_trial_config)', async ({ action, extra }) => {
    const { req, res } = mockReqRes({ action, uid: 'anon', sessionToken: 'anon', ...extra });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test.each(dangerousActions)('$action rejects a real but non-admin user', async ({ action, extra }) => {
    seed('users', 'u_regular', baseUser({ uid: 'u_regular', role: 'user' }));
    const { req, res } = mockReqRes({ action, uid: 'u_regular', sessionToken: 'valid_session_token_123', ...extra });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test.each(dangerousActions)('$action succeeds for a real admin user', async ({ action, extra }) => {
    seed('users', 'u_admin', ADMIN_USER);
    if (extra.targetUid === 'someone') {
      seed('users', 'someone', baseUser({ uid: 'someone' }));
    }
    const { req, res } = mockReqRes({ action, uid: 'u_admin', sessionToken: 'admin_session_token', ...extra });
    await handler(req, res);
    expect(res._status).not.toBe(403);
  });
});

describe('Priority 11: grant_days adds trial days correctly', () => {
  test('extends trialEnd by the requested number of days', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u_target', baseUser({ uid: 'u_target', trialEnd: '2026-08-20T00:00:00.000Z' }));
    const { req, res } = mockReqRes({ action: 'grant_days', uid: 'u_admin', sessionToken: 'admin_session_token', targetUid: 'u_target', days: 5 });
    await handler(req, res);
    expect(res._status).toBe(200);
    const user = getDoc('users', 'u_target');
    expect(new Date(user.trialEnd).getTime()).toBeGreaterThan(new Date('2026-08-20T00:00:00.000Z').getTime());
  });
});

describe('Priority 11: kill_all disables all non-admin users', () => {
  test('disables regular users but leaves admin accounts untouched', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u1', baseUser({ uid: 'u1', disabled: false }));
    seed('users', 'u2', baseUser({ uid: 'u2', disabled: false }));
    const { req, res } = mockReqRes({ action: 'kill_all', uid: 'u_admin', sessionToken: 'admin_session_token' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'u1').disabled).toBe(true);
    expect(getDoc('users', 'u2').disabled).toBe(true);
    expect(getDoc('users', 'u_admin').disabled).toBeFalsy();
  });
});
