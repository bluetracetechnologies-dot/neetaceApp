const REVISION_INTERVALS = [1, 3, 7, 15, 30];
const DIFFICULTY_ORDER = ['starter', 'easy', 'medium', 'hard', 'exam'];
const ERROR_LABELS = {
  concept_error: 'Concept Error',
  formula_recall_error: 'Formula Recall Error',
  unit_conversion_error: 'Unit Conversion Error',
  calculation_error: 'Calculation Error',
  careless_error: 'Careless Error',
  time_pressure_error: 'Time Pressure Error',
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'general';
}

function normalizeDifficulty(diff) {
  const value = String(diff || 'medium').toLowerCase();
  if (DIFFICULTY_ORDER.includes(value)) return value;
  if (value === 'simple') return 'easy';
  if (value === 'very hard') return 'hard';
  if (value === 'talent required') return 'exam';
  return 'medium';
}

function inferQuestionType(question) {
  const text = String(question.text || '').toLowerCase();
  const opts = Array.isArray(question.opts) ? question.opts.join(' ').toLowerCase() : '';
  if (/\d/.test(text + opts)) return 'numerical_mcq';
  if (/assertion|reason|statement/i.test(text)) return 'assertion_reason';
  if (/match|column/i.test(text)) return 'match_the_following';
  return 'mcq';
}

function inferUnitType(question, subject) {
  const blob = `${question.text || ''} ${(question.opts || []).join(' ')}`.toLowerCase();
  if (/(m\/s|km\/h|cm\/s|mol|molar|litre|liter|ml|kg|gram|°c|kelvin|atm|pascal|newton|joule|volt|amp)/.test(blob)) {
    return 'converted_units';
  }
  if (subject === 'BIOLOGY') return 'ncert_recall';
  if (/\d/.test(blob)) return 'calculation';
  return 'conceptual';
}

function defaultEstimatedTime(difficulty) {
  return ({
    starter: 35,
    easy: 45,
    medium: 60,
    hard: 85,
    exam: 100,
  })[difficulty] || 60;
}

function normalizeQuestion(raw = {}, fallback = {}) {
  const merged = { ...fallback, ...raw };
  const subject = String(merged.subject || merged.sub || 'BIOLOGY').toUpperCase();
  const chapter = merged.chapter || merged.ch || 'General';
  const difficulty = normalizeDifficulty(merged.difficulty || merged.diff || 'medium');
  const concept = merged.concept || merged.unit || chapter;
  const intelligence = {
    ...(merged.intelligence || {}),
    subject,
    chapter,
    concept,
    subconcept: merged.subconcept || merged.intelligence?.subconcept || concept,
    difficulty,
    formula: merged.formula || merged.intelligence?.formula || '',
    unitType: merged.unitType || merged.intelligence?.unitType || inferUnitType(merged, subject),
    questionType: merged.questionType || merged.intelligence?.questionType || inferQuestionType(merged),
    commonMistake: merged.commonMistake || merged.trick || merged.intelligence?.commonMistake || '',
    variantGroup: merged.variantGroup || merged.intelligence?.variantGroup || slugify(`${subject}-${chapter}-${concept}`),
    estimatedTimeSec: clamp(
      asNumber(merged.estimatedTimeSec ?? merged.intelligence?.estimatedTimeSec, defaultEstimatedTime(difficulty)),
      20,
      180
    ),
    neetWeightage: clamp(asNumber(merged.neetWeightage ?? merged.intelligence?.neetWeightage, merged.pyq ? 1.3 : 1), 0.5, 3),
    metadataVersion: 'v2',
  };

  return {
    ...merged,
    sub: subject,
    subject,
    ch: chapter,
    chapter,
    diff: difficulty,
    difficulty,
    concept,
    unit: merged.unit || concept,
    formula: intelligence.formula,
    unitType: intelligence.unitType,
    questionType: intelligence.questionType,
    commonMistake: intelligence.commonMistake,
    variantGroup: intelligence.variantGroup,
    estimatedTimeSec: intelligence.estimatedTimeSec,
    neetWeightage: intelligence.neetWeightage,
    metadataVersion: 'v2',
    intelligence,
  };
}

