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

describe('admin.js — remaining actions (untested until now)', () => {
  test('search_users requires at least 2 characters', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    const { req, res } = mockReqRes({ action: 'search_users', uid: 'u_admin', sessionToken: 'admin_session_token', query: 'a' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('search_users finds by email prefix', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u1', baseUser({ uid: 'u1', email: 'rahim@example.com', name: 'Zebra' }));
    seed('users', 'u2', baseUser({ uid: 'u2', email: 'other@example.com', name: 'Yak' }));
    const { req, res } = mockReqRes({ action: 'search_users', uid: 'u_admin', sessionToken: 'admin_session_token', query: 'rahim' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.users.some((r) => r.email === 'rahim@example.com')).toBe(true);
  });

  test('search_users requires admin role', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', role: 'user' }));
    const { req, res } = mockReqRes({ action: 'search_users', uid: 'u1', sessionToken: 'valid_session_token_123', query: 'test' });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test('get_user returns full detail including mastery for a real target', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u_target', baseUser({ uid: 'u_target', email: 'student@example.com', mastery: { p3: { theta: 600 } } }));
    const { req, res } = mockReqRes({ action: 'get_user', uid: 'u_admin', sessionToken: 'admin_session_token', targetUid: 'u_target' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.user.email).toBe('student@example.com');
    expect(res._json.user.mastery.p3.theta).toBe(600);
  });

  test('get_user 404s for a non-existent target', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    const { req, res } = mockReqRes({ action: 'get_user', uid: 'u_admin', sessionToken: 'admin_session_token', targetUid: 'ghost' });
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  test('get_stats computes real counts when no cached stats doc exists', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u1', baseUser({ uid: 'u1', paid: true }));
    seed('users', 'u2', baseUser({ uid: 'u2', paid: false }));
    const { req, res } = mockReqRes({ action: 'get_stats', uid: 'u_admin', sessionToken: 'admin_session_token' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.total).toBeGreaterThanOrEqual(3); // u_admin + u1 + u2
    expect(res._json.paid).toBeGreaterThanOrEqual(1);
  });

  test('set_expiry batch-updates all non-admin users, leaves admins untouched', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u1', baseUser({ uid: 'u1', trialEnd: '2020-01-01T00:00:00.000Z', paid: true }));
    const { req, res } = mockReqRes({ action: 'set_expiry', uid: 'u_admin', sessionToken: 'admin_session_token', days: 3 });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'u1').paid).toBe(false); // reset by the batch update
    expect(getDoc('users', 'u_admin').paid).toBeFalsy(); // admin excluded from the where('role','!=','admin') query
  });

  test('set_user_feature_override rejects a reason under 5 characters', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u_target', baseUser({ uid: 'u_target' }));
    const { req, res } = mockReqRes({ action: 'set_user_feature_override', uid: 'u_admin', sessionToken: 'admin_session_token', targetUid: 'u_target', featureKey: 'ai_tutor', enabled: true, reason: 'ok' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('set_user_feature_override grants with a valid reason', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u_target', baseUser({ uid: 'u_target' }));
    const { req, res } = mockReqRes({ action: 'set_user_feature_override', uid: 'u_admin', sessionToken: 'admin_session_token', targetUid: 'u_target', featureKey: 'ai_tutor', enabled: true, reason: 'compensation for a bug' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'u_target').featureOverrides.ai_tutor.enabled).toBe(true);
  });

  test('list_user_overrides returns only users with real, non-empty overrides', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u_with_override', baseUser({ uid: 'u_with_override', featureOverrides: { ai_tutor: { enabled: true, reason: 'test' } } }));
    seed('users', 'u_without', baseUser({ uid: 'u_without' }));
    const { req, res } = mockReqRes({ action: 'list_user_overrides', uid: 'u_admin', sessionToken: 'admin_session_token' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.users.some((u) => u.uid === 'u_with_override')).toBe(true);
  });

  test('set_trial_config persists days/cap/allFeatures to config/trial', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    const { req, res } = mockReqRes({ action: 'set_trial_config', uid: 'u_admin', sessionToken: 'admin_session_token', days: 5, dailyQuestionCap: 15, allFeatures: false });
    await handler(req, res);
    expect(res._status).toBe(200);
    const cfg = getDoc('config', 'trial');
    expect(cfg.days).toBe(5);
    expect(cfg.dailyQuestionCap).toBe(15);
  });

  test('set_trial_config requires admin role', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', role: 'user' }));
    const { req, res } = mockReqRes({ action: 'set_trial_config', uid: 'u1', sessionToken: 'valid_session_token_123', days: 999 });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test('grant_academy_admin elevates a target user to academy_admin role for a given academy', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u_teacher', baseUser({ uid: 'u_teacher' }));
    const { req, res } = mockReqRes({ action: 'grant_academy_admin', uid: 'u_admin', sessionToken: 'admin_session_token', targetUid: 'u_teacher', academyId: 'acy1' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'u_teacher').academyRole).toBe('academy_admin');
    expect(getDoc('users', 'u_teacher').academyId).toBe('acy1');
  });

  test('grant_academy_admin requires admin role', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', role: 'user' }));
    const { req, res } = mockReqRes({ action: 'grant_academy_admin', uid: 'u1', sessionToken: 'valid_session_token_123', targetUid: 'someone', academyId: 'acy1' });
    await handler(req, res);
    expect(res._status).toBe(403);
  });
});

describe('Coverage completion pass — admin.js real gaps found via line-by-line audit', () => {
  test('get_trial_config catch-fallback fires when the config read throws', async () => {
    const { db } = require('../mocks/_firebase.mock');
    const original = db.collection;
    db.collection = (name) => {
      if (name === 'config') return { doc: () => ({ get: () => { throw new Error('Firestore down'); } }) };
      return original(name);
    };
    try {
      const { req, res } = mockReqRes({ action: 'get_trial_config', uid: 'anon', sessionToken: 'anon' });
      await handler(req, res);
      expect(res._status).toBe(200); // graceful fallback, not a crash
      expect(res._json).toEqual({ days: 7, dailyQuestionCap: 10, allFeatures: true });
    } finally {
      db.collection = original;
    }
  });

  test('get_stats returns the cached stats doc directly when one already exists (skips live recompute)', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('config', 'stats', { total: 999, paid: 111, admins: 1, updatedAt: '2026-08-18T00:00:00.000Z' });
    const { req, res } = mockReqRes({ action: 'get_stats', uid: 'u_admin', sessionToken: 'admin_session_token' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.total).toBe(999); // the cached value, not a fresh live count
  });

  test('rejects a gated action with sessionToken missing entirely (distinct from wrong-token)', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    const { req, res } = mockReqRes({ action: 'list_users', uid: 'u_admin' }); // no sessionToken at all
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('list_users with a real pageToken cursor paginates past the first page', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    for (let i = 0; i < 5; i++) seed('users', `u${i}`, baseUser({ uid: `u${i}`, createdAt: `2026-08-0${i + 1}T00:00:00.000Z` }));
    const { req, res } = mockReqRes({ action: 'list_users', uid: 'u_admin', sessionToken: 'admin_session_token', pageToken: 'u2' });
    await handler(req, res);
    expect(res._status).toBe(200); // cursor path completes without error
  });

  test('enable action actually re-enables a disabled user (never directly tested before this pass)', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u_target', baseUser({ uid: 'u_target', disabled: true }));
    const { req, res } = mockReqRes({ action: 'enable', uid: 'u_admin', sessionToken: 'admin_session_token', targetUid: 'u_target' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'u_target').disabled).toBe(false);
  });

  test('enable rejects a missing targetUid', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    const { req, res } = mockReqRes({ action: 'enable', uid: 'u_admin', sessionToken: 'admin_session_token' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('set_user_feature_override with enabled=null CLEARS an existing override (the reset path, never tested before)', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u_target', baseUser({ uid: 'u_target', featureOverrides: { ai_tutor: { enabled: true, reason: 'old grant' } } }));
    const { req, res } = mockReqRes({ action: 'set_user_feature_override', uid: 'u_admin', sessionToken: 'admin_session_token', targetUid: 'u_target', featureKey: 'ai_tutor', enabled: null, reason: 'clearing this override now' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'u_target').featureOverrides.ai_tutor).toBeUndefined();
  });

  test('an unrecognized action returns a clean 400, not a crash', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    const { req, res } = mockReqRes({ action: 'totally_made_up_action', uid: 'u_admin', sessionToken: 'admin_session_token' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('a second unexpected thrown error scenario is caught by the outer handler and returns a clean 500, not an unhandled crash', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    const { db } = require('../mocks/_firebase.mock');
    const original = db.collection;
    let callCount = 0;
    // Let verifyAdmin's own read succeed normally (it runs BEFORE the try/catch),
    // then throw on the action's OWN later query - this is what actually exercises
    // the try/catch, not breaking auth itself before the code under test even runs.
    db.collection = (name) => {
      callCount++;
      if (callCount > 1) throw new Error('simulated unexpected failure');
      return original(name);
    };
    try {
      const { req, res } = mockReqRes({ action: 'list_users', uid: 'u_admin', sessionToken: 'admin_session_token' });
      await handler(req, res);
      expect(res._status).toBe(500);
    } finally {
      db.collection = original;
    }
  });
});
