const { CAUSE_LABELS, diagnoseWrongAnswer, classifyError } = require('../../lib/galti-classify');
const { QUESTIONS_FIXTURE } = require('../fixtures/questions.fixture');

// diagnoseWrongAnswer reads three bare globals exactly as the live browser code
// does: window._DASHBOARD, ADAPTIVE_MODE, DIFF_RANK. Set them fresh each test.
beforeEach(() => {
  global.window = { _DASHBOARD: null };
  global.ADAPTIVE_MODE = false;
  global.DIFF_RANK = { starter: 0, easy: 1, medium: 2, hard: 3, exam: 4 };
});

const q = QUESTIONS_FIXTURE[1]; // Electrostatics, medium, has formula, unitType='unit_variant'

describe('CAUSE_LABELS (Priority 9: Concept Doctor)', () => {
  test('has exactly the 6 required causes', () => {
    expect(Object.keys(CAUSE_LABELS).sort()).toEqual(
      ['calc', 'careless', 'concept', 'formula', 'time', 'unit'].sort()
    );
  });
  test('every cause has a label and emoji', () => {
    Object.values(CAUSE_LABELS).forEach((c) => {
      expect(c.label).toBeTruthy();
      expect(c.emoji).toBeTruthy();
    });
  });
});

describe('diagnoseWrongAnswer (Priority 9: Concept Doctor diagnosis)', () => {
  test('returns all 4 required fields: primaryCause, confidence, evidence, recommendation', () => {
    const d = diagnoseWrongAnswer(q, 0, 65000);
    expect(d).toHaveProperty('primaryCause');
    expect(d).toHaveProperty('confidence');
    expect(d).toHaveProperty('evidence');
    expect(d).toHaveProperty('recommendation');
    expect(Array.isArray(d.evidence)).toBe(true);
  });

  test('confidence is always capped below 100 (never claims false certainty)', () => {
    for (let i = 0; i < 20; i++) {
      const d = diagnoseWrongAnswer(q, i % 4, 60000 + i * 5000);
      expect(d.confidence).toBeLessThanOrEqual(90);
      expect(d.confidence).toBeGreaterThanOrEqual(35);
    }
  });

  test('unitType=unit_variant question votes toward unit cause', () => {
    const unitQ = { ...q, unitType: 'unit_variant', formula: '', trick: '', diff: 'medium' };
    const d = diagnoseWrongAnswer(unitQ, 0, 60000);
    expect(d.primaryCause).toBe('unit');
  });

  test('question with a formula field votes toward formula cause', () => {
    const formulaQ = { ...q, unitType: 'standard', formula: 'v = u + at', trick: '', diff: 'medium' };
    const d = diagnoseWrongAnswer(formulaQ, 0, 60000);
    expect(d.primaryCause).toBe('formula');
  });

  test('slow answer (>1.6x estimated time) votes toward time pressure', () => {
    const timeQ = { ...q, unitType: 'standard', formula: '', trick: '', diff: 'medium', estimatedTime: 60 };
    const d = diagnoseWrongAnswer(timeQ, 0, 110000); // 110s vs 60s expected = 1.83x
    expect(d.primaryCause).toBe('time');
    expect(d.evidence.some((e) => e.includes('110s'))).toBe(true);
  });

  test('very fast answer on non-easy question votes toward careless', () => {
    const fastQ = { ...q, unitType: 'standard', formula: '', trick: '', diff: 'medium', estimatedTime: 60 };
    const d = diagnoseWrongAnswer(fastQ, 0, 15000); // 15s vs 60s = 0.25x, under the 0.4 threshold
    expect(d.primaryCause).toBe('careless');
  });

  test('easy/starter question wrong answer leans careless', () => {
    const easyQ = { ...q, diff: 'easy', unitType: 'standard', formula: '', trick: '' };
    const d = diagnoseWrongAnswer(easyQ, 0, 45000);
    expect(d.primaryCause).toBe('careless');
  });

  test('historical prior from window._DASHBOARD.conceptStats influences the diagnosis', () => {
    global.window._DASHBOARD = {
      conceptStats: [{ tid: q.tid, errorTypes: { unit: 5, concept: 1 } }],
    };
    const neutralQ = { ...q, unitType: 'standard', formula: '', trick: '', diff: 'medium' };
    const d = diagnoseWrongAnswer(neutralQ, 0, 60000);
    expect(d.primaryCause).toBe('unit');
    expect(d.evidence.some((e) => e.includes('unit conversion error mistakes'))).toBe(true);
  });

  test('no signals fire -> falls back to concept with an explicit fallback note', () => {
    const blankQ = { tid: 'x1', diff: 'medium', unitType: 'standard', formula: '', trick: '' };
    const d = diagnoseWrongAnswer(blankQ, 0, null);
    expect(d.primaryCause).toBe('concept');
    expect(d.evidence[0]).toContain('No strong signal detected');
  });

  test('doctorEligible is true ONLY when adaptive mode + medium/hard + cause in [concept,formula,unit,calc]', () => {
    global.ADAPTIVE_MODE = true;
    const formulaQ = { ...q, diff: 'medium', unitType: 'standard', formula: 'v=u+at', trick: '' };
    const d1 = diagnoseWrongAnswer(formulaQ, 0, 60000);
    expect(d1.doctorEligible).toBe(true);

    const carelessQ = { ...q, diff: 'easy', unitType: 'standard', formula: '', trick: '' };
    const d2 = diagnoseWrongAnswer(carelessQ, 0, 45000);
    expect(d2.doctorEligible).toBe(false); // careless is not doctor-eligible even in adaptive mode
  });

  test('doctorEligible is false when NOT in adaptive mode, regardless of cause', () => {
    global.ADAPTIVE_MODE = false;
    const formulaQ = { ...q, diff: 'medium', unitType: 'standard', formula: 'v=u+at', trick: '' };
    const d = diagnoseWrongAnswer(formulaQ, 0, 60000);
    expect(d.doctorEligible).toBe(false);
  });

  test('recommendation reuses Recovery Queue / Daily Mission / GALTI - never a new system', () => {
    const carelessQ = { ...q, diff: 'easy', unitType: 'standard', formula: '', trick: '' };
    const d1 = diagnoseWrongAnswer(carelessQ, 0, 45000);
    expect(d1.recommendation).toMatch(/Galti Copy/);

    const conceptQ = { tid: 'x2', diff: 'medium', unitType: 'standard', formula: '', trick: '' };
    global.ADAPTIVE_MODE = false; // not doctor-eligible -> falls to Recovery Queue/Daily Mission text
    const d2 = diagnoseWrongAnswer(conceptQ, 0, 60000);
    expect(d2.recommendation).toMatch(/Recovery Queue/);
    expect(d2.recommendation).toMatch(/Daily Mission/);
  });

  test('evidence is capped at 3 items even when more signals fire', () => {
    global.window._DASHBOARD = { conceptStats: [{ tid: q.tid, errorTypes: { unit: 5 } }] };
    const busyQ = { ...q, diff: 'easy', unitType: 'unit_variant', formula: 'x=y', trick: 'Watch the units!', estimatedTime: 60 };
    const d = diagnoseWrongAnswer(busyQ, 0, 15000);
    expect(d.evidence.length).toBeLessThanOrEqual(3);
  });
});

describe('classifyError (delegates to diagnoseWrongAnswer - single source of truth, no duplicate classifier)', () => {
  test('returns exactly diagnoseWrongAnswer(...).primaryCause', () => {
    const direct = diagnoseWrongAnswer(q, 0, 60000);
    const viaClassify = classifyError(q, 0, 60000);
    expect(viaClassify).toBe(direct.primaryCause);
  });
});