function normalizeQuestionList(list = []) {
  return list.map((question) => normalizeQuestion(question));
}

function buildRevisionSchedule(fromDate = new Date()) {
  const start = new Date(fromDate);
  return REVISION_INTERVALS.map((days) => {
    const when = new Date(start);
    when.setDate(when.getDate() + days);
    return { dayOffset: days, dueAt: when.toISOString(), completedAt: null };
  });
}

function rotateOptions(options = [], correctIndex = 0, shift = 1) {
  const opts = options.filter((opt) => opt !== undefined);
  if (!opts.length) return { opts: options, correctIndex };
  const amount = shift % opts.length;
  const rotated = opts.map((_, idx) => opts[(idx + amount) % opts.length]);
  const newCorrect = (correctIndex - amount + opts.length) % opts.length;
  return { opts: rotated, correctIndex: newCorrect };
}

function variantPrefix(stage) {
  return ({
    diagnostic: 'Diagnostic check',
    confirmation: 'Confirmation check',
    recovery: 'Recovery drill',
    reinforcement: 'Reinforcement round',
  })[stage] || 'Practice variant';
}

function stageDifficulty(baseDifficulty, stage) {
  const baseIdx = DIFFICULTY_ORDER.indexOf(normalizeDifficulty(baseDifficulty));
  const targets = {
    diagnostic: Math.max(1, baseIdx - 1),
    confirmation: Math.max(1, baseIdx),
    recovery: Math.max(1, Math.min(baseIdx + 1, DIFFICULTY_ORDER.length - 1)),
    reinforcement: Math.min(baseIdx + (baseIdx >= 3 ? 0 : 1), DIFFICULTY_ORDER.length - 1),
  };
  return DIFFICULTY_ORDER[targets[stage] ?? baseIdx] || 'medium';
}

function buildVariantQuestion(question, stage, targetDifficulty) {
  const normalized = normalizeQuestion(question);
  const rotated = rotateOptions(normalized.opts || [], normalized.correct || 0, stage === 'diagnostic' ? 1 : stage === 'confirmation' ? 2 : 3);
  const prefix = variantPrefix(stage);
  return {
    ...normalized,
    id: `${normalized.id || slugify(normalized.text)}_${stage}`,
    text: `${prefix}: ${normalized.text}`,
    opts: rotated.opts,
    correct: rotated.correctIndex,
    diff: targetDifficulty,
    difficulty: targetDifficulty,
    variantOf: normalized.id,
    variantStage: stage,
    isGeneratedVariant: true,
  };
}

function sameConcept(left, right) {
  return left.intelligence?.variantGroup === right.intelligence?.variantGroup
    || (left.subject === right.subject && left.chapter === right.chapter && left.concept === right.concept);
}

function pickRecoveryQuestion(question, questionBank, stage, targetDifficulty) {
  const base = normalizeQuestion(question);
  const candidates = normalizeQuestionList(questionBank || [])
    .filter((candidate) => candidate.id !== base.id)
    .filter((candidate) => sameConcept(base, candidate))
    .sort((a, b) => {
      const aMatch = a.difficulty === targetDifficulty ? 0 : 1;
      const bMatch = b.difficulty === targetDifficulty ? 0 : 1;
      return aMatch - bMatch;
    });

  const best = candidates.find((candidate) => candidate.difficulty === targetDifficulty) || candidates[0];
  return best ? { ...best, variantStage: stage, fromBank: true } : buildVariantQuestion(base, stage, targetDifficulty);
}

