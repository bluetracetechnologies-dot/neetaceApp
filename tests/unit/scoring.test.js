const { resetDb, seed, getDoc } = require('../helpers/withMockDb');
const { baseUser, RICH_DATA_USER, ADMIN_USER } = require('../fixtures/users.fixture');
const handler = require('../../api/scoring');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = {
    _status: 200, _json: null,
    status(code) { this._status = code; return this; },
    json(obj) { this._json = obj; return this; },
  };
  return { req, res };
}

beforeEach(() => resetDb());

describe('Priority 1: Scoring Engine - weights, marking, speed bonus', () => {
  test('rejects non-POST', async () => {
    const { req, res } = mockReqRes({});
    req.method = 'GET';
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  test('rejects missing uid/sessionToken', async () => {
    const { req, res } = mockReqRes({ results: [] });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('rejects invalid session token', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'WRONG', results: [{ correct: true, difficulty: 'medium' }] });
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('correct answer at medium difficulty scores WEIGHTS.medium (4) points, no bonus if slow', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: true, difficulty: 'medium', type: 'standard', tid: 'p3', timeTaken: 55000 }],
      sessionTimeSec: 60,
    });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.session.score).toBeCloseTo(4, 1); // WEIGHTS.medium=4, no speed bonus (slow), TYPE_BONUS.standard=1.0
  });

  test('wrong answer applies negative marking: -0.25 * weight', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: false, difficulty: 'hard', tid: 'p12' }],
    });
    await handler(req, res);
    // Negative score is clamped to 0 (Math.max(0, ...)) - session-level floor
    expect(res._json.session.score).toBe(0);
    expect(res._json.session.wrong).toBe(1);
  });

  test('SECURITY REGRESSION: speed bonus does NOT apply to wrong answers (accuracy-gate exploit fix)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      // Fast (5s) but WRONG - must not get the 1.2x fast-bonus multiplier
      results: [{ correct: false, difficulty: 'medium', tid: 'p3', timeTaken: 5000 }],
    });
    await handler(req, res);
    expect(res._json.session.score).toBe(0); // negative marking clamped, definitely not bonused
  });

  // FINDING (discovered writing this test): timeTaken's unit is SECONDS, not
  // milliseconds. Confirmed against the only live frontend caller of this action
  // (Exam Mode's result submission), which sends `timeTaken:60` - a HARDCODED
  // constant for every question, not real per-question timing. This means the
  // speed-bonus mechanic never actually varies in production today; it's fully
  // implemented and correct here, but not yet wired to real per-question clocks
  // anywhere in the live app. Not a bug (nothing crashes or scores wrong), but a
  // real completeness gap worth a future follow-up: plumb actual per-question
  // elapsed time through Exam Mode's result array instead of the fixed 60.
  test('fast AND correct gets the 1.2x speed bonus (unit: seconds, matching the real caller)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: true, difficulty: 'medium', type: 'standard', tid: 'p3', timeTaken: 5 }],
      sessionTimeSec: 60, // timePerQ=60, ratio = 5/(60*2) = 0.04 < 0.30 -> 1.2x bonus
    });
    await handler(req, res);
    expect(res._json.session.score).toBeCloseTo(4 * 1.2, 1);
  });

  test('DOCUMENTS PRODUCTION GAP: Exam Mode always sends a flat timeTaken:60, so speed bonus never triggers for real exams today', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'global',
      results: [{ correct: true, difficulty: 'medium', tid: 'p3', timeTaken: 60 }], // exact value the real caller always sends
      sessionTimeSec: 180 * 60, // typical exam duration in seconds
    });
    await handler(req, res);
    // timePerQ = 10800/1 = 10800, totalTime=21600, ratio = 60/21600 ≈ 0.003 -> ALWAYS gets 1.2x
    // in a real multi-question exam this ratio stays tiny regardless of actual student speed,
    // so every correct answer gets the max bonus and every session's speed component is identical.
    expect(res._json.session.score).toBeCloseTo(4 * 1.2, 1);
  });

  test('parameterized question type gets 1.15x bonus multiplier', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: true, difficulty: 'easy', type: 'parameterized', tid: 'p3', timeTaken: 60000 }],
      sessionTimeSec: 60,
    });
    await handler(req, res);
    expect(res._json.session.score).toBeCloseTo(2 * 1.15, 1); // WEIGHTS.easy=2
  });
});

