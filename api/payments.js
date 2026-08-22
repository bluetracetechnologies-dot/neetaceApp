// api/payments.js — merged payment endpoints
// POST { action: 'create_order' | 'verify' | 'success', ... }
const Razorpay = require('razorpay');
const { db } = require('./_firebase');
const crypto = require('crypto');
const { verifySession } = require('../lib/session');

const FALLBACK = { plan_pro:79900, plan_medium:49900, plan_starter:29900, plan_monthly:9900 };

async function getPlanPrice(planKey) {
  try {
    const snap = await db.collection('config').doc('pricing').get();
    if (snap.exists) { const plan = snap.data()[planKey]; if (plan?.price_paise) return { price: plan.price_paise, label: plan.label }; }
  } catch(e) {}
  return { price: FALLBACK[planKey]||79900, label: planKey };
}

async function applyPromo(code, base, uid) {
  if (!code) return { finalPrice:base, discount:0, valid:false };
  try {
    const snap = await db.collection('config').doc('promos').get();
    if (!snap.exists) return { finalPrice:base, discount:0, valid:false };
    const promo = (snap.data().codes||{})[code.toUpperCase()];
    if (!promo) return { finalPrice:base, discount:0, valid:false, err:'Invalid promo code' };
    if (promo.expires && new Date(promo.expires)<new Date()) return { finalPrice:base, discount:0, valid:false, err:'Promo expired' };
    if (promo.max_uses && promo.used>=promo.max_uses) return { finalPrice:base, discount:0, valid:false, err:'Promo exhausted' };
    if (promo.single_use) { const used = await db.collection('promo_uses').where('uid','==',uid).where('code','==',code.toUpperCase()).limit(1).get(); if (!used.empty) return { finalPrice:base, discount:0, valid:false, err:'Already used' }; }
    let discount = promo.type==='percent_off' ? Math.round(base*promo.value/100) : (promo.value||0)*100;
    return { finalPrice:Math.max(100,base-discount), discount, valid:true, label:promo.label||code };
  } catch(e) { return { finalPrice:base, discount:0, valid:false }; }
}

function nextMay31() { const n=new Date(); let d=new Date(n.getFullYear(),4,31,23,59,59); if(n>d) d=new Date(n.getFullYear()+1,4,31,23,59,59); return d; }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const action = body.action || 'create_order';

  // ── CREATE ORDER ──
  if (action === 'create_order') {
    const { uid, sessionToken, planKey = 'plan_pro', promoCode } = body;
    const auth = await verifySession(db, uid, sessionToken);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const profile = auth.profile;
    if (profile.disabled) return res.status(403).json({ error: 'Access disabled' });
    const keyId=process.env.RAZORPAY_KEY_ID, keySecret=process.env.RAZORPAY_KEY_SECRET;
    if (!keyId||!keySecret) return res.status(500).json({ error: 'Payment not configured.' });
    try {
      let { price:basePrice, label:planLabel } = await getPlanPrice(planKey);
      if (profile.customPricePaise && profile.customPricePaise > 0) { basePrice = profile.customPricePaise; planLabel = (planLabel||'Plan') + ' (Personal Offer)'; }
      const { finalPrice, discount, valid:promoValid, label:promoLabel, err:promoError } = await applyPromo(promoCode, basePrice, uid);
      const instance = new Razorpay({key_id:keyId, key_secret:keySecret});
      const order = await instance.orders.create({ amount:finalPrice, currency:'INR', receipt:`neetace_${uid}_${Date.now()}`, notes:{uid, email:profile.email, plan:planKey, planLabel, promoCode:promoCode||'', discount, gstin:'27AAOCB7164R1ZP', seller:'Bluetrace Technologies Pvt. Ltd.'} });
      return res.status(200).json({ orderId:order.id, amount:order.amount, currency:order.currency, keyId, planKey, planLabel, basePrice, discount, promoValid, promoLabel:promoLabel||null, promoError:promoError||null, userName:profile.name, userEmail:profile.email });
    } catch(err) { return res.status(500).json({ error: 'Could not create payment order.' }); }
  }

  // ── VERIFY PAYMENT ──
  if (action === 'verify') {
    const { uid, sessionToken, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!uid||!sessionToken||!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)
      return res.status(400).json({ error: 'Missing payment params' });
    const keyId = process.env.RAZORPAY_KEY_ID, keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId||!keySecret) return res.status(500).json({ error: 'Payment not configured.' });

    // FIX (security): this session-ownership check was missing entirely - sessionToken
    // was destructured from the request but never actually verified against the real
    // value on the user's own document, unlike create_order a few lines above.
    const auth = await verifySession(db, uid, sessionToken);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const expectedSig = crypto.createHmac('sha256', keySecret).update(razorpay_order_id + '|' + razorpay_payment_id).digest('hex');
    if (expectedSig !== razorpay_signature) return res.status(400).json({ error: 'Invalid payment signature.' });

    // FIX (security): confirm the order Razorpay actually created belongs to THIS uid,
    // not just that the signature is valid for some order/payment pair. Without this,
    // a valid signature for anyone's real payment could be replayed against a
    // different uid, crediting an account that never paid.
    try {
      const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const order = await instance.orders.fetch(razorpay_order_id);
      if (!order || !order.notes || order.notes.uid !== uid)
        return res.status(403).json({ error: 'This payment does not belong to this account.' });
    } catch (err) {
      return res.status(500).json({ error: 'Could not verify order ownership.' });
    }

    // FIX (security): reject if this exact payment_id has already been used to credit
    // ANY account - closes the replay path where one real payment activates multiple
    // free accounts. Reuses the existing paymentId field, no new collection needed.
    const alreadyUsed = await db.collection('users').where('paymentId', '==', razorpay_payment_id).limit(1).get();
    if (!alreadyUsed.empty) return res.status(409).json({ error: 'This payment has already been used.' });

    const paidUntil = nextMay31();
    await db.collection('users').doc(uid).update({ paid: true, paidUntil: paidUntil.toISOString(), paymentId: razorpay_payment_id, paidAt: new Date().toISOString() });
    try { const { dispatch } = require('./notifications'); dispatch(uid, 'payment_success', { planLabel: 'Pro' }).catch(()=>{}); } catch(e) {}
    return res.status(200).json({ verified: true, paidUntil: paidUntil.toISOString() });
  }

  // ── PAYMENT SUCCESS (logging) ──
  if (action === 'success') {
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
