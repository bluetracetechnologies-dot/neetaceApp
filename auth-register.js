// api/auth-register.js
// POST { email, password, name }
// Creates Firebase Auth user + Firestore profile with 7-day trial
const { auth, db } = require('./_firebase');

const ADMIN_EMAIL = 'bluetracetechnologies@gmail.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email, password, name } = req.body || {};
  if (!email || !password || !name)
    return res.status(400).json({ error: 'email, password and name are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const userRecord = await auth.createUser({ email, password, displayName: name });
    const now = new Date();
    const trialEnd = new Date(now); trialEnd.setDate(trialEnd.getDate() + 7);
    const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid, email, name,
      role: isAdmin ? 'admin' : 'user',
      trialStart: now.toISOString(),
      trialEnd: trialEnd.toISOString(),
      paid: isAdmin, paidUntil: null,
      disabled: false, sessionToken: null,
      createdAt: now.toISOString(),
    });
    return res.status(200).json({ ok: true, message: 'Account created. Please sign in.' });
  } catch (err) {
    if (err.code === 'auth/email-already-exists')
      return res.status(409).json({ error: 'An account with this email already exists.' });
    console.error('register error', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};
