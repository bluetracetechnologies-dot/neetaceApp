// api/admin.js
// POST { action, uid, sessionToken, ...params }
// All actions require admin role.
//
// list_users     — paginated, searchable, filterable (never loads all at once)
// search_users   — search by email prefix using Firestore range query
// get_user       — single user detail by uid
// disable        — disable user + null session token
// enable         — re-enable user
// grant_pro      — give free Pro access till next May 31
// grant_days     — add N trial days to any user
// kill_all       — disable ALL non-admin users (emergency)
// set_expiry     — set trial end for all users
// get_stats      — aggregate stats (total, paid, trial, expired) — fast, no full scan
// log_feedback   — store user feedback

const { db } = require('./_firebase');

const PAGE_SIZE   = 20; // users per page
const ADMIN_EMAIL = 'bluetracetechnologies@gmail.com';

function nextMay31(fromDate) {
  const d = fromDate || new Date();
  let may31 = new Date(d.getFullYear(), 4, 31, 23, 59, 59);
  if (d > may31) may31 = new Date(d.getFullYear() + 1, 4, 31, 23, 59, 59);
  return may31;
}

async function verifyAdmin(uid, sessionToken) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const p = snap.data();
  if (p.sessionToken !== sessionToken || p.role !== 'admin') return null;
  return p;
}

function computeStatus(u) {
  const now = new Date();
  if (u.role === 'admin')   return 'admin';
  if (u.disabled)           return 'disabled';
  if (u.paid && u.paidUntil && now <= new Date(u.paidUntil)) return 'paid';
  if (u.trialEnd && now <= new Date(u.trialEnd))              return 'trial';
  return 'expired';
}

