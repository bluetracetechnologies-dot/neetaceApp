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

describe('adaptive.js — get_mastery (untested until now)', () => {
  test('returns per-tid summary sorted weakest-theta-first', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', mastery: {
      p3: { theta: 700, attempts: 10, correct: 8, correctStreak: 3, avgTimeMs: 30000, lastSeenAt: '2026-08-01T00:00:00.000Z' },
      c8: { theta: 300, attempts: 5, correct: 1, correctStreak: 0, avgTimeMs: 60000, lastSeenAt: '2026-08-01T00:00:00.000Z' },
    } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_mastery' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.mastery[0].tid).toBe('c8'); // weaker theta (300) sorts first
    expect(res._json.mastery[1].tid).toBe('p3');
  });

  test('accuracy computed correctly from correct/attempts', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', mastery: { p3: { theta: 500, attempts: 4, correct: 3 } } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_mastery' });
    await handler(req, res);
    expect(res._json.mastery[0].accuracy).toBe(75);
  });

  test('subject theta mapping: p-prefixed tid maps to PHYSICS, c to CHEMISTRY, else BIOLOGY', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', mastery: {
      p3: { theta: 500, attempts: 1 }, c8: { theta: 500, attempts: 1 }, b7: { theta: 500, attempts: 1 },
    } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_mastery' });
    await handler(req, res);
    expect(res._json.subjectTheta).toHaveProperty('PHYSICS');
    expect(res._json.subjectTheta).toHaveProperty('CHEMISTRY');
    expect(res._json.subjectTheta).toHaveProperty('BIOLOGY');
  });

  test('empty mastery returns empty summary, not an error', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_mastery' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.mastery).toEqual([]);
  });
});

describe('adaptive.js — reset_mastery (untested until now)', () => {
  test('a regular user resets their OWN mastery', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', mastery: { p3: { theta: 700, attempts: 10 } } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'reset_mastery' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'u1').mastery).toEqual({});
  });

  test("SECURITY: a regular user CANNOT reset someone else's mastery via adminReset+targetUid", async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', role: 'user' }));
    seed('users', 'u_victim', baseUser({ uid: 'u_victim', mastery: { p3: { theta: 700, attempts: 10 } } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'reset_mastery', adminReset: true, targetUid: 'u_victim' });
    await handler(req, res);
    expect(getDoc('users', 'u_victim').mastery.p3.theta).toBe(700);
  });

  test("an admin CAN reset a specific target user's mastery via adminReset+targetUid", async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    seed('users', 'u_target', baseUser({ uid: 'u_target', mastery: { p3: { theta: 700, attempts: 10 } } }));
    const { req, res } = mockReqRes({ uid: 'u_admin', sessionToken: 'valid_session_token_123', action: 'reset_mastery', adminReset: true, targetUid: 'u_target' });
    await handler(req, res);
    expect(getDoc('users', 'u_target').mastery).toEqual({});
  });
});

describe('adaptive.js — next_question (untested until now)', () => {
  const pool = [
    { id: 'q1', tid: 'p3', diff: 'medium' }, { id: 'q2', tid: 'p3', diff: 'medium' },
    { id: 'q3', tid: 'c8', diff: 'easy' },
  ];
  test('rejects when availableQuestions is missing or empty', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'next_question', availableQuestions: [] });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('returns a question from the pool when mastery data is empty (cold start)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'next_question', availableQuestions: pool, subject: 'PHYSICS' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.question).toBeDefined();
    expect(pool.some((q) => q.id === res._json.question.id)).toBe(true);
  });

  test('excludes already-seen question ids when an unseen alternative exists in the same tid', async () => {
    const largerPool = [
      { id: 'q1', tid: 'p3', diff: 'medium' }, { id: 'q2', tid: 'p3', diff: 'medium' }, { id: 'q4', tid: 'p3', diff: 'medium' },
    ];
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', action: 'next_question',
      availableQuestions: largerPool, seenIds: ['q1', 'q2'], subject: 'PHYSICS',
    });
    await handler(req, res);
    expect(res._json.question.id).toBe('q4'); // the one genuine unseen alternative
  });

  test('DOCUMENTED FALLBACK: if every question in the priority tid is already seen, returns one anyway rather than nothing', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', action: 'next_question',
      availableQuestions: pool, seenIds: ['q1', 'q2'], subject: 'PHYSICS', // both p3 questions seen
    });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.question).toBeDefined(); // still returns something, per selectBest's documented fallback
  });
});
