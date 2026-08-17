// tests/fixtures/questions.fixture.js
// Question objects matching the EXACT shape produced by api/packs.js's
// csvRowToQuestion (confirmed against real source), including Phase 1 metadata
// fields (concept, subconcept, formula, unitType, variantGroup, estimatedTime).

const QUESTIONS_FIXTURE = [
  {
    id: 'pack1_0', sub: 'PHYSICS', ch: 'Electrostatics', tid: 'p12',
    text: 'Electric field inside a charged conductor is:',
    opts: ['Maximum', 'Zero', 'Equal to surface field', 'Infinite'],
    correct: 1, explanation: 'Charges reside on surface; E_inside=0',
    ncertCl: 12, ncertCh: '1', ncertPg: '-', unit: 'Electrostatics',
    diff: 'easy', pyq: false, pyqYr: undefined, trick: '',
    concept: 'Electrostatics', subconcept: '', formula: '', unitType: 'standard',
    variantGroup: 'pack1_0', estimatedTime: 45,
  },
  {
    id: 'pack1_1', sub: 'PHYSICS', ch: 'Electrostatics', tid: 'p12',
    text: 'Capacitance of parallel plate capacitor with dielectric K becomes:',
    opts: ['C/K', 'KC', 'K2C', 'C'],
    correct: 1, explanation: 'C=Kε0A/d',
    ncertCl: 12, ncertCh: '2', ncertPg: '-', unit: 'Electrostatics',
    diff: 'medium', pyq: true, pyqYr: 2020, trick: '',
    concept: 'Electrostatics', subconcept: '', formula: 'C=Kε0A/d', unitType: 'unit_variant',
    variantGroup: 'pack1_1', estimatedTime: 60,
  },
  {
    id: 'pack1_2', sub: 'BIOLOGY', ch: 'Genetics and Evolution', tid: 'b7',
    text: 'Mendel dihybrid F2 ratio:',
    opts: ['3:1', '1:2:1', '9:3:3:1', '1:1'],
    correct: 2, explanation: 'Independent assortment',
    ncertCl: 12, ncertCh: '4', ncertPg: '-', unit: 'Genetics',
    diff: 'starter', pyq: true, pyqYr: 2018, trick: '',
    concept: 'Genetics and Evolution', subconcept: '', formula: '', unitType: 'standard',
    variantGroup: 'pack1_2', estimatedTime: 45,
  },
  {
    id: 'pack1_3', sub: 'CHEMISTRY', ch: 'Organic Basics', tid: 'c8',
    text: 'Homolytic fission produces:',
    opts: ['Carbocation', 'Carbanion', 'Free radicals', 'Ion pair'],
    correct: 2, explanation: 'Each atom keeps one electron',
    ncertCl: 11, ncertCh: '8', ncertPg: '-', unit: 'Organic Chemistry',
    diff: 'easy', pyq: false, pyqYr: undefined, trick: '',
    concept: 'Organic Basics', subconcept: '', formula: '', unitType: 'standard',
    variantGroup: 'pack1_3', estimatedTime: 45,
  },
  {
    id: 'pack1_4', sub: 'PHYSICS', ch: 'Laws of Motion', tid: 'p3',
    text: 'A 2 kg block on frictionless surface pulled by 10 N. Acceleration is:',
    opts: ['5 m/s2', '10 m/s2', '20 m/s2', '2 m/s2'],
    correct: 0, explanation: 'a=F/m=10/2',
    ncertCl: 11, ncertCh: '4', ncertPg: '-', unit: 'Laws of Motion',
    diff: 'starter', pyq: false, pyqYr: undefined, trick: 'F=ma',
    concept: 'Laws of Motion', subconcept: '', formula: 'F=ma', unitType: 'standard',
    variantGroup: 'pack1_4', estimatedTime: 45,
  },
];

// A question with legacy metadata missing entirely (simulates a pack stored
// BEFORE Phase 1 metadata was added) - used to test backfillMetadata / graceful
// fallback behavior specifically.
const LEGACY_QUESTION_NO_METADATA = {
  id: 'legacy_0', sub: 'PHYSICS', ch: 'Waves', tid: 'p11',
  text: 'Sound travels fastest in:', opts: ['Vacuum', 'Air', 'Water', 'Steel'],
  correct: 3, explanation: 'Elastic modulus highest in solids',
  ncertCl: 11, ncertCh: '14', ncertPg: '-', unit: 'Waves', diff: 'starter',
  pyq: false, pyqYr: undefined, trick: '',
  // concept/subconcept/formula/unitType/variantGroup/estimatedTime deliberately absent
};

module.exports = { QUESTIONS_FIXTURE, LEGACY_QUESTION_NO_METADATA };
