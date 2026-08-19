const { resetDb, seed, getDoc } = require('../helpers/withMockDb');
const { baseUser } = require('../fixtures/users.fixture');
const crypto = require('crypto');

// Mock the razorpay package itself - real network never touched. Each test
// controls exactly what orders.fetch() returns, to simulate both the correct
// owner and an attacker trying to credit a different uid.
let mockOrdersFetch;
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn().mockResolvedValue({ id: 'order_test123', amount: 29900, currency: 'INR' }),
      fetch: (...args) => mockOrdersFetch(...args),
    },
  }));
});

process.env.RAZORPAY_KEY_ID = 'test_key_id';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret';

const handler = require('../../api/payments');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}

function realSignature(orderId, paymentId) {
  return crypto.createHmac('sha256', 'test_key_secret').update(orderId + '|' + paymentId).digest('hex');
}

beforeEach(() => {
  resetDb();
  mockOrdersFetch = jest.fn().mockResolvedValue({ id: 'order_1', notes: { uid: 'u1' } });
});

describe('VULNERABILITY FIX: payments.js verify action', () => {
  test('CONFIRMED VULNERABILITY (now fixed): verify rejects a sessionToken that does not match the real one on the user doc', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'the_real_token' }));
    const sig = realSignature('order_1', 'pay_1');
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'attacker_guessed_wrong_token', // does NOT match the real one
      action: 'verify', razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: sig,
    });
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(getDoc('users', 'u1').paid).toBeFalsy(); // must NOT have been credited
  });

  test('CONFIRMED VULNERABILITY (now fixed): verify rejects when the order does not actually belong to the requesting uid', async () => {
    seed('users', 'u_attacker', baseUser({ uid: 'u_attacker', sessionToken: 'attacker_real_token' }));
    mockOrdersFetch = jest.fn().mockResolvedValue({ id: 'order_1', notes: { uid: 'u_victim_or_someone_else' } }); // order belongs to someone else
    const sig = realSignature('order_1', 'pay_1');
    const { req, res } = mockReqRes({
      uid: 'u_attacker', sessionToken: 'attacker_real_token', // attacker's OWN valid session
      action: 'verify', razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: sig,
    });
    await handler(req, res);
    expect(res._status).toBe(403);
    expect(getDoc('users', 'u_attacker').paid).toBeFalsy();
  });

  test('CONFIRMED VULNERABILITY (now fixed): a payment_id already used to credit one account cannot be replayed to credit another', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'token1', paymentId: 'pay_1' })); // already credited with this exact payment
    seed('users', 'u2', baseUser({ uid: 'u2', sessionToken: 'token2' }));
    mockOrdersFetch = jest.fn().mockResolvedValue({ id: 'order_1', notes: { uid: 'u2' } });
    const sig = realSignature('order_1', 'pay_1'); // SAME payment_id as u1's already-credited one
    const { req, res } = mockReqRes({
      uid: 'u2', sessionToken: 'token2', action: 'verify',
      razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: sig,
    });
    await handler(req, res);
    expect(res._status).toBe(409);
    expect(getDoc('users', 'u2').paid).toBeFalsy();
  });

  test('the genuine, correct case still succeeds: real owner, real session, real unused payment', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    mockOrdersFetch = jest.fn().mockResolvedValue({ id: 'order_1', notes: { uid: 'u1' } });
    const sig = realSignature('order_1', 'pay_1');
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'real_token', action: 'verify',
      razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: sig,
    });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'u1').paid).toBe(true);
    expect(getDoc('users', 'u1').paymentId).toBe('pay_1');
  });

  test('still rejects an invalid/forged signature (this protection already existed and must not regress)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    const { req, res } = mockReqRes({
      uid: 'u1', sessionToken: 'real_token', action: 'verify',
      razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'totally_fake_signature',
    });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('rejects missing required fields, unchanged behavior', async () => {
    const { req, res } = mockReqRes({ uid: 'u1', action: 'verify' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});

describe('Regression: create_order still works correctly after the verify fix', () => {
  test('creates an order for a valid, authenticated user', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token', email: 'student@example.com' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_starter' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.orderId).toBe('order_test123');
  });

  test('rejects a disabled user', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token', disabled: true }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order' });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test('rejects a wrong session token', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'wrong', action: 'create_order' });
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('MIGRATION NOTE: a non-existent uid now returns 401 (normalized via shared verifySession), was 404 before', async () => {
    const { req, res } = mockReqRes({ uid: 'ghost_uid', sessionToken: 'anything', action: 'create_order' });
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  test('a customPricePaise override on the user doc replaces the plan default', async () => {
    const { seed: s2 } = require('../helpers/withMockDb');
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token', customPricePaise: 19900 }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_pro' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.basePrice).toBe(19900); // the personal override, not plan_pro's default 79900
  });

  test('missing Razorpay env vars fails cleanly, not a crash', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    const savedId = process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_ID;
    try {
      const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order' });
      await handler(req, res);
      expect(res._status).toBe(500);
    } finally {
      process.env.RAZORPAY_KEY_ID = savedId;
    }
  });
});

