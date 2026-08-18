// api/scoring.js
// Actions: 'record' (default/legacy - no action field needed for backward compat),
//          'get_dashboard', 'get_concept_stats' (alias, kept for compatibility), 'sync_galti'
// Reuses: users/{uid}.mastery (written by adaptive.js), users/{uid}.conceptStats (this file),
//         users/{uid}.galtiMistakes (this file, new field - NOT a new collection).
// No new Firestore collections created.

const { db } = require('./_firebase');

// Difficulty weights
const WEIGHTS = { starter:1, easy:2, medium:4, hard:7, exam:10 };

// Question type bonuses
const TYPE_BONUS = { standard:1.0, parameterized:1.15, unit_variant:1.10 };

// NEET negative marking: wrong = -0.25 x weight
const NEGATIVE_MARK = 0.25;

// Minimum questions to appear on leaderboard
const MIN_FOR_RANK = 20;

// Level decay if student drops difficulty
const LEVEL_DECAY = [1.0, 0.85, 0.65, 0.40]; // [same, -1, -2, -3+]

// Bloat guards (same pattern applied to conceptStats and galtiMistakes)
const MAX_CONCEPT_TIDS = 60;
const MAX_GALTI_ENTRIES = 150;
const MAX_TARGET_HISTORY = 50;
const ALLOWED_ERROR_TYPES = ['concept','formula','unit','calc','careless','time'];

// Recovery priority order (Phase 3 requirement): unit > formula > concept > calc > careless > time
const ERROR_PRIORITY = { unit: 1, formula: 2, concept: 3, calc: 4, careless: 5, time: 6 };

function nextMay31() {
  const now = new Date();
  let d = new Date(now.getFullYear(), 4, 31, 23, 59, 59);
  if (now > d) d = new Date(now.getFullYear() + 1, 4, 31, 23, 59, 59);
  return d;
}

function speedBonus(timeTaken, totalTime, isCorrect) {
  // Speed bonus only if answered correctly - blocks guess-and-move exploit.
  if (!isCorrect) return 1.0;
  if (!timeTaken || !totalTime) return 1.0;
  const ratio = timeTaken / totalTime;
  if (ratio < 0.30) return 1.2;
  if (ratio < 0.60) return 1.1;
  return 1.0;
}

