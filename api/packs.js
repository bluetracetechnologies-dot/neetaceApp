// api/packs.js
// Content Pack System — replaces the old "CSV import wipes on refresh" flow.
//
// Each pack is a Firestore document in content_packs/{packId}:
//   { id, name, subject, description, source, enabled, questionCount, questions[], createdAt }
//
// GET  ?active=true          → merged questions from all ENABLED packs (public, used by quiz engine)
// POST { action:'admin_*' }  → admin manages packs (upload CSV, toggle, delete, list)
//
// This fixes two problems from the old system:
//   1. Uploaded questions used to live only in browser memory — lost on refresh. Now persisted in Firestore.
//   2. No way to turn a batch of questions off without deleting them — now a single toggle.

const { db } = require('./_firebase');
const fs = require('fs');
const path = require('path');

// ── CSV parsing (server-side, handles quoted commas) ──
function parseCSV(text) {
  const lines = text.split(/\r\n|\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = [];
    let cur = '', inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { row.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    row.push(cur.trim());
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] || ''; });
    rows.push(obj);
  }
  return rows;
}

function csvRowToQuestion(row, packId, idx) {
  const correctMap = { A: 0, B: 1, C: 2, D: 3 };
  return {
    id: `${packId}_${idx}`,
    sub: (row.subject || row.sub || 'BIOLOGY').toUpperCase(),
    ch: row.chapter || row.ch || 'General',
    tid: row.tid || packId,
    text: row.question || row.text || '',
    opts: [row.opt_a || '', row.opt_b || '', row.opt_c || '', row.opt_d || ''],
    correct: correctMap[(row.correct || 'A').toUpperCase()] ?? 0,
    explanation: row.explanation || 'Refer NCERT.',
    ncertCl: parseInt(row.ncert_class) || 11,
    ncertCh: row.ncert_chapter || '1',
    ncertPg: row.ncert_page || '1',
    unit: row.syllabus_unit || row.unit || 'NCERT',
    diff: row.difficulty || row.diff || 'medium',
    pyq: !!(row.pyq_year),
    pyqYr: row.pyq_year ? parseInt(row.pyq_year) : undefined,
    trick: row.trick || '',
  };
}

// Prebuilt starter packs — bundled CSV files shipped with the app
const STARTER_PACKS = [
  { id: 'pack_physics_core',   name: 'Physics Core',        subject: 'PHYSICS',   file: 'pack_physics_core.csv',   description: 'Foundational Physics questions across Mechanics, Electricity, Modern Physics' },
  { id: 'pack_chemistry_core', name: 'Chemistry Core',      subject: 'CHEMISTRY', file: 'pack_chemistry_core.csv', description: 'Physical, Organic, and Inorganic Chemistry fundamentals' },
  { id: 'pack_biology_core',   name: 'Biology Core',        subject: 'BIOLOGY',   file: 'pack_biology_core.csv',   description: 'Cell Biology, Genetics, Physiology, Ecology fundamentals' },
  { id: 'pack_pyq_highlights', name: 'PYQ Highlights',      subject: 'ALL',       file: 'pack_pyq_highlights.csv', description: 'Previous Year Questions across all subjects, 2019-2024' },
];

async function verifyAdmin(uid, sessionToken) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const u = snap.data();
  if (u.sessionToken !== sessionToken || u.role !== 'admin') return null;
  return u;
}

module.exports = async function handler(req, res) {

  // ─────────────────────────────────────────────
  // GET — public, returns merged active questions
  // ─────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const snap = await db.collection('content_packs').where('enabled', '==', true).get();
      let questions = [];
      snap.forEach(doc => {
        const pack = doc.data();
        if (pack.questions) questions = questions.concat(pack.questions);
      });
      const packMeta = snap.docs.map(d => ({ id: d.id, name: d.data().name, count: d.data().questionCount }));
      return res.status(200).json({ questions, activePacks: packMeta, totalQuestions: questions.length });
    } catch (err) {
      console.error('packs GET error', err);
      return res.status(200).json({ questions: [], activePacks: [], totalQuestions: 0 });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, uid, sessionToken } = req.body || {};

  // ─────────────────────────────────────────────
  // SEED — one-time load of bundled starter packs into Firestore
  // ─────────────────────────────────────────────
  if (action === 'seed_starter_packs') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const results = [];
    for (const pack of STARTER_PACKS) {
      try {
        const csvPath = path.join(__dirname, '..', 'data', 'packs', pack.file);
        const csvText = fs.readFileSync(csvPath, 'utf-8');
        const rows = parseCSV(csvText);
        const questions = rows.map((row, i) => csvRowToQuestion(row, pack.id, i));

        await db.collection('content_packs').doc(pack.id).set({
          id: pack.id, name: pack.name, subject: pack.subject,
          description: pack.description, source: 'prebuilt',
          enabled: true, questionCount: questions.length,
          questions, createdAt: new Date().toISOString(),
        });
        results.push({ id: pack.id, status: 'seeded', count: questions.length });
      } catch (err) {
        results.push({ id: pack.id, status: 'error', error: err.message });
      }
    }
    return res.status(200).json({ ok: true, results });
  }

  // ─────────────────────────────────────────────
  // ADMIN: list all packs with metadata
  // ─────────────────────────────────────────────
  if (action === 'admin_list') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const snap = await db.collection('content_packs').get();
    const packs = snap.docs.map(d => {
      const p = d.data();
      return {
        id: d.id, name: p.name, subject: p.subject, description: p.description,
        source: p.source, enabled: p.enabled, questionCount: p.questionCount,
        createdAt: p.createdAt,
      };
    });
    return res.status(200).json({ packs });
  }

  // ─────────────────────────────────────────────
  // ADMIN: upload new pack from CSV text
  // ─────────────────────────────────────────────
  if (action === 'admin_upload') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const { name, subject, description, csvText, enabledByDefault } = req.body;
    if (!name || !csvText) return res.status(400).json({ error: 'name and csvText required' });

    const packId = 'pack_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '_' + Date.now().toString(36);
    const rows = parseCSV(csvText);
    if (!rows.length) return res.status(400).json({ error: 'CSV has no valid rows' });

    const questions = rows.map((row, i) => csvRowToQuestion(row, packId, i));

    await db.collection('content_packs').doc(packId).set({
      id: packId, name, subject: subject || 'MIXED',
      description: description || '', source: 'csv_upload',
      enabled: enabledByDefault === true, // defaults to FALSE — admin reviews before going live
      questionCount: questions.length,
      questions,
      uploadedBy: uid,
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true, packId, questionCount: questions.length,
      message: `Pack "${name}" uploaded with ${questions.length} questions. ${enabledByDefault ? 'Live now.' : 'Disabled — enable it when ready.'}`,
    });
  }

  // ─────────────────────────────────────────────
  // ADMIN: toggle pack on/off
  // ─────────────────────────────────────────────
  if (action === 'admin_toggle') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const { packId, enabled } = req.body;
    if (!packId) return res.status(400).json({ error: 'packId required' });

    await db.collection('content_packs').doc(packId).update({ enabled, updatedAt: new Date().toISOString() });
    return res.status(200).json({ ok: true, message: `Pack ${enabled ? 'enabled' : 'disabled'}` });
  }

  // ─────────────────────────────────────────────
  // ADMIN: delete pack permanently
  // ─────────────────────────────────────────────
  if (action === 'admin_delete') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const { packId } = req.body;
    if (!packId) return res.status(400).json({ error: 'packId required' });

    await db.collection('content_packs').doc(packId).delete();
    return res.status(200).json({ ok: true, message: 'Pack deleted' });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
