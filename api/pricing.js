// api/pricing.js
// GET  → returns current pricing config (public)
// POST { action:'update', adminUid, sessionToken, config } → updates pricing (admin only)
//
// All prices stored in Firestore doc: config/pricing
// Admin changes prices from dashboard — ZERO code changes needed.
//
// Pricing tiers supported:
//   plan_starter  — Easy level only
//   plan_medium   — Easy + Medium levels
//   plan_pro      — All levels including Hard + Exam
//   plan_monthly  — Monthly subscription
//   pack_100      — 100 question credits
//   pack_500      — 500 question credits
//   institute     — Per-student bulk pricing for institutes
//
// Each tier has: price_paise, label, description, features[], active

const { db } = require('./_firebase');
const { verifyAdminSession } = require('../lib/session');

const DEFAULT_PRICING = {
  plan_starter: {
    price_paise: 29900,
    label: 'Starter Plan',
    description: 'Easy level questions only',
    features: ['Easy difficulty questions','NCERT references','Flashcards','Basic analytics'],
    levels: ['starter','easy'],
    active: true,
    color: '#22c55e',
  },
  plan_medium: {
    price_paise: 49900,
    label: 'Medium Plan',
    description: 'Easy + Medium difficulty',
    features: ['Easy + Medium questions','Unit conversion variants','Galti Copy','AI Tutor (limited)','Full analytics'],
    levels: ['starter','easy','medium'],
    active: true,
    color: '#f59e0b',
  },
  plan_pro: {
    price_paise: 79900,
    label: 'NEETAce Pro',
    description: 'All levels — best value',
    features: ['All 5 difficulty levels','Parameterized unique questions','Unit variant questions','Full AI Tutor','Leaderboard rank','Galti Copy','All analytics'],
    levels: ['starter','easy','medium','hard','exam'],
    active: true,
    color: '#1a56db',
    popular: true,
  },
  plan_monthly: {
    price_paise: 9900,
    label: 'Monthly',
    description: 'Pay monthly, cancel anytime',
    features: ['All Pro features','Cancel anytime','Auto-renews monthly'],
    levels: ['starter','easy','medium','hard','exam'],
    active: true,
    color: '#7c3aed',
    isMonthly: true,
  },
  pack_100: {
    price_paise: 4900,
    label: '100 Questions',
    description: 'One-time question credit pack',
    features: ['100 questions of your choice','Choose any difficulty mix','Never expires'],
    type: 'credit',
    credits: 100,
    active: false,
    color: '#06b6d4',
  },
  pack_500: {
    price_paise: 19900,
    label: '500 Questions',
    description: 'Best value credit pack',
    features: ['500 questions of your choice','Choose any difficulty mix','Never expires'],
    type: 'credit',
    credits: 500,
    active: false,
    color: '#06b6d4',
  },
  institute: {
    price_paise_per_student: 49900,
    min_students: 10,
    label: 'Institute Plan',
    description: 'Per-student pricing for coaching institutes',
    features: ['All Pro features per student','Private batch leaderboard','Teacher admin dashboard','CSV bulk student upload','Progress reports','Priority support'],
    levels: ['starter','easy','medium','hard','exam'],
    active: true,
    color: '#0f6e56',
    isInstitute: true,
  },
  expiry: {
    type: 'academic_year',
    description: 'All annual plans expire 31 May',
    monthly_renews: true,
  },
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
};

module.exports = async function handler(req, res) {
  // GET — return current pricing (public)
  if (req.method === 'GET') {
    try {
      const snap = await db.collection('config').doc('pricing').get();
      if (snap.exists) {
        return res.status(200).json(snap.data());
      } else {
        // First time — seed defaults
        await db.collection('config').doc('pricing').set(DEFAULT_PRICING);
        return res.status(200).json(DEFAULT_PRICING);
      }
    } catch (err) {
      return res.status(200).json(DEFAULT_PRICING);
    }
  }

  // POST — update pricing (admin only)
  if (req.method === 'POST') {
    const { action, adminUid, sessionToken, config } = req.body || {};
    if (!adminUid || !sessionToken) return res.status(400).json({ error: 'Missing credentials' });

    // Verify admin
    const auth = await verifyAdminSession(db, adminUid, sessionToken);
    if (!auth.ok) return res.status(403).json({ error: 'Admin access required' });

    if (action === 'update' && config) {
      // Basic sanity check on price fields - admin-only surface, so this guards against
      // accidental typos more than malice, but a bad price_paise here would otherwise
      // surface as a confusing Razorpay error far from this actual cause.
      for (const [key, plan] of Object.entries(config)) {
        if (plan && typeof plan === 'object' && 'price_paise' in plan) {
          if (typeof plan.price_paise !== 'number' || plan.price_paise < 0) {
            return res.status(400).json({ error: `Invalid price_paise for ${key}: must be a non-negative number` });
          }
        }
      }
      const update = { ...config, updatedAt: new Date().toISOString(), updatedBy: adminUid };
      await db.collection('config').doc('pricing').set(update, { merge: true });
      return res.status(200).json({ ok: true, message: 'Pricing updated successfully' });
    }

    if (action === 'reset') {
      await db.collection('config').doc('pricing').set(DEFAULT_PRICING);
      return res.status(200).json({ ok: true, message: 'Pricing reset to defaults' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
