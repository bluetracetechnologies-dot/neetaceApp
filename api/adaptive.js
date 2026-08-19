// api/adaptive.js
// Real-time adaptive difficulty engine.
// ELO/IRT-lite model — updates student ability estimate (theta) after every answer.
// Picks the next question closest to the student's current ability per topic (tid).
//
// Core formula (IRT-lite):
//   expected  = 1 / (1 + 10^((qDifficulty - studentTheta) / 400))
//   studentTheta += K * (actual - expected)
//   where K shrinks as attempt count grows (more attempts = more confident estimate)
//
// Desirable difficulty zone: expected ≈ 0.65-0.75 (challenging but not demoralising)
// Question selection targets this zone per tid, weighted toward weakest tids first.

const { db } = require('./_firebase');
const { verifySession } = require('../lib/session');
const { recordUsage } = require('../lib/usage');

// ── Constants ────────────────────────────────────────────
const TARGET_EXPECTED   = 0.70;  // aim for 70% probability of correct answer
const K_BASE            = 32;    // base ELO K-factor
const K_MIN             = 8;     // K floor after many attempts (high confidence)
const MAX_THETA_JUMP    = 60;    // cap per-question theta change (smoothing)
const COOLDOWN_STEPS    = 2;     // don't escalate difficulty 2 steps in a row
const MIN_DIFFICULTY    = 100;   // floor — even top students see some base difficulty
const MAX_DIFFICULTY    = 900;   // ceiling
const STREAK_BOOST      = 1.15;  // extra K multiplier on a 3+ correct streak (sharp student)

// Difficulty numeric mapping (maps diff labels to ELO-style numbers)
const DIFF_RATING = {
  starter: 150, free: 150,
  easy:    300,
  medium:  500,
  hard:    700,
  exam:    850,
  talent:  900,
};

// ── Helpers ───────────────────────────────────────────────
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function expected(qDifficulty, theta) {
  return 1 / (1 + Math.pow(10, (qDifficulty - theta) / 400));
}

function kFactor(attempts, streak) {
  const k = Math.max(K_MIN, K_BASE - attempts * 0.8);
  return streak >= 3 ? k * STREAK_BOOST : k;
}

function updateTheta(current, qDifficulty, correct, attempts, streak) {
  const exp   = expected(qDifficulty, current);
  const actual = correct ? 1 : 0;
  const k     = kFactor(attempts, streak);
  const delta = k * (actual - exp);
  return clamp(current + clamp(delta, -MAX_THETA_JUMP, MAX_THETA_JUMP), MIN_DIFFICULTY, MAX_DIFFICULTY);
}

// Find the question difficulty closest to target probability for a given theta
function targetDifficulty(theta) {
  // Invert: given theta and TARGET_EXPECTED, find qDifficulty
  // TARGET = 1/(1+10^((q-θ)/400)) → q = θ - 400*log10(1/T - 1)
  const q = theta - 400 * Math.log10(1 / TARGET_EXPECTED - 1);
  return clamp(Math.round(q), MIN_DIFFICULTY, MAX_DIFFICULTY);
}

// Rate how well a question matches a student's target difficulty (lower = better match)
function difficultyScore(question, targetDiff) {
  const qDiff = DIFF_RATING[question.diff] || 500;
  return Math.abs(qDiff - targetDiff);
}

// Pick the best next question from candidates for a given tid
function selectBest(candidates, targetDiff, seenIds) {
  const unseen = candidates.filter(q => !seenIds.has(q.id));
  const pool   = unseen.length ? unseen : candidates; // fallback if all seen
  return pool.sort((a, b) => difficultyScore(a, targetDiff) - difficultyScore(b, targetDiff))[0];
}