function classifyAttempt(result = {}) {
  const question = normalizeQuestion(result.question || {}, {
    id: result.questionId,
    difficulty: result.difficulty,
    diff: result.difficulty,
    questionType: result.type,
  });
  if (result.correct === true) {
    return { code: 'correct', label: 'Correct', reason: 'Answered correctly.' };
  }

  const timeTakenSec = asNumber(result.timeTaken ?? result.timeTakenSec, 0);
  const estimated = question.intelligence.estimatedTimeSec;
  const confidence = String(result.confidence || '').toLowerCase();
  const questionText = String(question.text || '').toLowerCase();
  const combined = `${questionText} ${(question.opts || []).join(' ')}`.toLowerCase();

  let code = 'concept_error';
  let reason = 'The response suggests a concept gap, so the learner should return to the underlying idea before retrying.';

  if (timeTakenSec && timeTakenSec > estimated * 1.35) {
    code = 'time_pressure_error';
    reason = 'The student used more than the expected time window, indicating time pressure rather than pure lack of knowledge.';
  } else if (confidence === 'easy' || (timeTakenSec && timeTakenSec < estimated * 0.45)) {
    code = 'careless_error';
    reason = 'The answer came too quickly or with high confidence, which often indicates a careless slip rather than a deep concept issue.';
  } else if (question.unitType === 'converted_units' || /convert|unit|si unit|km\/h|m\/s|cm\/s|kelvin|celsius/.test(combined)) {
    code = 'unit_conversion_error';
    reason = 'This question includes unit handling, so the most likely error pattern is unit conversion or unit interpretation.';
  } else if (question.formula || /formula|law|equation|constant/.test(combined)) {
    code = 'formula_recall_error';
    reason = 'The question depends on formula retrieval, so the student likely needs a formula recall checkpoint before a harder retry.';
  } else if (question.questionType === 'numerical_mcq' || /calculate|find the value|how much|numerical/.test(questionText)) {
    code = 'calculation_error';
    reason = 'The learner appears to understand the setup but likely made an arithmetic or procedural calculation mistake.';
  }

  return { code, label: ERROR_LABELS[code], reason };
}

function buildRecoveryPath(question, diagnosis, questionBank = []) {
  const base = normalizeQuestion(question);
  const stages = ['diagnostic', 'confirmation', 'recovery', 'reinforcement'];
  return stages.map((stage) => {
    const targetDifficulty = stageDifficulty(base.difficulty, stage);
    return {
      stage,
      title: variantPrefix(stage),
      targetDifficulty,
      strategy: stage === 'diagnostic'
        ? `Step down to ${targetDifficulty} while keeping ${base.concept} intact.`
        : stage === 'reinforcement'
          ? `Return to ${targetDifficulty} after the ${diagnosis.label.toLowerCase()} is addressed.`
          : `Use an equivalent ${base.concept} checkpoint to confirm the fix.`,
      question: pickRecoveryQuestion(base, questionBank, stage, targetDifficulty),
    };
  });
}

function emptyLearningProfile(existing = {}) {
  return {
    physics: {
      conceptUnderstanding: 50,
      formulaRecall: 50,
      unitConversion: 50,
      calculation: 50,
      speed: 50,
      retention: 50,
      ...(existing.physics || {}),
    },
    chemistry: {
      conceptUnderstanding: 50,
      formulaRecall: 50,
      unitConversion: 50,
      calculation: 50,
      speed: 50,
      retention: 50,
      ...(existing.chemistry || {}),
    },
    biology: {
      conceptUnderstanding: 50,
      recall: 50,
      retention: 50,
      ncertAccuracy: 50,
      speed: 50,
      ...(existing.biology || {}),
    },
  };
}

function applyProfileDelta(profile, subjectKey, metric, delta) {
  if (!profile[subjectKey] || profile[subjectKey][metric] === undefined) return;
  profile[subjectKey][metric] = clamp(Math.round((profile[subjectKey][metric] + delta) * 10) / 10, 0, 100);
}