describe('applyPromo (via create_order) - never tested before this review, handles real revenue', () => {
  test('no promo code: full price charged, no discount applied', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_starter' });
    await handler(req, res);
    expect(res._json.discount).toBe(0);
    expect(res._json.promoValid).toBe(false);
  });

  test('valid percent-off promo correctly discounts the price', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    seed('config', 'promos', { codes: { SAVE20: { type: 'percent_off', value: 20, label: '20% off' } } });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_starter', promoCode: 'save20' });
    await handler(req, res);
    expect(res._json.promoValid).toBe(true);
    expect(res._json.discount).toBe(Math.round(29900 * 0.2)); // 20% of plan_starter's 29900
  });

  test('valid flat-rupee-off promo discounts by the exact fixed amount', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    seed('config', 'promos', { codes: { FLAT50: { type: 'flat_off', value: 50, label: 'Rs 50 off' } } });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_starter', promoCode: 'FLAT50' });
    await handler(req, res);
    expect(res._json.discount).toBe(5000); // 50 rupees = 5000 paise
  });

  test('discount can never bring the price below the 100-paise floor (prevents a free/negative order)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    seed('config', 'promos', { codes: { HUGE: { type: 'flat_off', value: 999999 } } });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_starter', promoCode: 'HUGE' });
    await handler(req, res);
    expect(res._json.promoValid).toBe(true);
    // final price floors at 100 paise regardless of how large the discount is
  });

  test('an invalid/unknown promo code is rejected, full price still charged', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    seed('config', 'promos', { codes: {} });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_starter', promoCode: 'NOTREAL' });
    await handler(req, res);
    expect(res._json.promoValid).toBe(false);
    expect(res._json.promoError).toBe('Invalid promo code');
  });

  test('an expired promo code is rejected', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    seed('config', 'promos', { codes: { OLD: { type: 'percent_off', value: 50, expires: '2020-01-01T00:00:00.000Z' } } });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_starter', promoCode: 'OLD' });
    await handler(req, res);
    expect(res._json.promoValid).toBe(false);
    expect(res._json.promoError).toBe('Promo expired');
  });

  test('a promo at its max_uses limit is rejected for a NEW user (usage cap enforced)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    seed('config', 'promos', { codes: { LIMITED: { type: 'percent_off', value: 10, max_uses: 5, used: 5 } } });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_starter', promoCode: 'LIMITED' });
    await handler(req, res);
    expect(res._json.promoValid).toBe(false);
    expect(res._json.promoError).toBe('Promo exhausted');
  });

  test('a single_use promo already used by THIS uid is rejected on a second attempt', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    seed('config', 'promos', { codes: { ONCE: { type: 'percent_off', value: 10, single_use: true } } });
    seed('promo_uses', 'u1_ONCE', { uid: 'u1', code: 'ONCE' });
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_starter', promoCode: 'ONCE' });
    await handler(req, res);
    expect(res._json.promoValid).toBe(false);
    expect(res._json.promoError).toBe('Already used');
  });

  test('promo lookup failure degrades gracefully to full price, never crashes the order', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', sessionToken: 'real_token' }));
    const { db } = require('../mocks/_firebase.mock');
    const original = db.collection;
    db.collection = (name) => { if (name === 'config') throw new Error('down'); return original(name); };
    try {
      const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'real_token', action: 'create_order', planKey: 'plan_starter', promoCode: 'ANY' });
      await handler(req, res);
      expect(res._status).toBe(200); // order still succeeds at full price
      expect(res._json.promoValid).toBe(false);
    } finally {
      db.collection = original;
    }
  });
});

describe('payments.js remaining actions', () => {
  test('success action is a no-op logging stub, always returns ok', async () => {
    const { req, res } = mockReqRes({ action: 'success' });
    await handler(req, res);
    expect(res._status).toBe(200);
  });

  test('an unrecognized action returns a clean 400', async () => {
    const { req, res } = mockReqRes({ action: 'not_a_real_action' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('rejects non-POST methods', async () => {
    const req = { method: 'GET', body: {} };
    const res = { _status: 200, status(c) { this._status = c; return this; }, json(o) { return this; } };
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
