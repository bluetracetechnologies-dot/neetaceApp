// api/scoring.js
// POST { uid, sessionToken, results[] }
// results: [{ questionId, correct, timeTaken, difficulty, type }]
// Computes weighted score and writes to Firestore users/{uid}/scores
// Called at end of every quiz session

const { db } = require('./_firebase');

// Difficulty weights
const WEIGHTS = { starter:1, easy:2, medium:4, hard:7, exam:10 };

// Question type bonuses
const TYPE_BONUS = { standard:1.0, parameterized:1.15, unit_variant:1.10 };

// NEET negative marking: wrong = -0.25 × weight
const NEGATIVE_MARK = 0.25;

// Minimum questions to appear on leaderboard
const MIN_FOR_RANK = 20;

// Level decay if student drops difficulty
const LEVEL_DECAY = [1.0, 0.85, 0.65, 0.40]; // [same, -1, -2, -3+]

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
  if (ratio < 0.30) return 1.2;   // Fast AND correct: real skill
  if (ratio < 0.60) return 1.1;
  return 1.0;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, sessionToken, results, subject, sessionTimeSec } = req.body || {};
  if (!uid || !sessionToken || !results?.length)
    return res.status(400).json({ error: 'uid, sessionToken, results required' });

  // Verify session
  const uSnap = await db.collection('users').doc(uid).get();
  if (!uSnap.exists) return res.status(404).json({ error: 'User not found' });
  const user = uSnap.data();
  if (user.sessionToken !== sessionToken) return res.status(401).json({ error: 'Invalid session' });

  try {
    // Compute session score
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

    // Determine subject key
    const subKey = (subject || 'global').toLowerCase();
    const validSubs = ['physics', 'chemistry', 'biology', 'global'];
    const key = validSubs.includes(subKey) ? subKey : 'global';

    // Load existing scores
    const existing = user.scores || {};
    const prev     = existing[key] || { weighted: 0, attempted: 0, correct: 0, wrong: 0, currentLevel: 0 };

    // Detect level drop for decay
    const currentLevel = results[0]?.levelIndex ?? prev.currentLevel ?? 0;
    const drop = Math.max(0, (prev.currentLevel || 0) - currentLevel);
    const decayIdx = Math.min(drop, LEVEL_DECAY.length - 1);
    const decayFactor = LEVEL_DECAY[decayIdx];
    const decayedScore = Math.round(sessionScore * decayFactor * 100) / 100;

    // Update subject scores
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

    // Also update global if not already global
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

    // Build update
    const scoresUpdate = { ...existing, [key]: newSubScore };
    if (key !== 'global') scoresUpdate.global = newGlobal;

    // ── AGGREGATE PER-TOPIC CONCEPT STATS (Learning DNA foundation) ──
    // Each question carries tid (topic id), chapter, and optionally errorType.
    // Concept stats power weak-topic analysis and next-question selection.
    const conceptStats = user.conceptStats || {};
    for (const r of results) {
      const tid = r.tid || r.topicId;
      if (!tid) continue;
      const cs = conceptStats[tid] || { attempted: 0, correct: 0, wrong: 0, totalTimeMs: 0, lastSeen: null, errorTypes: {} };
      cs.attempted++;
      if (r.correct === true) cs.correct++;
      else if (r.correct === false) {
        cs.wrong++;
        if (r.errorType) cs.errorTypes[r.errorType] = (cs.errorTypes[r.errorType] || 0) + 1;
      }
      cs.totalTimeMs += (r.timeTaken || 0);
      cs.lastSeen = new Date().toISOString();
      cs.accuracy = cs.attempted > 0 ? Math.round((cs.correct / cs.attempted) * 1000) / 10 : 0;
      cs.avgTimeMs = cs.attempted > 0 ? Math.round(cs.totalTimeMs / cs.attempted) : 0;
      // Mastery band: 0-40 weak, 40-70 developing, 70-100 mastered
      cs.masteryBand = cs.accuracy >= 70 ? 'mastered' : cs.accuracy >= 40 ? 'developing' : 'weak';
      conceptStats[tid] = cs;
    }

    // ── CONSISTENCY & MASTERY-ADJUSTED RANK SCORE ──
    // Prevents "grind easy questions forever" gaming. Rank uses composite:
    // weightedScore * accuracyMultiplier * consistencyMultiplier
    const accMultiplier = Math.max(0.5, Math.min(1.2, (newGlobal.accuracy || 50) / 60));
    // Consistency: sessions in last 7 days
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentSessions = await db.collection('sessions').where('uid','==',uid)
      .where('playedAt','>=',sevenDaysAgo.toISOString()).count().get().catch(function(){return {data:function(){return{count:1}}}});
    const daysActive = Math.min(7, recentSessions.data().count || 1);
    const consistencyMultiplier = 0.7 + (daysActive / 7) * 0.4; // 0.7 to 1.1
    const rankScore = Math.round(newGlobal.weighted * accMultiplier * consistencyMultiplier * 100) / 100;
    newGlobal.rankScore = rankScore;
    newGlobal.consistency7d = daysActive;

    // Write to Firestore (with concept stats + rank score)
    await db.collection('users').doc(uid).update({
      scores: scoresUpdate,
      conceptStats: conceptStats,
      totalQuestionsAttempted: (user.totalQuestionsAttempted || 0) + results.length,
      lastSessionAt: new Date().toISOString(),
    });

    // Log session for history
    await db.collection('sessions').add({
      uid, subject: key, sessionScore, decayedScore,
      correct, wrong, skipped,
      questionsCount: results.length,
      difficulty: results[0]?.difficulty || 'mixed',
      sessionTimeSec: sessionTimeSec || 0,
      playedAt: new Date().toISOString(),
      expiresAt: nextMay31().toISOString(),
    });

    // Compute global rank estimate (fast approximate)
    let rank = null;
    const totalAttempted = newGlobal.attempted || 0;
    if (totalAttempted >= MIN_FOR_RANK) {
      // Rank uses composite rankScore (weighted x accuracy x consistency), not raw weighted.
      // This prevents grinders farming easy questions from dominating leaderboard.
      const aboveCount = await db.collection('users')
        .where('scores.global.rankScore', '>', rankScore)
        .count().get();
      rank = (aboveCount.data().count || 0) + 1;
      await db.collection('users').doc(uid).update({ 'scores.global.rank': rank });
    }

    return res.status(200).json({
      ok: true,
      session: { score: sessionScore, decayedScore, correct, wrong, skipped },
      updated: { [key]: newSubScore, global: newGlobal },
      rank: rank,
      qualifiesForLeaderboard: totalAttempted >= MIN_FOR_RANK,
      minQuestionsNeeded: Math.max(0, MIN_FOR_RANK - totalAttempted),
    });
  // Return concept stats + weak topics
  if (req.body.action === 'get_concept_stats') {
    const cs = user.conceptStats || {};
    const list = Object.entries(cs).map(function(e){
      return { tid: e[0], attempted: e[1].attempted, correct: e[1].correct, accuracy: e[1].accuracy,
               avgTimeMs: e[1].avgTimeMs, masteryBand: e[1].masteryBand, errorTypes: e[1].errorTypes };
    }).sort(function(a,b){ return a.accuracy - b.accuracy; }); // weak first
    return res.status(200).json({ conceptStats: list, weakTopics: list.filter(function(x){return x.masteryBand==='weak'}).slice(0,5) });
  }

  } catch (err) {
    console.error('scoring error', err);
    return res.status(500).json({ error: err.message });
  }
};
