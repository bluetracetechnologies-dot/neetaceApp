// api/notifications.js
// Notification system - Email (Gmail SMTP) + WhatsApp link generation + SMS ready
//
// Env vars needed in Vercel:
//   GMAIL_USER      = bluetracetechnologies@gmail.com
//   GMAIL_APP_PASS  = (16-char App Password from Google Account → Security → App Passwords)
//   MSG91_KEY       = (optional, for SMS - get from msg91.com)
//   MSG91_SENDER    = NEETAC (optional, 6-char SMS sender ID)
//
// Trigger events (called internally by other APIs):
//   trial_started   - Day 1: welcome email + WhatsApp to student + parent
//   trial_warning   - Day 5: 2 days left warning
//   trial_last_day  - Day 7: final push + offer
//   trial_expired   - Expired: last chance
//   payment_success - Paid: confirmation
//   weekly_progress - Every Monday: progress digest
//   offer_alert     - Festival offer went live
//
// POST { action:'send', uid, sessionToken, event, targetUid? } - admin triggered
// POST { action:'update_contacts', uid, sessionToken, phone, parentPhone, whatsapp } - user updates

const { db } = require('./_firebase');
const nodemailer = require('nodemailer');

// ── Email transporter (Gmail SMTP) ──────────────────────
function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASS) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
  });
}

