const { DNA_DIMENSIONS, MIN_ATTEMPTS_FOR_DNA, computeSubjectDNA } = require('../../lib/learning-dna');
const { QUESTIONS_FIXTURE } = require('../fixtures/questions.fixture');

beforeEach(() => {
  global.QUESTIONS = QUESTIONS_FIXTURE;
});

describe('DNA_DIMENSIONS (Priority 8: Learning DNA)', () => {
  test('has exactly the 4 error-type-derived dimensions (Speed and Retention are computed separately)', () => {
    expect(DNA_DIMENSIONS.map((d) => d.key).sort()).toEqual(['calc', 'concept', 'formula', 'unit'].sort());
  });
});

describe('computeSubjectDNA (Priority 8: Learning DNA six skills)', () => {
  const richList = [
    { tid: 'p12', attempted: 10, correct: 6, accuracy: 60, avgTimeMs: 90000, correctStreak: 0, errorTypes: { unit: 3, concept: 1 } },
    { tid: 'p3', attempted: 8, correct: 7, accuracy: 87.5, avgTimeMs: 40000, correctStreak: 4, errorTypes: { careless: 1 } },
  ];

  test('below MIN_ATTEMPTS_FOR_DNA (5), returns ready=false with no fake precise numbers', () => {
    const thin = [{ tid: 'p12', attempted: 2, correct: 1, accuracy: 50, avgTimeMs: 60000, correctStreak: 0, errorTypes: {} }];
    const result = computeSubjectDNA('PHYSICS', thin, [], 3);
    expect(result.ready).toBe(false);
    expect(result.scores).toBeUndefined();
    expect(result.totalAttempted).toBe(2);
  });

  test('at/above MIN_ATTEMPTS_FOR_DNA, computes all 6 dimension scores', () => {
    const result = computeSubjectDNA('PHYSICS', richList, [], 5);
    expect(result.ready).toBe(true);
    expect(result.scores).toHaveProperty('concept');
    expect(result.scores).toHaveProperty('formula');
    expect(result.scores).toHaveProperty('unit');
    expect(result.scores).toHaveProperty('calc');
    expect(result.scores).toHaveProperty('speed');
    expect(result.scores).toHaveProperty('retention');
  });

  test('unit dimension score = 100 * (1 - unitErrors/totalAttempted), exact formula', () => {
    const result = computeSubjectDNA('PHYSICS', richList, [], 5);
    const totalAttempted = 18; // 10 + 8
    const unitErrors = 3;
    const expected = Math.round(100 * (1 - unitErrors / totalAttempted));
    expect(result.scores.unit).toBe(expected);
  });

  test('all dimension scores are clamped 0-100', () => {
    const extreme = [{ tid: 'p12', attempted: 5, correct: 0, accuracy: 0, avgTimeMs: 500000, correctStreak: 0, errorTypes: { concept: 5, formula: 5, unit: 5, calc: 5 } }];
    const result = computeSubjectDNA('PHYSICS', extreme, [], 0);
    Object.values(result.scores).forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    });
  });

  test('speed score uses actual avgTimeMs vs question metadata estimatedTime (first real use of Phase 1 metadata)', () => {
    const fastList = [{ tid: 'p12', attempted: 10, correct: 8, accuracy: 80, avgTimeMs: 20000, correctStreak: 0, errorTypes: {} }]; // very fast vs 60s estimate
    const slowList = [{ tid: 'p12', attempted: 10, correct: 8, accuracy: 80, avgTimeMs: 200000, correctStreak: 0, errorTypes: {} }]; // very slow
    const fastResult = computeSubjectDNA('PHYSICS', fastList, [], 5);
    const slowResult = computeSubjectDNA('PHYSICS', slowList, [], 5);
    expect(fastResult.scores.speed).toBeGreaterThan(slowResult.scores.speed);
    expect(fastResult.scores.speed).toBe(100); // faster than expected = full marks, capped at 100
  });

  test('retention: with >=3 galti entries, blends recovery rate (80%) + consistency (20%)', () => {
    const galtiSummary = [
      { sub: 'PHYSICS', recovered: true }, { sub: 'PHYSICS', recovered: true }, { sub: 'PHYSICS', recovered: false },
    ];
    const result = computeSubjectDNA('PHYSICS', richList, galtiSummary, 7);
    // recoveryRate = 2/3 = 0.667, consistencyNorm = 1 -> (0.667*0.8 + 1*0.2)*100 = 73.3 -> round 73
    expect(result.scores.retention).toBe(73);
    expect(result.retentionConfident).toBe(true);
  });

  test('retention: with <3 galti entries, falls back to consistency-only and flags low confidence', () => {
    const result = computeSubjectDNA('PHYSICS', richList, [{ sub: 'PHYSICS', recovered: true }], 7);
    expect(result.retentionConfident).toBe(false);
    expect(result.scores.retention).toBe(100); // consistency 7/7 = 100% consistency-only
  });

  test('uses recovery success rate specifically for THIS subject, not mixed with other subjects', () => {
    const mixedGalti = [
      { sub: 'PHYSICS', recovered: false }, { sub: 'PHYSICS', recovered: false }, { sub: 'PHYSICS', recovered: false },
      { sub: 'CHEMISTRY', recovered: true }, { sub: 'CHEMISTRY', recovered: true }, { sub: 'CHEMISTRY', recovered: true },
    ];
    const physicsResult = computeSubjectDNA('PHYSICS', richList, mixedGalti, 0);
    expect(physicsResult.scores.retention).toBeLessThan(50); // all physics recoveries failed
  });

  test('improvingCount reflects correctStreak>=3 tids within this subject (reused Chapter Mastery signal)', () => {
    const result = computeSubjectDNA('PHYSICS', richList, [], 5);
    expect(result.improvingCount).toBe(1); // only p3 has correctStreak=4
  });

  test('only considers tids belonging to the given subject (correct QUESTIONS join)', () => {
    const crossSubjectList = [
      { tid: 'p12', attempted: 10, correct: 6, accuracy: 60, avgTimeMs: 50000, correctStreak: 0, errorTypes: {} },
      { tid: 'b7', attempted: 10, correct: 8, accuracy: 80, avgTimeMs: 50000, correctStreak: 0, errorTypes: {} }, // biology - should be excluded
    ];
    const result = computeSubjectDNA('PHYSICS', crossSubjectList, [], 5);
    expect(result.totalAttempted).toBe(10); // only p12's 10, not b7's
  });
});
