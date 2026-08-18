// api/test-series.js
// Fixed academy tests, batch assignments, persisted attempts, and post-test analytics.

const { db } = require('./_firebase');
const { recordUsage } = require('../lib/usage');

const MAX_QUESTIONS = 180;
const MAX_ATTEMPTS = 3;

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function sanitizeQuestion(q, index) {
  if (!q) return null;
  const correct = parseInt(q.correct);
  if (q.id === undefined || !q.text || !Array.isArray(q.opts) || q.opts.length < 2 || correct < 0 || correct > 3) return null;
  return {
    id: cleanText(q.id, 80) || `q_${index + 1}`,
    sub: cleanText(q.sub, 20).toUpperCase() || 'BIOLOGY',
    ch: cleanText(q.ch, 100) || 'General',
    tid: cleanText(q.tid, 40),
    text: cleanText(q.text, 2000),
    opts: q.opts.slice(0, 4).map(function(o) { return cleanText(o, 500); }),
    correct,
    explanation: cleanText(q.explanation, 2500),
    diff: cleanText(q.diff, 20) || 'medium',
    estimatedTime: Math.max(15, Math.min(300, parseInt(q.estimatedTime) || 60)),
    ncertCl: parseInt(q.ncertCl) || null,
    ncertCh: cleanText(q.ncertCh, 30),
    ncertPg: cleanText(q.ncertPg, 30),
    unit: cleanText(q.unit, 150),
  };
}

function validIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function publicQuestion(q) {
  const copy = { ...q };
  delete copy.correct;
  delete copy.explanation;
  return copy;
}

function isTeacher(user) {
  return !!(user.academyId && (user.academyRole === 'teacher' || user.role === 'admin'));
}

function canAccessTest(user, test, uid) {
  if (user.role === 'admin' || test.createdBy === uid) return true;
  return user.academyRole === 'student' && user.academyId === test.academyId && user.batchId === test.batchId;
}

function availability(test) {
  const now = Date.now();
  if (test.active === false) return 'closed';
  if (test.startAt && now < new Date(test.startAt).getTime()) return 'upcoming';
  if (test.dueAt && now > new Date(test.dueAt).getTime()) return 'closed';
  return 'open';
}

async function getAttempts(testRef, uid) {
  const snap = await testRef.collection('attempts').where('uid', '==', uid).get();
  return snap.docs.map(function(d) { return { id: d.id, ...d.data() }; })
    .sort(function(a, b) { return (a.attemptNo || 0) - (b.attemptNo || 0); });
}

function summarizeTest(test) {
  return {
    id: test.id, title: test.title, type: test.type, subject: test.subject,
    templateKey: test.templateKey || 'custom',
    questionCount: test.questionCount, durationMinutes: test.durationMinutes,
    startAt: test.startAt || null, dueAt: test.dueAt || null,
    attemptLimit: test.attemptLimit || 1, batchId: test.batchId,
    batchName: test.batchName || '', createdAt: test.createdAt,
    active: test.active !== false, availability: availability(test),
  };
}

