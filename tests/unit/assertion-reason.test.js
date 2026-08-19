const { csvRowToQuestion, AR_OPTIONS, STATEMENT_OPTIONS, parseCSV } = require('../../api/packs');

describe('csvRowToQuestion - assertion_reason type', () => {
  test('auto-populates the fixed AR_OPTIONS, ignoring any opt_a-d columns in the row', () => {
    const row = { subject: 'physics', type: 'assertion_reason', statement1: 'A stmt', statement2: 'R stmt', correct: 'A', opt_a: 'should be ignored' };
    const q = csvRowToQuestion(row, 'pack1', 0);
    expect(q.type).toBe('assertion_reason');
    expect(q.opts).toEqual(AR_OPTIONS);
    expect(q.opts).not.toContain('should be ignored');
  });

  test('reads statement1/statement2 from the row', () => {
    const row = { type: 'assertion_reason', statement1: 'The assertion text', statement2: 'The reason text', correct: 'A' };
    const q = csvRowToQuestion(row, 'pack1', 0);
    expect(q.statement1).toBe('The assertion text');
    expect(q.statement2).toBe('The reason text');
  });

  test('also accepts assertion/reason column names as an alias for statement1/statement2', () => {
    const row = { type: 'assertion_reason', assertion: 'Alias assertion', reason: 'Alias reason', correct: 'B' };
    const q = csvRowToQuestion(row, 'pack1', 0);
    expect(q.statement1).toBe('Alias assertion');
    expect(q.statement2).toBe('Alias reason');
  });

  test('exactly 4 fixed options, matching the standard NTA convention', () => {
    expect(AR_OPTIONS.length).toBe(4);
    expect(AR_OPTIONS[0]).toMatch(/correct explanation/i);
    expect(AR_OPTIONS[2]).toMatch(/Assertion is true, but Reason is false/i);
  });
});

describe('csvRowToQuestion - statement type', () => {
  test('auto-populates the fixed STATEMENT_OPTIONS', () => {
    const row = { type: 'statement', statement1: 'Stmt I', statement2: 'Stmt II', correct: 'A' };
    const q = csvRowToQuestion(row, 'pack1', 0);
    expect(q.type).toBe('statement');
    expect(q.opts).toEqual(STATEMENT_OPTIONS);
  });

  test('exactly 4 fixed options, matching the standard convention', () => {
    expect(STATEMENT_OPTIONS.length).toBe(4);
    expect(STATEMENT_OPTIONS[0]).toMatch(/Both Statement I and Statement II are true/i);
  });
});

describe('csvRowToQuestion - standard type (regression, must be unaffected)', () => {
  test('a normal row with no type field still works exactly as before', () => {
    const row = { subject: 'biology', question: 'A normal question', opt_a: 'A', opt_b: 'B', opt_c: 'C', opt_d: 'D', correct: 'B' };
    const q = csvRowToQuestion(row, 'pack1', 0);
    expect(q.type).toBe('standard');
    expect(q.opts).toEqual(['A', 'B', 'C', 'D']); // the row's OWN options, not the fixed AR/statement sets
    expect(q.statement1).toBeNull(); // null, not undefined - Firestore-safe
    expect(q.statement2).toBeNull();
  });

  test('an explicit type:"standard" behaves identically to an absent type field', () => {
    const row = { type: 'standard', opt_a: 'X', opt_b: 'Y', opt_c: 'Z', opt_d: 'W', correct: 'A' };
    const q = csvRowToQuestion(row, 'pack1', 0);
    expect(q.opts).toEqual(['X', 'Y', 'Z', 'W']);
  });

  test('an unrecognized type value falls back to standard, not a crash', () => {
    const row = { type: 'totally_made_up', opt_a: 'A', opt_b: 'B', opt_c: 'C', opt_d: 'D', correct: 'A' };
    const q = csvRowToQuestion(row, 'pack1', 0);
    expect(q.type).toBe('standard');
    expect(q.opts).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('REAL FILE regression: pack_assertion_reason_statement.csv parses correctly end-to-end', () => {
  // Written after finding a real bug: unquoted commas inside explanation text
  // shifted every subsequent column, so `correct` silently held explanation text
  // instead of A/B/C/D. Unit tests with clean synthetic objects never caught
  // this - only checking the REAL file does. This test exists specifically so
  // that class of bug can't silently return if the file is ever hand-edited.
  const fs = require('fs');
  const path = require('path');

  function loadRealPack() {
    const csvPath = path.join(__dirname, '../../data/packs/pack_assertion_reason_statement.csv');
    const raw = fs.readFileSync(csvPath, 'utf8');
    return parseCSV(raw);
  }

  test('every row has a valid correct answer (A/B/C/D), not explanation text or anything else', () => {
    const rows = loadRealPack();
    expect(rows.length).toBe(10);
    rows.forEach((r) => {
      expect(['A', 'B', 'C', 'D']).toContain(r.correct);
    });
  });

  test('every row, when parsed through the real csvRowToQuestion, produces a valid question with correct-length statements', () => {
    const rows = loadRealPack();
    rows.forEach((r, i) => {
      const q = csvRowToQuestion(r, 'pack_ar', i);
      expect(q.statement1.length).toBeGreaterThan(10);
      expect(q.statement2.length).toBeGreaterThan(10);
      expect(q.opts.length).toBe(4);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThanOrEqual(3);
    });
  });

  test('the answer types are genuinely mixed, not all clustered on one option (a real pedagogical check)', () => {
    const rows = loadRealPack();
    const answerCounts = {};
    rows.forEach((r) => { answerCounts[r.correct] = (answerCounts[r.correct] || 0) + 1; });
    expect(Object.keys(answerCounts).length).toBeGreaterThanOrEqual(3); // at least 3 of the 4 possible answers actually used
  });
});
