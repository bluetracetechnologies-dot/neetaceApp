const { db } = require('./_firebase');
const {
  normalizeQuestion,
  normalizeQuestionList,
  classifyAttempt,
  buildRecoveryPath,
} = require('./_learning');

async function verifyUser(uid, sessionToken) {
  if (!uid || !sessionToken) return null;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const user = snap.data();
  if (user.sessionToken !== sessionToken) return null;
  return { ref: snap.ref, data: user };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  try {
    if (action === 'dashboard') {
      const { uid, sessionToken } = req.body || {};
      const verified = await verifyUser(uid, sessionToken);
      if (!verified) return res.status(401).json({ error: 'Invalid session' });

      const user = verified.data;
      return res.status(200).json({
        ok: true,
        learningProfile: user.learningProfile || null,
        chapterMastery: user.chapterMastery || {},
        galti: user.galti || [],
        galtiSummary: user.galtiSummary || null,
        dailyMission: user.dailyMission || [],
        scorePrediction: user.scorePrediction || null,
      });
    }

    if (action === 'recover') {
      const { uid, sessionToken, question, questionBank, attempt = {} } = req.body || {};
      if (!question) return res.status(400).json({ error: 'question required' });
      const verified = await verifyUser(uid, sessionToken);
      if (!verified) return res.status(401).json({ error: 'Invalid session' });

      const normalizedQuestion = normalizeQuestion(question);
      const relatedBank = normalizeQuestionList(questionBank || []);
      const diagnosis = classifyAttempt({ ...attempt, question: normalizedQuestion });
      const recoveryPath = buildRecoveryPath(normalizedQuestion, diagnosis, relatedBank);

      return res.status(200).json({
        ok: true,
        question: normalizedQuestion,
        diagnosis,
        recoveryPath,
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('learning error', err);
    return res.status(500).json({ error: err.message || 'Learning request failed' });
  }
};
