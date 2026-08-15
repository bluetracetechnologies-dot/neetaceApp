module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email, paymentId, orderId } = req.body || {};
  console.log('Payment recorded:', { email, paymentId, orderId });
  return res.status(200).json({ ok: true });
};
