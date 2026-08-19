// api/referral.js
// POST { action, uid, sessionToken, ... }
// Actions:
//   get_my_code      → returns user's referral code + stats
//   apply_referral   → called during registration with referral code
//   get_leaderboard  → top referrers this month
//   admin_config     → admin updates reward config

const { db } = require('./_firebase');
const { verifySession } = require('../lib/session');
const crypto = require('crypto');

// Default config — admin can override in Firestore config/referral
const DEFAULT_CONFIG = {
  referrerDays: 14,        // days given to referrer per successful referral
  referredDays: 7,         // days given to new user who was referred
  bonusOnPayment: 30,      // extra days for referrer if referred user pays within 30 days
  weeklyLimit: 5,          // max referrals per week per referrer
  totalCapDays: 90,        // max total days earnable through referrals
  paymentWindowDays: 30,   // window for payment bonus to apply
};

async function getConfig() {
  try {
    const snap = await db.collection('config').doc('referral').get();
    return snap.exists ? { ...DEFAULT_CONFIG, ...snap.data() } : DEFAULT_CONFIG;
  } catch(e) { return DEFAULT_CONFIG; }
}

function generateReferralCode(name, uid) {
  // Format: REF-NAME-XXXX (friendly, shareable)
  const namePart = (name || 'USER').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
  const hashPart = crypto.createHash('md5').update(uid).digest('hex').toUpperCase().slice(0, 4);
  return `REF-${namePart}-${hashPart}`;
}

async function checkWeeklyLimit(uid, config) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return false;
  const u = snap.data();
  const now = new Date();
  const resetDate = u.weeklyReferralReset ? new Date(u.weeklyReferralReset) : null;
  // Reset weekly count if it's past Monday
  if (!resetDate || now > resetDate) return true; // can refer
  return (u.weeklyReferrals || 0) < config.weeklyLimit;
}