// ── Email templates ─────────────────────────────────────
const EMAIL_TEMPLATES = {

  trial_started: (name, daysLeft, trialEnd) => ({
    subject: `Welcome to NEETAce, ${name}! Your 7-day trial has started 🎉`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#0a2342,#1a56db);color:#fff;border-radius:14px;padding:28px;text-align:center;margin-bottom:20px">
    <div style="font-size:28px;font-weight:800;margin-bottom:4px">NEETAce</div>
    <div style="font-size:13px;opacity:.8">Every student. Every dream. One app.</div>
  </div>
  <h2 style="color:#0a2342">Welcome, ${name}! 👋</h2>
  <p style="color:#444;line-height:1.7">Your <b>7-day free trial</b> has started. You now have full access to everything NEETAce offers - no payment needed yet.</p>
  <div style="background:#f0f4f8;border-radius:10px;padding:16px;margin:16px 0">
    <b style="color:#0a2342">What to do in your first 7 days:</b>
    <ul style="color:#444;line-height:2;margin-top:8px">
      <li>⚛️ Try a <b>topic quiz</b> - your questions have unique numbers, so no one can copy your answers</li>
      <li>🤖 Ask the <b>AI Tutor</b> any NCERT concept you're confused about</li>
      <li>📓 Let <b>Galti Copy</b> auto-log every wrong answer with an explanation</li>
      <li>🏆 Check your <b>All India Rank</b> estimate in the leaderboard</li>
    </ul>
  </div>
  <div style="text-align:center;margin:20px 0">
    <a href="https://neet.bluetrace.tech" style="background:#1a56db;color:#fff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px">Open NEETAce →</a>
  </div>
  <p style="color:#888;font-size:12px;text-align:center">Trial ends: ${trialEnd}. After that, upgrade from just ₹299.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
  <p style="color:#aaa;font-size:11px;text-align:center">
    NEETAce · Bluetrace Technologies Pvt. Ltd. · DPIIT DIPP266429<br>
    Parbhani, Maharashtra, India · support@bluetrace.tech
  </p>
</div>`,
  }),

  trial_warning: (name, daysLeft) => ({
    subject: `⏰ ${daysLeft} days left in your NEETAce trial, ${name}`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
  <div style="background:#f59e0b;color:#fff;border-radius:14px;padding:22px;text-align:center;margin-bottom:20px">
    <div style="font-size:36px;margin-bottom:4px">⏰</div>
    <div style="font-size:20px;font-weight:800">${daysLeft} days left</div>
    <div style="font-size:13px;opacity:.9">in your free trial</div>
  </div>
  <h2 style="color:#0a2342">Don't lose your progress, ${name}</h2>
  <p style="color:#444;line-height:1.7">Your trial ends in <b>${daysLeft} day${daysLeft!==1?'s':''}</b>. If you don't upgrade, you'll lose access to your Galti Copy, your rank, and your adaptive practice - but your progress is saved and ready to continue.</p>
  <div style="background:#fef3e2;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;padding:14px;margin:16px 0">
    <b>Plans start at just ₹299:</b><br>
    <span style="color:#444;font-size:13px">Annual Pro ₹799 · Monthly ₹99 · Starter ₹299</span>
  </div>
  <div style="text-align:center;margin:20px 0">
    <a href="https://neet.bluetrace.tech" style="background:#f59e0b;color:#fff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px">Upgrade Now →</a>
  </div>
  <p style="color:#aaa;font-size:11px;text-align:center">NEETAce · support@bluetrace.tech · Crack NEET. Not your budget.</p>
</div>`,
  }),

  trial_last_day: (name) => ({
    subject: `⛔ Last day of your NEETAce trial, ${name} - upgrade today`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
  <div style="background:#e34948;color:#fff;border-radius:14px;padding:22px;text-align:center;margin-bottom:20px">
    <div style="font-size:36px;margin-bottom:4px">⛔</div>
    <div style="font-size:20px;font-weight:800">Trial ends today</div>
  </div>
  <h2 style="color:#0a2342">Today is your last day, ${name}</h2>
  <p style="color:#444;line-height:1.7">After midnight today, your free trial ends. Upgrade before then to continue without any interruption to your practice streak and rank.</p>
  <div style="background:#feecec;border-radius:10px;padding:16px;margin:16px 0">
    <b style="color:#e34948">After trial ends, you lose:</b>
    <ul style="color:#444;line-height:2;margin-top:8px">
      <li>❌ All quiz practice beyond Free level</li>
      <li>❌ AI Tutor</li>
      <li>❌ Galti Copy entries</li>
      <li>❌ Leaderboard rank</li>
      <li>❌ Adaptive learning engine</li>
    </ul>
    <b style="color:#16a34a">✅ Your progress stays saved - upgrade and continue exactly where you are.</b>
  </div>
  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:20px 0">
    <a href="https://neet.bluetrace.tech" style="background:#e34948;color:#fff;padding:14px 24px;border-radius:9px;text-decoration:none;font-weight:700">Upgrade Now →</a>
  </div>
  <p style="color:#888;font-size:13px;text-align:center">Annual ₹799 · Monthly ₹99 · Starter ₹299</p>
  <p style="color:#aaa;font-size:11px;text-align:center">NEETAce · support@bluetrace.tech</p>
</div>`,
  }),

  trial_expired: (name) => ({
    subject: `Your NEETAce trial has ended, ${name} - here's what's waiting for you`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
  <div style="background:#0a2342;color:#fff;border-radius:14px;padding:22px;text-align:center;margin-bottom:20px">
    <div style="font-size:36px;margin-bottom:4px">\uD83C\uDF93</div>
    <div style="font-size:20px;font-weight:800">Your trial has ended</div>
  </div>
  <h2 style="color:#0a2342">Hi ${name},</h2>
  <p style="color:#444;line-height:1.7">Your 7-day NEETAce trial ended today. Your progress, Galti Copy entries, and rank are all safely saved and waiting - nothing is lost.</p>
  <div style="background:#f0f7ff;border-left:4px solid #1F5AA8;border-radius:0 10px 10px 0;padding:14px;margin:16px 0">
    <b>Plans start at just \u20B9299/year:</b><br>
    <span style="color:#444;font-size:13px">Annual Pro \u20B9799 &middot; Monthly \u20B999 &middot; Starter \u20B9299</span>
  </div>
  <div style="text-align:center;margin:20px 0">
    <a href="https://neet.bluetrace.tech" style="background:#f59e0b;color:#fff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px">Continue Where You Left Off &rarr;</a>
  </div>
  <p style="color:#666;font-size:13px;text-align:center;line-height:1.6">Not ready yet, or something didn't work for you? Just reply to this email and tell us - we read every reply.</p>
  <p style="color:#aaa;font-size:11px;text-align:center">NEETAce &middot; support@bluetrace.tech &middot; Crack NEET. Not your budget.</p>
</div>`,
  }),

  payment_success: (name, planLabel, paidUntil) => ({
    subject: `✅ Payment confirmed - Welcome to NEETAce ${planLabel}, ${name}!`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#0a2342,#1a56db);color:#fff;border-radius:14px;padding:28px;text-align:center;margin-bottom:20px">
    <div style="font-size:40px;margin-bottom:8px">🎉</div>
    <div style="font-size:22px;font-weight:800">Payment Confirmed!</div>
    <div style="font-size:14px;opacity:.8;margin-top:4px">${planLabel} · Valid till ${paidUntil}</div>
  </div>
  <h2 style="color:#0a2342">You're all set, ${name}!</h2>
  <p style="color:#444;line-height:1.7">Your payment has been verified and your account is now fully active. All features are unlocked till <b>${paidUntil}</b>.</p>
  <div style="background:#e8fdf5;border-radius:10px;padding:16px;margin:16px 0">
    <b style="color:#0a5c0a">What's unlocked:</b>
    <ul style="color:#444;line-height:2;margin-top:8px">
      <li>✅ All 5 difficulty levels (Free Practice → Talent Required)</li>
      <li>✅ Parameterized questions - unique numbers for you</li>
      <li>✅ Full AI Tutor - ask anything</li>
      <li>✅ Galti Copy + Flashcards + Analytics</li>
      <li>✅ Global leaderboard rank</li>
    </ul>
  </div>
  <div style="text-align:center;margin:20px 0">
    <a href="https://neet.bluetrace.tech" style="background:#16a34a;color:#fff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px">Start Practicing →</a>
  </div>
  <p style="color:#aaa;font-size:11px;text-align:center">NEETAce · Bluetrace Technologies Pvt. Ltd. · support@bluetrace.tech</p>
</div>`,
  }),

  weekly_progress: (name, stats) => ({
    subject: `📊 Your NEETAce weekly report, ${name}`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#4a3aa7,#1a56db);color:#fff;border-radius:14px;padding:22px;text-align:center;margin-bottom:20px">
    <div style="font-size:22px;font-weight:800">Weekly Progress Report</div>
    <div style="font-size:13px;opacity:.8;margin-top:4px">${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long'})}</div>
  </div>
  <h2 style="color:#0a2342">Here's how you did this week, ${name}:</h2>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:16px 0">
    <div style="background:#f0f4f8;border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#1a56db">${stats.questionsThisWeek||0}</div>
      <div style="font-size:12px;color:#666">Questions attempted</div>
    </div>
    <div style="background:#f0f4f8;border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#0ca30c">${stats.accuracy||0}%</div>
      <div style="font-size:12px;color:#666">Accuracy</div>
    </div>
    <div style="background:#f0f4f8;border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#e34948">${stats.mistakesLogged||0}</div>
      <div style="font-size:12px;color:#666">Mistakes logged</div>
    </div>
    <div style="background:#f0f4f8;border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#4a3aa7">${stats.currentRank||' - '}</div>
      <div style="font-size:12px;color:#666">AIR estimate</div>
    </div>
  </div>
  ${stats.weakestTopic ? `<div style="background:#feecec;border-radius:10px;padding:14px;margin:12px 0">
    <b style="color:#e34948">Focus area this week:</b><br>
    <span style="color:#444">${stats.weakestTopic} - your weakest topic. 20 minutes daily will move your rank.</span>
  </div>` : ''}
  <div style="text-align:center;margin:20px 0">
    <a href="https://neet.bluetrace.tech" style="background:#1a56db;color:#fff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700">Continue Studying →</a>
  </div>
  <p style="color:#aaa;font-size:11px;text-align:center">NEETAce · Bluetrace Technologies Pvt. Ltd.<br>Unsubscribe: reply with "STOP"</p>
</div>`,
  }),

  parent_trial_started: (studentName, parentName, trialEnd) => ({
    subject: `${studentName} has joined NEETAce for NEET preparation`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#0a2342,#1a56db);color:#fff;border-radius:14px;padding:22px;text-align:center;margin-bottom:20px">
    <div style="font-size:22px;font-weight:800">NEETAce</div>
    <div style="font-size:13px;opacity:.8">AI-powered NEET preparation</div>
  </div>
  <h2 style="color:#0a2342">Dear ${parentName||'Parent'},</h2>
  <p style="color:#444;line-height:1.7"><b>${studentName}</b> has started a <b>7-day free trial</b> on NEETAce - an AI-powered NEET preparation app by Bluetrace Technologies.</p>
  <div style="background:#f0f4f8;border-radius:10px;padding:16px;margin:16px 0;color:#444;line-height:1.7">
    <b>About NEETAce:</b><br>
    Smart quiz practice with NCERT references, an AI tutor that explains any concept, automatic mistake tracking, and a live All India Rank estimate. Questions are unique per student - no answer sharing between classmates.
  </div>
  <p style="color:#444;line-height:1.7">The free trial ends on <b>${trialEnd}</b>. After that, full annual access costs just <b>₹799</b> (less than ₹2.20/day for the entire academic year).</p>
  <div style="text-align:center;margin:20px 0">
    <a href="https://neet.bluetrace.tech" style="background:#1a56db;color:#fff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700">Visit NEETAce →</a>
  </div>
  <p style="color:#888;font-size:12px;text-align:center">For any queries: support@bluetrace.tech · +91 94622 25303</p>
  <p style="color:#aaa;font-size:11px;text-align:center">Bluetrace Technologies Pvt. Ltd. · DPIIT DIPP266429 · Parbhani, Maharashtra</p>
</div>`,
  }),

  offer_alert: (name, festivalName, discountPct, promoCode, hoursLeft) => ({
    subject: `🎉 ${festivalName} offer - ${discountPct}% off NEETAce (${hoursLeft}h left)`,
    html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px">
  <div style="background:#f59e0b;color:#fff;border-radius:14px;padding:22px;text-align:center;margin-bottom:20px">
    <div style="font-size:36px;margin-bottom:8px">🎉</div>
    <div style="font-size:22px;font-weight:800">${festivalName} Special!</div>
    <div style="font-size:36px;font-weight:900;margin:8px 0">${discountPct}% OFF</div>
    <div style="font-size:16px;font-weight:700;background:rgba(255,255,255,.2);padding:8px 20px;border-radius:30px;display:inline-block">${promoCode}</div>
  </div>
  <h2 style="color:#0a2342">Happy ${festivalName}, ${name}!</h2>
  <p style="color:#444;line-height:1.7">For the next <b>${hoursLeft} hours</b>, get ${discountPct}% off any NEETAce plan using code <b>${promoCode}</b> at checkout.</p>
  <div style="text-align:center;margin:20px 0">
    <a href="https://neet.bluetrace.tech" style="background:#f59e0b;color:#fff;padding:14px 32px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px">Claim Offer →</a>
  </div>
  <p style="color:#888;font-size:12px;text-align:center">Offer expires in ${hoursLeft} hours. Crack NEET. Not your budget.</p>
</div>`,
  }),
};

