// api/levels.js
// GET  → returns level config (public, no auth needed)
// POST { action:'admin_update', ... } → admin edits levels
//
// Levels are fully admin-configurable: names, taglines, mix %, weights,
// and critically — the Free Practice tier can be day-capped or disabled entirely.

const { db } = require('./_firebase');

const DEFAULT_LEVELS = [
  {
    id: 0, key: 'starter',
    name: 'Free Practice',
    tagline: 'Get a feel for it',
    weight: 1,
    mix: { e: 100, m: 0, h: 0, u: 0, p: 0 },
    color: '#22c55e',
    enabled: true,
    isFree: true,
    maxFreeDays: 7,          // admin can change or set null for unlimited
    requiresLogin: false,     // anonymous visitors can try this level
  },
  {
    id: 1, key: 'easy',
    name: 'Simple',
    tagline: 'Build the basics',
    weight: 2,
    mix: { e: 70, m: 20, h: 0, u: 10, p: 0 },
    color: '#3b82f6',
    enabled: true,
    isFree: false,
    requiresLogin: true,
  },
  {
    id: 2, key: 'medium',
    name: 'Hard',
    tagline: 'Real exam pressure',
    weight: 4,
    mix: { e: 20, m: 45, h: 15, u: 15, p: 5 },
    color: '#f59e0b',
    enabled: true,
    isFree: false,
    requiresLogin: true,
  },
  {
    id: 3, key: 'hard',
    name: 'Very Hard',
    tagline: 'NEET topper standard',
    weight: 7,
    mix: { e: 5, m: 25, h: 45, u: 15, p: 10 },
    color: '#ef4444',
    enabled: true,
    isFree: false,
    requiresLogin: true,
  },
  {
    id: 4, key: 'exam',
    name: 'Talent Required',
    tagline: 'AIR top 1000 level',
    weight: 10,
    mix: { e: 0, m: 10, h: 40, u: 25, p: 25 },
    color: '#7c3aed',
    enabled: true,
    isFree: false,
    requiresLogin: true,
  },
];

module.exports = async function handler(req, res) {

  // GET — public, returns current level config
  if (req.method === 'GET') {
    try {
      const snap = await db.collection('config').doc('levels').get();
      const levels = snap.exists && snap.data().list ? snap.data().list : DEFAULT_LEVELS;
      // Only return enabled levels to the client, but keep order/ids intact
      return res.status(200).json({ levels });
    } catch (err) {
      return res.status(200).json({ levels: DEFAULT_LEVELS });
    }
  }

  // POST — admin management
  if (req.method === 'POST') {
    const { action, uid, sessionToken } = req.body || {};
    if (!uid || !sessionToken) return res.status(400).json({ error: 'Auth required' });

    const uSnap = await db.collection('users').doc(uid).get();
    if (!uSnap.exists || uSnap.data().role !== 'admin' || uSnap.data().sessionToken !== sessionToken)
      return res.status(403).json({ error: 'Admin only' });

    if (action === 'get_all') {
      const snap = await db.collection('config').doc('levels').get();
      const levels = snap.exists && snap.data().list ? snap.data().list : DEFAULT_LEVELS;
      return res.status(200).json({ levels });
    }

    if (action === 'update_level') {
      const { level } = req.body;
      if (!level || level.id === undefined) return res.status(400).json({ error: 'level with id required' });
      const snap = await db.collection('config').doc('levels').get();
      let list = snap.exists && snap.data().list ? snap.data().list : [...DEFAULT_LEVELS];
      const idx = list.findIndex(l => l.id === level.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...level };
      await db.collection('config').doc('levels').set({ list, updatedAt: new Date().toISOString() });
      return res.status(200).json({ ok: true, message: `Level "${list[idx]?.name}" updated` });
    }

    // Toggle a level on/off — e.g. disable Free Practice during high-demand periods
    if (action === 'toggle_level') {
      const { levelId, enabled } = req.body;
      const snap = await db.collection('config').doc('levels').get();
      let list = snap.exists && snap.data().list ? snap.data().list : [...DEFAULT_LEVELS];
      const idx = list.findIndex(l => l.id === levelId);
      if (idx >= 0) list[idx].enabled = enabled;
      await db.collection('config').doc('levels').set({ list, updatedAt: new Date().toISOString() });
      return res.status(200).json({
        ok: true,
        message: enabled ? `${list[idx]?.name} re-enabled` : `${list[idx]?.name} disabled`,
      });
    }

    // Change the Free Practice day cap without touching other levels
    if (action === 'set_free_days') {
      const { maxFreeDays } = req.body; // number or null for unlimited
      const snap = await db.collection('config').doc('levels').get();
      let list = snap.exists && snap.data().list ? snap.data().list : [...DEFAULT_LEVELS];
      const idx = list.findIndex(l => l.isFree);
      if (idx >= 0) list[idx].maxFreeDays = maxFreeDays;
      await db.collection('config').doc('levels').set({ list, updatedAt: new Date().toISOString() });
      return res.status(200).json({ ok: true, message: `Free Practice cap set to ${maxFreeDays ?? 'unlimited'} days` });
    }

    if (action === 'reset_defaults') {
      await db.collection('config').doc('levels').set({ list: DEFAULT_LEVELS, updatedAt: new Date().toISOString() });
      return res.status(200).json({ ok: true, message: 'Levels reset to defaults' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
