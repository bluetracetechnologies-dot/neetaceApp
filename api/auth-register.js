// api/auth-register.js
const { auth, db } = require('./_firebase');
const ADMIN_EMAIL = 'bluetracetechnologies@gmail.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email, password, name, uid } = req.body || {};
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
    const trialEnd = new Date(now); trialEnd.setDate(trialEnd.getDate() + 7);
    const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    await db.collection('users').doc(userUid).set({
      uid: userUid, email, name,
      role: isAdmin ? 'admin' : 'user',
      trialStart: now.toISOString(),
      trialEnd: trialEnd.toISOString(),
      paid: isAdmin, paidUntil: null,
      disabled: false, sessionToken: null,
      createdAt: now.toISOString(),
      authProvider: uid ? 'google' : 'email',
      phone: '', parentPhone: '', parentName: '', parentEmail: '',
      notifPrefs: { email: true, whatsapp: true, parent: true },
    });
    // Fire trial_started notification asynchronously (don't block registration)
    if (!isAdmin) {
      try {
        const { dispatch } = require('./notifications');
        dispatch(userUid, 'trial_started').catch(e => console.log('notif error:', e.message));
      } catch(e) {}
    }
    return res.status(200).json({ ok: true, message: 'Account created.' });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') return res.status(409).json({ error: 'An account with this email already exists.' });
    console.error('register error', err);
    return res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
};
