const { resetDb, seed, getDoc } = require('../helpers/withMockDb');
const { baseUser } = require('../fixtures/users.fixture');
const handler = require('../../api/adaptive');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}

beforeEach(() => resetDb());

describe('Priority 2: Adaptive Engine (ELO/IRT) - record_answer', () => {
  test('theta increases after a correct answer', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 500, correct: true });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.theta).toBeGreaterThan(500); // starts at default 500, correct answer at matched difficulty raises it
  });

  test('theta decreases after a wrong answer', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', mastery: { p3: { theta: 500, attempts: 5, correctStreak: 2, avgTimeMs: 30000 } } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 500, correct: false });
    await handler(req, res);
    expect(res._json.theta).toBeLessThan(500);
  });

  test('theta change is capped at MAX_THETA_JUMP (60) per question - no wild single-question swings', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', mastery: { p3: { theta: 150, attempts: 0, correctStreak: 0, avgTimeMs: 30000 } } }));
    // Massive difficulty mismatch (900 vs theta 150) - correct answer would want a huge jump, must be clamped
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 900, correct: true });
    await handler(req, res);
    expect(res._json.theta - 150).toBeLessThanOrEqual(60);
  });

  test('theta stays within MIN_DIFFICULTY (100) / MAX_DIFFICULTY (900) bounds', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', mastery: { p3: { theta: 895, attempts: 50, correctStreak: 5, avgTimeMs: 20000 } } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 900, correct: true });
    await handler(req, res);
    expect(res._json.theta).toBeLessThanOrEqual(900);
  });

  test('correctStreak increments on correct, resets to 0 on wrong', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', mastery: { p3: { theta: 500, attempts: 3, correctStreak: 2, avgTimeMs: 30000 } } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 500, correct: true });
    await handler(req, res);
    expect(res._json.mastery.correctStreak).toBe(3);

    const { req: req2, res: res2 } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 500, correct: false });
    await handler(req2, res2);
    expect(res2._json.mastery.correctStreak).toBe(0);
  });

  test('K-factor shrinks with more attempts (experienced students get smaller theta swings)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', mastery: { p3: { theta: 500, attempts: 0, correctStreak: 0, avgTimeMs: 30000 } } }));
    const { req: r1, res: s1 } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 700, correct: true });
    await handler(r1, s1);
    const noviceDelta = s1._json.theta - 500;

    seed('users', 'u2', baseUser({ uid: 'u2', mastery: { p3: { theta: 500, attempts: 40, correctStreak: 0, avgTimeMs: 30000 } } }));
    const { req: r2, res: s2 } = mockReqRes({ uid: 'u2', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 700, correct: true });
    await handler(r2, s2);
    const veteranDelta = s2._json.theta - 500;

    expect(veteranDelta).toBeLessThan(noviceDelta);
  });

  test('speedSignal=sharp on fast+correct triggers nextAction=advance', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 500, correct: true, timeTakenMs: 5000, expectedTimeMs: 30000 });
    await handler(req, res);
    expect(res._json.speedSignal).toBe('sharp');
    expect(res._json.nextAction).toBe('advance');
  });

  test('wrong answer sets speedSignal=scaffold and nextAction=scaffold', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 500, correct: false, timeTakenMs: 20000, expectedTimeMs: 30000 });
    await handler(req, res);
    expect(res._json.speedSignal).toBe('scaffold');
    expect(res._json.nextAction).toBe('scaffold');
  });

  test('5-streak triggers nextAction=level_up (celebration hook)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', mastery: { p3: { theta: 500, attempts: 10, correctStreak: 4, avgTimeMs: 30000 } } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 500, correct: true });
    await handler(req, res);
    expect(res._json.nextAction).toBe('level_up');
  });

  test('mastery is persisted to the user document under mastery.<tid>', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 500, correct: true });
    await handler(req, res);
    const user = getDoc('users', 'u1');
    expect(user.mastery.p3).toBeDefined();
    expect(user.mastery.p3.attempts).toBe(1);
  });

  test('rejects missing tid', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', correct: true });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('rejects invalid session', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'wrong', action: 'record_answer', tid: 'p3', correct: true });
    await handler(req, res);
    expect(res._status).toBe(401);
  });
});