// ── WhatsApp message templates ───────────────────────────
const WA_TEMPLATES = {
  trial_started:  (name, trialEnd) =>
    `🎉 Hi ${name}! Your NEETAce 7-day free trial has started!\n\nYou now have full access to:\n✅ AI Tutor\n✅ Unique parameterized questions\n✅ Galti Copy & Flashcards\n✅ All India Rank\n\nTrial ends: ${trialEnd}\n\nStart now → https://neet.bluetrace.tech\n\n_Crack NEET. Not your budget. - NEETAce by Bluetrace Technologies_`,

  trial_warning:  (name, daysLeft) =>
    `⏰ Hi ${name}! Only *${daysLeft} days* left in your NEETAce free trial.\n\nDon't lose your Galti Copy, rank & progress.\n\nUpgrade from just ₹299 → https://neet.bluetrace.tech\n\n_NEETAce · support@bluetrace.tech_`,

  trial_last_day: (name) =>
    `⛔ Hi ${name}! Today is the *last day* of your NEETAce trial.\n\nUpgrade before midnight to continue without losing your streak and rank.\n\n📱 https://neet.bluetrace.tech\n\n💡 Plans: ₹299 Starter · ₹799 Annual · ₹99/month`,

  trial_expired: (name) =>
    `\uD83C\uDF93 Hi ${name}! Your NEETAce trial has ended, but your progress is saved.\n\nContinue anytime from just \u20B9299 \u2192 https://neet.bluetrace.tech\n\nNot ready or ran into an issue? Just reply - we read every message.`,

  payment_success: (name, planLabel) =>
    `✅ Hi ${name}! Payment confirmed. Welcome to *NEETAce ${planLabel}*!\n\nAll features unlocked. Go crack NEET! 💪\n\n📱 https://neet.bluetrace.tech`,

  parent_trial:   (studentName, parentName) =>
    `🙏 Namaste ${parentName||''}!\n\n*${studentName}* has started preparing for NEET using NEETAce - an AI-powered app by Bluetrace Technologies.\n\nFeatures: Unique questions, AI Tutor, Mistake tracking, Live rank.\n\nFull year access: ₹799 only (₹2.20/day).\n\nLearn more: https://neet.bluetrace.tech\n📞 Support: +91 94622 25303`,

  weekly_progress: (name, q, acc, rank) =>
    `📊 *NEETAce Weekly Update - ${name}*\n\n✅ Questions done: ${q}\n🎯 Accuracy: ${acc}%\n🏆 AIR estimate: ${rank}\n\nKeep going - consistency beats talent every time!\n\nhttps://neet.bluetrace.tech`,

  offer_alert:    (name, festival, discount, code) =>
    `🎉 *${festival} Special Offer!*\n\nHi ${name}, celebrate with *${discount}% OFF* NEETAce!\n\nUse code: *${code}*\nValid for limited time only.\n\n👉 https://neet.bluetrace.tech\n\n_Crack NEET. Not your budget. - NEETAce_`,
};

