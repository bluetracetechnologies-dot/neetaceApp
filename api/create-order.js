// api/create-order.js
// POST { uid, sessionToken, planKey?, promoCode? }
// Amount ALWAYS from Firestore config — client never sets price
const Razorpay = require('razorpay');
const { db } = require('./_firebase');

const FALLBACK = {
  plan_pro:79900, plan_medium:49900, plan_starter:29900, plan_monthly:9900,
};

async function getPlanPrice(planKey) {
  try {
    const snap = await db.collection('config').doc('pricing').get();
    if (snap.exists) {
      const plan = snap.data()[planKey];
      if (plan?.price_paise) return { price: plan.price_paise, label: plan.label };
    }
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
    if (promo.expires && new Date(promo.expires)<new Date())
      return { finalPrice:base, discount:0, valid:false, err:'Promo code expired' };
    if (promo.max_uses && promo.used>=promo.max_uses)
      return { finalPrice:base, discount:0, valid:false, err:'Promo code exhausted' };
    if (promo.single_use) {
      const used = await db.collection('promo_uses')
        .where('uid','==',uid).where('code','==',code.toUpperCase()).limit(1).get();
      if (!used.empty) return { finalPrice:base, discount:0, valid:false, err:'Already used this code' };
    }
    let discount = promo.type==='percent_off'
      ? Math.round(base*promo.value/100)
      : (promo.value||0)*100;
    return { finalPrice:Math.max(100,base-discount), discount, valid:true, label:promo.label||code };
  } catch(e) { return { finalPrice:base, discount:0, valid:false }; }
}

module.exports = async function handler(req, res) {
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const { uid, sessionToken, planKey='plan_pro', promoCode } = req.body||{};
  if (!uid||!sessionToken) return res.status(400).json({error:'uid and sessionToken required'});

  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return res.status(404).json({error:'User not found'});
  const profile = snap.data();
  if (profile.sessionToken!==sessionToken) return res.status(401).json({error:'Invalid session'});
  if (profile.disabled) return res.status(403).json({error:'Access disabled'});

  const keyId=process.env.RAZORPAY_KEY_ID, keySecret=process.env.RAZORPAY_KEY_SECRET;
  if (!keyId||!keySecret) return res.status(500).json({error:'Payment not configured.'});

  try {
    const { price:basePrice, label:planLabel } = await getPlanPrice(planKey);
    const { finalPrice, discount, valid:promoValid, label:promoLabel, err:promoError } =
      await applyPromo(promoCode, basePrice, uid);

    const instance = new Razorpay({key_id:keyId, key_secret:keySecret});
    const order = await instance.orders.create({
      amount:finalPrice, currency:'INR',
      receipt:`neetace_${uid}_${Date.now()}`,
      notes:{uid, email:profile.email, plan:planKey, planLabel, promoCode:promoCode||'', discount},
    });

    return res.status(200).json({
      orderId:order.id, amount:order.amount, currency:order.currency, keyId,
      planKey, planLabel, basePrice, discount, promoValid,
      promoLabel:promoLabel||null, promoError:promoError||null,
      userName:profile.name, userEmail:profile.email,
    });
  } catch(err) {
    console.error('create-order error', err);
    return res.status(500).json({error:'Could not create payment order. Please try again.'});
  }
};