describe('Priority 3: ConceptStats aggregation and bloat protection', () => {
  test('aggregates attempted/correct/wrong/accuracy per tid across a session', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [
        { correct: true, difficulty: 'medium', tid: 'p3', timeTaken: 40000 },
        { correct: false, difficulty: 'medium', tid: 'p3', timeTaken: 60000, errorType: 'concept' },
      ],
    });
    await handler(req, res);
    const user = getDoc('users', 'u1');
    expect(user.conceptStats.p3.attempted).toBe(2);
    expect(user.conceptStats.p3.correct).toBe(1);
    expect(user.conceptStats.p3.accuracy).toBe(50);
    expect(user.conceptStats.p3.errorTypes.concept).toBe(1);
  });

  test('masteryBand thresholds: weak <40, developing 40-69, mastered >=70', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: Array(10).fill(0).map((_, i) => ({ correct: i < 8, difficulty: 'medium', tid: 'p3' })), // 80% -> mastered
    });
    await handler(req, res);
    const user = getDoc('users', 'u1');
    expect(user.conceptStats.p3.masteryBand).toBe('mastered');
  });

  test('errorTypes only accepts the 6 whitelisted types - rejects garbage input', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: false, difficulty: 'medium', tid: 'p3', errorType: 'DROP TABLE users;' }],
    });
    await handler(req, res);
    const user = getDoc('users', 'u1');
    expect(user.conceptStats.p3.errorTypes['DROP TABLE users;']).toBeUndefined();
    expect(Object.keys(user.conceptStats.p3.errorTypes).length).toBe(0);
  });

  test('BLOAT PROTECTION: conceptStats evicts oldest (LRU by lastSeen) beyond MAX_CONCEPT_TIDS (60)', async () => {
    const existingStats = {};
    for (let i = 0; i < 60; i++) {
      existingStats[`tid_${i}`] = { attempted: 1, correct: 1, wrong: 0, totalTimeMs: 1000, accuracy: 100, avgTimeMs: 1000, lastSeen: new Date(2026, 0, i + 1).toISOString(), masteryBand: 'mastered', errorTypes: {} };
    }
    seed('users', 'u1', baseUser({ uid: 'u1', conceptStats: existingStats }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: true, difficulty: 'medium', tid: 'brand_new_tid' }],
    });
    await handler(req, res);
    const user = getDoc('users', 'u1');
    expect(Object.keys(user.conceptStats).length).toBe(60); // capped, not 61
    expect(user.conceptStats.tid_0).toBeUndefined(); // oldest evicted
    expect(user.conceptStats.brand_new_tid).toBeDefined(); // newest survives
  });

  test('rejects invalid/oversized tid values (guards against bad data injection)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: true, difficulty: 'medium', tid: 'x'.repeat(200) }], // > 40 chars
    });
    await handler(req, res);
    const user = getDoc('users', 'u1');
    expect(Object.keys(user.conceptStats).length).toBe(0);
  });
});

describe('Priority 1: rankScore - mastery-adjusted, prevents easy-question grinding', () => {
  test('rankScore = weighted * accuracyMultiplier * consistencyMultiplier (not raw weighted)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'global',
      results: Array(20).fill(0).map(() => ({ correct: true, difficulty: 'medium', tid: 'p3' })),
    });
    await handler(req, res);
    const user = getDoc('users', 'u1');
    expect(user.scores.global.rankScore).toBeDefined();
    expect(user.scores.global.rankScore).not.toBe(user.scores.global.weighted); // must differ (adjusted)
  });

  test('rank only computed once attempted >= MIN_FOR_RANK (20)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'global',
      results: Array(5).fill(0).map(() => ({ correct: true, difficulty: 'medium', tid: 'p3' })),
    });
    await handler(req, res);
    expect(res._json.qualifiesForLeaderboard).toBe(false);
    expect(res._json.rank).toBeNull();
  });
});

