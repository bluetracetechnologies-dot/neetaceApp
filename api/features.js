// api/features.js
// Feature Flag System — admin controls every feature from dashboard.
// No code deployment needed to enable, disable, or move a feature between plans.
//
// Every feature has:
//   enabled       — master switch (off = no one gets it regardless of plan)
//   free          — available to free/trial users
//   plans         — which paid plans include it ['starter','medium','pro','monthly','institute']
//   adminOnly     — only admin can use (e.g. kill switch)
//   hasCost       — does this feature cost us money to serve?
//   costPerUse    — optional: rupees per use (for metered features)
//   chargeable    — can we sell this as an add-on?
//   addOnPrice    — if chargeable, price in paise for standalone purchase
//   usageCap      — optional: max uses per day/month for non-pro users
//   description   — shown in admin panel
//   category      — quiz | ai | analytics | notifications | social | admin

const { db } = require('./_firebase');


const DEFAULT_LEVELS = [
  {id:0,key:"starter",name:"Free Practice",tagline:"Get a feel for it",weight:1,color:"#22c55e",enabled:true,isFree:true,maxFreeDays:7},
  {id:1,key:"easy",name:"Simple",tagline:"Build the basics",weight:2,color:"#3b82f6",enabled:true},
  {id:2,key:"medium",name:"Hard",tagline:"Real exam pressure",weight:4,color:"#f59e0b",enabled:true},
  {id:3,key:"hard",name:"Very Hard",tagline:"NEET topper standard",weight:7,color:"#ef4444",enabled:true},
  {id:4,key:"exam",name:"Talent Required",tagline:"AIR top 1000 level",weight:10,color:"#7c3aed",enabled:true},
];

