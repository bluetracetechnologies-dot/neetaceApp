// lib/session.js
//
// Single source of truth for the two session-verification patterns that were
// previously hand-copied across 13 files, 19+ times, with no shared function.
// That duplication is the direct root cause of the payments.js vulnerability
// found in the full-codebase review: `verify` simply forgot to copy the check
// that every other action correctly had. This file exists to make that class
// of bug structurally harder to reintroduce.
//
// Two DELIBERATELY separate functions, not one - "is this a valid session" and
// "is this a valid ADMIN session" are genuinely different checks used in
// different contexts, and forcing them into one function with a flag would
// obscure which one a given call site actually needs.
//
// One intentional, disclosed behavior normalization: some original call sites
// returned 404 for "user doesn't exist" and 401 for "wrong token" separately;
// others folded both into a single 401. This module folds both into 401
// consistently (a non-existent uid is not meaningfully different from an
// invalid session, from the caller's perspective) - a deliberate small
// consistency improvement, not an accidental behavior change.

async function verifySession(db, uid, sessionToken) {
  if (!uid || !sessionToken) return { ok: false, status: 400, error: 'uid and sessionToken required' };
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return { ok: false, status: 401, error: 'Invalid session' };
  const profile = snap.data();
  if (profile.sessionToken !== sessionToken) return { ok: false, status: 401, error: 'Invalid session' };
  return { ok: true, profile, snap };
}

async function verifyAdminSession(db, uid, sessionToken) {
  if (!uid || !sessionToken) return { ok: false, status: 400, error: 'uid and sessionToken required' };
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return { ok: false, status: 403, error: 'Admin access required' };
  const profile = snap.data();
  if (profile.sessionToken !== sessionToken || profile.role !== 'admin')
    return { ok: false, status: 403, error: 'Admin access required' };
  return { ok: true, profile, snap };
}

module.exports = { verifySession, verifyAdminSession };
