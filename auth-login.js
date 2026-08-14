// api/auth-login.js
// POST { idToken }  — idToken comes from Firebase client SDK signInWithEmailAndPassword
// 1. Verifies the Firebase ID token server-side
// 2. Generates a new sessionToken (random, stored in Firestore)
// 3. Returns sessionToken + user profile to the client
// Old sessionToken is overwritten → previous device/tab is kicked out immediately
const { auth, db } = require('./_firebase');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'idToken required' });

  try {
    // Verify the Firebase ID token issued by the client SDK
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Load Firestore profile
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return res.status(404).json({ error: 'User profile not found. Please register.' });
    const profile = snap.data();

    if (profile.disabled) return res.status(403).json({ error: 'Your access has been disabled by the admin.' });

    // Generate a new session token — this invalidates any existing session on other devices
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await db.collection('users').doc(uid).update({ sessionToken, lastLogin: new Date().toISOString() });

    // Compute access status server-side
    const now = new Date();
    let accessStatus = 'active';
    if (profile.role !== 'admin') {
      if (profile.paid && profile.paidUntil && now <= new Date(profile.paidUntil)) {
        accessStatus = 'paid';
      } else if (profile.trialEnd && now <= new Date(profile.trialEnd)) {
        accessStatus = 'trial';
        const daysLeft = Math.max(0, Math.ceil((new Date(profile.trialEnd) - now) / 86400000));
        profile.trialDaysLeft = daysLeft;
      } else {
        accessStatus = 'expired';
      }
    }

    return res.status(200).json({
      sessionToken,
      user: {
        uid, email: profile.email, name: profile.name, role: profile.role,
        accessStatus, trialEnd: profile.trialEnd, paidUntil: profile.paidUntil,
        trialDaysLeft: profile.trialDaysLeft || null,
      }
    });
  } catch (err) {
    if (err.code === 'auth/id-token-expired') return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    if (err.code === 'auth/argument-error') return res.status(401).json({ error: 'Invalid credentials.' });
    console.error('login error', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};
