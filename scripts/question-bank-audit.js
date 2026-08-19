// Audits verified CSV packs without modifying content.
// Usage: npm run audit:questions
const fs = require('fs');
const path = require('path');

const PACK_DIR = path.join(__dirname, '..', 'data', 'packs');
const TARGET_QUESTIONS = 2000;
const STRICT = process.argv.includes('--strict');

function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map(function(h) { return h.toLowerCase(); });
  return rows.slice(1).map(function(values) {
    const item = {}; headers.forEach(function(h, i) { item[h] = values[i] || ''; }); return item;
  });
}

const files = fs.readdirSync(PACK_DIR).filter(function(f) { return f.endsWith('.csv'); }).sort();
const rawSubjectCounts = {}, uniqueSubjectCounts = {}, uniqueNcertBySubject = {}, chapterCounts = {}, packBreakdown = {}, seenText = new Map(), duplicates = [], errors = [], warnings = [];
let total = 0, rawPyq = 0, uniquePyq = 0, rawWithNcertPage = 0, uniqueWithNcertPage = 0, uniqueFacultyReviewed = 0;

files.forEach(function(file) {
  const rows = parseCSV(fs.readFileSync(path.join(PACK_DIR, file), 'utf8'));
  packBreakdown[file] = { raw: rows.length, unique: 0, duplicates: 0, validationErrors: 0, ncertReferenced: 0 };
  rows.forEach(function(q, index) {
    total++;
    const subject = String(q.sub || q.subject || '').toUpperCase();
    const chapter = q.ch || q.chapter || '';
    const text = q.text || q.question || '';
    const correct = String(q.correct || '').toUpperCase();
    const options = [q.opt_a, q.opt_b, q.opt_c, q.opt_d];
    const location = `${file}:${index + 2}`;
    if (!subject || !chapter || !text || options.some(function(o) { return !o; }) || !['A','B','C','D'].includes(correct)) {
      errors.push({ location, reason: 'Missing/invalid subject, chapter, question, options, or correct answer' });
      packBreakdown[file].validationErrors++;
    }
    if (!q.explanation) warnings.push({ location, reason: 'Missing explanation' });
    if (!q.ncert_page || q.ncert_page === '-') warnings.push({ location, reason: 'Missing NCERT page reference' });
    rawSubjectCounts[subject || 'UNKNOWN'] = (rawSubjectCounts[subject || 'UNKNOWN'] || 0) + 1;
    chapterCounts[`${subject}:${chapter}`] = (chapterCounts[`${subject}:${chapter}`] || 0) + 1;
    if (q.pyq_year) rawPyq++;
    if (q.ncert_page && q.ncert_page !== '-') rawWithNcertPage++;
    const key = text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key && seenText.has(key)) {
      duplicates.push({ first: seenText.get(key), duplicate: location });
      packBreakdown[file].duplicates++;
    }
    else if (key) {
      seenText.set(key, location);
      packBreakdown[file].unique++;
      uniqueSubjectCounts[subject || 'UNKNOWN'] = (uniqueSubjectCounts[subject || 'UNKNOWN'] || 0) + 1;
      if (q.pyq_year) uniquePyq++;
      if (String(q.review_status || '').toLowerCase() === 'approved' && q.reviewer) uniqueFacultyReviewed++;
      if (q.ncert_page && q.ncert_page !== '-') {
        uniqueWithNcertPage++;
        packBreakdown[file].ncertReferenced++;
        uniqueNcertBySubject[subject || 'UNKNOWN'] = (uniqueNcertBySubject[subject || 'UNKNOWN'] || 0) + 1;
      }
    }
  });
});

const ncertCoverageBySubject = {};
Object.keys(uniqueSubjectCounts).forEach(function(subject) {
  ncertCoverageBySubject[subject] = {
    referenced: uniqueNcertBySubject[subject] || 0,
    uniqueQuestions: uniqueSubjectCounts[subject],
    coveragePct: Math.round((uniqueNcertBySubject[subject] || 0) / uniqueSubjectCounts[subject] * 1000) / 10,
  };
});
const duplicateRatePct = total ? Math.round(duplicates.length / total * 1000) / 10 : 0;
const ncertCoveragePct = seenText.size ? Math.round(uniqueWithNcertPage / seenText.size * 1000) / 10 : 0;
const facultyReviewCoveragePct = seenText.size ? Math.round(uniqueFacultyReviewed / seenText.size * 1000) / 10 : 0;

const report = {
  generatedAt: new Date().toISOString(), files: files.length, rawQuestionRows: total,
  totalQuestions: seenText.size, targetQuestions: TARGET_QUESTIONS,
  targetCompletionPct: Math.round(seenText.size / TARGET_QUESTIONS * 1000) / 10,
  remainingToTarget: Math.max(0, TARGET_QUESTIONS - seenText.size), subjectCounts: uniqueSubjectCounts,
  rawSubjectCounts,
  uniqueSubjectChapters: Object.keys(chapterCounts).length,
  pyqQuestions: uniquePyq, rawPyqQuestionRows: rawPyq,
  questionsWithNcertPage: uniqueWithNcertPage, rawRowsWithNcertPage: rawWithNcertPage,
  ncertCoveragePct, ncertCoverageBySubject,
  facultyReviewedQuestions: uniqueFacultyReviewed, facultyReviewCoveragePct,
  exactDuplicateQuestionTexts: duplicates.length, validationErrors: errors.length,
  duplicateRatePct, warningCount: warnings.length,
  readiness: {
    uniqueQuestionTargetMet: seenText.size >= TARGET_QUESTIONS,
    zeroValidationErrors: errors.length === 0,
    zeroExactDuplicates: duplicates.length === 0,
    ncertReferenceCoverageAtLeast90Pct: ncertCoveragePct >= 90,
    allQuestionsFacultyApproved: uniqueFacultyReviewed === seenText.size,
  },
  packBreakdown,
  duplicateSamples: duplicates.slice(0, 10), errorSamples: errors.slice(0, 10), warningSamples: warnings.slice(0, 10),
};

process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (errors.length) process.exitCode = 1;
if (STRICT && (duplicates.length || warnings.length || uniqueFacultyReviewed !== seenText.size)) process.exitCode = 1;
