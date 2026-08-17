const { buildChapterMasteryList } = require('../../lib/chapter-mastery');
const { QUESTIONS_FIXTURE } = require('../fixtures/questions.fixture');

beforeEach(() => {
  global.QUESTIONS = QUESTIONS_FIXTURE;
});

describe('buildChapterMasteryList (Priority 7: Chapter Mastery)', () => {
  test('groups by subject using QUESTIONS metadata (not a separate mapping table)', () => {
    const list = [
      { tid: 'p12', attempted: 10, correct: 6, accuracy: 60, theta: 500, masteryBand: 'developing', correctStreak: 0, errorTypes: {} },
      { tid: 'b7', attempted: 8, correct: 3, accuracy: 37.5, theta: 400, masteryBand: 'weak', correctStreak: 0, errorTypes: {} },
    ];
    const result = buildChapterMasteryList(list);
    expect(result.PHYSICS.length).toBe(1);
    expect(result.BIOLOGY.length).toBe(1);
    expect(result.CHEMISTRY.length).toBe(0);
  });

  test('chapter label pulled from most-common q.ch among matching questions', () => {
    const list = [{ tid: 'p12', attempted: 5, correct: 3, accuracy: 60, theta: 500, masteryBand: 'developing', correctStreak: 0, errorTypes: {} }];
    const result = buildChapterMasteryList(list);
    expect(result.PHYSICS[0].chapter).toBe('Electrostatics');
  });

  test('skips entries with attempted < 1', () => {
    const list = [{ tid: 'p12', attempted: 0, correct: 0, accuracy: 0, theta: 500, masteryBand: 'weak', correctStreak: 0, errorTypes: {} }];
    const result = buildChapterMasteryList(list);
    expect(result.PHYSICS.length).toBe(0);
  });

  test('skips tids with no matching loaded questions (disabled pack) - does not crash', () => {
    const list = [{ tid: 'nonexistent_tid', attempted: 5, correct: 3, accuracy: 60, theta: 500, masteryBand: 'developing', correctStreak: 0, errorTypes: {} }];
    expect(() => buildChapterMasteryList(list)).not.toThrow();
    const result = buildChapterMasteryList(list);
    expect(result.PHYSICS.length + result.CHEMISTRY.length + result.BIOLOGY.length).toBe(0);
  });

  test('mastery pct uses the theta*0.6 + accuracy*0.4 blend, matches Score Predictor formula exactly', () => {
    const list = [{ tid: 'c8', attempted: 10, correct: 8, accuracy: 80, theta: 700, masteryBand: 'mastered', correctStreak: 0, errorTypes: {} }];
    const result = buildChapterMasteryList(list);
    const expectedBase = ((700 - 100) / 800) * 0.6 + (80 / 100) * 0.4;
    const expectedPct = Math.round(expectedBase * 100);
    expect(result.CHEMISTRY[0].pct).toBe(expectedPct);
  });

  test('null theta falls back to neutral 500 (not a crash, not zero)', () => {
    const list = [{ tid: 'c8', attempted: 10, correct: 5, accuracy: 50, theta: null, masteryBand: 'developing', correctStreak: 0, errorTypes: {} }];
    const result = buildChapterMasteryList(list);
    expect(result.CHEMISTRY[0].pct).toBeGreaterThan(0);
  });

  test('improving flag set when correctStreak >= 3 (reused signal, no new tracking)', () => {
    const list = [
      { tid: 'p3', attempted: 5, correct: 4, accuracy: 80, theta: 600, masteryBand: 'mastered', correctStreak: 4, errorTypes: {} },
      { tid: 'p12', attempted: 5, correct: 2, accuracy: 40, theta: 400, masteryBand: 'weak', correctStreak: 1, errorTypes: {} },
    ];
    const result = buildChapterMasteryList(list);
    expect(result.PHYSICS.find((c) => c.tid === 'p3').improving).toBe(true);
    expect(result.PHYSICS.find((c) => c.tid === 'p12').improving).toBe(false);
  });

  test('masteryBand and errorTypes pass through unchanged (reused from conceptStats, not recomputed)', () => {
    const list = [{ tid: 'p12', attempted: 5, correct: 2, accuracy: 40, theta: 400, masteryBand: 'weak', correctStreak: 0, errorTypes: { unit: 3 } }];
    const result = buildChapterMasteryList(list);
    expect(result.PHYSICS[0].masteryBand).toBe('weak');
    expect(result.PHYSICS[0].errorTypes).toEqual({ unit: 3 });
  });
});
