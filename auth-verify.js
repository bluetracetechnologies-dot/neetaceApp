// api/auth-verify.js
// POST { uid, sessionToken }
// Called on every page load / tab focus to confirm this device still holds the active session.
// If another device logged in, their sessionToken replaced this one in Firestore → this returns 401.
const { db } = require('./_firebase');

function nextMay31() {
  const now = new Date();
  let may31 = new Date(now.getFullYear(), 4, 31, 23, 59, 59);
  if (now > may31) may31 = new Date(now.getFullYear() + 1, 4, 31, 23, 59, 59);
  return may31;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { uid, sessionToken } = req.body || {};
  if (!uid || !sessionToken) return res.status(400).json({ error: 'uid and sessionToken required' });

  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    const profile = snap.data();

    // Single-device check — session token must match what's stored
    if (profile.sessionToken !== sessionToken)
      return res.status(401).json({ error: 'SESSION_REPLACED', message: 'You were signed in on another device. Please sign in again.' });

    if (profile.disabled)
      return res.status(403).json({ error: 'ACCESS_DISABLED', message: 'Your access has been disabled by the admin.' });

    // Compute live access status
    const now = new Date();
    let accessStatus = 'active';
    let trialDaysLeft = null;

    if (profile.role !== 'admin') {
      if (profile.paid && profile.paidUntil && now <= new Date(profile.paidUntil)) {
        accessStatus = 'paid';
      } else if (profile.trialEnd && now <= new Date(profile.trialEnd)) {
        accessStatus = 'trial';
        trialDaysLeft = Math.max(0, Math.ceil((new Date(profile.trialEnd) - now) / 86400000));
      } else {
        accessStatus = 'expired';
      }
    }

    return res.status(200).json({
      valid: true,
      user: {
        uid, email: profile.email, name: profile.name, role: profile.role,
        accessStatus, trialEnd: profile.trialEnd, paidUntil: profile.paidUntil, trialDaysLeft,
      }
    });
  } catch (err) {
    console.error('verify error', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
};
