// api/auth.js — merged auth endpoints
// POST { action: 'register' | 'login' | 'verify', ... }
const { auth, db } = require('./_firebase');
const ADMIN_EMAIL = 'bluetracetechnologies@gmail.com';

function nextMay31(d) {
  d = d || new Date();
  let may31 = new Date(d.getFullYear(), 4, 31, 23, 59, 59);
  if (d > may31) may31 = new Date(d.getFullYear() + 1, 4, 31, 23, 59, 59);
  return may31;
}

async function getFreeLevel() {
  try {
    const snap = await db.collection('config').doc('levels').get();
    const list = snap.exists && snap.data().list ? snap.data().list : null;
    if (list) return list.find(l => l.isFree) || null;
  } catch (e) {}
  return { enabled: true, maxFreeDays: 7 };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const action = body.action || 'login';

  // ── REGISTER ──
  if (action === 'register') {
    const { email, password, name, uid } = body;
    if (!email || !name) return res.status(400).json({ error: 'email and name required' });
    try {
      let userUid = uid;
      if (!uid) {
        if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
        const rec = await auth.createUser({ email, password, displayName: name });
        userUid = rec.uid;
      }
      const existing = await db.collection('users').doc(userUid).get();
      if (existing.exists) return res.status(200).json({ ok: true });
      const now = new Date();
      // Admin-configurable trial duration
      let trialDays = 7;
      try {
        const tcSnap = await db.collection('config').doc('trial').get();
        if (tcSnap.exists) trialDays = tcSnap.data().days || 7;
      } catch(e) {}
      const trialEnd = new Date(now); trialEnd.setDate(trialEnd.getDate() + trialDays);
      const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      await db.collection('users').doc(userUid).set({
        uid: userUid, email, name,
        role: isAdmin ? 'admin' : 'user',
        trialStart: now.toISOString(), trialEnd: trialEnd.toISOString(),
        paid: isAdmin, paidUntil: null, disabled: false, sessionToken: null,
        createdAt: now.toISOString(), authProvider: uid ? 'google' : 'email',
        phone: '', parentPhone: '', parentName: '', parentEmail: '',
        notifPrefs: { email: true, whatsapp: true, parent: true },
      });
      if (!isAdmin) {
        try { const { dispatch } = require('./notifications'); dispatch(userUid, 'trial_started').catch(() => {}); } catch(e) {}
      }
      return res.status(200).json({ ok: true, message: 'Account created.' });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') return res.status(409).json({ error: 'An account with this email already exists.' });
      return res.status(500).json({ error: 'Registration failed: ' + err.message });
    }
  }

  // ── LOGIN ──
  if (action === 'login') {
    const { idToken } = body;
    if (!idToken) return res.status(400).json({ error: 'idToken required' });
    try {
      const decoded = await auth.verifyIdToken(idToken);
      const uid2 = decoded.uid;
      const snap = await db.collection('users').doc(uid2).get();
      if (!snap.exists) return res.status(404).json({ error: 'Account not found. Please register first.' });
      const profile = snap.data();
      if (profile.disabled) return res.status(403).json({ error: 'Your account has been disabled by the admin.' });
      const crypto = require('crypto');
      // ── SINGLE DEVICE: confirm before replacing ──
      const existingSession = profile.sessionToken;
      const forceLogin = body.forceLogin === true; // user confirmed on new device
      if (existingSession && !forceLogin) {
        // Another device is active — ask user to confirm
        // Log the attempt so old device can show notification
        await db.collection('users').doc(uid2).update({
          loginAttempt: { at: new Date().toISOString(), device: body.deviceInfo || 'Unknown device' }
        });
        return res.status(409).json({
          error: 'DEVICE_CONFLICT',
          message: 'This account is active on another device. Sign in here? The other device will be signed out.',
          requireConfirm: true,
        });
      }
      const sessionToken = crypto.randomBytes(32).toString('hex');
      await db.collection('users').doc(uid2).update({
        sessionToken, lastLogin: new Date().toISOString(),
        loginAttempt: null, // clear after successful login
        lastDevice: body.deviceInfo || 'Unknown',
      });
      const now = new Date();
      let accessStatus = 'active';
      let trialDaysLeft = null;
      if (profile.role !== 'admin') {
        if (profile.paid && profile.paidUntil && now <= new Date(profile.paidUntil)) accessStatus = 'paid';
        else if (profile.trialEnd && now <= new Date(profile.trialEnd)) { accessStatus = 'trial'; trialDaysLeft = Math.max(0, Math.ceil((new Date(profile.trialEnd) - now) / 86400000)); }
        else accessStatus = 'expired';
      }
      return res.status(200).json({
        user: { uid: uid2, email: profile.email, name: profile.name, role: profile.role, accessStatus,
                trialEnd: profile.trialEnd, trialStart: profile.trialStart, paidUntil: profile.paidUntil,
                trialDaysLeft, planKey: profile.planKey || null,
                phone: profile.phone, parentPhone: profile.parentPhone, parentName: profile.parentName, parentEmail: profile.parentEmail,
                notifPrefs: profile.notifPrefs, referralCode: profile.referralCode,
                academyId: profile.academyId, academyRole: profile.academyRole, academyName: profile.academyName,
                batchId: profile.batchId, batchCode: profile.batchCode, batchName: profile.batchName,
                scores: profile.scores },
        sessionToken,
      });
    } catch (err) { return res.status(401).json({ error: 'Invalid token: ' + err.message }); }
  }

  // ── VERIFY ──
  if (action === 'verify') {
    const { uid: vUid, sessionToken } = body;
    if (!vUid || !sessionToken) return res.status(400).json({ error: 'uid and sessionToken required' });
    try {
      const snap = await db.collection('users').doc(vUid).get();
      if (!snap.exists) return res.status(404).json({ error: 'User not found' });
      const profile = snap.data();
      if (profile.sessionToken !== sessionToken)
        return res.status(401).json({ error: 'SESSION_REPLACED', message: 'You were signed in on another device.' });
      if (profile.disabled)
        return res.status(403).json({ error: 'ACCESS_DISABLED', message: 'Your access has been disabled.' });
      const now = new Date();
      let accessStatus = 'active'; let trialDaysLeft = null;
      if (profile.role !== 'admin') {
        if (profile.paid && profile.paidUntil && now <= new Date(profile.paidUntil)) accessStatus = 'paid';
        else if (profile.trialEnd && now <= new Date(profile.trialEnd)) { accessStatus = 'trial'; trialDaysLeft = Math.max(0, Math.ceil((new Date(profile.trialEnd) - now) / 86400000)); }
        else accessStatus = 'expired';
      }
      const freeLevel = await getFreeLevel();
      let freePractice = { enabled: freeLevel?.enabled !== false, daysLeft: null, expired: false };
      if (freeLevel?.enabled !== false && freeLevel.maxFreeDays) {
        if (!profile.freePracticeStarted) {
          await db.collection('users').doc(vUid).update({ freePracticeStarted: now.toISOString() });
          freePractice.daysLeft = freeLevel.maxFreeDays;
        } else {
          const daysUsed = (now - new Date(profile.freePracticeStarted)) / 86400000;
          freePractice.daysLeft = Math.max(0, Math.ceil(freeLevel.maxFreeDays - daysUsed));
          freePractice.expired = daysUsed >= freeLevel.maxFreeDays;
        }
      } else { freePractice.expired = true; }
      return res.status(200).json({
        valid: true,
        user: { uid: vUid, email: profile.email, name: profile.name, role: profile.role,
                accessStatus, trialEnd: profile.trialEnd, paidUntil: profile.paidUntil, trialDaysLeft,
                planKey: profile.planKey, academyId: profile.academyId, academyRole: profile.academyRole,
                academyName: profile.academyName, batchId: profile.batchId },
        freePractice,
      });
    } catch (err) { return res.status(500).json({ error: 'Verification failed' }); }
  }

  return res.status(400).json({ error: 'Unknown action' });
};