function updateProfile(profile, result, diagnosis) {
  const question = normalizeQuestion(result.question || {}, { questionId: result.questionId });
  const subjectKey = question.subject.toLowerCase();
  const timeTakenSec = asNumber(result.timeTaken ?? result.timeTakenSec, 0);
  const speedDelta = result.correct ? (timeTakenSec && timeTakenSec <= question.intelligence.estimatedTimeSec ? 3 : 1) : -2;

  applyProfileDelta(profile, subjectKey, 'speed', speedDelta);

  if (subjectKey === 'biology') {
    applyProfileDelta(profile, subjectKey, 'conceptUnderstanding', result.correct ? 2 : diagnosis.code === 'concept_error' ? -4 : -1);
    applyProfileDelta(profile, subjectKey, 'recall', result.correct ? 2 : diagnosis.code === 'formula_recall_error' ? -4 : -2);
    applyProfileDelta(profile, subjectKey, 'retention', result.correct ? 1.5 : -1);
    applyProfileDelta(profile, subjectKey, 'ncertAccuracy', result.correct ? 1.5 : -1.5);
    return;
  }

  applyProfileDelta(profile, subjectKey, 'conceptUnderstanding', result.correct ? 2 : diagnosis.code === 'concept_error' ? -4 : -1);
  applyProfileDelta(profile, subjectKey, 'formulaRecall', result.correct && question.formula ? 2.5 : diagnosis.code === 'formula_recall_error' ? -4 : 0.5);
  applyProfileDelta(profile, subjectKey, 'unitConversion', diagnosis.code === 'unit_conversion_error' ? -4 : result.correct && question.unitType === 'converted_units' ? 2 : 0);
  applyProfileDelta(profile, subjectKey, 'calculation', diagnosis.code === 'calculation_error' ? -4 : result.correct && question.questionType === 'numerical_mcq' ? 2 : 0.5);
  applyProfileDelta(profile, subjectKey, 'retention', result.correct ? 1.5 : -1);
}

function chapterKey(question) {
  return slugify(`${question.subject}-${question.chapter}`);
}

function mergeChapterMastery(existing = {}, results = []) {
  const mastery = { ...(existing || {}) };
  results.forEach((result) => {
    const question = normalizeQuestion(result.question || {}, { questionId: result.questionId });
    const key = chapterKey(question);
    const current = mastery[key] || {
      subject: question.subject,
      chapter: question.chapter,
      concept: question.concept,
      attempted: 0,
      correct: 0,
      wrong: 0,
      mastery: 50,
      lastUpdated: null,
    };
    current.attempted += 1;
    if (result.correct === true) current.correct += 1;
    if (result.correct === false) current.wrong += 1;
    const accuracy = current.attempted ? (current.correct / current.attempted) * 100 : 0;
    current.mastery = clamp(Math.round((accuracy - current.wrong * 2) * 10) / 10, 0, 100);
    current.lastUpdated = new Date().toISOString();
    mastery[key] = current;
  });
  return mastery;
}

function buildGaltiEntries(existing = [], results = []) {
  const galti = Array.isArray(existing) ? [...existing] : [];
  results
    .filter((result) => result.correct === false)
    .forEach((result) => {
      const question = normalizeQuestion(result.question || {}, { questionId: result.questionId });
      const diagnosis = classifyAttempt(result);
      const recoveryPath = buildRecoveryPath(question, diagnosis, result.relatedQuestions || []);
      const existingIdx = galti.findIndex((entry) => entry.questionId === question.id);
      const revisionPlan = buildRevisionSchedule(new Date());
      const nextEntry = {
        questionId: question.id,
        subject: question.subject,
        chapter: question.chapter,
        concept: question.concept,
        question,
        diagnosis,
        repeatCount: existingIdx >= 0 ? (galti[existingIdx].repeatCount || 1) + 1 : 1,
        revisionPlan,
        dueToday: false,
        recoveryPath,
        recoveryProgress: { completed: 0, total: recoveryPath.length },
        lastWrongAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) galti.splice(existingIdx, 1, nextEntry);
      else galti.unshift(nextEntry);
    });
  return galti.slice(0, 120);
}

function buildRevisionPlan(galti = [], now = new Date()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  endOfToday.setMilliseconds(-1);
  return galti.map((entry) => {
    const dueSteps = (entry.revisionPlan || []).map((step) => ({
      ...step,
      isDue: !step.completedAt && new Date(step.dueAt) <= now,
    }));
    return {
      ...entry,
      revisionPlan: dueSteps,
      dueToday: dueSteps.some((step) => !step.completedAt && new Date(step.dueAt) >= startOfToday && new Date(step.dueAt) <= endOfToday),
    };
  });
}

