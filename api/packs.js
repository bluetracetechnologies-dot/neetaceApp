// api/packs.js
// Content Pack System with VERSION CONTROL.
//
// Firestore structure:
//   content_packs/{packId}                    → live pack (current version served to app)
//     { id, name, subject, description, source, enabled, questionCount,
//       questions[], version, versionHistory[] }
//   content_packs/{packId}/versions/{version}  → full snapshot of every version ever uploaded
//     { version, questions[], questionCount, uploadedAt, uploadedBy, changeNote }
//
// versionHistory on the live doc is a LIGHTWEIGHT summary (no question arrays) for fast admin listing.
// Full question data for any past version lives only in the versions subcollection — fetched on demand.

const { db } = require('./_firebase');
const fs = require('fs');
const path = require('path');

function parseCSV(text) {
  const lines = text.split(/\r\n|\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = []; let cur = '', inQ = false;
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

function normalizeDifficulty(diff) {
  const d = String(diff || '').toLowerCase();
  if (d === 'easy' || d === 'medium' || d === 'hard') return d;
  if (d === 'starter') return 'easy';
  if (d === 'exam') return 'hard';
  return 'medium';
}

function backfillQuestionMetadata(q) {
  const subject = (q.subject || q.sub || 'BIOLOGY').toUpperCase();
  const chapter = q.chapter || q.ch || 'General';
  const unitType = q.unitType || q.unit || 'NCERT';
  const concept = (q.concept || String(unitType).split('—')[0] || chapter).trim();
  const subconcept = (q.subconcept || String(unitType).split('—')[1] || concept).trim();
  const difficulty = normalizeDifficulty(q.difficulty || q.diff);
  return {
    ...q,
    subject,
    chapter,
    concept,
    subconcept,
    difficulty,
    formula: q.formula || q.trick || '',
    unitType,
    questionType: q.questionType || (q.pyq ? 'pyq' : (q.isParameterized ? 'parameterized' : 'mcq')),
    commonMistake: q.commonMistake || 'concept_error',
    variantGroup: q.variantGroup || `${subject}_${chapter}_${concept}`.replace(/[^A-Za-z0-9]+/g, '_'),
    estimatedTime: Number.isFinite(q.estimatedTime) ? q.estimatedTime : ({ easy: 60, medium: 90, hard: 120 }[difficulty]),
    neetWeightage: Number.isFinite(q.neetWeightage) ? q.neetWeightage : (q.pyq ? 3 : 2),
  };
}

function csvRowToQuestion(row, packId, idx) {
  const correctMap = { A: 0, B: 1, C: 2, D: 3 };
  return backfillQuestionMetadata({
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
    concept: row.concept || '',
    subconcept: row.subconcept || '',
    formula: row.formula || '',
    unitType: row.unit_type || row.unittype || row.syllabus_unit || row.unit || 'NCERT',
    questionType: row.question_type || row.questiontype || (row.pyq_year ? 'pyq' : 'mcq'),
    commonMistake: row.common_mistake || row.commonmistake || '',
    variantGroup: row.variant_group || row.variantgroup || '',
    estimatedTime: row.estimated_time ? parseInt(row.estimated_time) : undefined,
    neetWeightage: row.neet_weightage ? parseFloat(row.neet_weightage) : undefined,
  });
}

function bumpVersion(current) {
  // "1.0" -> "1.1", "1.9" -> "1.10". Simple monotonic minor bump.
  if (!current) return '1.0';
  const parts = current.split('.');
  const minor = parseInt(parts[1] || '0') + 1;
  return `${parts[0]}.${minor}`;
}

const STARTER_PACKS = [
  { id: 'pack_physics_core',   name: 'Physics Core',   subject: 'PHYSICS',   file: 'pack_physics_core.csv',   description: 'Foundational Physics — Mechanics, Electricity, Modern Physics' },
  { id: 'pack_chemistry_core', name: 'Chemistry Core', subject: 'CHEMISTRY', file: 'pack_chemistry_core.csv', description: 'Physical, Organic, and Inorganic Chemistry fundamentals' },
  { id: 'pack_biology_core',   name: 'Biology Core',   subject: 'BIOLOGY',   file: 'pack_biology_core.csv',   description: 'Cell Biology, Genetics, Physiology, Ecology fundamentals' },
  { id: 'pack_pyq_highlights', name: 'PYQ Highlights', subject: 'ALL',       file: 'pack_pyq_highlights.csv', description: 'Previous Year Questions across all subjects, 2019-2024' },
];

async function verifyAdmin(uid, sessionToken) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const u = snap.data();
  if (u.sessionToken !== sessionToken || u.role !== 'admin') return null;
  return u;
}

// Writes a new version snapshot + updates the live pack doc in one place
async function saveNewVersion(packId, meta, questions, uid, changeNote, existingHistory) {
  const version = bumpVersion(meta.currentVersion);
  const now = new Date().toISOString();

  // Full snapshot goes into the versions subcollection — never overwritten
  await db.collection('content_packs').doc(packId).collection('versions').doc(version).set({
    version, questions, questionCount: questions.length,
    uploadedAt: now, uploadedBy: uid, changeNote: changeNote || '',
  });

  const historyEntry = { version, questionCount: questions.length, uploadedAt: now, changeNote: changeNote || '' };
  const versionHistory = [...(existingHistory || []), historyEntry];

  await db.collection('content_packs').doc(packId).set({
    id: packId, name: meta.name, subject: meta.subject, description: meta.description,
    source: meta.source, enabled: meta.enabled,
    questionCount: questions.length, questions,
    version, versionHistory,
    updatedAt: now, updatedBy: uid,
    createdAt: meta.createdAt || now,
  }, { merge: false });

  return version;
}

module.exports = async function handler(req, res) {

  // GET — public, merged questions from enabled packs (always serves current live version)
  if (req.method === 'GET') {
    try {
      const snap = await db.collection('content_packs').where('enabled', '==', true).get();
      let questions = [];
      const packMeta = [];
      snap.forEach(doc => {
        const pack = doc.data();
        if (pack.questions) questions = questions.concat(pack.questions);
        packMeta.push({ id: doc.id, name: pack.name, count: pack.questionCount, version: pack.version });
      });
      return res.status(200).json({ questions, activePacks: packMeta, totalQuestions: questions.length });
    } catch (err) {
      return res.status(200).json({ questions: [], activePacks: [], totalQuestions: 0 });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, uid, sessionToken } = req.body || {};

  // SEED — first-time load of bundled starter packs (each becomes v1.0)
  if (action === 'seed_starter_packs') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const results = [];
    for (const pack of STARTER_PACKS) {
      try {
        const existing = await db.collection('content_packs').doc(pack.id).get();
        if (existing.exists) {
          results.push({ id: pack.id, status: 'skipped', reason: 'already exists — use update to add a new version' });
          continue;
        }
        const csvPath = path.join(__dirname, '..', 'data', 'packs', pack.file);
        const csvText = fs.readFileSync(csvPath, 'utf-8');
        const rows = parseCSV(csvText);
        const questions = rows.map((row, i) => csvRowToQuestion(row, pack.id, i));

        const version = await saveNewVersion(
          pack.id,
          { name: pack.name, subject: pack.subject, description: pack.description, source: 'prebuilt', enabled: true, currentVersion: null },
          questions, uid, 'Initial seed', []
        );
        results.push({ id: pack.id, status: 'seeded', count: questions.length, version });
      } catch (err) {
        results.push({ id: pack.id, status: 'error', error: err.message });
      }
    }
    return res.status(200).json({ ok: true, results });
  }

  // ADMIN: list all packs (lightweight — includes version + history summary, no question arrays)
  if (action === 'admin_list') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const snap = await db.collection('content_packs').get();
    const packs = snap.docs.map(d => {
      const p = d.data();
      return {
        id: d.id, name: p.name, subject: p.subject, description: p.description,
        source: p.source, enabled: p.enabled, questionCount: p.questionCount,
        version: p.version, versionHistory: p.versionHistory || [],
        createdAt: p.createdAt, updatedAt: p.updatedAt,
      };
    });
    return res.status(200).json({ packs });
  }

  // ADMIN: upload a brand NEW pack (v1.0)
  if (action === 'admin_upload') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const { name, subject, description, csvText, enabledByDefault } = req.body;
    if (!name || !csvText) return res.status(400).json({ error: 'name and csvText required' });

    const packId = 'pack_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '_' + Date.now().toString(36);
    const rows = parseCSV(csvText);
    if (!rows.length) return res.status(400).json({ error: 'CSV has no valid rows' });
    const questions = rows.map((row, i) => csvRowToQuestion(row, packId, i));

    const version = await saveNewVersion(
      packId,
      { name, subject: subject || 'MIXED', description: description || '', source: 'csv_upload', enabled: enabledByDefault === true, currentVersion: null },
      questions, uid, 'Initial upload', []
    );

    return res.status(200).json({
      ok: true, packId, version, questionCount: questions.length,
      message: `Pack "${name}" created as v${version} with ${questions.length} questions. ${enabledByDefault ? 'Live now.' : 'Disabled — enable when ready.'}`,
    });
  }

  // ADMIN: upload a NEW VERSION of an EXISTING pack — old version preserved, never lost
  if (action === 'admin_upload_version') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const { packId, csvText, changeNote } = req.body;
    if (!packId || !csvText) return res.status(400).json({ error: 'packId and csvText required' });

    const existing = await db.collection('content_packs').doc(packId).get();
    if (!existing.exists) return res.status(404).json({ error: 'Pack not found' });
    const meta = existing.data();

    const rows = parseCSV(csvText);
    if (!rows.length) return res.status(400).json({ error: 'CSV has no valid rows' });
    const questions = rows.map((row, i) => csvRowToQuestion(row, packId, i));

    const version = await saveNewVersion(
      packId,
      { name: meta.name, subject: meta.subject, description: meta.description, source: meta.source, enabled: meta.enabled, currentVersion: meta.version, createdAt: meta.createdAt },
      questions, uid, changeNote || 'Updated content', meta.versionHistory || []
    );

    return res.status(200).json({
      ok: true, packId, version, questionCount: questions.length,
      message: `Pack "${meta.name}" updated to v${version} with ${questions.length} questions. Previous version v${meta.version} preserved and can be restored.`,
    });
  }

  // ADMIN: get full version history for one pack (metadata only, lightweight)
  if (action === 'admin_get_history') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const { packId } = req.body;
    const snap = await db.collection('content_packs').doc(packId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Pack not found' });
    const p = snap.data();
    return res.status(200).json({ currentVersion: p.version, history: p.versionHistory || [] });
  }

  // ADMIN: rollback to a previous version — restores that snapshot as the live version
  if (action === 'admin_rollback') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });

    const { packId, version } = req.body;
    if (!packId || !version) return res.status(400).json({ error: 'packId and version required' });

    const versionSnap = await db.collection('content_packs').doc(packId).collection('versions').doc(version).get();
    if (!versionSnap.exists) return res.status(404).json({ error: `Version ${version} not found` });
    const snapshot = versionSnap.data();

    const packSnap = await db.collection('content_packs').doc(packId).get();
    if (!packSnap.exists) return res.status(404).json({ error: 'Pack not found' });
    const meta = packSnap.data();

    // Rolling back is itself logged as a new history entry, but reuses the OLD question data
    const now = new Date().toISOString();
    const historyEntry = {
      version: meta.version + '→rollback→' + version,
      questionCount: snapshot.questionCount,
      uploadedAt: now,
      changeNote: `Rolled back to v${version}`,
    };
    const versionHistory = [...(meta.versionHistory || []), historyEntry];

    await db.collection('content_packs').doc(packId).update({
      questions: snapshot.questions,
      questionCount: snapshot.questionCount,
      version: version, // now serving the restored version number
      versionHistory,
      updatedAt: now, updatedBy: uid,
    });

    return res.status(200).json({ ok: true, message: `Rolled back to v${version} (${snapshot.questionCount} questions)` });
  }

  // ADMIN: toggle pack on/off
  if (action === 'admin_toggle') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });
    const { packId, enabled } = req.body;
    if (!packId) return res.status(400).json({ error: 'packId required' });
    await db.collection('content_packs').doc(packId).update({ enabled, updatedAt: new Date().toISOString() });
    return res.status(200).json({ ok: true, message: `Pack ${enabled ? 'enabled' : 'disabled'}` });
  }

  // ADMIN: delete pack + all its version history permanently
  if (action === 'admin_delete') {
    const admin = await verifyAdmin(uid, sessionToken);
    if (!admin) return res.status(403).json({ error: 'Admin only' });
    const { packId } = req.body;
    if (!packId) return res.status(400).json({ error: 'packId required' });

    const versionsSnap = await db.collection('content_packs').doc(packId).collection('versions').get();
    const batch = db.batch();
    versionsSnap.forEach(doc => batch.delete(doc.ref));
    batch.delete(db.collection('content_packs').doc(packId));
    await batch.commit();

    return res.status(200).json({ ok: true, message: 'Pack and all version history deleted' });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