function evictOldest(map, maxSize, dateField) {
  const count = Object.keys(map).length;
  if (count <= maxSize) return map;
  const sorted = Object.entries(map).sort(function(a, b) {
    return new Date(a[1][dateField] || 0) - new Date(b[1][dateField] || 0);
  });
  const toRemove = count - maxSize;
  for (let i = 0; i < toRemove; i++) delete map[sorted[i][0]];
  return map;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { uid, sessionToken } = body;
  const action = body.action || 'record'; // backward compatible: no action = session recording (legacy callers)

  if (!uid || !sessionToken) return res.status(400).json({ error: 'uid and sessionToken required' });

  // Verify session ONCE, reuse the same doc read for every action below (zero duplicate reads).
  const uSnap = await db.collection('users').doc(uid).get();
  if (!uSnap.exists) return res.status(404).json({ error: 'User not found' });
  const user = uSnap.data();
  if (user.sessionToken !== sessionToken) return res.status(401).json({ error: 'Invalid session' });

  try {
    // ══════════════════════════════════════════════════════════════
    // ACTION: get_dashboard / get_concept_stats (alias)
    // Merges conceptStats + mastery (adaptive.js's field, same doc) + galtiMistakes.
    // ONE Firestore read total (uSnap above). No extra queries except sessions count.
    // ══════════════════════════════════════════════════════════════
    if (action === 'get_dashboard' || action === 'get_concept_stats') {
      const cs = user.conceptStats || {};
      const mastery = user.mastery || {};       // reused from adaptive.js, not duplicated
      const galti = user.galtiMistakes || {};   // reused/new field, not a new collection

      // Merge conceptStats (accuracy) with mastery (theta) per tid - same key space.
      const list = Object.keys(cs).map(function(tid) {
        const c = cs[tid];
        const m = mastery[tid] || {};
        return {
          tid: tid,
          attempted: c.attempted, correct: c.correct, accuracy: c.accuracy,
          avgTimeMs: c.avgTimeMs, masteryBand: c.masteryBand, errorTypes: c.errorTypes || {},
          lastSeen: c.lastSeen,
          theta: m.theta !== undefined ? Math.round(m.theta) : null, // null = adaptive hasn't touched this tid yet
          correctStreak: m.correctStreak || 0, // reused as-is for "improving" signal - zero new storage
        };
      });

      const weakTopics = list.filter(function(x) { return x.attempted >= 3 && x.masteryBand === 'weak'; })
        .sort(function(a, b) { return a.accuracy - b.accuracy; }).slice(0, 5);
      const strongTopics = list.filter(function(x) { return x.masteryBand === 'mastered'; })
        .sort(function(a, b) { return b.accuracy - a.accuracy; }).slice(0, 3);

      const errorBreakdown = {};
      list.forEach(function(x) {
        Object.entries(x.errorTypes || {}).forEach(function(e) {
          errorBreakdown[e[0]] = (errorBreakdown[e[0]] || 0) + e[1];
        });
      });

      // ── PHASE 3: RECOVERY QUEUE ──
      // Priority: unit errors > formula errors > concept errors > calc > careless > time.
      // Built from conceptStats.errorTypes (what kinds of mistakes) + galtiMistakes (recency).
      // Server returns a RANKED LIST of {tid, errorType, priority, reason} - NOT actual question
      // objects. The client already has the question bank (QUESTIONS array, loaded from packs)
      // and its own shuffle/selection logic (shuffleQuestion, shuffleArray) - reusing that instead
      // of duplicating question-selection logic here.
      const recoveryCandidates = [];
      list.forEach(function(x) {
        Object.entries(x.errorTypes || {}).forEach(function(e) {
          const errorType = e[0], errCount = e[1];
          if (ERROR_PRIORITY[errorType] === undefined) return;
          recoveryCandidates.push({
            tid: x.tid, errorType: errorType, priority: ERROR_PRIORITY[errorType],
            errorCount: errCount, accuracy: x.accuracy,
            reason: errorType + ' error x' + errCount + ' in this topic (accuracy ' + x.accuracy + '%)',
          });
        });
      });
      // Sort by priority (unit=1 first), then by error count (more errors = more urgent)
      recoveryCandidates.sort(function(a, b) {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.errorCount - a.errorCount;
      });
      const recoveryQueue = recoveryCandidates.slice(0, 10);

      // ── REVISION DUE TODAY ──
      // From galtiMistakes where nextReview <= now and not recovered.
      // Scheduling (Day 1/3/7/15/30) stays client-computed at mistake-add time (existing logic,
      // not duplicated here) - server just reads back what was synced.
      const now = new Date();
      const revisionDue = Object.entries(galti)
        .filter(function(e) {
          const m = e[1];
          return !m.recovered && (!m.nextReview || new Date(m.nextReview) <= now);
        })
        .map(function(e) { return { questionId: e[0], tid: e[1].tid, errorType: e[1].errorType, count: e[1].count }; })
        .slice(0, 30);

      // ── DAILY MISSION (reuses weakTopics/recoveryQueue/revisionDue computed above - zero extra reads) ──
      // Server returns a PLAN (tids + target counts), not question objects - client's existing
      // QUESTIONS.filter/shuffle logic (generateDailyMission, unchanged) realizes it. Same pattern
      // as recoveryQueue - avoids duplicating question-selection logic server-side.
      const TARGET_TOTAL = 20;
      const todayKey = new Date().toISOString().slice(0, 10);
      const missionProgress = (user.dailyMission && user.dailyMission.date === todayKey)
        ? user.dailyMission.blockProgress : {};

      const missionPlan = {
        date: todayKey,
        blocks: [
          { key: 'recovery', type: 'Recovery Questions', title: 'Recovery Queue', emoji: '\uD83E\uDE7A', color: 'var(--purple)',
            targetCount: 6, tids: recoveryQueue.slice(0, 3).map(function(r) { return r.tid; }),
            reason: recoveryQueue.length ? recoveryQueue[0].reason : null },
          { key: 'weak', type: 'Weak Topic Questions', title: 'Fix Weak Concepts', emoji: '\uD83C\uDFAF', color: 'var(--red)',
            targetCount: 6, tids: weakTopics.slice(0, 2).map(function(w) { return w.tid; }) },
          { key: 'revision', type: 'Revision Questions', title: 'Revision (Galti Due)', emoji: '\uD83D\uDD01', color: 'var(--amber)',
            targetCount: 5, questionIds: revisionDue.slice(0, 5).map(function(r) { return r.questionId; }) },
          { key: 'challenge', type: 'Challenge Questions', title: 'Fresh Challenge', emoji: '\uD83C\uDD95', color: 'var(--blue)',
            targetCount: 3, tids: [] }, // client fills from unattempted pool - existing logic
        ].filter(function(b) { return (b.tids && b.tids.length) || (b.questionIds && b.questionIds.length) || b.key === 'challenge'; }),
        targetTotal: TARGET_TOTAL,
      };

      const completedQCount = Object.values(missionProgress).reduce(function(s, b) { return s + (b.questionsCompleted || 0); }, 0);
      const completionPercentage = TARGET_TOTAL > 0 ? Math.min(100, Math.round((completedQCount / TARGET_TOTAL) * 100)) : 0;

      // Trimmed galti shape for recovery-rate math (Learning DNA) - only sub+recovered needed,
      // not the full mistake objects. Same doc, same read, minimal payload addition.
      const galtiSummary = Object.values(galti).map(function(m) {
        return { sub: m.sub || '', recovered: !!m.recovered };
      });

      return res.status(200).json({
        ok: true,
        scores: user.scores || {},
        conceptStats: list,
        galtiSummary: galtiSummary,
        weakTopics: weakTopics,
        strongTopics: strongTopics,
        errorBreakdown: errorBreakdown,
        recoveryQueue: recoveryQueue,
        revisionDue: revisionDue,
        revisionDueCount: revisionDue.length,
        totalConceptsTouched: list.length,
        rankScore: (user.scores && user.scores.global && user.scores.global.rankScore) || 0,
        consistency7d: (user.scores && user.scores.global && user.scores.global.consistency7d) || 0,
        totalAttempted: user.totalQuestionsAttempted || 0,
        lastSessionAt: user.lastSessionAt || null,
        dailyMission: missionPlan,
        missionProgress: missionProgress,
        completionPercentage: completionPercentage,
      });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: mark_mission_progress
    // Persists Daily Mission block completion to the EXISTING user document
    // (user.dailyMission field - not a new collection). Auto-resets when date changes.
    // ══════════════════════════════════════════════════════════════
    if (action === 'mark_mission_progress') {
      const { blockKey, questionsCompleted } = body;
      if (!blockKey) return res.status(400).json({ error: 'blockKey required' });
      const todayKey2 = new Date().toISOString().slice(0, 10);
      const existing2 = (user.dailyMission && user.dailyMission.date === todayKey2)
        ? user.dailyMission.blockProgress : {}; // stale date = fresh start, no manual cleanup needed
      existing2[blockKey] = {
        questionsCompleted: Math.min(50, parseInt(questionsCompleted) || 0),
        completedAt: new Date().toISOString(),
      };
      await db.collection('users').doc(uid).update({
        dailyMission: { date: todayKey2, blockProgress: existing2 },
      });
      return res.status(200).json({ ok: true });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: sync_galti
    // Persists GALTI mistakes to the user doc (fixes pre-existing bug: mistakes were
    // never persisted anywhere - client-memory only, lost on reload/re-login).
    // Client sends the full current mistake object; server upserts by questionId key.
    // Scheduling logic (nextReview dates) stays client-owned; server just stores it.
    // ══════════════════════════════════════════════════════════════
    if (action === 'sync_galti') {
      const { mistake, questionId } = body;
      if (!questionId || !mistake) return res.status(400).json({ error: 'questionId and mistake required' });
      if (typeof questionId !== 'string' || questionId.length > 60)
        return res.status(400).json({ error: 'invalid questionId' });

      const galti = user.galtiMistakes || {};
      galti[questionId] = {
        tid: (mistake.tid || '').slice(0, 40),
        sub: (mistake.sub || '').slice(0, 20),
        errorType: ALLOWED_ERROR_TYPES.indexOf(mistake.errorType) >= 0 ? mistake.errorType : 'unknown',
        count: Math.min(999, parseInt(mistake.count) || 1),
        recovered: !!mistake.recovered,
        recoveryStep: Math.min(3, parseInt(mistake.recoveryStep) || 0),
        addedAt: mistake.addedAt || new Date().toISOString(),
        lastWrong: mistake.lastWrong || new Date().toISOString(),
        nextReview: mistake.nextReview || null,
        recoveredAt: mistake.recoveredAt || null,
      };

      const capped = evictOldest(galti, MAX_GALTI_ENTRIES, 'lastWrong');
      await db.collection('users').doc(uid).update({ galtiMistakes: capped });
      return res.status(200).json({ ok: true });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: sync_galti_bulk
    // One-shot upload of the entire local mistakes[] array - used once on first login
    // after this fix ships, so existing in-session (not-yet-lost) mistakes aren't wasted.
    // ══════════════════════════════════════════════════════════════
    if (action === 'sync_galti_bulk') {
      const { mistakes } = body;
      if (!Array.isArray(mistakes)) return res.status(400).json({ error: 'mistakes array required' });
      const galti = user.galtiMistakes || {};
      mistakes.slice(0, MAX_GALTI_ENTRIES).forEach(function(m) {
        if (!m.id) return;
        galti[String(m.id)] = {
          tid: (m.tid || '').slice(0, 40), sub: (m.sub || '').slice(0, 20),
          errorType: ALLOWED_ERROR_TYPES.indexOf(m.errorType) >= 0 ? m.errorType : 'unknown',
          count: Math.min(999, parseInt(m.count) || 1),
          recovered: !!m.recovered, recoveryStep: Math.min(3, parseInt(m.recoveryStep) || 0),
          addedAt: m.addedAt || new Date().toISOString(), lastWrong: m.lastWrong || new Date().toISOString(),
          nextReview: m.nextReview || null, recoveredAt: m.recoveredAt || null,
        };
      });
      const capped = evictOldest(galti, MAX_GALTI_ENTRIES, 'lastWrong');
      await db.collection('users').doc(uid).update({ galtiMistakes: capped });
      return res.status(200).json({ ok: true, synced: mistakes.length });
    }

    // ── TARGET-LEAP TRACKER: student sets a target score before a real exam attempt,
    // then sees a running history of target-vs-actual outcomes. Uses NEETAce's real
    // NEET-pattern /720 scale (not NEETprep's /360) - consistent with Exam Mode's
    // existing scoring, not a separate scale invented for this feature alone. ──
    if (action === 'set_target') {
      const { targetScore, targetDate } = body;
      const ts = parseInt(targetScore);
      if (!Number.isFinite(ts) || ts < 0 || ts > 720)
        return res.status(400).json({ error: 'targetScore must be between 0 and 720' });
      if (!targetDate) return res.status(400).json({ error: 'targetDate required' });

      const history = Array.isArray(user.targetHistory) ? user.targetHistory.slice() : [];
      const newTarget = {
        id: 'tgt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        targetScore: ts, targetDate: String(targetDate).slice(0, 20),
        createdAt: new Date().toISOString(), status: 'pending', actualScore: null, hit: null,
      };
      history.push(newTarget);
      // Bloat protection, same pattern as conceptStats/galtiMistakes elsewhere in this file:
      // oldest entries evicted beyond the cap, keyed by createdAt.
      const trimmed = history.length > MAX_TARGET_HISTORY
        ? history.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, MAX_TARGET_HISTORY)
        : history;
      await db.collection('users').doc(uid).update({ targetHistory: trimmed });
      return res.status(200).json({ ok: true, targetId: newTarget.id });
    }

    if (action === 'get_target_history') {
      const history = Array.isArray(user.targetHistory) ? user.targetHistory.slice() : [];
      history.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      return res.status(200).json({ history: history });
    }

    // ══════════════════════════════════════════════════════════════
    // DEFAULT ACTION: record (session scoring) - legacy callers send no `action` field,
    // so this must stay the default. Behavior is UNCHANGED from before this refactor.
    // ══════════════════════════════════════════════════════════════
    const { results, subject, sessionTimeSec } = body;
    if (!results || !results.length)
      return res.status(400).json({ error: 'results required for recording a session' });

    let sessionScore = 0;
    let correct = 0, wrong = 0, skipped = 0;
    const timePerQ = sessionTimeSec ? sessionTimeSec / results.length : 30;

    for (const r of results) {
      const w  = WEIGHTS[r.difficulty] || 1;
      const tb = TYPE_BONUS[r.type]    || 1.0;
      const sb = speedBonus(r.timeTaken, timePerQ * 2, r.correct === true);

      if (r.correct === true) {
        sessionScore += w * tb * sb;
        correct++;
      } else if (r.correct === false) {
        sessionScore -= w * NEGATIVE_MARK;
        wrong++;
      } else {
        skipped++;
      }
    }
    sessionScore = Math.max(0, Math.round(sessionScore * 100) / 100);

    const subKey = (subject || 'global').toLowerCase();
    const validSubs = ['physics', 'chemistry', 'biology', 'global'];
    const key = validSubs.includes(subKey) ? subKey : 'global';

    const existing = user.scores || {};
    const prev     = existing[key] || { weighted: 0, attempted: 0, correct: 0, wrong: 0, currentLevel: 0 };

    const currentLevel = results[0]?.levelIndex ?? prev.currentLevel ?? 0;
    const drop = Math.max(0, (prev.currentLevel || 0) - currentLevel);
    const decayIdx = Math.min(drop, LEVEL_DECAY.length - 1);
    const decayFactor = LEVEL_DECAY[decayIdx];
    const decayedScore = Math.round(sessionScore * decayFactor * 100) / 100;

    const newSubScore = {
      weighted:     Math.round((prev.weighted + decayedScore) * 100) / 100,
      attempted:    prev.attempted + results.length,
      correct:      (prev.correct  || 0) + correct,
      wrong:        (prev.wrong    || 0) + wrong,
      skipped:      (prev.skipped  || 0) + skipped,
      accuracy:     Math.round(((prev.correct + correct) / (prev.attempted + results.length)) * 1000) / 10,
      currentLevel: currentLevel,
      lastUpdated:  new Date().toISOString(),
    };

    const prevGlobal = existing.global || { weighted: 0, attempted: 0, correct: 0, wrong: 0 };
    const newGlobal  = key !== 'global' ? {
      weighted:    Math.round((prevGlobal.weighted + decayedScore) * 100) / 100,
      attempted:   prevGlobal.attempted + results.length,
      correct:     (prevGlobal.correct  || 0) + correct,
      wrong:       (prevGlobal.wrong    || 0) + wrong,
      accuracy:    Math.round(((prevGlobal.correct + correct) / (prevGlobal.attempted + results.length)) * 1000) / 10,
      weeklyPoints: (prevGlobal.weeklyPoints || 0) + decayedScore,
      lastUpdated:  new Date().toISOString(),
    } : newSubScore;

    const scoresUpdate = { ...existing, [key]: newSubScore };
    if (key !== 'global') scoresUpdate.global = newGlobal;

    // Aggregate per-topic concept stats (unchanged from prior session)
    const conceptStats = user.conceptStats || {};
    for (const r of results) {
      const tid = r.tid || r.topicId;
      if (!tid || typeof tid !== 'string' || tid.length > 40) continue;
      const cs = conceptStats[tid] || { attempted: 0, correct: 0, wrong: 0, totalTimeMs: 0, lastSeen: null, errorTypes: {} };
      cs.attempted++;
      if (r.correct === true) cs.correct++;
      else if (r.correct === false) {
        cs.wrong++;
        if (r.errorType && ALLOWED_ERROR_TYPES.indexOf(r.errorType) >= 0) {
          cs.errorTypes[r.errorType] = (cs.errorTypes[r.errorType] || 0) + 1;
        }
      }
      cs.totalTimeMs = Math.min(36000000, cs.totalTimeMs + (r.timeTaken || 0));
      cs.lastSeen = new Date().toISOString();
      cs.accuracy = cs.attempted > 0 ? Math.round((cs.correct / cs.attempted) * 1000) / 10 : 0;
      cs.avgTimeMs = cs.attempted > 0 ? Math.round(cs.totalTimeMs / cs.attempted) : 0;
      cs.masteryBand = cs.accuracy >= 70 ? 'mastered' : cs.accuracy >= 40 ? 'developing' : 'weak';
      conceptStats[tid] = cs;
    }
    const cappedConceptStats = evictOldest(conceptStats, MAX_CONCEPT_TIDS, 'lastSeen');

    const accMultiplier = Math.max(0.5, Math.min(1.2, (newGlobal.accuracy || 50) / 60));
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSessions = await db.collection('sessions').where('uid', '==', uid)
      .where('playedAt', '>=', sevenDaysAgo.toISOString()).count().get()
      .catch(function() { return { data: function() { return { count: 1 }; } }; });
    const daysActive = Math.min(7, recentSessions.data().count || 1);
    const consistencyMultiplier = 0.7 + (daysActive / 7) * 0.4;
    const rankScore = Math.round(newGlobal.weighted * accMultiplier * consistencyMultiplier * 100) / 100;
    newGlobal.rankScore = rankScore;
    newGlobal.consistency7d = daysActive;

    await db.collection('users').doc(uid).update({
      scores: scoresUpdate,
      conceptStats: cappedConceptStats,
      totalQuestionsAttempted: (user.totalQuestionsAttempted || 0) + results.length,
      lastSessionAt: new Date().toISOString(),
    });

    await db.collection('sessions').add({
      uid, subject: key, sessionScore, decayedScore,
      correct, wrong, skipped,
      questionsCount: results.length,
      difficulty: results[0]?.difficulty || 'mixed',
      sessionTimeSec: sessionTimeSec || 0,
      playedAt: new Date().toISOString(),
      expiresAt: nextMay31().toISOString(),
    });

    if (Math.random() < 0.05) {
      try {
        const oldSessions = await db.collection('sessions')
          .where('uid', '==', uid).orderBy('playedAt', 'asc').limit(50).get();
        if (oldSessions.size >= 50) {
          const countSnap = await db.collection('sessions').where('uid', '==', uid).count().get();
          if ((countSnap.data().count || 0) > 200) {
            const batch = db.batch();
            oldSessions.docs.slice(0, 50).forEach(function(d) { batch.delete(d.ref); });
            await batch.commit();
          }
        }
      } catch (e) {}
    }

    let rank = null;
    const totalAttempted = newGlobal.attempted || 0;
    if (totalAttempted >= MIN_FOR_RANK) {
      const aboveCount = await db.collection('users')
        .where('scores.global.rankScore', '>', rankScore)
        .count().get();
      rank = (aboveCount.data().count || 0) + 1;
      await db.collection('users').doc(uid).update({ 'scores.global.rank': rank });
    }

    // Target-Leap Tracker: if this session was submitted against a pending target
    // (Exam Mode passes targetId + its own already-computed real /720 score), mark
    // that target complete. Never blocks the exam submission itself if the targetId
    // is stale or missing - scoring the exam always succeeds regardless.
    const { targetId, examScoreOutOf720 } = body;
    if (targetId && Number.isFinite(parseInt(examScoreOutOf720))) {
      const history = Array.isArray(user.targetHistory) ? user.targetHistory.slice() : [];
      const idx = history.findIndex(function(t) { return t.id === targetId && t.status === 'pending'; });
      if (idx >= 0) {
        const scoreVal = parseInt(examScoreOutOf720);
        history[idx] = Object.assign({}, history[idx], {
          status: 'complete', actualScore: scoreVal, hit: scoreVal >= history[idx].targetScore,
        });
        await db.collection('users').doc(uid).update({ targetHistory: history });
      }
    }

    return res.status(200).json({
      ok: true,
      session: { score: sessionScore, decayedScore, correct, wrong, skipped },
      updated: { [key]: newSubScore, global: newGlobal },
      rank: rank,
      qualifiesForLeaderboard: totalAttempted >= MIN_FOR_RANK,
      minQuestionsNeeded: Math.max(0, MIN_FOR_RANK - totalAttempted),
    });

  } catch (err) {
    console.error('scoring error', err);
    return res.status(500).json({ error: err.message });
  }
};
