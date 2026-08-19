// Shared, bounded usage aggregation for student, teacher and founder visibility.
// One document per user/day keeps reads predictable and avoids raw event-log bloat.

const ALLOWED_SECTIONS = [
  'home', 'practice', 'quiz', 'exam', 'revision', 'flashcards', 'galti',
  'ai_tutor', 'analytics', 'syllabus', 'notes', 'profile', 'test_series', 'other',
];
const MAX_BUCKETS = 24;

function cleanLabel(value, max) {
  return String(value || '').replace(/[^a-z0-9 &()_\-./]/gi, '').trim().slice(0, max);
}

function dayKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function daysAgoKey(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.max(0, parseInt(days) || 0));
  return dayKey(date);
}

function addBucket(map, key, seconds, questions) {
  if (!key) return map;
  const out = map && typeof map === 'object' ? { ...map } : {};
  if (!out[key] && Object.keys(out).length >= MAX_BUCKETS) key = 'Other';
  const existing = out[key] || { timeSec: 0, questions: 0 };
  out[key] = {
    timeSec: Math.min(86400, (existing.timeSec || 0) + seconds),
    questions: Math.min(1000, (existing.questions || 0) + questions),
  };
  return out;
}

function sanitizeEvent(event) {
  const rawSection = cleanLabel(event.section, 30).toLowerCase().replace(/\s+/g, '_');
  const section = ALLOWED_SECTIONS.includes(rawSection) ? rawSection : 'other';
  return {
    section,
    elapsedSec: Math.max(0, Math.min(1800, parseInt(event.elapsedSec) || 0)),
    questions: Math.max(0, Math.min(200, parseInt(event.questions) || 0)),
    aiQuestions: Math.max(0, Math.min(20, parseInt(event.aiQuestions) || 0)),
    testsSubmitted: Math.max(0, Math.min(5, parseInt(event.testsSubmitted) || 0)),
    subject: cleanLabel(event.subject, 20).toUpperCase(),
    chapter: cleanLabel(event.chapter, 80),
    occurredAt: event.occurredAt || new Date().toISOString(),
  };
}

async function recordUsage(db, uid, user, input) {
  const event = sanitizeEvent(input || {});
  if (!event.elapsedSec && !event.questions && !event.aiQuestions && !event.testsSubmitted) return null;
  const date = dayKey(event.occurredAt);
  const ref = db.collection('usage_daily').doc(`${uid}_${date}`);
  const now = new Date().toISOString();
  await db.runTransaction(async function(transaction) {
    const snap = await transaction.get(ref);
    const current = snap.exists ? snap.data() : {};
    const next = {
      id: `${uid}_${date}`,
      uid,
      userName: cleanLabel(user.name || 'Student', 100),
      academyId: user.academyId || null,
      batchId: user.batchId || null,
      date,
      totalTimeSec: Math.min(86400, (current.totalTimeSec || 0) + event.elapsedSec),
      questionsAttempted: Math.min(2000, (current.questionsAttempted || 0) + event.questions),
      aiQuestions: Math.min(200, (current.aiQuestions || 0) + event.aiQuestions),
      testsSubmitted: Math.min(20, (current.testsSubmitted || 0) + event.testsSubmitted),
      activityEvents: Math.min(500, (current.activityEvents || 0) + 1),
      sections: addBucket(current.sections, event.section, event.elapsedSec, event.questions),
      subjects: addBucket(current.subjects, event.subject, event.elapsedSec, event.questions),
      chapters: addBucket(current.chapters, event.chapter, event.elapsedSec, event.questions),
      firstActiveAt: current.firstActiveAt || now,
      lastActiveAt: now,
      updatedAt: now,
    };
    transaction.set(ref, next);
  });
  return { id: ref.id, date, event };
}

function mergeBuckets(target, source) {
  Object.entries(source || {}).forEach(function(entry) {
    const existing = target[entry[0]] || { timeSec: 0, questions: 0 };
    target[entry[0]] = {
      timeSec: existing.timeSec + (entry[1].timeSec || 0),
      questions: existing.questions + (entry[1].questions || 0),
    };
  });
}

function sortBuckets(map, limit) {
  return Object.entries(map || {}).map(function(entry) {
    return { name: entry[0], timeSec: entry[1].timeSec || 0, questions: entry[1].questions || 0 };
  }).sort(function(a, b) {
    return b.timeSec - a.timeSec || b.questions - a.questions;
  }).slice(0, limit || 20);
}

function summarizeUsage(docs, startDate) {
  const summary = {
    startDate: startDate || null,
    activeStudents: 0,
    totalTimeSec: 0,
    questionsAttempted: 0,
    aiQuestions: 0,
    testsSubmitted: 0,
    sections: {}, subjects: {}, chapters: {}, students: {},
  };
  (docs || []).forEach(function(doc) {
    const data = typeof doc.data === 'function' ? doc.data() : doc;
    if (startDate && data.date < startDate) return;
    summary.totalTimeSec += data.totalTimeSec || 0;
    summary.questionsAttempted += data.questionsAttempted || 0;
    summary.aiQuestions += data.aiQuestions || 0;
    summary.testsSubmitted += data.testsSubmitted || 0;
    mergeBuckets(summary.sections, data.sections);
    mergeBuckets(summary.subjects, data.subjects);
    mergeBuckets(summary.chapters, data.chapters);
    const student = summary.students[data.uid] || {
      uid: data.uid, name: data.userName || 'Student', timeSec: 0, questions: 0,
      aiQuestions: 0, testsSubmitted: 0, lastActiveAt: null,
    };
    student.timeSec += data.totalTimeSec || 0;
    student.questions += data.questionsAttempted || 0;
    student.aiQuestions += data.aiQuestions || 0;
    student.testsSubmitted += data.testsSubmitted || 0;
    if (!student.lastActiveAt || String(data.lastActiveAt || '') > student.lastActiveAt)
      student.lastActiveAt = data.lastActiveAt || null;
    summary.students[data.uid] = student;
  });
  const students = Object.values(summary.students).sort(function(a, b) {
    return b.timeSec - a.timeSec || b.questions - a.questions;
  });
  return {
    startDate: summary.startDate,
    activeStudents: students.length,
    totalTimeSec: summary.totalTimeSec,
    questionsAttempted: summary.questionsAttempted,
    aiQuestions: summary.aiQuestions,
    testsSubmitted: summary.testsSubmitted,
    sections: sortBuckets(summary.sections, 16),
    subjects: sortBuckets(summary.subjects, 8),
    chapters: sortBuckets(summary.chapters, 12),
    students,
  };
}

module.exports = { recordUsage, summarizeUsage, daysAgoKey, sanitizeEvent };
