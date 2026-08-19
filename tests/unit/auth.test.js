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
