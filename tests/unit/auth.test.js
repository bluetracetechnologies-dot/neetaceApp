const { resetDb, seed, getDoc } = require('../helpers/withMockDb');
const handler = require('../../api/auth');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}

beforeEach(() => resetDb());

describe('Registration trial configuration', () => {
  test('Google registration succeeds with safe defaults when no trial config exists', async () => {
    const { req, res } = mockReqRes({ action: 'register', uid: 'new_google_user', email: 'new@example.com', name: 'New Student' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'new_google_user')).toMatchObject({ trialDays: 7, trialQuestionCap: 10, trialFeatures: 'all' });
  });

  test('registration reads both current trial-config field names', async () => {
    seed('config', 'trial', { trialDays: 12, dailyCapAmount: 18, featureAccess: 'basic' });
    const { req, res } = mockReqRes({ action: 'register', uid: 'configured_user', email: 'configured@example.com', name: 'Configured Student' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('users', 'configured_user')).toMatchObject({ trialDays: 12, trialQuestionCap: 18, trialFeatures: 'basic' });
  });
});

describe('CONFIRMED BUG FIX: Google sign-in for a new user with no Firestore profile yet', () => {
  test('login on a valid Firebase-authenticated uid with NO Firestore profile returns the stable PROFILE_NOT_FOUND code', async () => {
    const { auth } = require('../mocks/_firebase.mock');
    auth.verifyIdToken.mockResolvedValueOnce({ uid: 'brand_new_google_user' });
    // Deliberately NOT seeding a users/brand_new_google_user doc - this is exactly
    // the real-world state right after Google auth succeeds for a first-time user.
    const { req, res } = mockReqRes({ action: 'login', idToken: 'valid_google_id_token' });
    await handler(req, res);
    expect(res._status).toBe(404);
    // This is the actual regression check: the frontend's doGoogleSignIn() checks
    // r.error === 'PROFILE_NOT_FOUND' to decide whether to auto-register. Before
    // the fix, the backend returned free text ('Account not found. Please
    // register first.') that never matched the frontend's check
    // ('User profile not found. Please register.') - two different strings that
    // were never equal, so auto-registration silently never fired and every new
    // Google user got stuck seeing this raw message with no way to sign up.
    expect(res._json.error).toBe('PROFILE_NOT_FOUND');
    expect(res._json.message).toBe('Account not found. Please register first.');
  });
});