function addMetric(map, key, result) {
  const item = map[key] || { attempted: 0, correct: 0, wrong: 0, skipped: 0, score: 0, accuracy: 0 };
  if (result.selected === null) item.skipped++;
  else {
    item.attempted++;
    if (result.correct) { item.correct++; item.score += 4; }
    else { item.wrong++; item.score -= 1; }
  }
  item.accuracy = item.attempted ? Math.round(item.correct / item.attempted * 1000) / 10 : 0;
  map[key] = item;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const { action, uid, sessionToken } = body;
  if (!uid || !sessionToken) return res.status(400).json({ error: 'Auth required' });

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
  const user = userSnap.data();
  if (user.sessionToken !== sessionToken) return res.status(401).json({ error: 'Invalid session' });

  if (action === 'create_test') {
    if (!isTeacher(user)) return res.status(403).json({ error: 'Teacher only' });
    const { batchId, title, type = 'chapter', subject = 'ALL' } = body;
    if (!batchId || !title) return res.status(400).json({ error: 'batchId and title required' });
    const batchSnap = await db.collection('academies').doc(user.academyId).collection('batches').doc(batchId).get();
    if (!batchSnap.exists) return res.status(404).json({ error: 'Batch not found' });
    const batch = batchSnap.data();
    if (user.role !== 'admin' && batch.createdBy !== uid) return res.status(403).json({ error: 'Can assign only to your own batch' });

    const questions = (Array.isArray(body.questions) ? body.questions : []).slice(0, MAX_QUESTIONS)
      .map(sanitizeQuestion).filter(Boolean);
    if (!questions.length) return res.status(400).json({ error: 'At least one valid question required' });

    const ref = db.collection('academy_tests').doc();
    const now = new Date().toISOString();
    const test = {
      id: ref.id,
      title: cleanText(title, 120),
      type: ['chapter','subject','part','full'].includes(type) ? type : 'chapter',
      subject: cleanText(subject, 20).toUpperCase() || 'ALL',
      templateKey: cleanText(body.templateKey, 40) || 'custom',
      academyId: user.academyId, batchId, batchName: batch.batchName || '',
      createdBy: uid, createdByName: user.name || '',
      questionCount: questions.length,
      chapters: Array.from(new Set(questions.map(function(q) { return q.ch; }))).slice(0, 50),
      durationMinutes: Math.max(1, Math.min(180, parseInt(body.durationMinutes) || questions.length)),
      attemptLimit: Math.max(1, Math.min(MAX_ATTEMPTS, parseInt(body.attemptLimit) || 1)),
      startAt: validIso(body.startAt),
      dueAt: validIso(body.dueAt),
      questions, active: true, attemptCount: 0, submittedCount: 0, createdAt: now, updatedAt: now,
    };
    if ((body.startAt && !test.startAt) || (body.dueAt && !test.dueAt))
      return res.status(400).json({ error: 'Invalid startAt or dueAt' });
    if (test.startAt && test.dueAt && new Date(test.dueAt) <= new Date(test.startAt))
      return res.status(400).json({ error: 'dueAt must be after startAt' });
    await ref.set(test);
    return res.status(200).json({ ok: true, test: summarizeTest(test) });
  }

  if (action === 'list_tests') {
    let snap;
    if (isTeacher(user)) {
      snap = await db.collection('academy_tests').where('createdBy', '==', uid).get();
    } else if (user.academyRole === 'student' && user.batchId) {
      snap = await db.collection('academy_tests').where('batchId', '==', user.batchId).get();
    } else {
      return res.status(200).json({ ok: true, tests: [] });
    }
    const tests = snap.docs.map(function(d) { return d.data(); })
      .filter(function(test) { return isTeacher(user) || test.academyId === user.academyId; })
      .map(summarizeTest)
      .sort(function(a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
    return res.status(200).json({ ok: true, tests });
  }

  if (action === 'get_test') {
    if (!body.testId) return res.status(400).json({ error: 'testId required' });
    const ref = db.collection('academy_tests').doc(body.testId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Test not found' });
    const test = snap.data();
    if (!canAccessTest(user, test, uid)) return res.status(403).json({ error: 'Not assigned to this test' });
    const attempts = await getAttempts(ref, uid);
    const draft = attempts.find(function(a) { return a.status === 'draft'; }) || null;
    return res.status(200).json({
      ok: true, test: summarizeTest(test),
      questions: test.questions.map(publicQuestion),
      attempt: draft ? { id: draft.id, attemptNo: draft.attemptNo, answers: draft.answers || [], responseTimes: draft.responseTimes || [], startedAt: draft.startedAt } : null,
      submittedAttempts: attempts.filter(function(a) { return a.status === 'submitted'; }).length,
    });
  }

  if (action === 'save_progress') {
    const ref = db.collection('academy_tests').doc(body.testId || '');
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Test not found' });
    const test = snap.data();
    if (!canAccessTest(user, test, uid) || user.academyRole !== 'student') return res.status(403).json({ error: 'Not assigned to this test' });
    if (availability(test) !== 'open') return res.status(403).json({ error: 'Test is not open' });
    const attempts = await getAttempts(ref, uid);
    let draft = attempts.find(function(a) { return a.status === 'draft'; });
    if (!draft) {
      const submitted = attempts.filter(function(a) { return a.status === 'submitted'; }).length;
      if (submitted >= test.attemptLimit) return res.status(403).json({ error: 'Attempt limit reached' });
      const attemptNo = submitted + 1;
      draft = { id: `${uid}_${attemptNo}`, attemptNo, startedAt: new Date().toISOString() };
    }
    const answers = Array.isArray(body.answers) ? body.answers.slice(0, test.questionCount).map(function(a) {
      const n = parseInt(a); return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
    }) : [];
    const responseTimes = Array.isArray(body.responseTimes) ? body.responseTimes.slice(0, test.questionCount).map(function(t) {
      return Math.max(0, Math.min(3600000, parseInt(t) || 0));
    }) : [];
    await ref.collection('attempts').doc(draft.id).set({
      uid, studentName: user.name || '', testId: test.id, attemptNo: draft.attemptNo,
      status: 'draft', answers, responseTimes, startedAt: draft.startedAt,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return res.status(200).json({ ok: true, attemptId: draft.id, attemptNo: draft.attemptNo });
  }

  if (action === 'submit_test') {
    const ref = db.collection('academy_tests').doc(body.testId || '');
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Test not found' });
    const test = snap.data();
    if (!canAccessTest(user, test, uid) || user.academyRole !== 'student') return res.status(403).json({ error: 'Not assigned to this test' });
    if (availability(test) !== 'open') return res.status(403).json({ error: 'Test is not open' });

    const attempts = await getAttempts(ref, uid);
    let draft = attempts.find(function(a) { return a.status === 'draft'; });
    const submittedBefore = attempts.filter(function(a) { return a.status === 'submitted'; }).length;
    if (!draft) {
      if (submittedBefore >= test.attemptLimit) return res.status(403).json({ error: 'Attempt limit reached' });
      draft = { id: `${uid}_${submittedBefore + 1}`, attemptNo: submittedBefore + 1, startedAt: new Date().toISOString() };
    }

    const answers = Array.isArray(body.answers) ? body.answers.slice(0, test.questionCount) : (draft.answers || []);
    const responseTimes = Array.isArray(body.responseTimes) ? body.responseTimes.slice(0, test.questionCount) : (draft.responseTimes || []);
    const bySubject = {}, byChapter = {}, review = [], behaviours = { tooFastIncorrect: 0, overtimeIncorrect: 0 };
    let correct = 0, wrong = 0, skipped = 0, score = 0, totalTimeMs = 0;
    const galti = user.galtiMistakes || {};

    test.questions.forEach(function(q, i) {
      const raw = answers[i];
      const selected = Number.isInteger(parseInt(raw)) && parseInt(raw) >= 0 && parseInt(raw) <= 3 ? parseInt(raw) : null;
      const isCorrect = selected !== null && selected === q.correct;
      const timeMs = Math.max(0, Math.min(3600000, parseInt(responseTimes[i]) || 0));
      totalTimeMs += timeMs;
      if (selected === null) skipped++;
      else if (isCorrect) { correct++; score += 4; }
      else {
        wrong++; score -= 1;
        if (timeMs && timeMs < q.estimatedTime * 500) behaviours.tooFastIncorrect++;
        if (timeMs > q.estimatedTime * 1500) behaviours.overtimeIncorrect++;
        galti[q.id] = {
          tid: q.tid, sub: q.sub, errorType: 'concept', count: (galti[q.id] && galti[q.id].count || 0) + 1,
          recovered: false, recoveryStep: 0, addedAt: galti[q.id] && galti[q.id].addedAt || new Date().toISOString(),
          lastWrong: new Date().toISOString(), nextReview: new Date(Date.now() + 86400000).toISOString(), recoveredAt: null,
        };
      }
      const item = { questionId: q.id, selected, correct: isCorrect, correctIndex: q.correct, timeMs, sub: q.sub, chapter: q.ch, explanation: q.explanation };
      review.push(item); addMetric(bySubject, q.sub || 'OTHER', item); addMetric(byChapter, q.ch || 'General', item);
    });

    const maxScore = test.questionCount * 4;
    const score720 = maxScore ? Math.max(0, Math.round(score / maxScore * 720)) : 0;
    const accuracy = correct + wrong ? Math.round(correct / (correct + wrong) * 1000) / 10 : 0;
    const submittedAt = new Date().toISOString();
    const attemptData = {
      uid, studentName: user.name || '', testId: test.id, testTitle: test.title,
      attemptNo: draft.attemptNo, status: 'submitted', answers, responseTimes,
      correct, wrong, skipped, score, maxScore, score720, accuracy, totalTimeMs,
      bySubject, byChapter, behaviours, review, startedAt: draft.startedAt, submittedAt, updatedAt: submittedAt,
    };
    await ref.collection('attempts').doc(draft.id).set(attemptData);

    const allSubmitted = await ref.collection('attempts').where('status', '==', 'submitted').get();
    const ranked = allSubmitted.docs.map(function(d) { return { id: d.id, score: d.data().score || 0 }; })
      .sort(function(a, b) { return b.score - a.score; });
    const rank = ranked.findIndex(function(a) { return a.id === draft.id; }) + 1;
    const percentile = ranked.length ? Math.round((ranked.length - rank + 1) / ranked.length * 1000) / 10 : 0;
    await ref.collection('attempts').doc(draft.id).update({ rank, percentile, cohortSize: ranked.length });
    await ref.update({ submittedCount: allSubmitted.size, updatedAt: submittedAt });

    const galtiEntries = Object.entries(galti).sort(function(a, b) { return new Date(b[1].lastWrong || 0) - new Date(a[1].lastWrong || 0); }).slice(0, 150);
    await db.collection('users').doc(uid).update({
      galtiMistakes: Object.fromEntries(galtiEntries),
      totalQuestionsAttempted: (user.totalQuestionsAttempted || 0) + test.questionCount,
      lastSessionAt: submittedAt,
    });
    try {
      await recordUsage(db, uid, user, {
        section: 'test_series',
        // The test runner records bounded dwell time while open. Response times
        // are client-provided and remain useful for behaviour analytics only.
        elapsedSec: 0,
        questions: test.questionCount,
        testsSubmitted: 1,
        subject: test.subject === 'ALL' ? '' : test.subject,
        chapter: test.chapters && test.chapters.length === 1 ? test.chapters[0] : '',
        occurredAt: submittedAt,
      });
    } catch (usageError) {
      console.error('test usage aggregation error', usageError.message);
    }
    return res.status(200).json({ ok: true, attempt: { ...attemptData, rank, percentile, cohortSize: ranked.length } });
  }

  if (action === 'get_attempt_history') {
    const snap = await db.collectionGroup('attempts').where('uid', '==', uid).get();
    const attempts = snap.docs.map(function(d) { return { id: d.id, ...d.data() }; })
      .filter(function(a) { return a.status === 'submitted'; })
      .sort(function(a, b) { return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0); })
      .map(function(a) {
        return { id: a.id, testId: a.testId, testTitle: a.testTitle, attemptNo: a.attemptNo, score: a.score, maxScore: a.maxScore, score720: a.score720, accuracy: a.accuracy, rank: a.rank || null, percentile: a.percentile || 0, submittedAt: a.submittedAt, bySubject: a.bySubject, byChapter: a.byChapter, behaviours: a.behaviours };
      });
    return res.status(200).json({ ok: true, attempts });
  }

  if (action === 'get_test_results') {
    if (!isTeacher(user) || !body.testId) return res.status(403).json({ error: 'Teacher only' });
    const ref = db.collection('academy_tests').doc(body.testId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Test not found' });
    const test = snap.data();
    if (user.role !== 'admin' && test.createdBy !== uid) return res.status(403).json({ error: 'Not your test' });
    const attemptSnap = await ref.collection('attempts').where('status', '==', 'submitted').get();
    const attempts = attemptSnap.docs.map(function(d) { const a = d.data(); return { id: d.id, uid: a.uid, studentName: a.studentName, attemptNo: a.attemptNo, score: a.score, maxScore: a.maxScore, score720: a.score720, accuracy: a.accuracy, rank: a.rank || null, submittedAt: a.submittedAt, bySubject: a.bySubject, byChapter: a.byChapter, behaviours: a.behaviours }; })
      .sort(function(a, b) { return b.score - a.score; });
    const studentSnap = await db.collection('academies').doc(test.academyId).collection('batches').doc(test.batchId).collection('students').get();
    const submittedStudents = new Set(attempts.map(function(a) { return a.uid; })).size;
    // Protect historical tests if an old roster entry has since been removed.
    const assigned = Math.max(studentSnap.size, submittedStudents);
    const averageScore = attempts.length ? Math.round(attempts.reduce(function(s, a) { return s + a.score; }, 0) / attempts.length * 10) / 10 : 0;
    return res.status(200).json({ ok: true, test: summarizeTest(test), attempts, summary: { assigned, submitted: submittedStudents, notAttempted: Math.max(0, assigned - submittedStudents), totalSubmissions: attempts.length, averageScore, highestScore: attempts.length ? attempts[0].score : 0 } });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