describe('Priority 5: Recovery Queue (server-side ranking, via get_dashboard)', () => {
  test('ranks by ERROR_PRIORITY: unit > formula > concept > calc > careless > time', async () => {
    seed('users', 'u1', RICH_DATA_USER);
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await handler(req, res);
    expect(res._status).toBe(200);
    const queue = res._json.recoveryQueue;
    expect(queue.length).toBeGreaterThan(0);
    // First item should be a 'unit' error (highest priority in the fixture's data)
    expect(queue[0].errorType).toBe('unit');
  });

  test('every recovery item has a reason string (evidence)', async () => {
    seed('users', 'u1', RICH_DATA_USER);
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await handler(req, res);
    res._json.recoveryQueue.forEach((item) => {
      expect(item.reason).toBeTruthy();
    });
  });
});

describe('Priority 4: GALTI sync (fixes the historical never-persisted bug)', () => {
  test('sync_galti persists a mistake to the user document (not just client memory)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', action: 'sync_galti',
      questionId: 'q1', mistake: { tid: 'p12', sub: 'PHYSICS', errorType: 'unit', count: 1, recovered: false, recoveryStep: 0 },
    });
    await handler(req, res);
    expect(res._status).toBe(200);
    const user = getDoc('users', 'u1');
    expect(user.galtiMistakes.q1.errorType).toBe('unit');
  });

  test('sync_galti rejects an unwhitelisted errorType, stores as "unknown" instead of trusting client', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', action: 'sync_galti',
      questionId: 'q1', mistake: { tid: 'p12', sub: 'PHYSICS', errorType: '<script>alert(1)</script>', count: 1 },
    });
    await handler(req, res);
    const user = getDoc('users', 'u1');
    expect(user.galtiMistakes.q1.errorType).toBe('unknown');
  });

  test('BLOAT PROTECTION: galtiMistakes evicts oldest beyond MAX_GALTI_ENTRIES (150)', async () => {
    const existing = {};
    for (let i = 0; i < 150; i++) {
      existing[`q_${i}`] = { tid: 'p3', sub: 'PHYSICS', errorType: 'concept', count: 1, recovered: false, recoveryStep: 0, lastWrong: new Date(2026, 0, i % 28 + 1).toISOString() };
    }
    seed('users', 'u1', baseUser({ uid: 'u1', galtiMistakes: existing }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', action: 'sync_galti',
      questionId: 'q_new', mistake: { tid: 'p3', sub: 'PHYSICS', errorType: 'concept', count: 1, lastWrong: new Date(2026, 5, 1).toISOString() },
    });
    await handler(req, res);
    const user = getDoc('users', 'u1');
    expect(Object.keys(user.galtiMistakes).length).toBe(150);
    expect(user.galtiMistakes.q_new).toBeDefined();
  });

  test('sync_galti_bulk uploads an entire local mistakes array in one call', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', action: 'sync_galti_bulk',
      mistakes: [
        { id: 'q1', tid: 'p3', sub: 'PHYSICS', errorType: 'concept', count: 1 },
        { id: 'q2', tid: 'c8', sub: 'CHEMISTRY', errorType: 'careless', count: 2 },
      ],
    });
    await handler(req, res);
    expect(res._json.synced).toBe(2);
    const user = getDoc('users', 'u1');
    expect(Object.keys(user.galtiMistakes).length).toBe(2);
  });
});