// ── Send email ───────────────────────────────────────────
async function sendEmail(to, templateFn, ...args) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('Email not configured (no GMAIL_USER/GMAIL_APP_PASS)');
    return { skipped: true };
  }
  try {
    const { subject, html } = templateFn(...args);
    await transporter.sendMail({
      from: `"NEETAce by Bluetrace" <${process.env.GMAIL_USER}>`,
      to, subject, html,
    });
    return { sent: true };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { error: err.message };
  }
}

// ── WhatsApp link (free, no API) ─────────────────────────
function waLink(phone, message) {
  const clean = phone?.replace(/\D/g, '');
  if (!clean) return null;
  const num = clean.startsWith('91') ? clean : '91' + clean;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

// ── Log notification to Firestore ────────────────────────
async function logNotification(uid, event, channels, results) {
  await db.collection('notifications').add({
    uid, event, channels, results,
    sentAt: new Date().toISOString(),
  });
}

// ── Core dispatch function ────────────────────────────────
async function dispatch(uid, event, customData = {}) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return { error: 'User not found' };
  const u = snap.data();
  const prefs = u.notifPrefs || { email: true, whatsapp: true, parent: true };
  const results = {};

  const name       = u.name || 'Student';
  const email      = u.email;
  const phone      = u.phone || '';
  const parentPhone = u.parentPhone || '';
  const parentEmail = u.parentEmail || '';
  const trialEnd   = u.trialEnd ? new Date(u.trialEnd).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : ' - ';
  const daysLeft   = u.trialEnd ? Math.max(0, Math.ceil((new Date(u.trialEnd)-new Date())/86400000)) : 0;
  const planLabel  = customData.planLabel || 'Pro';
  const paidUntil  = u.paidUntil ? new Date(u.paidUntil).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '31 May';

  // ── Student email ──
  if (prefs.email && email && EMAIL_TEMPLATES[event]) {
    const tmplArgs = {
      trial_started:   [name, daysLeft, trialEnd],
      trial_warning:   [name, daysLeft],
      trial_last_day:  [name],
      trial_expired:   [name],
      payment_success: [name, planLabel, paidUntil],
      weekly_progress: [name, customData.stats || {}],
      offer_alert:     [name, customData.festival, customData.discount, customData.code, customData.hoursLeft],
    }[event] || [name];
    results.email = await sendEmail(email, EMAIL_TEMPLATES[event], ...tmplArgs);
  }

  // ── Parent email ──
  if (prefs.parent && parentEmail && event === 'trial_started') {
    results.parentEmail = await sendEmail(parentEmail, EMAIL_TEMPLATES.parent_trial_started, name, u.parentName||'Parent', trialEnd);
  }

  // ── WhatsApp links (stored for admin to click/send) ──
  if (prefs.whatsapp) {
    const waMsgArgs = {
      trial_started:   WA_TEMPLATES.trial_started(name, trialEnd),
      trial_warning:   WA_TEMPLATES.trial_warning(name, daysLeft),
      trial_last_day:  WA_TEMPLATES.trial_last_day(name),
      trial_expired:   WA_TEMPLATES.trial_expired(name),
      payment_success: WA_TEMPLATES.payment_success(name, planLabel),
      weekly_progress: WA_TEMPLATES.weekly_progress(name, customData.stats?.questionsThisWeek||0, customData.stats?.accuracy||0, customData.stats?.currentRank||' - '),
      offer_alert:     WA_TEMPLATES.offer_alert(name, customData.festival, customData.discount, customData.code),
    }[event];

    if (waMsgArgs) {
      results.whatsappLink   = phone       ? waLink(phone, waMsgArgs)       : null;
      results.parentWaLink   = parentPhone ? waLink(parentPhone, WA_TEMPLATES.parent_trial(name, u.parentName||'Parent')) : null;
    }
  }

  await logNotification(uid, event, Object.keys(results), results);
  return results;
}