function buildGaltiSummary(galti = []) {
  const repeated = galti.filter((entry) => (entry.repeatCount || 1) > 1);
  const formulaErrors = galti.filter((entry) => entry.diagnosis?.code === 'formula_recall_error').length;
  const unitErrors = galti.filter((entry) => entry.diagnosis?.code === 'unit_conversion_error').length;
  const weakConceptMap = new Map();
  let completed = 0;
  let total = 0;
  let dueToday = 0;

  galti.forEach((entry) => {
    const key = `${entry.subject}::${entry.concept}`;
    weakConceptMap.set(key, {
      subject: entry.subject,
      concept: entry.concept,
      chapter: entry.chapter,
      count: (weakConceptMap.get(key)?.count || 0) + 1,
    });
    completed += entry.recoveryProgress?.completed || 0;
    total += entry.recoveryProgress?.total || 0;
    if (entry.dueToday) dueToday += 1;
  });

  return {
    wrongQuestions: galti.length,
    repeatedMistakes: repeated.length,
    weakConcepts: [...weakConceptMap.values()].sort((a, b) => b.count - a.count).slice(0, 6),
    formulaErrors,
    unitConversionErrors: unitErrors,
    recoveryProgress: { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 },
    revisionDueToday: dueToday,
  };
}

function buildDailyMission(chapterMastery = {}, galtiSummary = {}) {
  const chapters = Object.values(chapterMastery).sort((a, b) => a.mastery - b.mastery);
  const weakest = chapters[0];
  const challenge = chapters[chapters.length - 1];
  return [
    weakest && {
      kind: 'weak_topic',
      title: `${weakest.chapter} recovery set`,
      note: `${weakest.subject} · ${weakest.mastery}% mastery`,
    },
    galtiSummary.revisionDueToday ? {
      kind: 'revision',
      title: `GALTI revision due today`,
      note: `${galtiSummary.revisionDueToday} item(s) waiting for spaced repetition`,
    } : null,
    galtiSummary.repeatedMistakes ? {
      kind: 'repeat_traps',
      title: 'Fix repeated mistakes',
      note: `${galtiSummary.repeatedMistakes} repeat-pattern issue(s) detected`,
    } : null,
    challenge && {
      kind: 'challenge',
      title: `${challenge.chapter} challenge push`,
      note: `Use ${challenge.subject} strength to stretch difficulty`,
    },
  ].filter(Boolean);
}

function buildScorePrediction(scores = {}, chapterMastery = {}) {
  const global = scores.global || {};
  const accuracy = asNumber(global.accuracy, 0);
  const attempted = asNumber(global.attempted, 0);
  const predicted = clamp(Math.round((accuracy / 100) * 720), 0, 720);
  const spread = clamp(Math.round(110 - Math.min(attempted, 45) * 1.5), 30, 110);
  const weakTopics = Object.values(chapterMastery)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3)
    .map((entry) => ({
      subject: entry.subject,
      chapter: entry.chapter,
      mastery: entry.mastery,
      upliftPotential: clamp(Math.round((100 - entry.mastery) * 0.7), 5, 60),
    }));

  return {
    currentNeetScore: predicted,
    confidenceRange: [Math.max(0, predicted - spread), Math.min(720, predicted + spread)],
    highestImprovementPotential: weakTopics,
  };
}

function buildLearningSnapshot({ user = {}, results = [], scores = {} }) {
  const profile = emptyLearningProfile(user.learningProfile || {});
  const normalizedResults = results.map((result) => ({
    ...result,
    question: normalizeQuestion(result.question || {}, {
      id: result.questionId,
      difficulty: result.difficulty,
      diff: result.difficulty,
      questionType: result.type,
    }),
  }));

  normalizedResults.forEach((result) => updateProfile(profile, result, classifyAttempt(result)));

  const chapterMastery = mergeChapterMastery(user.chapterMastery || {}, normalizedResults);
  const galti = buildRevisionPlan(buildGaltiEntries(user.galti || [], normalizedResults));
  const galtiSummary = buildGaltiSummary(galti);
  const dailyMission = buildDailyMission(chapterMastery, galtiSummary);
  const scorePrediction = buildScorePrediction(scores, chapterMastery);

  return {
    learningProfile: profile,
    chapterMastery,
    galti,
    galtiSummary,
    dailyMission,
    scorePrediction,
  };
}

module.exports = {
  REVISION_INTERVALS,
  ERROR_LABELS,
  normalizeDifficulty,
  normalizeQuestion,
  normalizeQuestionList,
  buildRevisionSchedule,
  classifyAttempt,
  buildRecoveryPath,
  buildLearningSnapshot,
};