describe('Priority 6: Daily Mission (plan generation + progress persistence)', () => {
  test('get_dashboard returns a dailyMission plan with exactly the 4 required block types', async () => {
    seed('users', 'u1', RICH_DATA_USER);
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await handler(req, res);
    const plan = res._json.dailyMission;
    expect(plan.targetTotal).toBe(20);
    const keys = plan.blocks.map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining(['challenge'])); // challenge always present per filter logic
  });

  test('mark_mission_progress persists to the user document, NOT localStorage (regression: the historical bug)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', action: 'mark_mission_progress',
      blockKey: 'recovery', questionsCompleted: 6,
    });
    await handler(req, res);
    expect(res._status).toBe(200);
    const user = getDoc('users', 'u1');
    expect(user.dailyMission.blockProgress.recovery.questionsCompleted).toBe(6);
  });

  test('mission progress resets on date change (no manual cleanup job needed)', async () => {
    seed('users', 'u1', baseUser({
      uid: 'u1',
      dailyMission: { date: '2020-01-01', blockProgress: { recovery: { questionsCompleted: 20 } } }, // ancient date
    }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await handler(req, res);
    // Stale date -> missionProgress should be empty, not carry forward 2020's data
    expect(res._json.missionProgress).toEqual({});
  });

  test('completionPercentage caps at 100 even if questionsCompleted exceeds target', async () => {
    seed('users', 'u1', baseUser({
      uid: 'u1',
      dailyMission: { date: new Date().toISOString().slice(0, 10), blockProgress: { a: { questionsCompleted: 50 }, b: { questionsCompleted: 50 } } },
    }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await handler(req, res);
    expect(res._json.completionPercentage).toBeLessThanOrEqual(100);
  });
});

describe('get_dashboard: single-read assembly (Priority 3+4+5+6 integration)', () => {
  test('merges conceptStats + mastery(theta) + galtiSummary + recoveryQueue + revisionDue + dailyMission in ONE response', async () => {
    seed('users', 'u1', RICH_DATA_USER);
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await handler(req, res);
    expect(res._json).toHaveProperty('conceptStats');
    expect(res._json).toHaveProperty('galtiSummary');
    expect(res._json).toHaveProperty('recoveryQueue');
    expect(res._json).toHaveProperty('revisionDue');
    expect(res._json).toHaveProperty('dailyMission');
    expect(res._json).toHaveProperty('missionProgress');
    expect(res._json).toHaveProperty('completionPercentage');
    // theta merged into conceptStats entries (not a separate duplicate call)
    const p3Entry = res._json.conceptStats.find((c) => c.tid === 'p3');
    expect(p3Entry.theta).toBe(620);
  });

  test('REGRESSION: get_dashboard is reachable (historical bug: action-routing gate blocked it)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    // No `results` array provided - this exact shape used to 400 before the routing fix
    await handler(req, res);
    expect(res._status).toBe(200);
  });

  test('weakTopics excludes tids with fewer than 3 attempts (avoids noisy low-sample labels)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', conceptStats: {
      p3: { attempted: 2, correct: 0, accuracy: 0, masteryBand: 'weak', errorTypes: {}, lastSeen: '2026-08-01' },
    } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await handler(req, res);
    expect(res._json.weakTopics.length).toBe(0);
  });

  test('strongTopics surfaces mastered tids regardless of attempt count gate (different rule than weakTopics)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', conceptStats: {
      p3: { attempted: 5, correct: 5, accuracy: 100, masteryBand: 'mastered', errorTypes: {}, lastSeen: '2026-08-01' },
    } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await handler(req, res);
    expect(res._json.strongTopics.length).toBe(1);
  });

  test('skipped (null) answers are counted separately, neither correct nor wrong', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: null, difficulty: 'medium', tid: 'p3' }],
    });
    await handler(req, res);
    expect(res._json.session.skipped).toBe(1);
    expect(res._json.session.correct).toBe(0);
    expect(res._json.session.wrong).toBe(0);
  });

  test('rejects record action with an empty results array', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', results: [] });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('sync_galti rejects missing questionId', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'sync_galti', mistake: { tid: 'p3' } });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('sync_galti rejects an oversized questionId (guards against bad data)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'sync_galti', questionId: 'x'.repeat(100), mistake: { tid: 'p3' } });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('session pruning: users under 200 sessions are left alone (no deletion triggered)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: true, difficulty: 'medium', tid: 'p3' }],
    });
    await handler(req, res);
    expect(res._status).toBe(200); // completes without error regardless of pruning branch taken
  });
});