const DEFAULT_FEATURES = {

  // ── QUIZ ENGINE ────────────────────────────────────────
  free_practice: {
    key: 'free_practice',
    label: 'Free Practice (Easy Questions)',
    description: 'Easy-level questions for unregistered and trial users. The lead magnet.',
    category: 'quiz',
    enabled: true, free: true,
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: false, chargeable: false,
    adminOnly: false,
    usageCap: { daily: 10, unit: 'questions' }, // cap for non-logged-in users
  },

  standard_quiz: {
    key: 'standard_quiz',
    label: 'Standard Quiz (NCERT Questions)',
    description: 'Core question bank across all subjects. Available to all paid plans.',
    category: 'quiz',
    enabled: true, free: false,
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: false, chargeable: false,
    adminOnly: false,
  },

  parameterized_questions: {
    key: 'parameterized_questions',
    label: 'Parameterized Questions (Unique Numbers)',
    description: 'Each student gets different numerical values — zero cheating possible. Premium differentiator.',
    category: 'quiz',
    enabled: true, free: false,
    plans: ['medium','pro','monthly','institute'],
    hasCost: false, chargeable: true,
    addOnPrice: 4900, // ₹49 standalone if not on qualifying plan
    adminOnly: false,
    note: 'Do NOT include in Starter plan — this is a key upsell reason to go Medium+.',
  },

  unit_variant_questions: {
    key: 'unit_variant_questions',
    label: 'Unit Variant Questions (m/s vs km/h etc.)',
    description: 'Same concept, different units per student. Tests dimensional awareness.',
    category: 'quiz',
    enabled: true, free: false,
    plans: ['medium','pro','monthly','institute'],
    hasCost: false, chargeable: true,
    addOnPrice: 4900,
    adminOnly: false,
  },

  adaptive_engine: {
    key: 'adaptive_engine',
    label: 'Adaptive Learning Engine (ELO/IRT)',
    description: 'Questions tuned per-topic to each student\'s ability. Costs Firestore reads per question.',
    category: 'quiz',
    enabled: true, free: false,
    plans: ['pro','monthly','institute'],
    hasCost: true, costPerUse: 0.001, // fractions of a paisa per question — negligible solo, matters at scale
    chargeable: true,
    addOnPrice: 9900, // ₹99 standalone
    adminOnly: false,
    note: 'Keep Pro-only. This is the strongest reason to choose Pro over Medium.',
  },

  difficulty_slider: {
    key: 'difficulty_slider',
    label: 'Difficulty Slider (All 5 Levels)',
    description: 'Access to Hard, Very Hard, Talent Required levels.',
    category: 'quiz',
    enabled: true, free: false,
    plans: ['medium','pro','monthly','institute'],
    hasCost: false, chargeable: false,
    adminOnly: false,
    note: 'Starter gets Simple only. Medium gets up to Hard. Pro gets all.',
  },

  // ── AI ─────────────────────────────────────────────────
  ai_tutor: {
    key: 'ai_tutor',
    label: 'AI Tutor (Claude API)',
    description: 'Ask any NCERT concept and get an explanation. Costs real money per query via Claude API.',
    category: 'ai',
    enabled: true, free: false,
    plans: ['pro','monthly','institute'],
    hasCost: true, costPerUse: 0.50, // ~₹0.50 per query (Claude API tokens)
    chargeable: true,
    addOnPrice: 19900, // ₹199 standalone for 30-day AI Tutor access
    adminOnly: false,
    usageCap: { daily: 20, unit: 'queries', planOverride: { pro: null } }, // cap non-pro, unlimited for pro
    note: 'This is our highest-cost feature. Keep Pro-only. May need daily cap for monthly plan.',
  },

  // ── ANALYTICS & TRACKING ───────────────────────────────
  galti_copy: {
    key: 'galti_copy',
    label: 'Galti Copy (Mistake Notebook)',
    description: 'Auto-logs wrong answers with explanations. Drives daily habit and retention.',
    category: 'analytics',
    enabled: true, free: false,
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: false, chargeable: false,
    adminOnly: false,
    note: 'Keep in all paid plans. It creates habit lock-in. Do NOT put behind Pro-only.',
  },

  flashcards: {
    key: 'flashcards',
    label: 'Flashcards & Spaced Repetition',
    description: 'Tap-to-flip cards with Easy/Medium/Hard rating.',
    category: 'analytics',
    enabled: true, free: false,
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: false, chargeable: false,
    adminOnly: false,
  },

  analytics_basic: {
    key: 'analytics_basic',
    label: 'Basic Analytics (Accuracy, Streak)',
    description: 'Chapter accuracy, study streak grid, time spent.',
    category: 'analytics',
    enabled: true, free: false,
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: false, chargeable: false,
    adminOnly: false,
  },

  analytics_advanced: {
    key: 'analytics_advanced',
    label: 'Advanced Analytics (Mastery Map, Weak Topics)',
    description: 'Per-topic theta scores from adaptive engine, weakest topic identification.',
    category: 'analytics',
    enabled: true, free: false,
    plans: ['pro','monthly','institute'],
    hasCost: false, chargeable: true,
    addOnPrice: 4900,
    adminOnly: false,
  },

  notes: {
    key: 'notes',
    label: 'Personal Notes',
    description: 'Student can save notes per topic.',
    category: 'analytics',
    enabled: true, free: false,
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: false, chargeable: false,
    adminOnly: false,
  },

  // ── SOCIAL & LEADERBOARD ───────────────────────────────
  leaderboard_global: {
    key: 'leaderboard_global',
    label: 'Global Leaderboard (AIR Estimate)',
    description: 'All India Rank estimate. Strong social proof — keep accessible.',
    category: 'social',
    enabled: true, free: false,
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: false, chargeable: false,
    adminOnly: false,
  },

  leaderboard_batch: {
    key: 'leaderboard_batch',
    label: 'Batch/Institute Leaderboard',
    description: 'Private leaderboard for coaching classes. B2B value — institutes pay for this.',
    category: 'social',
    enabled: true, free: false,
    plans: ['institute'],
    hasCost: false, chargeable: true,
    addOnPrice: 0, // included in institute plan only
    adminOnly: false,
    note: 'Institute plan exclusive. Individual students can join a batch but not create one.',
  },

  referral: {
    key: 'referral',
    label: 'Refer & Earn',
    description: 'Share code → both get free days. Our best growth engine — keep free.',
    category: 'social',
    enabled: true, free: true,
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: false, chargeable: false,
    adminOnly: false,
  },

  // ── NOTIFICATIONS ──────────────────────────────────────
  email_notifications: {
    key: 'email_notifications',
    label: 'Email Notifications (Gmail SMTP)',
    description: 'Trial reminders, payment confirmations, weekly progress. Near-zero cost.',
    category: 'notifications',
    enabled: true, free: true,
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: true, costPerUse: 0.01, // negligible
    chargeable: false, // marketing for us — never charge
    adminOnly: false,
  },

  whatsapp_links: {
    key: 'whatsapp_links',
    label: 'WhatsApp Links (Free, via wa.me)',
    description: 'Admin-generated WhatsApp pre-filled links. No API cost.',
    category: 'notifications',
    enabled: true, free: true,
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: false, chargeable: false,
    adminOnly: false,
  },

  whatsapp_api: {
    key: 'whatsapp_api',
    label: 'WhatsApp API (Auto-send via AiSensy/Twilio)',
    description: 'Automated WhatsApp messages sent programmatically. ~₹1.5/message.',
    category: 'notifications',
    enabled: false, // OFF by default — enable when you subscribe to AiSensy/Twilio
    free: false,
    plans: ['pro','institute'],
    hasCost: true, costPerUse: 1.50,
    chargeable: true,
    addOnPrice: 9900, // ₹99/month add-on for auto-WhatsApp
    adminOnly: false,
    note: 'Enable only after subscribing to AiSensy (aisensy.com) or Twilio. Add API key to Vercel env vars.',
  },

  parent_notifications: {
    key: 'parent_notifications',
    label: 'Parent Notifications',
    description: 'Separate email/WhatsApp to parent when trial starts, expires, progress report. Peace-of-mind feature.',
    category: 'notifications',
    enabled: true, free: true, // free now — can charge ₹99 as "parent connect" feature later
    plans: ['starter','medium','pro','monthly','institute'],
    hasCost: true, costPerUse: 0.02,
    chargeable: true, // future: charge ₹99/year for "Parent Dashboard"
    addOnPrice: 9900,
    adminOnly: false,
    note: 'Currently free — strong retention signal (parents become advocates). Consider paid parent dashboard later.',
  },

  sms_notifications: {
    key: 'sms_notifications',
    label: 'SMS Notifications (MSG91)',
    description: 'SMS for critical alerts — trial expiry, OTP, payment. ~₹0.15/SMS.',
    category: 'notifications',
    enabled: false, // OFF — enable after MSG91 signup
    free: false,
    plans: ['pro','institute'],
    hasCost: true, costPerUse: 0.15,
    chargeable: false, // absorb cost — drives conversions
    adminOnly: false,
    note: 'Enable after signing up at msg91.com. Add MSG91_KEY to Vercel env vars.',
  },

  weekly_progress_report: {
    key: 'weekly_progress_report',
    label: 'Weekly Progress Report (Email)',
    description: 'Every Monday — questions done, accuracy, rank, weakest topic. Drives habit.',
    category: 'notifications',
    enabled: true, free: false,
    plans: ['pro','monthly','institute'],
    hasCost: true, costPerUse: 0.01,
    chargeable: false, // premium feel, included in Pro — drives upgrade from Medium
    adminOnly: false,
  },

  // ── ADMIN ONLY ─────────────────────────────────────────
  admin_kill_switch: {
    key: 'admin_kill_switch',
    label: 'Admin Kill Switch',
    description: 'Disable any user instantly.',
    category: 'admin',
    enabled: true, free: false, plans: [],
    hasCost: false, chargeable: false, adminOnly: true,
  },

  admin_broadcast: {
    key: 'admin_broadcast',
    label: 'Admin Notification Broadcast',
    description: 'Send notifications to all users at once.',
    category: 'admin',
    enabled: true, free: false, plans: [],
    hasCost: true, costPerUse: 0.01,
    chargeable: false, adminOnly: true,
  },

  content_pack_upload: {
    key: 'content_pack_upload',
    label: 'Admin Content Pack Upload',
    description: 'Upload and version CSV question packs.',
    category: 'admin',
    enabled: true, free: false, plans: [],
    hasCost: false, chargeable: false, adminOnly: true,
  },
};

