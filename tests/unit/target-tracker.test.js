const { resetDb, seed, getDoc } = require('../helpers/withMockDb');
const { baseUser } = require('../fixtures/users.fixture');
const handler = require('../../api/scoring');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}
beforeEach(() => resetDb());

describe('Target-Leap Tracker: set_target', () => {
  test('creates a pending target with a real id', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'set_target', targetScore: 600, targetDate: '2026-08-25' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.targetId).toBeTruthy();
    const user = getDoc('users', 'u1');
    expect(user.targetHistory.length).toBe(1);
    expect(user.targetHistory[0].status).toBe('pending');
    expect(user.targetHistory[0].targetScore).toBe(600);
  });

  test('rejects a target score outside 0-720 (the real NEET scale, not NEETprep\'s 360)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'set_target', targetScore: 999, targetDate: '2026-08-25' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('rejects a negative target score', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'set_target', targetScore: -10, targetDate: '2026-08-25' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('rejects a missing targetDate', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'set_target', targetScore: 600 });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('multiple targets accumulate as separate history entries, newest included', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    await handler(...Object.values(mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'set_target', targetScore: 500, targetDate: '2026-08-20' })));
    await handler(...Object.values(mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'set_target', targetScore: 600, targetDate: '2026-08-22' })));
    const user = getDoc('users', 'u1');
    expect(user.targetHistory.length).toBe(2);
  });

  test('BLOAT PROTECTION: target history caps at 50 entries, evicting oldest (consistent with app-wide pattern)', async () => {
    const existing = [];
    for (let i = 0; i < 50; i++) {
      existing.push({ id: `t${i}`, targetScore: 500, targetDate: '2026-01-01', createdAt: new Date(2026, 0, i + 1).toISOString(), status: 'complete', actualScore: 500 });
    }
    seed('users', 'u1', baseUser({ uid: 'u1', targetHistory: existing }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'set_target', targetScore: 650, targetDate: '2026-09-01' });
    await handler(req, res);
    const user = getDoc('users', 'u1');
    expect(user.targetHistory.length).toBe(50); // capped, not 51
    expect(user.targetHistory.find((t) => t.id === 't0')).toBeUndefined(); // oldest evicted
  });
});

describe('Target-Leap Tracker: record action extension (attaching a completed exam to its target)', () => {
  test('a normal record call with NO targetId behaves exactly as before (no regression)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: true, difficulty: 'medium', tid: 'p3' }],
    });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'u1').targetHistory).toBeUndefined(); // untouched when no targetId given
  });

  test('a record call WITH targetId + examScoreOutOf720 marks the matching pending target complete', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', targetHistory: [
      { id: 't1', targetScore: 600, targetDate: '2026-08-20', createdAt: '2026-08-15T00:00:00.000Z', status: 'pending', actualScore: null },
    ] }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'global',
      results: [{ correct: true, difficulty: 'medium', tid: 'p3' }],
      targetId: 't1', examScoreOutOf720: 612,
    });
    await handler(req, res);
    expect(res._status).toBe(200);
    const target = getDoc('users', 'u1').targetHistory.find((t) => t.id === 't1');
    expect(target.status).toBe('complete');
    expect(target.actualScore).toBe(612);
    expect(target.hit).toBe(true); // 612 >= 600 target
  });

  test('actualScore below target correctly marks hit:false, not an error', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', targetHistory: [
      { id: 't1', targetScore: 600, targetDate: '2026-08-20', createdAt: '2026-08-15T00:00:00.000Z', status: 'pending', actualScore: null },
    ] }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'global',
      results: [{ correct: false, difficulty: 'medium', tid: 'p3' }],
      targetId: 't1', examScoreOutOf720: 480,
    });
    await handler(req, res);
    const target = getDoc('users', 'u1').targetHistory.find((t) => t.id === 't1');
    expect(target.status).toBe('complete');
    expect(target.hit).toBe(false);
  });

  test('an unknown/already-completed targetId is silently ignored, not an error (never blocks exam submission)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', targetHistory: [] }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'global',
      results: [{ correct: true, difficulty: 'medium', tid: 'p3' }],
      targetId: 'nonexistent_id', examScoreOutOf720: 500,
    });
    await handler(req, res);
    expect(res._status).toBe(200); // exam submission itself must never fail because of a target mismatch
  });
});

describe('Target-Leap Tracker: get_target_history', () => {
  test('returns history sorted newest-first', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', targetHistory: [
      { id: 't1', targetScore: 500, targetDate: '2026-08-10', createdAt: '2026-08-05T00:00:00.000Z', status: 'complete', actualScore: 480, hit: false },
      { id: 't2', targetScore: 600, targetDate: '2026-08-20', createdAt: '2026-08-18T00:00:00.000Z', status: 'pending', actualScore: null },
    ] }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_target_history' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.history[0].id).toBe('t2'); // newer createdAt first
  });

  test('returns an empty array for a user with no targets yet, not an error', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_target_history' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.history).toEqual([]);
  });
});
