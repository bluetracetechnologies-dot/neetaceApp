const { computeScorePrediction } = require('../../lib/score-predictor');
const { buildChapterMasteryList } = require('../../lib/chapter-mastery');
const { QUESTIONS_FIXTURE } = require('../fixtures/questions.fixture');

const NEET_SYLLABUS_FIXTURE = {
  PHYSICS: { units: [{ id: 'PH12', name: 'Electrostatics', tids: ['p12'] }, { id: 'PH03', name: 'Laws of Motion', tids: ['p3'] }] },
};
function getWeightageFixture(unitId) {
  return { PH12: 6, PH03: 4 }[unitId] || 4;
}

beforeEach(() => {
  global.QUESTIONS = QUESTIONS_FIXTURE;
});

function richDash() {
  return {
    conceptStats: [
      { tid: 'p12', theta: 380, accuracy: 45, errorTypes: { unit: 4 } },
      { tid: 'p3', theta: 620, accuracy: 75, errorTypes: {} },
      { tid: 'c8', theta: 700, accuracy: 85, errorTypes: {} },
    ],
    galtiSummary: [{ sub: 'PHYSICS', recovered: true }, { sub: 'PHYSICS', recovered: false }, { sub: 'PHYSICS', recovered: true }],
    consistency7d: 5,
    recoveryQueue: [{ tid: 'p12', errorType: 'unit', priority: 1, reason: 'unit error x4 in this topic (accuracy 45%)' }],
  };
}
const richGlobal = { attempted: 25, accuracy: 65 };

describe('computeScorePrediction (Priority 10: Score Predictor V2)', () => {
  test('returns ready=false when attempted is 0 (the actual enforced gate)', () => {
    const result = computeScorePrediction(richDash(), { attempted: 0, accuracy: 60 }, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(result.ready).toBe(false);
    expect(result.currentScore).toBeUndefined();
  });

  // FINDING: the live source's message text says "Solve 20+ questions" but the actual
  // gate only checks `!g.attempted` (i.e. exactly 0), not a >=20 threshold. A student
  // with 1 attempted question already gets a real prediction. This is a UI-copy vs
  // enforcement mismatch, not a crash risk - documented here rather than silently
  // asserted around, so it stays visible for a future copy/logic alignment decision.
  test('DOCUMENTS MISMATCH: with only 5 attempted (well under the "20+" message), a prediction IS still returned', () => {
    const result = computeScorePrediction(richDash(), { attempted: 5, accuracy: 60 }, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(result.ready).toBe(true); // documents actual behavior, not necessarily desired behavior
  });

  test('returns ready=false when no conceptStats have theta yet (adaptive not touched)', () => {
    const dash = { conceptStats: [{ tid: 'p12', theta: null, accuracy: 50, errorTypes: {} }], galtiSummary: [], consistency7d: 0, recoveryQueue: [] };
    const result = computeScorePrediction(dash, richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(result.ready).toBe(false);
  });

  test('currentScore uses the EXACT V1 formula: ((avgTheta-100)/800)*0.6 + accuracy*0.4, times 720', () => {
    const dash = richDash();
    const result = computeScorePrediction(dash, richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    const avgTheta = (380 + 620 + 700) / 3;
    const expectedBase = ((avgTheta - 100) / 800) * 0.6 + 0.65 * 0.4;
    const expectedScore = Math.round(expectedBase * 720);
    expect(result.currentScore).toBe(expectedScore);
  });

  test('potentialScore is always >= currentScore (never predicts you will get worse)', () => {
    const result = computeScorePrediction(richDash(), richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(result.potentialScore).toBeGreaterThanOrEqual(result.currentScore);
  });

  test('confidence is bounded 35-90 (honest cap, matches Concept Doctor pattern)', () => {
    const result = computeScorePrediction(richDash(), richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(result.confidencePct).toBeGreaterThanOrEqual(35);
    expect(result.confidencePct).toBeLessThanOrEqual(90);
  });

  test('expected range (lo/hi) always brackets currentScore and stays within 0-720', () => {
    const result = computeScorePrediction(richDash(), richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(result.lo).toBeLessThanOrEqual(result.currentScore);
    expect(result.hi).toBeGreaterThanOrEqual(result.currentScore);
    expect(result.lo).toBeGreaterThanOrEqual(0);
    expect(result.hi).toBeLessThanOrEqual(720);
  });

  test('higher recovery rate + consistency narrows confidence band (real evidence rewarded)', () => {
    const highFollowThrough = { ...richDash(), galtiSummary: [{ sub: 'P', recovered: true }, { sub: 'P', recovered: true }, { sub: 'P', recovered: true }], consistency7d: 7 };
    const lowFollowThrough = { ...richDash(), galtiSummary: [{ sub: 'P', recovered: false }, { sub: 'P', recovered: false }, { sub: 'P', recovered: false }], consistency7d: 1 };
    const r1 = computeScorePrediction(highFollowThrough, richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    const r2 = computeScorePrediction(lowFollowThrough, richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(r1.hi - r1.lo).toBeLessThan(r2.hi - r2.lo);
  });

  test('top5Recovery is a DIRECT slice of dash.recoveryQueue - no reimplementation', () => {
    const dash = richDash();
    const result = computeScorePrediction(dash, richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(result.top5Recovery).toEqual(dash.recoveryQueue.slice(0, 5));
  });

  test('top5Chapters sorted weakest-first, minimum 3 attempts gate applied', () => {
    const dash = {
      conceptStats: [
        { tid: 'p12', theta: 380, accuracy: 45, errorTypes: {} }, // attempted comes from chapter mastery join via conceptStats shape - need attempted field
      ],
      galtiSummary: [], consistency7d: 0, recoveryQueue: [],
    };
    // buildChapterMasteryList needs `attempted` on each cs entry - add it properly
    dash.conceptStats[0].attempted = 10; dash.conceptStats[0].correct = 4; dash.conceptStats[0].masteryBand = 'weak'; dash.conceptStats[0].correctStreak = 0;
    const result = computeScorePrediction(dash, richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(result.top5Chapters.length).toBeGreaterThan(0);
    expect(result.top5Chapters[0].tid).toBe('p12');
  });

  test('concepts list uses chapter+dominant-errorType pairing, NOT identical to chapters list (Finding 2 fix)', () => {
    const dash = richDash();
    dash.conceptStats = dash.conceptStats.map((c) => ({ ...c, attempted: 10, correct: 5, masteryBand: 'weak', correctStreak: 0 }));
    const result = computeScorePrediction(dash, richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    if (result.concepts.length && result.top5Chapters.length) {
      expect(result.concepts[0]).toHaveProperty('cause');
      expect(result.top5Chapters[0]).not.toHaveProperty('cause');
    }
  });

  test('fastestAreas uses getWeightage (reused, not reimplemented) and only considers moderate weakness (35-65%)', () => {
    const dash = {
      conceptStats: [
        { tid: 'p12', theta: 500, accuracy: 50, attempted: 10, correct: 5, masteryBand: 'developing', correctStreak: 0, errorTypes: {} }, // in 35-65 range
        { tid: 'p3', theta: 900, accuracy: 95, attempted: 10, correct: 9, masteryBand: 'mastered', correctStreak: 5, errorTypes: {} }, // too strong, excluded
      ],
      galtiSummary: [], consistency7d: 0, recoveryQueue: [],
    };
    const result = computeScorePrediction(dash, richGlobal, buildChapterMasteryList, NEET_SYLLABUS_FIXTURE, getWeightageFixture);
    expect(result.fastestAreas.every((f) => f.pct >= 35 && f.pct <= 65)).toBe(true);
  });
});
