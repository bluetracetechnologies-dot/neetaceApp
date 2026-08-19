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
});
