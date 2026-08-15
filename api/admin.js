// api/admin.js
// POST { action, uid, sessionToken, targetUid?, ... }
// Actions: list_users | disable | enable | grant_pro | kill_all | set_expiry
// Only works if the calling user's Firestore role === 'admin'
const { db } = require('./_firebase');

const ADMIN_EMAIL = 'bluetracetechnologies@gmail.com';

function nextMay31(fromDate) {
  const d = fromDate || new Date();
  let may31 = new Date(d.getFullYear(), 4, 31, 23, 59, 59);
  if (d > may31) may31 = new Date(d.getFullYear() + 1, 4, 31, 23, 59, 59);
  return may31;
}

async function verifyAdmin(uid, sessionToken) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const p = snap.data();
  if (p.sessionToken !== sessionToken) return null;
  if (p.role !== 'admin') return null;
  return p;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, uid, sessionToken, targetUid, days } = req.body || {};
  if (!uid || !sessionToken || !action) return res.status(400).json({ error: 'uid, sessionToken, action required' });

  const admin = await verifyAdmin(uid, sessionToken);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });

  try {
    if (action === 'list_users') {
      const snap = await db.collection('users').get();
      const users = snap.docs.map(d => {
        const u = d.data();
        const now = new Date();
        let status = 'active';
        if (u.role === 'admin') status = 'admin';
        else if (u.disabled) status = 'disabled';
        else if (u.paid && u.paidUntil && now <= new Date(u.paidUntil)) status = 'paid';
        else if (u.trialEnd && now <= new Date(u.trialEnd)) status = 'trial';
        else status = 'expired';
        return { uid: u.uid, email: u.email, name: u.name, role: u.role, status, paidUntil: u.paidUntil, trialEnd: u.trialEnd, disabled: u.disabled };
      });
      return res.status(200).json({ users });
    }

    if (action === 'disable') {
      if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
      await db.collection('users').doc(targetUid).update({ disabled: true, sessionToken: null });
      return res.status(200).json({ ok: true, message: 'User disabled and session killed' });
    }

    if (action === 'enable') {
      if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
      await db.collection('users').doc(targetUid).update({ disabled: false });
      return res.status(200).json({ ok: true, message: 'User re-enabled' });
    }

    if (action === 'grant_pro') {
      if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
      const paidUntil = nextMay31();
      await db.collection('users').doc(targetUid).update({ paid: true, paidUntil: paidUntil.toISOString(), disabled: false });
      return res.status(200).json({ ok: true, paidUntil: paidUntil.toISOString() });
    }

    if (action === 'kill_all') {
      const snap = await db.collection('users').get();
      const batch = db.batch();
      snap.docs.forEach(d => {
        if (d.data().role !== 'admin') batch.update(d.ref, { disabled: true, sessionToken: null });
      });
      await batch.commit();
      return res.status(200).json({ ok: true, message: 'All non-admin users disabled' });
    }

    if (action === 'set_expiry') {
      const d = days || 7;
      const exp = new Date(); exp.setDate(exp.getDate() + d);
      const snap = await db.collection('users').get();
      const batch = db.batch();
      snap.docs.forEach(doc => {
        if (doc.data().role !== 'admin') batch.update(doc.ref, { trialEnd: exp.toISOString(), paid: false, paidUntil: null });
      });
      await batch.commit();
      return res.status(200).json({ ok: true, expiresAt: exp.toISOString() });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('admin error', err);
    return res.status(500).json({ error: 'Admin action failed' });
  }
};
