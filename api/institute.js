// api/institute.js
// Handles institute/college/city-level competition architecture
//
// HIERARCHY:
//   Platform (NEETAce)
//     └── Organisation (Institute / College / City)
//           └── Batch (Class / Division / Year)
//                 └── Student
//
// Org types: coaching_institute | college | city | district | state
//
// Admin creates org → gets ORG_CODE
// Teacher creates batch within org → gets BATCH_CODE
// Students join with BATCH_CODE
// Leaderboards visible at: student → batch → org → platform levels

const { db } = require('./_firebase');
const crypto = require('crypto');

function generateCode(prefix, len=6) {
  return prefix + crypto.randomBytes(len).toString('hex').toUpperCase().slice(0,len);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, uid, sessionToken } = req.body || {};
  if (!uid || !sessionToken) return res.status(400).json({ error: 'uid and sessionToken required' });

  // Verify session
  const uSnap = await db.collection('users').doc(uid).get();
  if (!uSnap.exists) return res.status(404).json({ error: 'User not found' });
  const user = uSnap.data();
  if (user.sessionToken !== sessionToken) return res.status(401).json({ error: 'Invalid session' });

  try {

    // ─────────────────────────────────────────────
    // CREATE ORGANISATION (admin or teacher)
    // ─────────────────────────────────────────────
    if (action === 'create_org') {
      const { name, type, city, state, contactEmail, contactPhone } = req.body;
      if (!name || !type) return res.status(400).json({ error: 'name and type required' });

      const orgCode = generateCode('ORG');
      const orgRef = db.collection('organisations').doc();
      await orgRef.set({
        id: orgRef.id,
        orgCode,
        name, type, city, state,
        contactEmail, contactPhone,
        createdBy: uid,
        createdAt: new Date().toISOString(),
        studentCount: 0,
        batchCount: 0,
        active: true,
        plan: 'institute',
        paidStudents: 0,
        paidUntil: null,
      });

      // Give creator org-admin role
      await db.collection('users').doc(uid).update({
        orgId: orgRef.id, orgCode, orgRole: 'org_admin', orgName: name,
      });

      return res.status(200).json({ ok: true, orgId: orgRef.id, orgCode, message: `Organisation "${name}" created. Share code: ${orgCode}` });
    }

    // ─────────────────────────────────────────────
    // CREATE BATCH within org
    // ─────────────────────────────────────────────
    if (action === 'create_batch') {
      const { orgId, batchName, targetYear, subject } = req.body;
      if (!orgId || !batchName) return res.status(400).json({ error: 'orgId and batchName required' });

      const batchCode = generateCode('BT');
      const batchRef = db.collection('organisations').doc(orgId).collection('batches').doc();
      await batchRef.set({
        id: batchRef.id,
        batchCode, batchName,
        orgId, targetYear: targetYear || 2026,
        subject: subject || 'ALL',
        createdBy: uid,
        createdAt: new Date().toISOString(),
        studentCount: 0,
        active: true,
      });

      await db.collection('users').doc(uid).update({ batchId: batchRef.id, batchCode, batchName });

      return res.status(200).json({ ok: true, batchId: batchRef.id, batchCode, message: `Batch "${batchName}" created. Student join code: ${batchCode}` });
    }

    // ─────────────────────────────────────────────
    // STUDENT JOINS BATCH with batch code
    // ─────────────────────────────────────────────
    if (action === 'join_batch') {
      const { batchCode } = req.body;
      if (!batchCode) return res.status(400).json({ error: 'batchCode required' });

      // Find batch by code across all orgs
      const batchQuery = await db.collectionGroup('batches')
        .where('batchCode', '==', batchCode.toUpperCase())
        .where('active', '==', true)
        .limit(1).get();

      if (batchQuery.empty) return res.status(404).json({ error: 'Invalid batch code. Check with your teacher.' });

      const batchDoc = batchQuery.docs[0];
      const batch = batchDoc.data();
      const orgId = batch.orgId;

      // Add student to batch
      await batchDoc.ref.collection('students').doc(uid).set({
        uid, email: user.email, name: user.name,
        joinedAt: new Date().toISOString(), active: true,
      });

      // Update student profile
      await db.collection('users').doc(uid).update({
        orgId, batchId: batchDoc.id, batchCode: batch.batchCode,
        batchName: batch.batchName, orgRole: 'student',
      });

      // Increment batch student count
      await batchDoc.ref.update({ studentCount: (batch.studentCount || 0) + 1 });

      return res.status(200).json({ ok: true, batchName: batch.batchName, message: `Joined batch "${batch.batchName}" successfully!` });
    }

    // ─────────────────────────────────────────────
    // BATCH LEADERBOARD
    // ─────────────────────────────────────────────
    if (action === 'batch_leaderboard') {
      const { batchId, orgId, subject } = req.body;
      if (!batchId || !orgId) return res.status(400).json({ error: 'batchId and orgId required' });

      const studentsSnap = await db.collection('organisations').doc(orgId)
        .collection('batches').doc(batchId)
        .collection('students').where('active', '==', true).get();

      const studentUids = studentsSnap.docs.map(d => d.id);
      if (studentUids.length === 0) return res.status(200).json({ leaderboard: [] });

      // Get scores for each student
      const scorePromises = studentUids.map(suid =>
        db.collection('users').doc(suid).get()
      );
      const snapshots = await Promise.all(scorePromises);

      const board = snapshots
        .filter(s => s.exists)
        .map(s => {
          const d = s.data();
          const sub = subject || 'global';
          const scores = d.scores || {};
          return {
            uid: d.uid, name: d.name,
            weighted: scores[sub]?.weighted || 0,
            accuracy: scores[sub]?.accuracy || 0,
            attempted: scores[sub]?.attempted || 0,
            currentLevel: scores[sub]?.currentLevel || 0,
          };
        })
        .filter(s => s.attempted >= 5)
        .sort((a, b) => b.weighted - a.weighted)
        .map((s, i) => ({ ...s, rank: i + 1 }));

      return res.status(200).json({ leaderboard: board });
    }

    // ─────────────────────────────────────────────
    // ORG LEADERBOARD — compete between batches
    // ─────────────────────────────────────────────
    if (action === 'org_leaderboard') {
      const { orgId } = req.body;
      if (!orgId) return res.status(400).json({ error: 'orgId required' });

      const batchesSnap = await db.collection('organisations').doc(orgId)
        .collection('batches').where('active', '==', true).get();

      const batchStats = await Promise.all(batchesSnap.docs.map(async bDoc => {
        const batch = bDoc.data();
        const studSnap = await bDoc.ref.collection('students').get();
        const uids = studSnap.docs.map(d => d.id);
        let totalWeighted = 0, count = 0;
        const scoreSnaps = await Promise.all(uids.map(u => db.collection('users').doc(u).get()));
        scoreSnaps.forEach(s => {
          if (s.exists && s.data().scores?.global?.weighted) {
            totalWeighted += s.data().scores.global.weighted;
            count++;
          }
        });
        return {
          batchId: bDoc.id, batchName: batch.batchName,
          studentCount: uids.length,
          avgScore: count > 0 ? Math.round(totalWeighted / count) : 0,
          totalWeighted,
        };
      }));

      return res.status(200).json({
        leaderboard: batchStats.sort((a, b) => b.avgScore - a.avgScore).map((b, i) => ({ ...b, rank: i + 1 }))
      });
    }

    // ─────────────────────────────────────────────
    // CITY / STATE LEADERBOARD
    // ─────────────────────────────────────────────
    if (action === 'city_leaderboard') {
      const { city, state } = req.body;
      const query = city
        ? db.collection('organisations').where('city', '==', city).where('active', '==', true)
        : db.collection('organisations').where('state', '==', state).where('active', '==', true);

      const orgsSnap = await query.get();
      const orgStats = orgsSnap.docs.map(d => ({
        orgId: d.id, name: d.data().name,
        city: d.data().city, studentCount: d.data().studentCount || 0,
      }));
      return res.status(200).json({ organisations: orgStats });
    }

    // ─────────────────────────────────────────────
    // INSTITUTE PAYMENT — bulk student payment
    // ─────────────────────────────────────────────
    if (action === 'institute_payment_status') {
      const { orgId } = req.body;
      const orgSnap = await db.collection('organisations').doc(orgId).get();
      if (!orgSnap.exists) return res.status(404).json({ error: 'Organisation not found' });
      return res.status(200).json({ org: orgSnap.data() });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('institute error', err);
    return res.status(500).json({ error: err.message });
  }
};
