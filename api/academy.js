// api/academy.js
// Academy Partner System - replaces "institute.js" conceptually but extends it.
// The word "Academy" covers: coaching centre, school, college, tuition class, district centre.
//
// B2B PRICING MODEL (all admin-controlled, no code changes):
//   Base price per student = config/academy.pricePerStudent (default ₹499)
//   Discount tiers (admin sets):
//     10-24  students → 0%   off  (₹499/student)
//     25-49  students → 10%  off  (₹449/student)
//     50-99  students → 20%  off  (₹399/student)
//     100+   students → 30%  off  (₹349/student)
//   Admin can override for specific academies (flat deal price)
//
// ACADEMY TYPES (for display/categorization - no functional difference):
//   coaching | school | college | tuition | district | state
//
// FLOW:
//   1. Admin creates academy → gets ACADEMY_CODE + Razorpay link
//   2. Teacher registers using ACADEMY_CODE → becomes academy_admin
//   3. Teacher creates batches (divisions/years/subjects)
//   4. Students join with BATCH_CODE
//   5. Admin can see all academies, their student counts, payment status

const { db } = require('./_firebase');
const crypto  = require('crypto');

function generateCode(prefix) {
  return prefix + crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function getAcademyConfig() {
  try {
    const snap = await db.collection('config').doc('academy').get();
    return snap.exists ? snap.data() : DEFAULT_ACADEMY_CONFIG;
  } catch(e) { return DEFAULT_ACADEMY_CONFIG; }
}

const DEFAULT_ACADEMY_CONFIG = {
  pricePerStudent: 49900, // ₹499 in paise
  discountTiers: [
    { minStudents: 10,  maxStudents: 24,  discountPct: 0  },
    { minStudents: 25,  maxStudents: 49,  discountPct: 10 },
    { minStudents: 50,  maxStudents: 99,  discountPct: 20 },
    { minStudents: 100, maxStudents: 9999,discountPct: 30 },
  ],
  minStudents: 10,
  features: ['all_levels','ai_tutor','adaptive','galti_copy','batch_leaderboard','teacher_dashboard','progress_reports'],
};

function computePricing(studentCount, config) {
  const base = config.pricePerStudent || 49900;
  const tier = config.discountTiers?.find(t => studentCount >= t.minStudents && studentCount <= t.maxStudents);
  const discountPct = tier?.discountPct || 0;
  const pricePerStudent = Math.round(base * (1 - discountPct/100));
  const totalPaise = pricePerStudent * studentCount;
  return {
    studentCount,
    pricePerStudent,
    pricePerStudentRupees: pricePerStudent / 100,
    discountPct,
    totalPaise,
    totalRupees: totalPaise / 100,
    savingsRupees: (base - pricePerStudent) / 100 * studentCount,
    tier: tier ? `${tier.minStudents}-${tier.maxStudents === 9999 ? '∞' : tier.maxStudents} students` : null,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, uid, sessionToken } = req.body || {};
  if (!uid || !sessionToken) return res.status(400).json({ error: 'Auth required' });

  const uSnap = await db.collection('users').doc(uid).get();
  if (!uSnap.exists) return res.status(404).json({ error: 'User not found' });
  const user = uSnap.data();
  if (user.sessionToken !== sessionToken) return res.status(401).json({ error: 'Invalid session' });

  const config = await getAcademyConfig();

  // ── PUBLIC: Get pricing quote ─────────────────────────
  if (action === 'get_quote') {
    const { studentCount = 30 } = req.body;
    if (studentCount < (config.minStudents || 10))
      return res.status(400).json({ error: `Minimum ${config.minStudents} students for Academy plan` });
    const pricing = computePricing(studentCount, config);
    return res.status(200).json({ ok: true, pricing, config });
  }

  // ── ADMIN: Create a new academy ───────────────────────
  if (action === 'admin_create') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { name, type='coaching', city, state, contactName, contactEmail, contactPhone,
            studentCount, customPricePerStudent, notes } = req.body;
    if (!name || !studentCount) return res.status(400).json({ error: 'name and studentCount required' });

    const academyCode = generateCode('ACY');
    const pricing = customPricePerStudent
      ? { pricePerStudent: customPricePerStudent*100, totalRupees: customPricePerStudent*studentCount, discountPct: 0, studentCount }
      : computePricing(studentCount, config);

    const ref = db.collection('academies').doc();
    await ref.set({
      id: ref.id,
      academyCode, name, type, city, state,
      contactName, contactEmail, contactPhone,
      studentCount, notes: notes||'',
      // Branding (co-branding for B2B marketing)
      branding: {
        logoUrl: req.body.logoUrl || '',       // academy logo URL (optional)
        bannerText: req.body.bannerText || '',  // e.g. "Powered by Parbhani Medical Academy"
        bannerColor: req.body.bannerColor || '#0d9488',
        showLogo: !!(req.body.logoUrl),
      },
      // Per-academy feature overrides (null = use global defaults)
      featureOverrides: req.body.featureOverrides || null,
      // Per-academy trial override
      trialOverride: req.body.trialOverride || null,
      pricing,
      customPrice: !!customPricePerStudent,
      status: 'pending', // pending | active | expired
      paid: false, paidAt: null, paidAmount: null,
      batchCount: 0, activeStudents: 0, seatsUsed: 0,
      createdAt: new Date().toISOString(),
      createdBy: uid,
    });

    return res.status(200).json({
      ok: true,
      academyId: ref.id,
      academyCode,
      pricing,
      message: `Academy "${name}" created. Code: ${academyCode}. Share with teacher to register.`,
    });
  }

  // ── ADMIN: List all academies ─────────────────────────
  if (action === 'admin_list') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const snap = await db.collection('academies').orderBy('createdAt','desc').limit(50).get();
    return res.status(200).json({
      academies: snap.docs.map(d => d.data()),
      total: snap.docs.length,
    });
  }

  // ── ADMIN: Update academy status / pricing ────────────
  if (action === 'admin_update') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { academyId, updates } = req.body;
    if (!academyId) return res.status(400).json({ error: 'academyId required' });
    await db.collection('academies').doc(academyId).update({ ...updates, updatedAt: new Date().toISOString() });
    return res.status(200).json({ ok: true });
  }

  // ── ADMIN: Mark academy as paid ───────────────────────
  if (action === 'admin_mark_paid') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { academyId, amountPaid } = req.body;
    const aSnap = await db.collection('academies').doc(academyId).get();
    if (!aSnap.exists) return res.status(404).json({ error: 'Academy not found' });
    const academy = aSnap.data();

    // Activate all students in this academy
    const batchSnap = await db.collection('academies').doc(academyId).collection('batches').get();
    const expiry = new Date(); expiry.setMonth(expiry.getMonth() + 10); // 10 months
    const batch = db.batch();
    let studentCount = 0;
    for (const bDoc of batchSnap.docs) {
      const studSnap = await bDoc.ref.collection('students').get();
      studSnap.docs.forEach(sDoc => {
        batch.update(db.collection('users').doc(sDoc.id), {
          paid: true, paidUntil: expiry.toISOString(), planKey: 'plan_academy',
        });
        studentCount++;
      });
    }
    batch.update(db.collection('academies').doc(academyId), {
      paid: true, paidAt: new Date().toISOString(), paidAmount: amountPaid||0,
      status: 'active', activeStudents: studentCount,
    });
    await batch.commit();
    return res.status(200).json({ ok: true, activatedStudents: studentCount });
  }

  // ── ADMIN: Update global academy pricing config ───────
  if (action === 'admin_update_config') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { pricePerStudent, discountTiers, minStudents } = req.body;
    const update = {};
    if (pricePerStudent) update.pricePerStudent = pricePerStudent * 100; // convert ₹ to paise
    if (discountTiers)   update.discountTiers   = discountTiers;
    if (minStudents)     update.minStudents      = minStudents;
    await db.collection('config').doc('academy').set({ ...DEFAULT_ACADEMY_CONFIG, ...update });
    return res.status(200).json({ ok: true, message: 'Academy pricing config updated' });
  }

  // ── TEACHER: Register as academy teacher using ACADEMY_CODE ──
  if (action === 'teacher_register') {
    const { academyCode } = req.body;
    if (!academyCode) return res.status(400).json({ error: 'academyCode required' });
    const snap = await db.collection('academies').where('academyCode','==',academyCode.toUpperCase()).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'Invalid academy code' });
    const academy = snap.docs[0];
    await db.collection('users').doc(uid).update({
      academyId: academy.id, academyCode, academyRole: 'teacher',
      academyName: academy.data().name,
    });
    return res.status(200).json({ ok: true, academy: academy.data(), message: `You are now a teacher at "${academy.data().name}"` });
  }

  // ── TEACHER: Create a batch ───────────────────────────
  if (action === 'create_batch') {
    if (!user.academyId) return res.status(403).json({ error: 'Must be registered as academy teacher' });
    const { batchName, subject='ALL', targetYear } = req.body;
    if (!batchName) return res.status(400).json({ error: 'batchName required' });
    const batchCode = generateCode('BT');
    const ref = db.collection('academies').doc(user.academyId).collection('batches').doc();
    await ref.set({
      id: ref.id, batchCode, batchName, subject,
      targetYear: targetYear || new Date().getFullYear(),
      academyId: user.academyId, createdBy: uid,
      studentCount: 0, active: true,
      createdAt: new Date().toISOString(),
    });
    await db.collection('users').doc(uid).update({ batchId: ref.id, batchCode, batchName });
    return res.status(200).json({ ok: true, batchCode, batchId: ref.id, message: `Batch "${batchName}" created. Student join code: ${batchCode}` });
  }

  // ── STUDENT: Join a batch ─────────────────────────────
  if (action === 'join_batch') {
    const { batchCode } = req.body;
    if (!batchCode) return res.status(400).json({ error: 'batchCode required' });
    const snap = await db.collectionGroup('batches')
      .where('batchCode','==',batchCode.toUpperCase()).where('active','==',true).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'Invalid batch code. Check with your teacher.' });
    const batchDoc = snap.docs[0];
    const batch = batchDoc.data();

    // SEAT ENFORCEMENT: academy bought N seats - block joins beyond that.
    const acadSnap = await db.collection('academies').doc(batch.academyId).get();
    if (!acadSnap.exists) return res.status(404).json({ error: 'Academy not found' });
    const acad = acadSnap.data();
    const seats = acad.studentCount || 0;
    const used  = acad.seatsUsed || 0;
    const alreadyMember = user.academyId === batch.academyId; // re-joining another batch = no new seat
    if (!alreadyMember && used >= seats) {
      return res.status(403).json({ error: 'Seat limit reached (' + used + '/' + seats + '). Ask your academy to add more seats.' });
    }
    if (!alreadyMember) {
      await db.collection('academies').doc(batch.academyId).update({ seatsUsed: used + 1 });
    }

    await batchDoc.ref.collection('students').doc(uid).set({
      uid, email: user.email, name: user.name, joinedAt: new Date().toISOString(), active: true,
    });
    const userUpdate = {
      academyId: batch.academyId, batchId: batchDoc.id,
      batchCode: batch.batchCode, batchName: batch.batchName, academyRole: 'student',
      academyName: acad.name,
    };
    // Late joiner into an already-paid academy → activate immediately
    if (acad.paid) {
      const exp = new Date(); exp.setMonth(exp.getMonth() + 10);
      userUpdate.paid = true; userUpdate.paidUntil = exp.toISOString(); userUpdate.planKey = 'plan_academy';
    }
    await db.collection('users').doc(uid).update(userUpdate);
    await batchDoc.ref.update({ studentCount: (batch.studentCount||0)+1 });
    return res.status(200).json({ ok: true, batchName: batch.batchName });
  }

  // ── BATCH LEADERBOARD ─────────────────────────────────
  if (action === 'batch_leaderboard') {
    const { batchId, academyId } = req.body;
    if (!batchId || !academyId) return res.status(400).json({ error: 'batchId and academyId required' });
    const studSnap = await db.collection('academies').doc(academyId)
      .collection('batches').doc(batchId).collection('students').get();
    const uids = studSnap.docs.map(d=>d.id);
    if (!uids.length) return res.status(200).json({ leaderboard: [] });
    const snaps = await Promise.all(uids.map(u => db.collection('users').doc(u).get()));
    const board = snaps.filter(s=>s.exists).map(s=>{
      const d=s.data();
      return { uid:d.uid, name:d.name, weighted:d.scores?.global?.weighted||0,
               accuracy:d.scores?.global?.accuracy||0, attempted:d.scores?.global?.attempted||0 };
    }).filter(s=>s.attempted>=5).sort((a,b)=>b.weighted-a.weighted).map((s,i)=>({...s,rank:i+1}));
    return res.status(200).json({ leaderboard: board });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