// ── API Handler ──────────────────────────────────────────
module.exports = async function handler(req, res) {

  // GET — public, returns which features are enabled (without cost/internal notes)
  if (req.method === 'GET') {
    try {
      const snap = await db.collection('config').doc('features').get();
      const features = snap.exists ? snap.data() : DEFAULT_FEATURES;
      // Strip internal notes for public response
      const pub = {};
      Object.entries(features).forEach(([k, f]) => {
        pub[k] = {
          key: f.key, label: f.label, enabled: f.enabled,
          free: f.free, plans: f.plans, adminOnly: f.adminOnly,
          usageCap: f.usageCap || null,
        };
      });
      let levelsData = DEFAULT_LEVELS;
      try { const ls = await db.collection('config').doc('levels').get(); if (ls.exists && ls.data().list) levelsData = ls.data().list; } catch(e) {}
      return res.status(200).json({ features: pub, levels: levelsData });
    } catch (err) {
      return res.status(200).json({ features: DEFAULT_FEATURES });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, uid, sessionToken } = req.body || {};
  if (!uid || !sessionToken) return res.status(400).json({ error: 'Auth required' });

  const uSnap = await db.collection('users').doc(uid).get();
  if (!uSnap.exists || uSnap.data().role !== 'admin' || uSnap.data().sessionToken !== sessionToken)
    return res.status(403).json({ error: 'Admin only' });

  // Admin: get full feature list including costs and notes
  if (action === 'admin_list') {
    const snap = await db.collection('config').doc('features').get();
    const features = snap.exists ? snap.data() : DEFAULT_FEATURES;
    return res.status(200).json({ features });
  }

  // Admin: toggle a feature on/off
  if (action === 'toggle') {
    const { featureKey, enabled } = req.body;
    if (!featureKey) return res.status(400).json({ error: 'featureKey required' });
    const snap = await db.collection('config').doc('features').get();
    const features = snap.exists ? snap.data() : { ...DEFAULT_FEATURES };
    if (!features[featureKey]) return res.status(404).json({ error: 'Feature not found' });
    features[featureKey].enabled = enabled;
    await db.collection('config').doc('features').set(features);
    return res.status(200).json({ ok: true, message: `${features[featureKey].label} ${enabled ? 'enabled' : 'disabled'}` });
  }

  // Admin: update which plans include a feature
  if (action === 'update_plans') {
    const { featureKey, plans, free, addOnPrice } = req.body;
    const snap = await db.collection('config').doc('features').get();
    const features = snap.exists ? snap.data() : { ...DEFAULT_FEATURES };
    if (!features[featureKey]) return res.status(404).json({ error: 'Feature not found' });
    if (plans     !== undefined) features[featureKey].plans = plans;
    if (free      !== undefined) features[featureKey].free  = free;
    if (addOnPrice!== undefined) features[featureKey].addOnPrice = addOnPrice;
    await db.collection('config').doc('features').set(features);
    return res.status(200).json({ ok: true });
  }

  // Admin: update usage cap for a feature
  if (action === 'update_cap') {
    const { featureKey, usageCap } = req.body;
    const snap = await db.collection('config').doc('features').get();
    const features = snap.exists ? snap.data() : { ...DEFAULT_FEATURES };
    features[featureKey].usageCap = usageCap;
    await db.collection('config').doc('features').set(features);
    return res.status(200).json({ ok: true });
  }

  // Admin: seed defaults into Firestore (first time setup)
  if (action === 'seed_defaults') {
    await db.collection('config').doc('features').set(DEFAULT_FEATURES);
    return res.status(200).json({ ok: true, message: `${Object.keys(DEFAULT_FEATURES).length} features seeded` });
  }

  // Admin: get cost summary — estimate monthly costs
  if (action === 'cost_estimate') {
    const { monthlyUsers = 100, avgQuestionsPerDay = 20, avgAiQueriesPerDay = 3 } = req.body;
    const snap = await db.collection('config').doc('features').get();
    const features = snap.exists ? snap.data() : DEFAULT_FEATURES;
    const costs = [];
    let totalMonthly = 0;
    Object.values(features).forEach(f => {
      if (!f.enabled || !f.hasCost || !f.costPerUse) return;
      let usagePerMonth = 0;
      if (f.key === 'ai_tutor')       usagePerMonth = monthlyUsers * avgAiQueriesPerDay * 30;
      if (f.key === 'adaptive_engine') usagePerMonth = monthlyUsers * avgQuestionsPerDay * 30;
      if (f.key === 'email_notifications') usagePerMonth = monthlyUsers * 4; // ~4 emails/month
      if (f.key === 'whatsapp_api')   usagePerMonth = monthlyUsers * 2;
      if (f.key === 'sms_notifications') usagePerMonth = monthlyUsers * 2;
      const monthlyCost = usagePerMonth * f.costPerUse;
      if (monthlyCost > 0) {
        costs.push({ feature: f.label, usagePerMonth, costPerUse: f.costPerUse, monthlyCost: Math.round(monthlyCost) });
        totalMonthly += monthlyCost;
      }
    });
    return res.status(200).json({
      costs: costs.sort((a,b) => b.monthlyCost - a.monthlyCost),
      totalMonthlyRupees: Math.round(totalMonthly),
      assumptions: { monthlyUsers, avgQuestionsPerDay, avgAiQueriesPerDay },
    });
  }


  if (action === 'get_levels') {
    try { const sn = await db.collection('config').doc('levels').get();
      return res.status(200).json({ levels: sn.exists && sn.data().list ? sn.data().list : DEFAULT_LEVELS });
    } catch(e) { return res.status(200).json({ levels: DEFAULT_LEVELS }); }
  }
  if (action === 'toggle_level' || action === 'set_free_days') {
    const uS2 = await db.collection('users').doc(uid).get();
    if (!uS2.exists || uS2.data().role !== 'admin' || uS2.data().sessionToken !== sessionToken) return res.status(403).json({ error: 'Admin only' });
    const sn = await db.collection('config').doc('levels').get();
    var list = sn.exists && sn.data().list ? sn.data().list : JSON.parse(JSON.stringify(DEFAULT_LEVELS));
    if (action === 'toggle_level') { var idx = list.findIndex(function(l){return l.id === req.body.levelId}); if (idx >= 0) list[idx].enabled = req.body.enabled; }
    if (action === 'set_free_days') { var idx2 = list.findIndex(function(l){return l.isFree}); if (idx2 >= 0) list[idx2].maxFreeDays = req.body.maxFreeDays; }
    await db.collection('config').doc('levels').set({ list: list, updatedAt: new Date().toISOString() });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