// ── API Handler ────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, uid, sessionToken } = req.body || {};
  if (!uid || !sessionToken) return res.status(400).json({ error: 'uid and sessionToken required' });

  const auth = await verifySession(db, uid, sessionToken);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const user = auth.profile;

  // ── 1. RECORD ANSWER ─────────────────────────────────────
  // Called after every single answer — updates theta for the question's tid
  if (action === 'record_answer') {
    const { tid, qDifficulty, correct, timeTakenMs, expectedTimeMs } = req.body;
    if (!tid) return res.status(400).json({ error: 'tid required' });

    const mastery = user.mastery || {};
    const prev    = mastery[tid] || { theta: 500, attempts: 0, correctStreak: 0, avgTimeMs: 30000 };

    const diff    = qDifficulty || DIFF_RATING.medium;
    const newTheta = updateTheta(prev.theta, diff, correct, prev.attempts, prev.correctStreak);

    const streak = correct ? (prev.correctStreak || 0) + 1 : 0;

    // Rolling average time (exponential moving avg, α=0.3)
    const alpha  = 0.3;
    const newAvgTime = timeTakenMs
      ? Math.round(alpha * timeTakenMs + (1 - alpha) * (prev.avgTimeMs || 30000))
      : prev.avgTimeMs;

    // Speed signal
    let speedSignal = 'normal';
    if (timeTakenMs && expectedTimeMs) {
      const ratio = timeTakenMs / expectedTimeMs;
      if (correct && ratio < 0.4)      speedSignal = 'sharp';    // fast+correct → advance faster
      else if (correct && ratio > 1.6) speedSignal = 'fluent';   // slow+correct → reinforce
      else if (!correct)               speedSignal = 'scaffold';  // wrong → easier variant
    }

    const updatedMastery = {
      ...prev,
      theta:         Math.round(newTheta),
      attempts:      prev.attempts + 1,
      correct:       (prev.correct || 0) + (correct ? 1 : 0),
      correctStreak: streak,
      avgTimeMs:     newAvgTime,
      speedSignal,
      lastSeenAt:    new Date().toISOString(),
    };

    await db.collection('users').doc(uid).update({ [`mastery.${tid}`]: updatedMastery });
    try {
      await recordUsage(db, uid, user, {
        // The client dwell tracker owns time-on-screen; this authenticated
        // adaptive event only contributes the authoritative question count.
        section: 'practice', elapsedSec: 0, questions: 1,
        subject: req.body.subject, chapter: req.body.chapter,
      });
    } catch (usageError) {
      console.error('adaptive usage aggregation error', usageError.message);
    }

    // Decision hint for the client — what to do next
    let nextAction = 'continue';
    if (speedSignal === 'scaffold') nextAction = 'scaffold'; // send easier variant of same tid
    if (speedSignal === 'sharp')    nextAction = 'advance';  // push difficulty up faster
    if (speedSignal === 'fluent')   nextAction = 'reinforce'; // one more at same difficulty
    if (streak >= 5)                nextAction = 'level_up'; // celebrate + advance

    return res.status(200).json({
      ok: true,
      mastery: updatedMastery,
      theta: Math.round(newTheta),
      speedSignal,
      nextAction,
      streakMilestone: streak >= 3 && streak % 3 === 0 ? streak : null,
    });
  }

  // ── 2. GET NEXT QUESTION ──────────────────────────────────
  // Returns the best next question from available questions for this student
  if (action === 'next_question') {
    const { subject, availableQuestions, seenIds = [], currentTid } = req.body;
    if (!availableQuestions?.length) return res.status(400).json({ error: 'availableQuestions required' });

    const mastery = user.mastery || {};
    const seen    = new Set(seenIds);

    // Group available questions by tid
    const byTid = {};
    availableQuestions.forEach(q => {
      if (!byTid[q.tid]) byTid[q.tid] = [];
      byTid[q.tid].push(q);
    });

    // Score each tid by weakness (lowest theta = most priority) + staleness (not seen recently)
    const tidScores = Object.keys(byTid).map(tid => {
      const m  = mastery[tid] || { theta: 500, attempts: 0 };
      const staleness = m.lastSeenAt
        ? (Date.now() - new Date(m.lastSeenAt).getTime()) / (1000 * 60 * 60) // hours since last seen
        : 100;
      // Priority: weak tids + stale tids first. Clamp staleness contribution.
      const priority = (800 - m.theta) + Math.min(staleness * 5, 200);
      return { tid, theta: m.theta, priority, attempts: m.attempts };
    }).sort((a, b) => b.priority - a.priority); // highest priority first

    // Pick the top-priority tid (but if we're mid-tid from currentTid, stay on it)
    let chosenTid  = tidScores[0]?.tid;
    if (currentTid && byTid[currentTid]) {
      const currentM = mastery[currentTid] || {};
      // Stay on current tid if we're in scaffold/reinforce mode
      if (currentM.speedSignal === 'scaffold' || currentM.speedSignal === 'fluent') {
        chosenTid = currentTid;
      }
    }

    const candidates = byTid[chosenTid] || availableQuestions;
    const tidTheta   = (mastery[chosenTid] || {}).theta || 500;
    const target     = targetDifficulty(tidTheta);
    const question   = selectBest(candidates, target, seen);

    if (!question) return res.status(404).json({ error: 'No suitable question found' });

    const masteryForTid = mastery[chosenTid] || { theta: 500, attempts: 0 };
    return res.status(200).json({
      question,
      chosenTid,
      studentTheta:    Math.round(masteryForTid.theta),
      targetDifficulty: target,
      expectedProb:    Math.round(expected(DIFF_RATING[question.diff] || 500, masteryForTid.theta) * 100),
      tidPriorities:   tidScores.slice(0, 5), // top 5 tids for client debugging if needed
    });
  }

  // ── 3. GET MASTERY SUMMARY ────────────────────────────────
  // Returns mastery data per topic — drives analytics + progress screen
  if (action === 'get_mastery') {
    const mastery = user.mastery || {};
    const summary = Object.entries(mastery).map(([tid, m]) => ({
      tid,
      theta:         Math.round(m.theta),
      attempts:      m.attempts || 0,
      accuracy:      m.attempts ? Math.round((m.correct || 0) / m.attempts * 100) : 0,
      correctStreak: m.correctStreak || 0,
      avgTimeSec:    Math.round((m.avgTimeMs || 30000) / 1000),
      lastSeenAt:    m.lastSeenAt,
      level:         thetaToLevel(m.theta),
    })).sort((a, b) => a.theta - b.theta); // weakest first

    const subjectAverages = {};
    summary.forEach(s => {
      // tid prefix maps loosely to subject (p=physics, c=chemistry, b=biology)
      const sub = s.tid.startsWith('p') ? 'PHYSICS' : s.tid.startsWith('c') ? 'CHEMISTRY' : 'BIOLOGY';
      if (!subjectAverages[sub]) subjectAverages[sub] = [];
      subjectAverages[sub].push(s.theta);
    });

    const subjectTheta = {};
    Object.entries(subjectAverages).forEach(([sub, thetas]) => {
      subjectTheta[sub] = Math.round(thetas.reduce((a, b) => a + b, 0) / thetas.length);
    });

    return res.status(200).json({ mastery: summary, subjectTheta, totalTopics: summary.length });
  }

  // ── 4. RESET MASTERY (admin or student request) ───────────
  if (action === 'reset_mastery') {
    const { targetUid, adminReset } = req.body;
    const targetId = adminReset && user.role === 'admin' ? targetUid : uid;
    await db.collection('users').doc(targetId).update({ mastery: {} });
    return res.status(200).json({ ok: true, message: 'Mastery reset — fresh start' });
  }

  return res.status(400).json({ error: 'Unknown action' });
};

// Map numeric theta back to a readable level label
function thetaToLevel(theta) {
  if (theta < 250) return 'Free Practice';
  if (theta < 400) return 'Simple';
  if (theta < 580) return 'Hard';
  if (theta < 720) return 'Very Hard';
  return 'Talent Required';
}
