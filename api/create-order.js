// api/create-order.js
// POST { uid, sessionToken }
// Verifies session first, then creates Razorpay order server-side.
// Amount is FIXED here — client can never change the price.
const Razorpay = require('razorpay');
const { db } = require('./_firebase');

const PLAN_PRICE_PAISE = 79900; // ₹799

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, sessionToken } = req.body || {};
  if (!uid || !sessionToken) return res.status(400).json({ error: 'uid and sessionToken required' });

  // Verify session before allowing payment
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return res.status(404).json({ error: 'User not found' });
  const profile = snap.data();
  if (profile.sessionToken !== sessionToken) return res.status(401).json({ error: 'Invalid session. Please sign in again.' });
  if (profile.disabled) return res.status(403).json({ error: 'Access disabled' });

  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return res.status(500).json({ error: 'Payment not configured yet. Contact admin.' });

  try {
    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await instance.orders.create({
      amount: PLAN_PRICE_PAISE,
      currency: 'INR',
      receipt: `neetace_${uid}_${Date.now()}`,
      notes: { uid, email: profile.email, plan: 'NEETAce Pro' },
    });
    return res.status(200).json({
      orderId: order.id, amount: order.amount,
      currency: order.currency, keyId,
      userName: profile.name, userEmail: profile.email,
    });
  } catch (err) {
    console.error('create-order error', err);
    return res.status(500).json({ error: 'Could not create payment order. Please try again.' });
  }
};
