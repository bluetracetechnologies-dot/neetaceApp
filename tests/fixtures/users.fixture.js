// tests/fixtures/users.fixture.js
// Realistic user documents matching the exact shape written/read across
// auth.js, scoring.js, adaptive.js, academy.js. Each fixture is a plain object
// ready to be passed to db.collection('users').doc(id).set(fixture).

function baseUser(overrides = {}) {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return {
    uid: 'u_base', email: 'student@example.com', name: 'Test Student',
    role: 'user', sessionToken: 'valid_session_token_123',
    disabled: false,
    trialStart: now.toISOString(),
    trialEnd: new Date('2026-08-08T00:00:00.000Z').toISOString(),
    paid: false, paidUntil: null, planKey: null,
    academyId: null, academyRole: null, batchId: null,
    totalQuestionsAttempted: 0,
    scores: {},
    conceptStats: {},
    mastery: {},
    galtiMistakes: {},
    dailyMission: null,
    featureOverrides: null,
    ...overrides,
  };
}

const ADMIN_USER = baseUser({
  uid: 'u_admin', email: 'bluetracetechnologies@gmail.com', role: 'admin',
  sessionToken: 'admin_session_token',
});

const TRIAL_ACTIVE_USER = baseUser({
  uid: 'u_trial_active', email: 'trial@example.com',
  trialEnd: new Date('2026-08-24T00:00:00.000Z').toISOString(), // future relative to Aug 17 "today" in this build
});

const TRIAL_EXPIRED_USER = baseUser({
  uid: 'u_trial_expired', email: 'expired@example.com',
  trialEnd: new Date('2026-08-01T00:00:00.000Z').toISOString(), // past
});

const PAID_USER = baseUser({
  uid: 'u_paid', email: 'paid@example.com',
  paid: true, paidUntil: new Date('2027-05-31T23:59:59.000Z').toISOString(),
  planKey: 'plan_pro',
});

const DISABLED_USER = baseUser({
  uid: 'u_disabled', email: 'disabled@example.com', disabled: true,
});

const ACADEMY_STUDENT_USER = baseUser({
  uid: 'u_academy_student', email: 'academystudent@example.com',
  academyId: 'acy_test1', academyRole: 'student', batchId: 'batch_test1',
  batchCode: 'BT4A2F91', academyName: 'Test Coaching Academy',
  paid: true, paidUntil: new Date('2027-05-31T23:59:59.000Z').toISOString(),
  planKey: 'plan_academy',
});

// A "rich data" user - has attempted enough questions across enough topics that
// every analytics feature (Learning DNA, Chapter Mastery, Score Predictor, GALTI
// recovery rate) has enough data to compute confidently. Used across most
// integration tests for get_dashboard.
const RICH_DATA_USER = baseUser({
  uid: 'u_rich', email: 'rich@example.com',
  totalQuestionsAttempted: 62,
  scores: {
    global: { weighted: 145.5, attempted: 62, correct: 40, wrong: 22, accuracy: 64.5, currentLevel: 2, rankScore: 130.2, consistency7d: 5 },
    physics: { weighted: 48.0, attempted: 20, correct: 12, wrong: 8, accuracy: 60.0, currentLevel: 2 },
  },
  mastery: {
    p3:  { theta: 620, attempts: 15, correctStreak: 4, avgTimeMs: 42000, lastSeenAt: '2026-08-15T10:00:00.000Z' },
    p12: { theta: 380, attempts: 10, correctStreak: 0, avgTimeMs: 95000, lastSeenAt: '2026-08-16T10:00:00.000Z' },
    c8:  { theta: 700, attempts: 12, correctStreak: 6, avgTimeMs: 38000, lastSeenAt: '2026-08-16T09:00:00.000Z' },
    b7:  { theta: 450, attempts: 8,  correctStreak: 1, avgTimeMs: 70000, lastSeenAt: '2026-08-14T10:00:00.000Z' },
  },
  conceptStats: {
    p3:  { attempted: 15, correct: 11, wrong: 4, totalTimeMs: 630000, accuracy: 73.3, avgTimeMs: 42000, lastSeen: '2026-08-15T10:00:00.000Z', masteryBand: 'developing', errorTypes: { concept: 1, careless: 3 } },
    p12: { attempted: 10, correct: 4,  wrong: 6, totalTimeMs: 950000, accuracy: 40.0, avgTimeMs: 95000, lastSeen: '2026-08-16T10:00:00.000Z', masteryBand: 'weak', errorTypes: { unit: 4, concept: 2 } },
    c8:  { attempted: 12, correct: 10, wrong: 2, totalTimeMs: 456000, accuracy: 83.3, avgTimeMs: 38000, lastSeen: '2026-08-16T09:00:00.000Z', masteryBand: 'mastered', errorTypes: { careless: 2 } },
    b7:  { attempted: 8,  correct: 3,  wrong: 5, totalTimeMs: 560000, accuracy: 37.5, avgTimeMs: 70000, lastSeen: '2026-08-14T10:00:00.000Z', masteryBand: 'weak', errorTypes: { formula: 3, concept: 2 } },
  },
  galtiMistakes: {
    'pack1_0': { tid: 'p12', sub: 'PHYSICS', errorType: 'unit', count: 2, recovered: false, recoveryStep: 0, addedAt: '2026-08-10T00:00:00.000Z', lastWrong: '2026-08-16T00:00:00.000Z', nextReview: '2026-08-17T00:00:00.000Z', recoveredAt: null },
    'pack1_1': { tid: 'p12', sub: 'PHYSICS', errorType: 'unit', count: 1, recovered: true,  recoveryStep: 3, addedAt: '2026-08-05T00:00:00.000Z', lastWrong: '2026-08-05T00:00:00.000Z', nextReview: '2026-09-04T00:00:00.000Z', recoveredAt: '2026-08-09T00:00:00.000Z' },
    'pack1_2': { tid: 'b7',  sub: 'BIOLOGY', errorType: 'formula', count: 3, recovered: false, recoveryStep: 1, addedAt: '2026-08-11T00:00:00.000Z', lastWrong: '2026-08-14T00:00:00.000Z', nextReview: '2026-08-15T00:00:00.000Z', recoveredAt: null },
    'pack1_3': { tid: 'c8',  sub: 'CHEMISTRY', errorType: 'careless', count: 1, recovered: true, recoveryStep: 3, addedAt: '2026-08-02T00:00:00.000Z', lastWrong: '2026-08-02T00:00:00.000Z', nextReview: '2026-09-01T00:00:00.000Z', recoveredAt: '2026-08-03T00:00:00.000Z' },
  },
  dailyMission: {
    date: '2026-08-16', // yesterday relative to fixture "today" - tests date-rollover behavior
    blockProgress: { recovery: { questionsCompleted: 6, completedAt: '2026-08-16T08:00:00.000Z' } },
  },
});

module.exports = {
  baseUser, ADMIN_USER, TRIAL_ACTIVE_USER, TRIAL_EXPIRED_USER,
  PAID_USER, DISABLED_USER, ACADEMY_STUDENT_USER, RICH_DATA_USER,
};
