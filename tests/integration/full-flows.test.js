// Integration tests: exercise multi-step flows across actions, not single
// isolated calls. Each test represents a real sequence a user would trigger.
const { resetDb, seed, seedNested, getDoc } = require('../helpers/withMockDb');
const { baseUser, ADMIN_USER } = require('../fixtures/users.fixture');
const { PENDING_ACADEMY, BATCH_FIXTURE } = require('../fixtures/academies.fixture');
const scoringHandler = require('../../api/scoring');
const adaptiveHandler = require('../../api/adaptive');
const academyHandler = require('../../api/academy');
const adminHandler = require('../../api/admin');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}

beforeEach(() => resetDb());

describe('Integration: answer a question wrong -> conceptStats -> get_dashboard reflects it immediately', () => {
  test('a single wrong answer flows through scoring into the dashboard weakTopics list', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));

    // Step 1: submit 3 wrong answers on the same tid (crosses the >=3 attempted gate)
    const { req: r1, res: s1 } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [
        { correct: false, difficulty: 'medium', tid: 'p12', errorType: 'unit' },
        { correct: false, difficulty: 'medium', tid: 'p12', errorType: 'unit' },
        { correct: false, difficulty: 'medium', tid: 'p12', errorType: 'unit' },
      ],
    });
    await scoringHandler(r1, s1);
    expect(s1._status).toBe(200);

    // Step 2: dashboard should now show p12 as a weak topic
    const { req: r2, res: s2 } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await scoringHandler(r2, s2);
    expect(s2._json.weakTopics.some((w) => w.tid === 'p12')).toBe(true);

    // Step 3: recovery queue should rank this tid's unit-error pattern
    expect(s2._json.recoveryQueue.some((r) => r.tid === 'p12' && r.errorType === 'unit')).toBe(true);
  });
});

describe('Integration: adaptive theta update independently feeds into get_dashboard mastery merge', () => {
  test('recording an adaptive answer updates mastery.theta, then get_dashboard merges it into conceptStats', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));

    // Step 1: adaptive engine records a correct answer, raising theta
    const { req: r1, res: s1 } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'record_answer', tid: 'p3', qDifficulty: 500, correct: true });
    await adaptiveHandler(r1, s1);
    const newTheta = s1._json.theta;

    // Step 2: scoring engine also records the same question for conceptStats
    const { req: r2, res: s2 } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: true, difficulty: 'medium', tid: 'p3' }],
    });
    await scoringHandler(r2, s2);

    // Step 3: dashboard merges BOTH - theta from adaptive.js, accuracy from scoring.js - one read
    const { req: r3, res: s3 } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await scoringHandler(r3, s3);
    const p3Entry = s3._json.conceptStats.find((c) => c.tid === 'p3');
    expect(p3Entry.theta).toBe(newTheta);
    expect(p3Entry.attempted).toBe(1);
  });
});

describe('Integration: full academy lifecycle - create, teacher register, batch, student join, mark paid', () => {
  test('admin creates academy -> teacher registers -> creates batch -> student joins -> admin marks paid -> student activated', async () => {
    seed('users', 'u_admin', ADMIN_USER);
    seed('users', 'u_teacher', baseUser({ uid: 'u_teacher' }));
    seed('users', 'u_student', baseUser({ uid: 'u_student', paid: false }));

    // Step 1: admin creates the academy
    const { req: r1, res: s1 } = mockReqRes({
      uid: 'u_admin', sessionToken: 'admin_session_token', action: 'admin_create',
      name: 'Integration Test Academy', type: 'coaching', studentCount: 20,
    });
    await academyHandler(r1, s1);
    expect(s1._status).toBe(200);
    const academyId = s1._json.academyId;
    const academyCode = s1._json.academyCode;

    // Step 2: teacher registers with the code
    const { req: r2, res: s2 } = mockReqRes({ uid: 'u_teacher', sessionToken: 'valid_session_token_123', action: 'teacher_register', academyCode });
    await academyHandler(r2, s2);
    expect(s2._status).toBe(200);

    // Step 3: teacher creates a batch
    const { req: r3, res: s3 } = mockReqRes({ uid: 'u_teacher', sessionToken: 'valid_session_token_123', action: 'create_batch', batchName: 'Batch A' });
    await academyHandler(r3, s3);
    expect(s3._status).toBe(200);
    const batchCode = s3._json.batchCode;

    // Step 4: student joins with the batch code (academy not yet paid - stays on trial)
    const { req: r4, res: s4 } = mockReqRes({ uid: 'u_student', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode });
    await academyHandler(r4, s4);
    expect(s4._status).toBe(200);
    expect(getDoc('users', 'u_student').paid).toBe(false);

    // Step 5: admin marks the academy as paid - student should now be activated
    const { req: r5, res: s5 } = mockReqRes({ uid: 'u_admin', sessionToken: 'admin_session_token', action: 'admin_mark_paid', academyId, amountPaid: 8980 });
    await academyHandler(r5, s5);
    expect(s5._status).toBe(200);
    expect(getDoc('users', 'u_student').paid).toBe(true);
    expect(getDoc('users', 'u_student').planKey).toBe('plan_academy');
  });
});

describe('Integration: admin.js gate correctly separates public trial config from protected actions in the SAME request cycle', () => {
  test('anon can read trial config, but the same anon identity cannot list users, in back-to-back calls', async () => {
    const { req: r1, res: s1 } = mockReqRes({ action: 'get_trial_config', uid: 'anon', sessionToken: 'anon' });
    await adminHandler(r1, s1);
    expect(s1._status).toBe(200);

    const { req: r2, res: s2 } = mockReqRes({ action: 'list_users', uid: 'anon', sessionToken: 'anon' });
    await adminHandler(r2, s2);
    expect(s2._status).toBe(403);
  });
});