async function incrementWeeklyCount(uid) {
  const now = new Date();
  // Next Monday
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + (8 - now.getDay()) % 7 || 7);
  nextMonday.setHours(0, 0, 0, 0);
  await db.collection('users').doc(uid).update({
    weeklyReferrals: (await db.collection('users').doc(uid).get()).data().weeklyReferrals + 1 || 1,
    weeklyReferralReset: nextMonday.toISOString(),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, uid, sessionToken } = req.body || {};
  if (!uid || !sessionToken) return res.status(400).json({ error: 'uid and sessionToken required' });

  const auth = await verifySession(db, uid, sessionToken);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const user = auth.profile;

  const config = await getConfig();

  try {

    // ─────────────────────────────────────────────
    // GET MY REFERRAL CODE + STATS
    // ─────────────────────────────────────────────
    if (action === 'get_my_code') {
      // Generate code if not exists
      if (!user.referralCode) {
        const code = generateReferralCode(user.name, uid);
        await db.collection('users').doc(uid).update({ referralCode: code });
        user.referralCode = code;
      }
      const referralLink = `https://neet.bluetrace.tech/?ref=${user.referralCode}`;
      const whatsappMsg = encodeURIComponent(
        `Join me on NEETAce — India's smartest NEET prep app!\n` +
        `Get 7 extra FREE days when you register using my link:\n` +
        `${referralLink}\n\n` +
        `AI Tutor, parameterized questions, unit variants — no cheating possible!\n` +
        `Only ₹799/year. Try free for 7+7 days!`
      );
      return res.status(200).json({
        referralCode: user.referralCode,
        referralLink,
        whatsappLink: `https://wa.me/?text=${whatsappMsg}`,
        stats: {
          totalReferrals: user.referralCount || 0,
          daysEarned: user.referralDaysEarned || 0,
          weeklyReferrals: user.weeklyReferrals || 0,
          weeklyLimit: config.weeklyLimit,
          totalCapDays: config.totalCapDays,
          daysRemaining: Math.max(0, config.totalCapDays - (user.referralDaysEarned || 0)),
        },
        config: {
          referrerDays: config.referrerDays,
          referredDays: config.referredDays,
          bonusOnPayment: config.bonusOnPayment,
        }
      });
    }

    // ─────────────────────────────────────────────
    // APPLY REFERRAL (called during/after registration)
    // ─────────────────────────────────────────────
    if (action === 'apply_referral') {
      const { referralCode } = req.body;
      if (!referralCode) return res.status(400).json({ error: 'referralCode required' });

      // Check if user already has a referral applied
      if (user.referredBy) {
        return res.status(409).json({ error: 'Referral already applied to this account.' });
      }

      // Find the referrer by their code
      const referrerQuery = await db.collection('users')
        .where('referralCode', '==', referralCode.toUpperCase()).limit(1).get();

      if (referrerQuery.empty) {
        return res.status(404).json({ error: 'Invalid referral code. Check with your friend.' });
      }

      const referrerDoc = referrerQuery.docs[0];
      const referrer = referrerDoc.data();
      const referrerUid = referrerDoc.id;

      // Anti-abuse: cannot refer yourself
      if (referrerUid === uid) {
        return res.status(400).json({ error: 'You cannot use your own referral code.' });
      }

      // Anti-abuse: referrer weekly limit
      const canRefer = await checkWeeklyLimit(referrerUid, config);
      if (!canRefer) {
        return res.status(429).json({ error: 'This referral code has reached its weekly limit. Try again next week.' });
      }

      // Anti-abuse: referrer total cap
      const referrerDaysEarned = referrer.referralDaysEarned || 0;
      if (referrerDaysEarned >= config.totalCapDays) {
        return res.status(429).json({ error: 'This referral code has reached its maximum reward cap.' });
      }

      // Calculate rewards
      const referredBonus = config.referredDays;
      const referrerBonus = Math.min(config.referrerDays, config.totalCapDays - referrerDaysEarned);

      // Apply rewards in a Firestore transaction (atomic)
      await db.runTransaction(async (tx) => {
        const newUserRef = db.collection('users').doc(uid);
        const referrerRef = db.collection('users').doc(referrerUid);
        const referralRef = db.collection('referrals').doc();

        // Extend new user's trial
        const currentTrialEnd = user.trialEnd ? new Date(user.trialEnd) : new Date();
        const newTrialEnd = new Date(Math.max(currentTrialEnd, new Date()));
        newTrialEnd.setDate(newTrialEnd.getDate() + referredBonus);

        // Extend referrer's trial (or paid subscription)
        let referrerUpdate = {
          referralCount: (referrer.referralCount || 0) + 1,
          referralDaysEarned: referrerDaysEarned + referrerBonus,
          weeklyReferrals: (referrer.weeklyReferrals || 0) + 1,
        };

        if (referrer.paid && referrer.paidUntil) {
          // Extend paid subscription
          const paidUntil = new Date(referrer.paidUntil);
          paidUntil.setDate(paidUntil.getDate() + referrerBonus);
          referrerUpdate.paidUntil = paidUntil.toISOString();
        } else {
          // Extend trial
          const referrerTrialEnd = referrer.trialEnd ? new Date(referrer.trialEnd) : new Date();
          const newReferrerTrialEnd = new Date(Math.max(referrerTrialEnd, new Date()));
          newReferrerTrialEnd.setDate(newReferrerTrialEnd.getDate() + referrerBonus);
          referrerUpdate.trialEnd = newReferrerTrialEnd.toISOString();
        }

        tx.update(newUserRef, {
          referredBy: referralCode,
          referredByUid: referrerUid,
          trialEnd: newTrialEnd.toISOString(),
        });
        tx.update(referrerRef, referrerUpdate);
        tx.set(referralRef, {
          referrerId: referrerUid,
          referrerCode: referralCode,
          referredId: uid,
          referredEmail: user.email,
          registeredAt: new Date().toISOString(),
          referredBonusDays: referredBonus,
          referrerBonusDays: referrerBonus,
          paidAt: null,
          bonusGranted: true,
          status: 'registered',
        });
      });

      return res.status(200).json({
        ok: true,
        referredBonusDays: referredBonus,
        referrerBonusDays: referrerBonus,
        message: `Referral applied! You got ${referredBonus} extra days. ${referrer.name} got ${referrerBonus} days too.`,
      });
    }

    // ─────────────────────────────────────────────
    // PAYMENT BONUS — called from verify-payment
    // ─────────────────────────────────────────────
    if (action === 'payment_bonus') {
      // Called internally when a referred user completes payment
      if (!user.referredByUid) return res.status(200).json({ ok: true, message: 'No referrer to reward' });

      // Check if within payment window
      const referralSnap = await db.collection('referrals')
        .where('referredId', '==', uid).where('status', '==', 'registered').limit(1).get();

      if (referralSnap.empty) return res.status(200).json({ ok: true });

      const referralDoc = referralSnap.docs[0];
      const referral = referralDoc.data();
      const registeredAt = new Date(referral.registeredAt);
      const now = new Date();
      const daysSinceReg = (now - registeredAt) / (1000 * 60 * 60 * 24);

      if (daysSinceReg > config.paymentWindowDays) {
        return res.status(200).json({ ok: true, message: 'Payment bonus window expired' });
      }

      const referrerSnap = await db.collection('users').doc(user.referredByUid).get();
      if (!referrerSnap.exists) return res.status(200).json({ ok: true });
      const referrer = referrerSnap.data();

      const bonusDays = config.bonusOnPayment;
      const referrerUpdate = {};

      if (referrer.paid && referrer.paidUntil) {
        const paidUntil = new Date(referrer.paidUntil);
        paidUntil.setDate(paidUntil.getDate() + bonusDays);
        referrerUpdate.paidUntil = paidUntil.toISOString();
      } else {
        const trialEnd = new Date(referrer.trialEnd || new Date());
        trialEnd.setDate(trialEnd.getDate() + bonusDays);
        referrerUpdate.trialEnd = trialEnd.toISOString();
      }
      referrerUpdate.referralDaysEarned = (referrer.referralDaysEarned || 0) + bonusDays;

      await db.collection('users').doc(user.referredByUid).update(referrerUpdate);
      await referralDoc.ref.update({ paidAt: now.toISOString(), status: 'paid', paymentBonusDays: bonusDays });

      return res.status(200).json({ ok: true, bonusDaysGranted: bonusDays });
    }

    // ─────────────────────────────────────────────
    // REFERRAL LEADERBOARD — top referrers
    // ─────────────────────────────────────────────
    if (action === 'leaderboard') {
      const snap = await db.collection('users')
        .where('referralCount', '>', 0)
        .orderBy('referralCount', 'desc')
        .limit(10).get();

      const board = snap.docs.map((d, i) => {
        const u = d.data();
        return {
          rank: i + 1,
          name: u.name,
          referralCount: u.referralCount || 0,
          daysEarned: u.referralDaysEarned || 0,
          isMe: d.id === uid,
        };
      });
      return res.status(200).json({ leaderboard: board });
    }

    // ─────────────────────────────────────────────
    // ADMIN — update referral config
    // ─────────────────────────────────────────────
    if (action === 'admin_config') {
      if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
      const { newConfig } = req.body;
      await db.collection('config').doc('referral').set({ ...DEFAULT_CONFIG, ...newConfig, updatedAt: new Date().toISOString() }, { merge: true });
      return res.status(200).json({ ok: true, message: 'Referral config updated' });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('referral error', err);
    return res.status(500).json({ error: err.message });
  }
};