function userSummary(d) {
  const u = d.data ? d.data() : d;
  const uid = d.id || u.uid;
  return {
    uid, email: u.email, name: u.name, role: u.role,
    status:    computeStatus(u),
    paidUntil: u.paidUntil || null,
    trialEnd:  u.trialEnd  || null,
    disabled:  u.disabled  || false,
    planKey:   u.planKey   || null,
    createdAt: u.createdAt || null,
    referralCount: u.referralCount || 0,
    scores: u.scores ? {
      globalWeighted: u.scores.global?.weighted || 0,
      globalRank:     u.scores.global?.rank     || null,
    } : null,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, uid, sessionToken } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action required' });

  // get_trial_config is deliberately public: it returns only non-sensitive shared
  // configuration (trial day count, daily cap, feature-access mode) and is called by
  // EVERY page load - including before login (uid:'anon') - to size the free-trial
  // experience for not-yet-registered visitors. It must not require admin auth.
  // Fixes a real bug: the blanket gate below was rejecting this call with 403 every
  // time, so admin-configured trial settings never actually reached real users -
  // the client silently fell back to hardcoded defaults regardless of config/trial.
  if (action === 'get_trial_config') {
    try {
      const snap = await db.collection('config').doc('trial').get();
      return res.status(200).json(snap.exists ? snap.data() : { days: 7, dailyQuestionCap: 10, allFeatures: true });
    } catch (err) {
      return res.status(200).json({ days: 7, dailyQuestionCap: 10, allFeatures: true });
    }
  }

  if (!uid || !sessionToken)
    return res.status(400).json({ error: 'uid, sessionToken required' });

  const admin = await verifyAdmin(uid, sessionToken);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });

  try {

    // ── PAGINATED USER LIST ───────────────────────────────
    if (action === 'list_users') {
      const {
        page      = 1,
        status    = 'all',    // all | paid | trial | expired | disabled | admin
        subject   = null,     // future: filter by weak subject
        sortBy    = 'createdAt', // createdAt | email | score
        pageToken = null,     // Firestore startAfter cursor
      } = req.body;

      let query = db.collection('users');

      // Apply status filter at DB level where possible
      if (status === 'paid')     query = query.where('paid', '==', true).where('disabled', '==', false);
      if (status === 'disabled') query = query.where('disabled', '==', true);
      if (status === 'admin')    query = query.where('role', '==', 'admin');

      // Sort
      if (sortBy === 'email')    query = query.orderBy('email');
      else                       query = query.orderBy('createdAt', 'desc');

      // Cursor-based pagination (much faster than offset for large collections)
      if (pageToken) {
        const cursorDoc = await db.collection('users').doc(pageToken).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }

      query = query.limit(PAGE_SIZE + 1); // fetch one extra to know if there's a next page

      const snap = await query.get();
      const docs = snap.docs;
      const hasMore = docs.length > PAGE_SIZE;
      const users = docs.slice(0, PAGE_SIZE).map(userSummary);

      // For trial/expired we filter in memory (Firestore can't do date comparisons easily)
      let filtered = users;
      if (status === 'trial')   filtered = users.filter(u => u.status === 'trial');
      if (status === 'expired') filtered = users.filter(u => u.status === 'expired');

      return res.status(200).json({
        users:         filtered,
        hasMore,
        nextPageToken: hasMore ? docs[PAGE_SIZE - 1].id : null,
        page,
        pageSize:      PAGE_SIZE,
        filterStatus:  status,
      });
    }

    // ── SEARCH USERS ─────────────────────────────────────
    if (action === 'search_users') {
      const { query: q = '' } = req.body;
      if (q.length < 2) return res.status(400).json({ error: 'Search query must be at least 2 characters' });

      const term = q.toLowerCase().trim();

      // Email prefix search (Firestore supports range queries on strings)
      const emailSnap = await db.collection('users')
        .where('email', '>=', term)
        .where('email', '<=', term + '\uf8ff')
        .limit(20).get();

      // Name prefix search
      const nameSnap = await db.collection('users')
        .where('name', '>=', term)
        .where('name', '<=', term + '\uf8ff')
        .limit(10).get();

      // Merge + deduplicate
      const seen = new Set();
      const users = [];
      [...emailSnap.docs, ...nameSnap.docs].forEach(d => {
        if (!seen.has(d.id)) { seen.add(d.id); users.push(userSummary(d)); }
      });

      return res.status(200).json({ users, total: users.length, query: q });
    }

    // ── SINGLE USER DETAIL ────────────────────────────────
    if (action === 'get_user') {
      const { targetUid } = req.body;
      if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
      const snap = await db.collection('users').doc(targetUid).get();
      if (!snap.exists) return res.status(404).json({ error: 'User not found' });
      const u = snap.data();
      // Full detail including mastery, scores, referral stats
      return res.status(200).json({
        user: {
          ...userSummary(snap),
          mastery:         u.mastery || {},
          referredBy:      u.referredBy || null,
          referralCount:   u.referralCount || 0,
          referralDaysEarned: u.referralDaysEarned || 0,
          batchCode:       u.batchCode || null,
          batchName:       u.batchName || null,
          orgId:           u.orgId || null,
          lastLogin:       u.lastLogin || null,
          totalQuestionsAttempted: u.totalQuestionsAttempted || 0,
          scores:          u.scores || {},
        }
      });
    }

    // ── AGGREGATE STATS ───────────────────────────────────
    // Uses counters — no full collection scan
    if (action === 'get_stats') {
      const statsRef = db.collection('config').doc('stats');
      const snap = await statsRef.get();
      // Fall back to a fast count query if stats doc not seeded yet
      if (!snap.exists || req.body.forceRecount) {
        const [total, paid, admin_count] = await Promise.all([
          db.collection('users').count().get(),
          db.collection('users').where('paid', '==', true).count().get(),
          db.collection('users').where('role', '==', 'admin').count().get(),
        ]);
        const stats = {
          total:    total.data().count,
          paid:     paid.data().count,
          admins:   admin_count.data().count,
          updatedAt: new Date().toISOString(),
        };
        await statsRef.set(stats);
        return res.status(200).json(stats);
      }
      return res.status(200).json(snap.data());
    }

    // ── USER ACTIONS ─────────────────────────────────────
    if (action === 'disable') {
      const { targetUid } = req.body;
      if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
      await db.collection('users').doc(targetUid).update({ disabled: true, sessionToken: null });
      await db.collection('config').doc('stats').update({ disabled: (admin.disabled||0)+1 }).catch(()=>{});
      return res.status(200).json({ ok: true, message: 'User disabled and session killed' });
    }

    if (action === 'enable') {
      const { targetUid } = req.body;
      if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
      await db.collection('users').doc(targetUid).update({ disabled: false });
      return res.status(200).json({ ok: true });
    }

    if (action === 'grant_pro') {
      const { targetUid } = req.body;
      if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
      const paidUntil = nextMay31();
      await db.collection('users').doc(targetUid).update({
        paid: true, paidUntil: paidUntil.toISOString(),
        disabled: false, planKey: 'plan_pro',
      });
      return res.status(200).json({ ok: true, paidUntil: paidUntil.toISOString() });
    }

    if (action === 'grant_days') {
      const { targetUid, days = 7 } = req.body;
      if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
      const uSnap = await db.collection('users').doc(targetUid).get();
      if (!uSnap.exists) return res.status(404).json({ error: 'User not found' });
      const u = uSnap.data();
      const base = u.trialEnd ? new Date(u.trialEnd) : new Date();
      if (base < new Date()) base.setTime(new Date().getTime());
      base.setDate(base.getDate() + days);
      await db.collection('users').doc(targetUid).update({ trialEnd: base.toISOString() });
      return res.status(200).json({ ok: true, newTrialEnd: base.toISOString() });
    }

    if (action === 'kill_all') {
      // Batch operation — processes in chunks of 400 (Firestore batch limit)
      const snap = await db.collection('users').where('role', '!=', 'admin').limit(400).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.update(d.ref, { disabled: true, sessionToken: null }));
      await batch.commit();
      return res.status(200).json({ ok: true, affected: snap.docs.length, message: 'First 400 non-admin users disabled. Re-run if more.' });
    }

    if (action === 'set_expiry') {
      const { days = 7 } = req.body;
      const exp = new Date(); exp.setDate(exp.getDate() + days);
      // Process in chunks
      const snap = await db.collection('users').where('role', '!=', 'admin').limit(400).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.update(d.ref, { trialEnd: exp.toISOString(), paid: false, paidUntil: null }));
      await batch.commit();
      return res.status(200).json({ ok: true, expiresAt: exp.toISOString(), affected: snap.docs.length });
    }

    // ── PER-USER FEATURE OVERRIDES (use sparingly - plans should be default) ──
    if (action === 'set_user_feature_override') {
      const { targetUid, featureKey, enabled, reason, expiresAt } = req.body;
      if (!targetUid || !featureKey) return res.status(400).json({ error: 'targetUid and featureKey required' });
      if (!reason || reason.trim().length < 5) return res.status(400).json({ error: 'Reason required (why this override) - min 5 chars' });
      const targetSnap = await db.collection('users').doc(targetUid).get();
      if (!targetSnap.exists) return res.status(404).json({ error: 'User not found' });
      const overrides = targetSnap.data().featureOverrides || {};
      if (enabled === null || enabled === undefined) {
        // Remove the override
        delete overrides[featureKey];
      } else {
        overrides[featureKey] = {
          enabled: !!enabled, reason: reason, setBy: uid,
          setAt: new Date().toISOString(),
          expiresAt: expiresAt || null,
        };
      }
      await db.collection('users').doc(targetUid).update({ featureOverrides: overrides });
      return res.status(200).json({ ok: true, message: enabled === null ? 'Override removed' : 'Override saved for ' + featureKey });
    }

    if (action === 'list_user_overrides') {
      // Show all users who have any feature overrides
      const snap2 = await db.collection('users').where('featureOverrides', '!=', null).limit(50).get();
      const users = [];
      snap2.forEach(function(doc){
        const d = doc.data();
        if (d.featureOverrides && Object.keys(d.featureOverrides).length > 0) {
          users.push({
            uid: d.uid, email: d.email, name: d.name,
            overrides: d.featureOverrides,
          });
        }
      });
      return res.status(200).json({ users });
    }

    // ── PER-STUDENT CUSTOM PRICING ────────────────────
    // Admin sets a personal price for one student — overrides all plan pricing.
    if (action === 'set_custom_price') {
      const { targetUid, customPriceRupees, note } = req.body;
      if (!targetUid) return res.status(400).json({ error: 'targetUid required' });
      const update = customPriceRupees && customPriceRupees > 0
        ? { customPricePaise: Math.round(customPriceRupees * 100),
            customPriceNote: note || '', customPriceSetAt: new Date().toISOString(), customPriceSetBy: uid }
        : { customPricePaise: null, customPriceNote: null }; // clear override
      await db.collection('users').doc(targetUid).update(update);
      return res.status(200).json({ ok: true,
        message: customPriceRupees ? `Personal price ₹${customPriceRupees} set for this student` : 'Custom price removed — standard pricing applies' });
    }


    // ── TRIAL CONFIGURATION (admin) ──────────────────────
    if (action === 'set_trial_config') {
      const { days, dailyQuestionCap, features, allFeatures } = req.body;
      const config = {};
      if (days !== undefined) config.days = days;
      if (dailyQuestionCap !== undefined) config.dailyQuestionCap = dailyQuestionCap; // per subject per day
      if (features !== undefined) config.features = features; // array of feature keys
      if (allFeatures !== undefined) config.allFeatures = allFeatures; // true = all features during trial
      config.updatedAt = new Date().toISOString();
      await db.collection('config').doc('trial').set(config, { merge: true });
      return res.status(200).json({ ok: true, message: 'Trial config updated', config });
    }
    // ── ACADEMY ADMIN DELEGATION ─────────────────────────
    // Grant academy_admin role to a teacher — they get limited admin controls for their academy only
    if (action === 'grant_academy_admin') {
      const { targetUid, academyId } = req.body;
      if (!targetUid || !academyId) return res.status(400).json({ error: 'targetUid and academyId required' });
      await db.collection('users').doc(targetUid).update({
        academyRole: 'academy_admin', academyId,
      });
      return res.status(200).json({ ok: true, message: 'Academy admin role granted' });
    }

    if (action === 'log_feedback') {
      const { feedback } = req.body;
      if (!feedback) return res.status(400).json({ error: 'feedback required' });
      await db.collection('feedback').add({ ...feedback, uid, submittedAt: new Date().toISOString() });

      // Route directly to the founder, not a generic support queue - at this stage,
      // every piece of non-conversion feedback needs a human to see it fast.
      // Reuses notifications.js's already-tested mail transport, no duplicate setup.
      try {
        const { sendEmail } = require('./notifications');
        if (sendEmail) {
          await sendEmail('rahim@bluetrace.tech',
            (fb, fromUid) => ({
              subject: `NEETAce feedback from ${fb.email || fromUid || 'a user'}`,
              html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
                <h2 style="color:#0a2342">New feedback received</h2>
                <p style="color:#444"><b>From:</b> ${fb.email || fromUid}</p>
                <p style="color:#444"><b>Context:</b> ${fb.context || 'not specified'}</p>
                <div style="background:#f0f7ff;border-radius:9px;padding:14px;margin:14px 0;white-space:pre-wrap">${fb.message || JSON.stringify(fb)}</div>
                <p style="color:#888;font-size:12px">Also saved in Firestore feedback collection.</p>
              </div>`,
            }), feedback, uid);
        }
      } catch (e) { /* feedback is already durably saved above; email is best-effort */ }

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });

  } catch (err) {
    console.error('admin error', action, err);
    return res.status(500).json({ error: err.message });
  }
};
