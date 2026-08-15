#!/usr/bin/env node
/* Backfills NEETAce V2 metadata for existing question banks without mutating source files. */

const path = require('path');
const { QUESTION_BANK } = require(path.join(__dirname, '..', 'questions'));
const { PARAM_QUESTIONS } = require(path.join(__dirname, '..', 'param_questions'));
const { UNIT_QUESTIONS } = require(path.join(__dirname, '..', 'unit_questions'));

function normalizeDifficulty(diff) {
  const d = String(diff || '').toLowerCase();
  if (d === 'easy' || d === 'medium' || d === 'hard') return d;
  if (d === 'starter') return 'easy';
  if (d === 'exam') return 'hard';
  return 'medium';
}

function slugify(v) {
  return String(v || 'general').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'general';
}

function backfill(q = {}) {
  const subject = String(q.subject || q.sub || 'BIOLOGY').toUpperCase();
  const chapter = String(q.chapter || q.ch || 'General');
  const unitType = String(q.unitType || q.unit || 'NCERT');
  const concept = String(q.concept || unitType.split('—')[0] || chapter).trim();
  const subconcept = String(q.subconcept || unitType.split('—')[1] || concept).trim();
  const difficulty = normalizeDifficulty(q.difficulty || q.diff);
  return {
    id: q.id,
    subject,
    chapter,
    concept,
    subconcept,
    difficulty,
    formula: String(q.formula || q.trick || ''),
    unitType,
    questionType: q.questionType || (q.pyq ? 'pyq' : (q.isParameterized ? 'parameterized' : 'mcq')),
    commonMistake: q.commonMistake || 'concept_error',
    variantGroup: q.variantGroup || `${slugify(subject)}_${slugify(chapter)}_${slugify(concept)}`,
    estimatedTime: Number.isFinite(q.estimatedTime) ? q.estimatedTime : ({ easy: 60, medium: 90, hard: 120 }[difficulty]),
    neetWeightage: Number.isFinite(q.neetWeightage) ? q.neetWeightage : (q.pyq ? 3 : 2),
  };
}

const pools = {
  QUESTION_BANK: QUESTION_BANK || [],
  PARAM_QUESTIONS: PARAM_QUESTIONS || [],
  UNIT_QUESTIONS: UNIT_QUESTIONS || [],
};

const output = Object.entries(pools).reduce((acc, [name, list]) => {
  const rows = list.map(backfill);
  acc[name] = {
    total: rows.length,
    missingFormula: rows.filter(r => !r.formula).length,
    byDifficulty: rows.reduce((m, r) => ({ ...m, [r.difficulty]: (m[r.difficulty] || 0) + 1 }), {}),
    sample: rows.slice(0, 3),
  };
  return acc;
}, {});

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  notes: 'Use this output to backfill metadata into Firestore/content packs while preserving legacy question shape.',
  output,
}, null, 2));
