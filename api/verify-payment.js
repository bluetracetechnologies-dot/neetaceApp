// api/verify-payment.js
// POST { uid, sessionToken, razorpay_order_id, razorpay_payment_id, razorpay_signature }
// 1. Verifies Razorpay HMAC signature (proves payment is genuine)
// 2. Writes paid=true + paidUntil=nextMay31 to Firestore
// Access is granted ONLY after both checks pass — never on client callback alone
const crypto = require('crypto');
const { db } = require('./_firebase');

function nextMay31() {
  const now = new Date();
  let may31 = new Date(now.getFullYear(), 4, 31, 23, 59, 59);
  if (now > may31) may31 = new Date(now.getFullYear() + 1, 4, 31, 23, 59, 59);
  return may31;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, sessionToken, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!uid || !sessionToken || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return res.status(400).json({ error: 'Missing required fields' });

  // Verify session
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return res.status(404).json({ error: 'User not found' });
  const profile = snap.data();
  if (profile.sessionToken !== sessionToken) return res.status(401).json({ error: 'Invalid session' });

  // Verify Razorpay signature — HMAC-SHA256 of "order_id|payment_id" with secret key
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return res.status(500).json({ error: 'Payment secret not configured' });

  const expectedSig = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    console.warn('Signature mismatch for order', razorpay_order_id, 'uid', uid);
    return res.status(400).json({ verified: false, error: 'Payment verification failed. Contact support.' });
  }

  // Signature valid — write paid status to Firestore
  const paidUntil = nextMay31();
  await db.collection('users').doc(uid).update({
    paid: true,
    paidUntil: paidUntil.toISOString(),
    lastPaymentId: razorpay_payment_id,
    lastPaymentDate: new Date().toISOString(),
  });

  // Log payment in a separate collection for records
  await db.collection('payments').add({
    uid, email: profile.email,
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    amount: 79900, currency: 'INR',
    paidUntil: paidUntil.toISOString(),
    paidAt: new Date().toISOString(),
  });

  console.log('Payment verified and recorded:', razorpay_payment_id, 'uid:', uid);
  return res.status(200).json({ verified: true, paidUntil: paidUntil.toISOString() });
};
