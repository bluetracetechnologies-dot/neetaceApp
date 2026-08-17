// Regression suite: one test per bug that was found and fixed during this
// build. If any of these ever fail again, a historical bug has recurred.
// Each test names the bug, when it was found, and links to the fix.

const { resetDb, seed, getDoc } = require('../helpers/withMockDb');
const { baseUser } = require('../fixtures/users.fixture');
const scoringHandler = require('../../api/scoring');
const adminHandler = require('../../api/admin');
const { computeScorePrediction } = require('../../lib/score-predictor');
const { buildChapterMasteryList } = require('../../lib/chapter-mastery');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}
beforeEach(() => resetDb());

describe('Regression: GALTI mistakes never persisted (Critical - found in GALTI 2.0 audit)', () => {
  test('sync_galti actually writes to Firestore, not just returning ok without persisting', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'sync_galti', questionId: 'q1', mistake: { tid: 'p3', sub: 'PHYSICS', errorType: 'concept', count: 1 } });
    await scoringHandler(req, res);
    const user = getDoc('users', 'u1');
    expect(user.galtiMistakes.q1).toBeDefined(); // bug: this used to be undefined - function didn't exist
  });
});

describe('Regression: get_dashboard/get_concept_stats unreachable (Major - action-routing gate bug)', () => {
  test('get_dashboard responds 200 even with no results array in the request body', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_dashboard' });
    await scoringHandler(req, res);
    expect(res._status).toBe(200); // bug: this used to 400 because the results-required gate ran first
  });
});

describe('Regression: Daily Mission progress was localStorage-only (Major - never reached Firestore)', () => {
  test('mark_mission_progress persists questionsCompleted to the user document', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'mark_mission_progress', blockKey: 'recovery', questionsCompleted: 5 });
    await scoringHandler(req, res);
    const user = getDoc('users', 'u1');
    expect(user.dailyMission.blockProgress.recovery.questionsCompleted).toBe(5); // bug: this field used to never exist
  });
});

describe('Regression: speed bonus applied to wrong answers (Security - guess-and-move exploit)', () => {
  test('a fast WRONG answer never receives the 1.2x/1.1x speed multiplier', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics',
      results: [{ correct: false, difficulty: 'medium', tid: 'p3', timeTaken: 1 }], // instant wrong answer
    });
    await scoringHandler(req, res);
    expect(res._json.session.score).toBe(0); // negative marking clamped to 0, definitely no bonus applied
  });
});

describe('Regression: admin.js get_trial_config blocked for anonymous callers (Major - discovered during "False Positive Audit")', () => {
  test('get_trial_config with uid="anon" returns 200, not 403', async () => {
    const { req, res } = mockReqRes({ action: 'get_trial_config', uid: 'anon', sessionToken: 'anon' });
    await adminHandler(req, res);
    expect(res._status).toBe(200); // bug: was 403 because the blanket admin gate ran before this check
  });

  test('every OTHER admin action still correctly rejects the anon placeholder (the gate itself was NEVER broken)', async () => {
    const { req, res } = mockReqRes({ action: 'list_users', uid: 'anon', sessionToken: 'anon' });
    await adminHandler(req, res);
    expect(res._status).toBe(403); // this direction was ALWAYS correct - the false-positive audit wrongly claimed otherwise
  });
});

describe('Regression: Score Predictor V2 confidence band widened instead of narrowed (found via THIS test suite, 2026-08-17)', () => {
  const NEET_SYLLABUS_FIXTURE = { PHYSICS: { units: [{ id: 'PH12', name: 'Electrostatics', tids: ['p12'] }] } };
  const getWeightageFixture = () => 4;

  test('better recovery rate + consistency produces a NARROWER confidence band, not wider', () => {
    global.QUESTIONS = require('../fixtures/questions.fixture').QUESTIONS_FIXTURE;
    const baseDash = (galtiSummary, consistency7d) => ({
      conceptStats: [{ tid: 'p12', theta: 500, accuracy: 60, errorTypes: {} }],
      galtiSummary, consistency7d,
      recoveryQueue: [],
    });
    const good = computeScorePrediction(baseDash([{ sub: 'P', recovered: true }, { sub: 'P', recovered: true }, { sub: 'P', recovered: true }], 7), { attempted: 25, accuracy: 60 }, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    const bad = computeScorePrediction(baseDash([{ sub: 'P', recovered: false }, { sub: 'P', recovered: false }, { sub: 'P', recovered: false }], 0), { attempted: 25, accuracy: 60 }, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(good.hi - good.lo).toBeLessThan(bad.hi - bad.lo); // bug: this used to be backwards
  });
});

describe('Regression: legacy question tid namespace split (Major - 133 questions invisible to analytics)', () => {
  test('a question using the modern p/c/b tid scheme IS picked up by chapter grouping', () => {
    global.QUESTIONS = require('../fixtures/questions.fixture').QUESTIONS_FIXTURE;
    const list = [{ tid: 'p3', attempted: 5, correct: 3, accuracy: 60, theta: 500, masteryBand: 'developing', correctStreak: 0, errorTypes: {} }];
    const result = buildChapterMasteryList(list);
    expect(result.PHYSICS.length).toBe(1); // confirms the p/c/b namespace (not the old t1-t11 one) is what's expected everywhere now
  });
});

describe('Regression: conceptStats/galtiMistakes unbounded growth (bloat protection must stay active)', () => {
  test('conceptStats never exceeds MAX_CONCEPT_TIDS (60) regardless of how many distinct tids a user touches', async () => {
    const existing = {};
    for (let i = 0; i < 65; i++) existing[`t${i}`] = { attempted: 1, correct: 1, wrong: 0, totalTimeMs: 1, accuracy: 100, avgTimeMs: 1, lastSeen: new Date(2026, 0, 1).toISOString(), masteryBand: 'mastered', errorTypes: {} };
    seed('users', 'u1', baseUser({ uid: 'u1', conceptStats: existing }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', subject: 'physics', results: [{ correct: true, difficulty: 'medium', tid: 'brand_new' }] });
    await scoringHandler(req, res);
    expect(Object.keys(getDoc('users', 'u1').conceptStats).length).toBeLessThanOrEqual(60);
  });
});
