// api/auth-verify.js
// POST { uid, sessionToken }
// Called on every page load / tab focus. Confirms session valid, returns access status
// including Free Practice tier day-cap tracking.
const { db } = require('./_firebase');

function nextMay31() {
  const now = new Date();
  let may31 = new Date(now.getFullYear(), 4, 31, 23, 59, 59);
  if (now > may31) may31 = new Date(now.getFullYear() + 1, 4, 31, 23, 59, 59);
  return may31;
}

async function getFreeLevel() {
  try {
    const snap = await db.collection('config').doc('levels').get();
    const list = snap.exists && snap.data().list ? snap.data().list : null;
    if (list) return list.find(l => l.isFree) || null;
  } catch (e) {}
  return { enabled: true, maxFreeDays: 7 }; // fallback default
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { uid, sessionToken } = req.body || {};
  if (!uid || !sessionToken) return res.status(400).json({ error: 'uid and sessionToken required' });

  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    const profile = snap.data();

    if (profile.sessionToken !== sessionToken)
      return res.status(401).json({ error: 'SESSION_REPLACED', message: 'You were signed in on another device. Please sign in again.' });

    if (profile.disabled)
      return res.status(403).json({ error: 'ACCESS_DISABLED', message: 'Your access has been disabled by the admin.' });

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

    // Free Practice tier tracking — separate from main trial
    const freeLevel = await getFreeLevel();
    let freePractice = { enabled: freeLevel?.enabled !== false, daysLeft: null, expired: false };

    if (freeLevel?.enabled !== false) {
      if (freeLevel.maxFreeDays) {
        if (!profile.freePracticeStarted) {
          // First time touching Free Practice — start the clock
          await db.collection('users').doc(uid).update({ freePracticeStarted: now.toISOString() });
          freePractice.daysLeft = freeLevel.maxFreeDays;
        } else {
          const started = new Date(profile.freePracticeStarted);
          const daysUsed = (now - started) / 86400000;
          freePractice.daysLeft = Math.max(0, Math.ceil(freeLevel.maxFreeDays - daysUsed));
          freePractice.expired = daysUsed >= freeLevel.maxFreeDays;
        }
      }
    } else {
      freePractice.expired = true; // admin disabled it entirely
    }

    return res.status(200).json({
      valid: true,
      user: {
        uid, email: profile.email, name: profile.name, role: profile.role,
        accessStatus, trialEnd: profile.trialEnd, paidUntil: profile.paidUntil, trialDaysLeft,
      },
      freePractice,
    });
  } catch (err) {
    console.error('verify error', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
};