// ── API Handler ──────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, uid, sessionToken } = req.body || {};
  if (!uid || !sessionToken) return res.status(400).json({ error: 'uid and sessionToken required' });

  const uSnap = await db.collection('users').doc(uid).get();
  if (!uSnap.exists) return res.status(404).json({ error: 'User not found' });
  const user = uSnap.data();
  if (user.sessionToken !== sessionToken) return res.status(401).json({ error: 'Invalid session' });

  // ── Update contact details ──────────────────────────────
  if (action === 'update_contacts') {
    const { phone, parentPhone, parentName, parentEmail, notifPrefs } = req.body;
    const update = {};
    if (phone        !== undefined) update.phone        = phone.trim();
    if (parentPhone  !== undefined) update.parentPhone  = parentPhone.trim();
    if (parentName   !== undefined) update.parentName   = parentName.trim();
    if (parentEmail  !== undefined) update.parentEmail  = parentEmail.trim();
    if (notifPrefs   !== undefined) update.notifPrefs   = notifPrefs;
    await db.collection('users').doc(uid).update(update);
    return res.status(200).json({ ok: true, message: 'Contact details updated' });
  }

  // ── Get notification history ────────────────────────────
  if (action === 'get_history') {
    const snap = await db.collection('notifications').where('uid','==',uid).orderBy('sentAt','desc').limit(20).get();
    return res.status(200).json({ notifications: snap.docs.map(d=>d.data()) });
  }

  // ── Self-send: student triggers their own notification ──
  if (action === 'send_self') {
    const { event } = req.body;
    const allowed = ['trial_started','payment_success','weekly_progress'];
    if (!allowed.includes(event)) return res.status(400).json({ error: 'Event not allowed for self-send' });
    const results = await dispatch(uid, event, req.body);
    return res.status(200).json({ ok: true, results });
  }

  // ── Admin: send to any user or all users ────────────────
  if (action === 'admin_send') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { targetUid, event, broadcast, customData } = req.body;

    if (broadcast) {
      // Bulk send - process in batches of 50 to avoid timeouts
      const snap = await db.collection('users').where('role','!=','admin').limit(50).get();
      const results = await Promise.all(snap.docs.map(d => dispatch(d.id, event, customData||{})));
      return res.status(200).json({ ok: true, sent: results.length });
    }

    if (targetUid) {
      const results = await dispatch(targetUid, event, customData||{});
      return res.status(200).json({ ok: true, results });
    }
    return res.status(400).json({ error: 'targetUid or broadcast required' });
  }

  // ── Admin: get WhatsApp links for a user (click to open WA) ──
  if (action === 'get_wa_links') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { targetUid, event } = req.body;
    const results = await dispatch(targetUid, event, req.body);
    return res.status(200).json({ ok: true, ...results });
  }

  return res.status(400).json({ error: 'Unknown action' });
};

// Named export so other API files (e.g. admin.js log_feedback) can reuse the same,
// already-tested mail transport instead of duplicating nodemailer setup.
module.exports.sendEmail = sendEmail;


// Export dispatch for internal use by other API files
module.exports.dispatch = dispatch;
