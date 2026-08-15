const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeQuestion,
  classifyAttempt,
  buildRecoveryPath,
  buildLearningSnapshot,
} = require('./_learning');

test('normalizeQuestion preserves legacy fields and adds intelligence metadata', () => {
  const question = normalizeQuestion({
    id: 'q1',
    sub: 'physics',
    ch: 'Electrostatics',
    text: 'Find the force in N',
    opts: ['1 N', '2 N', '3 N', '4 N'],
    correct: 1,
    diff: 'hard',
    formula: 'F = qE',
  });

  assert.equal(question.subject, 'PHYSICS');
  assert.equal(question.chapter, 'Electrostatics');
  assert.equal(question.difficulty, 'hard');
  assert.equal(question.intelligence.formula, 'F = qE');
  assert.equal(question.metadataVersion, 'v2');
});

test('classifyAttempt identifies unit conversion pressure before generic concept errors', () => {
  const diagnosis = classifyAttempt({
    correct: false,
    timeTaken: 32,
    question: {
      id: 'u1',
      sub: 'CHEMISTRY',
      ch: 'Solutions',
      text: 'Convert 1 mol/L into mmol/mL',
      opts: ['1', '10', '100', '1000'],
      correct: 0,
      diff: 'medium',
    },
  });

  assert.equal(diagnosis.code, 'unit_conversion_error');
});

test('buildRecoveryPath returns four stages and prefers concept-equivalent siblings', () => {
  const question = normalizeQuestion({
    id: 'q2',
    sub: 'BIOLOGY',
    ch: 'Genetics',
    concept: 'DNA Replication',
    text: 'Which enzyme unwinds DNA?',
    opts: ['Helicase', 'Ligase', 'Polymerase', 'Primase'],
    correct: 0,
    diff: 'hard',
  });

  const sibling = normalizeQuestion({
    id: 'q3',
    sub: 'BIOLOGY',
    ch: 'Genetics',
    concept: 'DNA Replication',
    text: 'Identify the enzyme that separates DNA strands.',
    opts: ['Helicase', 'Ligase', 'Polymerase', 'Topoisomerase'],
    correct: 0,
    diff: 'easy',
  });

  const path = buildRecoveryPath(question, { code: 'concept_error', label: 'Concept Error' }, [sibling]);
  assert.equal(path.length, 4);
  assert.equal(path[0].stage, 'diagnostic');
  assert.equal(path[0].question.id, 'q3');
});

test('buildLearningSnapshot creates dashboard-ready mastery, galti, mission, and prediction data', () => {
  const snapshot = buildLearningSnapshot({
    user: {},
    scores: {
      global: { attempted: 10, accuracy: 70 },
    },
    results: [
      {
        questionId: 'q4',
        correct: false,
        timeTaken: 80,
        question: {
          id: 'q4',
          sub: 'PHYSICS',
          ch: 'Kinematics',
          concept: 'Velocity',
          text: 'Convert 10 m/s to km/h',
          opts: ['18', '24', '36', '72'],
          correct: 2,
          diff: 'medium',
        },
      },
      {
        questionId: 'q5',
        correct: true,
        timeTaken: 30,
        question: {
          id: 'q5',
          sub: 'BIOLOGY',
          ch: 'Cell Biology',
          concept: 'Organelles',
          text: 'Powerhouse of the cell?',
          opts: ['Golgi', 'Ribosome', 'Mitochondria', 'Lysosome'],
          correct: 2,
          diff: 'easy',
        },
      },
    ],
  });

  assert.ok(snapshot.learningProfile.physics);
  assert.ok(snapshot.chapterMastery['physics-kinematics']);
  assert.equal(snapshot.galti.length, 1);
  assert.ok(snapshot.dailyMission.length >= 1);
  assert.ok(snapshot.scorePrediction.currentNeetScore > 0);
});
