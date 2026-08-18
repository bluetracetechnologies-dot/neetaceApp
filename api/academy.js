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
const { summarizeUsage, daysAgoKey } = require('../lib/usage');
const testSeriesHandler = require('./_test-series');

function generateCode(prefix) {
  return prefix + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function isAcademyTeacher(user) {
  return !!(user.academyId && (user.academyRole === 'teacher' || user.role === 'admin'));
}

function requestError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

async function getOwnedBatch(user, uid, batchId) {
  if (!isAcademyTeacher(user)) throw requestError(403, 'Must be registered as academy teacher');
  if (!batchId) throw requestError(400, 'batchId required');
  const ref = db.collection('academies').doc(user.academyId).collection('batches').doc(batchId);
  const snap = await ref.get();
  if (!snap.exists) throw requestError(404, 'Batch not found');
  const batch = snap.data();
  if (user.role !== 'admin' && batch.createdBy !== uid) throw requestError(403, 'Not your batch');
  return { ref, batch };
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

  // Test-series is part of the academy domain. Keep it behind this existing
  // function instead of creating a 13th deployable /api entry on Vercel Hobby.
  if (testSeriesHandler.actions.has(action)) return testSeriesHandler(req, res);

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
    if (!user.academyId || (user.academyRole !== 'teacher' && user.role !== 'admin'))
      return res.status(403).json({ error: 'Must be registered as academy teacher' });
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

  // ── TEACHER: List only batches created by this teacher ──────────
  if (action === 'list_my_batches') {
    if (!user.academyId || (user.academyRole !== 'teacher' && user.role !== 'admin'))
      return res.status(403).json({ error: 'Must be registered as academy teacher' });

    const [academySnap, batchSnap] = await Promise.all([
      db.collection('academies').doc(user.academyId).get(),
      db.collection('academies').doc(user.academyId).collection('batches')
        .where('createdBy', '==', uid).get(),
    ]);
    if (!academySnap.exists) return res.status(404).json({ error: 'Academy not found' });

    const academy = academySnap.data();
    const batches = batchSnap.docs.map(d => d.data())
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return res.status(200).json({
      ok: true,
      batches,
      seatsUsed: academy.seatsUsed || 0,
      studentCount: academy.studentCount || 0,
    });
  }

  // ── TEACHER: Edit/deactivate a teacher-owned batch ────────────
  if (action === 'update_batch') {
    try {
      const owned = await getOwnedBatch(user, uid, req.body.batchId);
      const updates = {};
      if (req.body.batchName !== undefined) {
        const name = String(req.body.batchName || '').trim().slice(0, 100);
        if (!name) return res.status(400).json({ error: 'batchName cannot be empty' });
        updates.batchName = name;
      }
      if (req.body.subject !== undefined)
        updates.subject = String(req.body.subject || 'ALL').trim().toUpperCase().slice(0, 30) || 'ALL';
      if (req.body.targetYear !== undefined) {
        const year = parseInt(req.body.targetYear);
        if (!Number.isInteger(year) || year < 2025 || year > 2040)
          return res.status(400).json({ error: 'Invalid targetYear' });
        updates.targetYear = year;
      }
      if (req.body.active !== undefined) updates.active = req.body.active === true;
      if (!Object.keys(updates).length) return res.status(400).json({ error: 'No supported updates supplied' });
      updates.updatedAt = new Date().toISOString();
      await owned.ref.update(updates);
      return res.status(200).json({ ok: true, batch: { ...owned.batch, ...updates } });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Could not update batch' });
    }
  }

  // ── TEACHER: View the roster for a teacher-owned batch ────────
  if (action === 'get_batch_roster') {
    try {
      const owned = await getOwnedBatch(user, uid, req.body.batchId);
      const memberSnap = await owned.ref.collection('students').get();
      const profiles = await Promise.all(memberSnap.docs.map(function(member) {
        return db.collection('users').doc(member.id).get();
      }));
      const students = memberSnap.docs.map(function(member, index) {
        const membership = member.data();
        const profile = profiles[index].exists ? profiles[index].data() : {};
        const global = profile.scores && profile.scores.global || {};
        return {
          uid: member.id,
          name: profile.name || membership.name || 'Student',
          email: profile.email || membership.email || '',
          joinedAt: membership.joinedAt || null,
          active: membership.active !== false,
          attempted: global.attempted || profile.totalQuestionsAttempted || 0,
          accuracy: global.accuracy || 0,
          weighted: global.weighted || 0,
          lastSessionAt: profile.lastSessionAt || profile.lastLogin || null,
        };
      }).sort(function(a, b) { return a.name.localeCompare(b.name); });
      return res.status(200).json({ ok: true, batch: owned.batch, students });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Could not load roster' });
    }
  }

  // ── TEACHER: Remove a student and release the academy seat ───
  if (action === 'remove_student') {
    try {
      const owned = await getOwnedBatch(user, uid, req.body.batchId);
      const studentUid = String(req.body.studentUid || '').trim();
      if (!studentUid) return res.status(400).json({ error: 'studentUid required' });
      const academyRef = db.collection('academies').doc(user.academyId);
      const memberRef = owned.ref.collection('students').doc(studentUid);
      const studentRef = db.collection('users').doc(studentUid);
      const removed = await db.runTransaction(async function(transaction) {
        const academySnap = await transaction.get(academyRef);
        const batchSnap = await transaction.get(owned.ref);
        const memberSnap = await transaction.get(memberRef);
        const studentSnap = await transaction.get(studentRef);
        if (!memberSnap.exists) throw requestError(404, 'Student is not in this batch');
        const academy = academySnap.exists ? academySnap.data() : {};
        const batch = batchSnap.exists ? batchSnap.data() : owned.batch;
        const student = studentSnap.exists ? studentSnap.data() : {};
        const isCurrentMembership = student.academyId === user.academyId && student.batchId === req.body.batchId;
        transaction.delete(memberRef);
        transaction.update(owned.ref, { studentCount: Math.max(0, (batch.studentCount || 0) - 1), updatedAt: new Date().toISOString() });
        if (isCurrentMembership) {
          const userUpdates = { academyId: null, academyRole: null, academyName: null, batchId: null, batchCode: null, batchName: null };
          if (student.planKey === 'plan_academy') Object.assign(userUpdates, { paid: false, paidUntil: null, planKey: null });
          transaction.update(studentRef, userUpdates);
          transaction.update(academyRef, { seatsUsed: Math.max(0, (academy.seatsUsed || 0) - 1) });
        }
        return isCurrentMembership;
      });
      return res.status(200).json({ ok: true, seatReleased: removed });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Could not remove student' });
    }
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
    if (user.academyId && user.academyId !== batch.academyId)
      return res.status(409).json({ error: 'You already belong to another academy. Ask that academy to remove you first.' });

    const academyRef = db.collection('academies').doc(batch.academyId);
    const userRef = db.collection('users').doc(uid);
    const memberRef = batchDoc.ref.collection('students').doc(uid);
    try {
      const result = await db.runTransaction(async function(transaction) {
        const acadSnap = await transaction.get(academyRef);
        const targetBatchSnap = await transaction.get(batchDoc.ref);
        const targetMemberSnap = await transaction.get(memberRef);
        if (!acadSnap.exists) throw requestError(404, 'Academy not found');
        if (!targetBatchSnap.exists || targetBatchSnap.data().active === false) throw requestError(404, 'Batch is inactive');
        const acad = acadSnap.data();
        const targetBatch = targetBatchSnap.data();
        const sameAcademy = user.academyId === batch.academyId;
        const movingBatch = sameAcademy && user.batchId && user.batchId !== batchDoc.id;
        let oldBatchRef = null, oldBatchSnap = null, oldMemberRef = null, oldMemberSnap = null;
        if (movingBatch) {
          oldBatchRef = db.collection('academies').doc(batch.academyId).collection('batches').doc(user.batchId);
          oldMemberRef = oldBatchRef.collection('students').doc(uid);
          oldBatchSnap = await transaction.get(oldBatchRef);
          oldMemberSnap = await transaction.get(oldMemberRef);
        }

        const needsMembership = !targetMemberSnap.exists;
        const needsSeat = !sameAcademy && needsMembership;
        const seats = acad.studentCount || 0;
        const used = acad.seatsUsed || 0;
        if (needsSeat && used >= seats)
          throw requestError(403, 'Seat limit reached (' + used + '/' + seats + '). Ask your academy to add more seats.');

        const now = new Date().toISOString();
        if (movingBatch && oldMemberSnap && oldMemberSnap.exists) {
          transaction.delete(oldMemberRef);
          if (oldBatchSnap && oldBatchSnap.exists)
            transaction.update(oldBatchRef, { studentCount: Math.max(0, (oldBatchSnap.data().studentCount || 0) - 1), updatedAt: now });
        }
        if (needsMembership) {
          transaction.set(memberRef, { uid, email: user.email, name: user.name, joinedAt: now, active: true });
          transaction.update(batchDoc.ref, { studentCount: (targetBatch.studentCount || 0) + 1, updatedAt: now });
        }
        if (needsSeat) transaction.update(academyRef, { seatsUsed: used + 1 });

        const userUpdate = {
          academyId: batch.academyId, batchId: batchDoc.id,
          batchCode: targetBatch.batchCode, batchName: targetBatch.batchName, academyRole: 'student',
          academyName: acad.name,
        };
        if (acad.paid) {
          const exp = new Date(); exp.setMonth(exp.getMonth() + 10);
          userUpdate.paid = true; userUpdate.paidUntil = exp.toISOString(); userUpdate.planKey = 'plan_academy';
        }
        transaction.update(userRef, userUpdate);
        return { batchName: targetBatch.batchName, alreadyJoined: !needsMembership };
      });
      return res.status(200).json({ ok: true, batchName: result.batchName, alreadyJoined: result.alreadyJoined });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Could not join batch' });
    }
  }

  // ── WEEKLY USAGE: teacher-owned batch or founder-wide view ─────
  if (action === 'get_usage_summary') {
    const days = Math.max(1, Math.min(31, parseInt(req.body.days) || 7));
    const startDate = daysAgoKey(days - 1);
    const batchId = cleanText(req.body.batchId, 100);
    const academyId = cleanText(req.body.academyId, 100);
    let query = db.collection('usage_daily');
    let ownedBatch = null;
    if (user.role === 'admin') {
      if (batchId) query = query.where('batchId', '==', batchId);
      else if (academyId) query = query.where('academyId', '==', academyId);
      else query = query.where('date', '>=', startDate);
    } else {
      try {
        ownedBatch = await getOwnedBatch(user, uid, batchId);
      } catch (error) {
        return res.status(error.status || 500).json({ error: error.message || 'Could not load usage' });
      }
      query = query.where('academyId', '==', user.academyId).where('batchId', '==', batchId);
    }
    const usageSnap = await query.limit(1000).get();
    const summary = summarizeUsage(usageSnap.docs, startDate);
    if (ownedBatch) {
      const rosterSnap = await ownedBatch.ref.collection('students').get();
      const activeIds = new Set(summary.students.map(function(s) { return s.uid; }));
      summary.assignedStudents = rosterSnap.size;
      summary.inactiveStudents = rosterSnap.docs.filter(function(member) { return !activeIds.has(member.id); }).map(function(member) {
        const data = member.data();
        return { uid: member.id, name: cleanText(data.name || 'Student', 100), joinedAt: data.joinedAt || null };
      });
    }
    return res.status(200).json({ ok: true, days, summary });
  }

  // ── STUDENT: escalate an AI question to the assigned teacher ──
  if (action === 'raise_doubt') {
    if (user.academyRole !== 'student' || !user.academyId || !user.batchId)
      return res.status(403).json({ error: 'Join an academy batch to ask its teacher' });
    const question = cleanText(req.body.question, 1200);
    if (!question) return res.status(400).json({ error: 'question required' });
    const batchRef = db.collection('academies').doc(user.academyId).collection('batches').doc(user.batchId);
    const batchSnap = await batchRef.get();
    if (!batchSnap.exists || batchSnap.data().active === false) return res.status(404).json({ error: 'Active batch not found' });
    const existingSnap = await db.collection('academy_doubts').where('studentUid', '==', uid).limit(30).get();
    const openCount = existingSnap.docs.filter(function(d) { return d.data().status === 'open'; }).length;
    if (openCount >= 10) return res.status(429).json({ error: 'Please wait for a teacher reply to an existing doubt' });
    const batch = batchSnap.data();
    const ref = db.collection('academy_doubts').doc();
    const now = new Date().toISOString();
    const doubt = {
      id: ref.id, academyId: user.academyId, batchId: user.batchId,
      batchName: cleanText(batch.batchName, 100), teacherUid: batch.createdBy,
      studentUid: uid, studentName: cleanText(user.name || 'Student', 100),
      subject: cleanText(req.body.subject, 20).toUpperCase(),
      chapter: cleanText(req.body.chapter, 100), question,
      aiAnswer: cleanText(req.body.aiAnswer, 1800),
      status: 'open', teacherReply: '', createdAt: now, updatedAt: now,
      resolvedAt: null,
    };
    await ref.set(doubt);
    return res.status(200).json({ ok: true, doubt });
  }

  if (action === 'list_my_doubts') {
    const doubtSnap = await db.collection('academy_doubts').where('studentUid', '==', uid).limit(50).get();
    const doubts = doubtSnap.docs.map(function(d) { return d.data(); })
      .sort(function(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    return res.status(200).json({ ok: true, doubts });
  }

  if (action === 'list_batch_doubts') {
    try {
      await getOwnedBatch(user, uid, req.body.batchId);
      const doubtSnap = await db.collection('academy_doubts').where('batchId', '==', req.body.batchId).limit(100).get();
      const doubts = doubtSnap.docs.map(function(d) { return d.data(); })
        .filter(function(d) { return d.academyId === user.academyId; })
        .sort(function(a, b) {
          if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
          return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        });
      return res.status(200).json({ ok: true, doubts });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Could not load doubts' });
    }
  }

  if (action === 'resolve_doubt') {
    const doubtId = cleanText(req.body.doubtId, 120);
    const teacherReply = cleanText(req.body.teacherReply, 1800);
    if (!doubtId || !teacherReply) return res.status(400).json({ error: 'doubtId and teacherReply required' });
    const doubtRef = db.collection('academy_doubts').doc(doubtId);
    const doubtSnap = await doubtRef.get();
    if (!doubtSnap.exists) return res.status(404).json({ error: 'Doubt not found' });
    const doubt = doubtSnap.data();
    if (doubt.academyId !== user.academyId) return res.status(403).json({ error: 'Not your academy doubt' });
    try {
      await getOwnedBatch(user, uid, doubt.batchId);
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Could not answer doubt' });
    }
    const now = new Date().toISOString();
    await doubtRef.update({ teacherReply, status: 'resolved', resolvedAt: now, updatedAt: now, resolvedBy: uid });
    return res.status(200).json({ ok: true, doubt: { ...doubt, teacherReply, status: 'resolved', resolvedAt: now } });
  }

  // ── BATCH LEADERBOARD ─────────────────────────────────
  if (action === 'batch_leaderboard') {
    const { batchId, academyId } = req.body;
    if (!batchId || !academyId) return res.status(400).json({ error: 'batchId and academyId required' });
    const requestedBatchRef = db.collection('academies').doc(academyId).collection('batches').doc(batchId);
    const requestedBatchSnap = await requestedBatchRef.get();
    if (!requestedBatchSnap.exists) return res.status(404).json({ error: 'Batch not found' });
    const requestedBatch = requestedBatchSnap.data();
    const teacherAccess = isAcademyTeacher(user) && user.academyId === academyId && (user.role === 'admin' || requestedBatch.createdBy === uid);
    const studentAccess = user.academyRole === 'student' && user.academyId === academyId && user.batchId === batchId;
    if (user.role !== 'admin' && !teacherAccess && !studentAccess)
      return res.status(403).json({ error: 'Not allowed to view this leaderboard' });
    const studSnap = await requestedBatchRef.collection('students').get();
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
