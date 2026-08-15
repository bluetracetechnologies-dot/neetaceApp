// api/auth-register.js
// POST { email, password, name, uid? }
// uid is passed for Google OAuth users (Firebase already created the auth user)
// For email/password users, we create the Firebase Auth user here too
const { auth, db } = require('./_firebase');

const ADMIN_EMAIL = 'bluetracetechnologies@gmail.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email, password, name, uid } = req.body || {};
  if (!email || !name) return res.status(400).json({ error: 'email and name are required' });

  try {
    let userUid = uid;

    // For email/password registration, create Firebase Auth user
    if (!uid) {
      if (!password || password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const userRecord = await auth.createUser({ email, password, displayName: name });
      userUid = userRecord.uid;
    }

    // Check if Firestore profile already exists (Google OAuth may have been used before)
    const existing = await db.collection('users').doc(userUid).get();
    if (existing.exists) {
      return res.status(200).json({ ok: true, message: 'Profile already exists.' });
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 7);
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
    });

    return res.status(200).json({ ok: true, message: 'Account created successfully.' });
  } catch (err) {
    if (err.code === 'auth/email-already-exists')
      return res.status(409).json({ error: 'An account with this email already exists.' });
    console.error('register error', err);
    return res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
};
