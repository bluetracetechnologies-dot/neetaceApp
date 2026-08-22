// api/_tutor.js
//
// AI Tutor backend. Underscore-prefixed deliberately: Vercel counts every
// non-underscore file in /api as a deployable serverless function, and the
// Hobby plan caps at 12 - which this project is already at. Routed through
// scoring.js the same way _test-series.js routes through academy.js, so this
// adds real functionality at zero function cost.
//
// Provider: Google Gemini. Chosen because it has a genuine free tier, so the
// feature can ship and be measured before it costs anything. Key lives in
// Vercel env as GEMINI_API_KEY - never in this repo.
//
// Tier gating and rate limits reuse the EXISTING ai_tutor feature config in
// features.js (plans: pro/monthly/institute, usageCap 20/day with pro
// unlimited). No parallel gating system was invented for this.

const { db } = require('./_firebase');

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PAID_PLANS = ['pro', 'monthly', 'institute', 'academy'];
const DEFAULT_DAILY_CAP = 20;
const MAX_QUESTION_CHARS = 500;

// Scoped hard to the NEET syllabus. Without this the model happily answers
// anything, which burns quota on off-topic questions and misrepresents what
// the product is for.
const SYSTEM_PROMPT = [
  'You are a NEET UG tutor for Indian students preparing for the medical entrance exam.',
  'Answer ONLY questions about NEET Physics, Chemistry and Biology at NCERT Class 11-12 level.',
  'If a question is outside that syllabus, say so briefly and invite a syllabus question instead.',
  'Keep answers under 180 words. Use simple, direct English.',
  'Structure: a short direct explanation, then the NCERT class and chapter if you are confident of it, then one exam tip.',
  'Never invent NCERT page numbers. Only cite a chapter if you are confident.',
  'Never guarantee marks, ranks or results.',
].join(' ');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isPaidUser(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.academyId) return true;
  if (user.paid === true) return true;
  return PAID_PLANS.indexOf(user.planKey) >= 0;
}

// Reads the admin-configured cap from config/features rather than hardcoding,
// so the existing admin panel keeps working as the single source of truth.
async function resolveDailyCap(user) {
  if (user && user.role === 'admin') return null; // unlimited
  try {
    const snap = await db.collection('config').doc('features').get();
    const cfg = snap.exists ? snap.data().ai_tutor : null;
    if (cfg && cfg.usageCap) {
      const override = cfg.usageCap.planOverride || {};
      if (user && Object.prototype.hasOwnProperty.call(override, user.planKey)) {
        return override[user.planKey]; // may legitimately be null = unlimited
      }
      if (typeof cfg.usageCap.daily === 'number') return cfg.usageCap.daily;
    }
  } catch (e) { /* fall through to default */ }
  return DEFAULT_DAILY_CAP;
}

async function countTodayUsage(uid) {
  const doc = await db.collection('ai_tutor_usage').doc(`${uid}_${todayKey()}`).get();
  return doc.exists ? (doc.data().count || 0) : 0;
}

async function incrementUsage(uid) {
  const ref = db.collection('ai_tutor_usage').doc(`${uid}_${todayKey()}`);
  const snap = await ref.get();
  const current = snap.exists ? (snap.data().count || 0) : 0;
  await ref.set({ uid, date: todayKey(), count: current + 1, updatedAt: new Date().toISOString() }, { merge: true });
  return current + 1;
}

async function callGemini(question, apiKey) {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: question }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
  };
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data
    && data.candidates
    && data.candidates[0]
    && data.candidates[0].content
    && data.candidates[0].content.parts
    && data.candidates[0].content.parts[0]
    && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Gemini returned no usable text');
  return text.trim();
}

// `user` is passed in by the caller (scoring.js) which has ALREADY verified the
// session - this module never re-implements auth, matching lib/session.js usage
// everywhere else.
async function handleAsk(req, res, uid, user) {
  const question = String(req.body.question || '').trim();
  if (!question) return res.status(400).json({ error: 'question required' });
  if (question.length > MAX_QUESTION_CHARS) {
    return res.status(400).json({ error: `Question too long (max ${MAX_QUESTION_CHARS} characters)` });
  }

  // Tier gate. `fallback: true` tells the frontend to serve its built-in
  // notes library instead of showing an error - the feature degrades, never breaks.
  if (!isPaidUser(user)) {
    return res.status(200).json({
      ok: false, fallback: true, reason: 'plan',
      message: 'AI Tutor is available on paid plans. Showing quick notes instead.',
    });
  }

  const cap = await resolveDailyCap(user);
  if (cap !== null && cap !== undefined) {
    const used = await countTodayUsage(uid);
    if (used >= cap) {
      return res.status(200).json({
        ok: false, fallback: true, reason: 'cap', used, cap,
        message: `You have used all ${cap} AI Tutor questions for today. Showing quick notes instead.`,
      });
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      ok: false, fallback: true, reason: 'unconfigured',
      message: 'AI Tutor is not configured yet. Showing quick notes instead.',
    });
  }

  try {
    const answer = await callGemini(question, apiKey);
    const used = await incrementUsage(uid);
    return res.status(200).json({
      ok: true, answer,
      used, cap: cap === null || cap === undefined ? null : cap,
    });
  } catch (err) {
    console.error('ai_tutor error', err.message);
    // Never surface a raw provider error to a student, and never charge them a
    // usage credit for a failed call.
    return res.status(200).json({
      ok: false, fallback: true, reason: 'error',
      message: 'AI Tutor could not answer right now. Showing quick notes instead.',
    });
  }
}

async function handler(req, res, uid, user) {
  const action = req.body && req.body.action;
  if (action === 'ai_ask') return handleAsk(req, res, uid, user);
  if (action === 'ai_usage') {
    const cap = await resolveDailyCap(user);
    const used = await countTodayUsage(uid);
    return res.status(200).json({
      ok: true, used,
      cap: cap === null || cap === undefined ? null : cap,
      paid: isPaidUser(user),
    });
  }
  return res.status(400).json({ error: 'Unknown tutor action' });
}

handler.actions = new Set(['ai_ask', 'ai_usage']);
module.exports = handler;
module.exports.isPaidUser = isPaidUser;
module.exports.resolveDailyCap = resolveDailyCap;
module.exports.SYSTEM_PROMPT = SYSTEM_PROMPT;
