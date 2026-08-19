const { isRealNcertPage, filterQuestionsByNcert, resolveNcertPool } = require('../../lib/ncert-filter');

const QUESTIONS = [
  { sub: 'PHYSICS', ncertCl: 11, ch: 'Units and Measurements', ncertPg: '42' },
  { sub: 'PHYSICS', ncertCl: 11, ch: 'Units and Measurements', ncertPg: '58' },
  { sub: 'PHYSICS', ncertCl: 11, ch: 'Units and Measurements', ncertPg: '1' }, // untagged (default)
  { sub: 'PHYSICS', ncertCl: 11, ch: 'Laws of Motion', ncertPg: '90' },
  { sub: 'PHYSICS', ncertCl: 12, ch: 'Electrostatics', ncertPg: '15' },
  { sub: 'CHEMISTRY', ncertCl: 11, ch: 'Chemical Bonding', ncertPg: '' }, // untagged (blank)
];

describe('isRealNcertPage', () => {
  test('rejects the coded defaults', () => {
    expect(isRealNcertPage('1')).toBe(false);
    expect(isRealNcertPage('')).toBe(false);
    expect(isRealNcertPage('-')).toBe(false);
    expect(isRealNcertPage(null)).toBe(false);
    expect(isRealNcertPage(undefined)).toBe(false);
  });
  test('accepts a genuine page number', () => {
    expect(isRealNcertPage('42')).toBe(true);
    expect(isRealNcertPage(42)).toBe(true);
  });
  test('rejects non-numeric garbage', () => {
    expect(isRealNcertPage('abc')).toBe(false);
  });
});

describe('filterQuestionsByNcert', () => {
  test('with no page range, includes untagged questions normally (existing chapter-browse behavior unchanged)', () => {
    const result = filterQuestionsByNcert(QUESTIONS, { sub: 'PHYSICS', cls: 11, chapter: 'Units and Measurements' });
    expect(result.length).toBe(3); // all 3, including the untagged one
  });

  test('with a page range, excludes untagged questions even if they would otherwise match subject/class/chapter', () => {
    const result = filterQuestionsByNcert(QUESTIONS, { sub: 'PHYSICS', cls: 11, chapter: 'Units and Measurements', pageFrom: '1', pageTo: '100' });
    expect(result.length).toBe(2); // the tagged 42 and 58, NOT the untagged '1' default
    expect(result.every((q) => isRealNcertPage(q.ncertPg))).toBe(true);
  });

  test('range boundaries are inclusive and correctly exclude out-of-range pages', () => {
    const result = filterQuestionsByNcert(QUESTIONS, { sub: 'PHYSICS', cls: 11, pageFrom: '50', pageTo: '60' });
    expect(result.map((q) => q.ncertPg)).toEqual(['58']); // 42 excluded (below), 90 excluded (above)
  });

  test('an open-ended range (only pageFrom) works correctly', () => {
    const result = filterQuestionsByNcert(QUESTIONS, { sub: 'PHYSICS', cls: 11, pageFrom: '50' });
    expect(result.map((q) => q.ncertPg).sort()).toEqual(['58', '90']);
  });

  test('subject and class filtering still work correctly alongside range filtering', () => {
    const result = filterQuestionsByNcert(QUESTIONS, { sub: 'PHYSICS', cls: 12, pageFrom: '1', pageTo: '100' });
    expect(result.length).toBe(1);
    expect(result[0].ch).toBe('Electrostatics');
  });
});

describe('resolveNcertPool - the graceful fallback, the actual point of this feature', () => {
  test('no range specified: returns the full chapter pool, usedFallback is false', () => {
    const { pool, usedFallback } = resolveNcertPool(QUESTIONS, { sub: 'PHYSICS', cls: 11, chapter: 'Units and Measurements' });
    expect(pool.length).toBe(3);
    expect(usedFallback).toBe(false);
  });

  test('range specified with real matches: returns only the tagged, in-range questions, usedFallback is false', () => {
    const { pool, usedFallback } = resolveNcertPool(QUESTIONS, { sub: 'PHYSICS', cls: 11, chapter: 'Units and Measurements', pageFrom: '1', pageTo: '100' });
    expect(pool.length).toBe(2);
    expect(usedFallback).toBe(false);
  });

  test('CONFIRMED FIX: range specified but zero tagged matches falls back to the full chapter pool, never returns empty', () => {
    const { pool, usedFallback } = resolveNcertPool(QUESTIONS, { sub: 'CHEMISTRY', cls: 11, chapter: 'Chemical Bonding', pageFrom: '1', pageTo: '50' });
    expect(usedFallback).toBe(true);
    expect(pool.length).toBe(1); // the untagged question IS included in the fallback
  });

  test('a genuinely empty result (no fallback available either) still correctly returns empty - not everything is forced non-empty', () => {
    const { pool, usedFallback } = resolveNcertPool(QUESTIONS, { sub: 'BIOLOGY', cls: 11, pageFrom: '1', pageTo: '50' });
    expect(pool.length).toBe(0); // no Biology questions exist in this fixture at all - correctly empty
    expect(usedFallback).toBe(true); // fallback WAS attempted, it just also found nothing
  });
});