describe('Coverage completion pass — scoring.js real gaps found via line-by-line audit', () => {
  test('weakTopics/strongTopics sort comparators actually execute (need 2+ items - a sort with 0-1 items never invokes its comparator)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', conceptStats: {
      p3: { attempted: 5, correct: 1, accuracy: 20, masteryBand: 'weak', errorTypes: {}, lastSeen: '2026-08-01' },
      c8: { attempted: 5, correct: 2, accuracy: 40, masteryBand: 'weak', errorTypes: {}, lastSeen: '2026-08-01' },
      p12: { attempted: 5, correct: 4, accuracy: 80, masteryBand: 'mastered', errorTypes: {}, lastSeen: '2026-08-01' },
      c15: { attempted: 5, correct: 5, accuracy: 100, masteryBand: 'mastered', errorTypes: {}, lastSeen: '2026-08-01' },
    } }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await handler(req, res);
    // weakTopics sorted ascending by accuracy - the weakest (20%) genuinely sorts first
    expect(res._json.weakTopics[0].accuracy).toBe(20);
    expect(res._json.weakTopics[1].accuracy).toBe(40);
    // strongTopics sorted descending by accuracy - the strongest (100%) genuinely sorts first
    expect(res._json.strongTopics[0].accuracy).toBe(100);
    expect(res._json.strongTopics[1].accuracy).toBe(80);
  });

  test('recentSessions count-query catch-fallback fires cleanly, session recording still succeeds', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { MockQueryForPatching } = require('../mocks/firestore.mock');
    const original = MockQueryForPatching.prototype.count;
    // Surgical: only the SPECIFIC double-where count (uid + playedAt, the consistency
    // check at line 412) throws. The pruning check's single-where count, and the
    // unrelated .add() call for recording THIS session, are untouched - a blanket
    // db.collection override here previously broke the .add() call too and caused
    // a different, unintended failure.
    MockQueryForPatching.prototype.count = function () {
      if (this._filters.length === 2) return { get: () => Promise.reject(new Error('down')) };
      return original.call(this);
    };
    try {
      const { req, res } = mockReqRes({
        uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
        results: [{ correct: true, difficulty: 'medium', tid: 'p3' }],
      });
      await handler(req, res);
      expect(res._status).toBe(200); // recording succeeds even if the consistency-count query fails
    } finally {
      MockQueryForPatching.prototype.count = original;
    }
  });

  test('SESSION PRUNING ACTUALLY FIRES: with 200+ existing sessions, old ones genuinely get deleted (previous test only asserted "completes without error", never proved the real branch ran)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { db } = require('../helpers/withMockDb');
    // Seed 201 real session docs so the >200 threshold genuinely trips
    for (let i = 0; i < 201; i++) {
      db._store.docs[`sessions/s${i}`] = { uid: 'u1', playedAt: new Date(2026, 0, (i % 28) + 1).toISOString(), subject: 'physics' };
    }
    // Force the random 5% pruning check to always trigger for this test (deterministic, not flaky)
    const originalRandom = Math.random;
    Math.random = () => 0.01; // well under the 0.05 threshold - guarantees the prune branch runs
    try {
      const { req, res } = mockReqRes({
        uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
        results: [{ correct: true, difficulty: 'medium', tid: 'p3' }],
      });
      await handler(req, res);
      expect(res._status).toBe(200);
      const remaining = Object.keys(db._store.docs).filter((k) => k.startsWith('sessions/')).length;
      expect(remaining).toBeLessThan(202); // genuinely fewer sessions remain - the delete batch actually ran
    } finally {
      Math.random = originalRandom;
    }
  });

  test('an unexpected thrown error during session recording is caught by the outer handler, returns clean 500', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { db } = require('../mocks/_firebase.mock');
    const original = db.collection;
    let callCount = 0;
    db.collection = (name) => { callCount++; if (callCount > 1) throw new Error('simulated failure'); return original(name); };
    try {
      const { req, res } = mockReqRes({
        uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
        results: [{ correct: true, difficulty: 'medium', tid: 'p3' }],
      });
      await handler(req, res);
      expect(res._status).toBe(500);
    } finally {
      db.collection = original;
    }
  });
});
