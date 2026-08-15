const { db } = require('./_firebase');

const DIAGNOSIS_TYPES = {
  concept_error: 'concept_error',
  formula_recall_error: 'formula_recall_error',
  unit_conversion_error: 'unit_conversion_error',
  calculation_error: 'calculation_error',
  careless_error: 'careless_error',
  time_pressure_error: 'time_pressure_error',
};

function normalizeDifficulty(diff) {
  const d = String(diff || '').toLowerCase();
  if (d === 'easy' || d === 'medium' || d === 'hard') return d;
  if (d === 'starter') return 'easy';
  if (d === 'exam') return 'hard';
  return 'medium';
}

function backfillQuestionMetadata(q = {}) {
  const subject = String(q.subject || q.sub || 'BIOLOGY').toUpperCase();
  const chapter = String(q.chapter || q.ch || 'General');
  const unitType = String(q.unitType || q.unit || 'NCERT');
  const concept = String(q.concept || unitType.split('—')[0] || chapter).trim();
  const subconcept = String(q.subconcept || unitType.split('—')[1] || concept).trim();
  const difficulty = normalizeDifficulty(q.difficulty || q.diff);
  return {
    ...q,
    subject,
    chapter,
    concept,
    subconcept,
    difficulty,
    formula: String(q.formula || q.trick || ''),
    unitType,
    questionType: q.questionType || (q.pyq ? 'pyq' : 'mcq'),
    commonMistake: q.commonMistake || 'concept_error',
    variantGroup: q.variantGroup || `${subject}_${chapter}_${concept}`.replace(/[^A-Za-z0-9]+/g, '_'),
    estimatedTime: Number.isFinite(q.estimatedTime) ? q.estimatedTime : ({ easy: 60, medium: 90, hard: 120 }[difficulty]),
    neetWeightage: Number.isFinite(q.neetWeightage) ? q.neetWeightage : (q.pyq ? 3 : 2),
  };
}

function classifyDiagnosis(payload = {}) {
  const q = payload.question || {};
  const selected = String(payload.selectedOption || '').toLowerCase();
  const expected = Number(q.estimatedTime || 90);
  const timeTakenSec = Number(payload.timeTakenSec || expected);
  if (timeTakenSec > expected * 1.5) return DIAGNOSIS_TYPES.time_pressure_error;
  if (timeTakenSec <= Math.max(8, Math.floor(expected * 0.2)) && normalizeDifficulty(q.difficulty || q.diff) === 'easy') return DIAGNOSIS_TYPES.careless_error;
  if ((q.formula && q.formula.length > 6) || /formula|law|equation/i.test(String(q.text || ''))) return DIAGNOSIS_TYPES.formula_recall_error;
  if (/unit|convert|si|m\/s|km\/h|mol\/l|°c|k\b|cm|mm|kg|g\b/i.test(`${q.unitType || ''} ${q.text || ''} ${selected}`)) return DIAGNOSIS_TYPES.unit_conversion_error;
  if (/\d/.test(selected)) return DIAGNOSIS_TYPES.calculation_error;
  return DIAGNOSIS_TYPES.concept_error;
}

function scorePredictor(chapters = []) {
  const safe = Array.isArray(chapters) ? chapters : [];
  const mastery = safe.length ? safe.reduce((s, c) => s + Number(c.accuracy || 0), 0) / safe.length : 55;
  const score = Math.round((mastery / 100) * 720);
  const confidence = Math.max(20, Math.round(90 - Math.abs(60 - mastery)));
  return {
    score,
    low: Math.max(0, score - 48),
    high: Math.min(720, score + 48),
    confidence,
    improvement: safe.slice().sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0)).slice(0, 3).map(c => c.chapter),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, uid, sessionToken } = req.body || {};

  if (action === 'backfill_metadata') {
    const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
    return res.status(200).json({ ok: true, questions: questions.map(backfillQuestionMetadata) });
  }

  if (action === 'diagnose_wrong_answer') {
    const question = backfillQuestionMetadata(req.body.question || {});
    const diagnosisType = classifyDiagnosis({ question, selectedOption: req.body.selectedOption, timeTakenSec: req.body.timeTakenSec });
    return res.status(200).json({ ok: true, diagnosisType });
  }

  if (action === 'daily_mission') {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    return res.status(200).json({ ok: true, items: items.slice(0, 8) });
  }

  if (action === 'score_predictor') {
    const predictor = scorePredictor(req.body.chapters || []);
    return res.status(200).json({ ok: true, predictor });
  }

  if (!uid || !sessionToken) return res.status(400).json({ error: 'uid and sessionToken required' });
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
  if (userSnap.data().sessionToken !== sessionToken) return res.status(401).json({ error: 'Invalid session' });
  return res.status(200).json({ ok: true });
};
