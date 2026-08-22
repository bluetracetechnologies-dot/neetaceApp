const { resolveTutorResponse } = require('../../lib/ai-tutor-client');

const GOOD = { user: { uid: 'u1' }, sessionToken: 'tok' };

describe('BUG 1 (shipped to production): guard checked S.user but not S.sessionToken', () => {
  test('a completely signed-out visitor never calls the API', () => {
    const r = resolveTutorResponse({ user: null, sessionToken: null }, null);
    expect(r.shouldCallApi).toBe(false);
    expect(r.source).toBe('canned');
    expect(r.note).toMatch(/sign in/i);
  });

  test('THE ACTUAL BUG: a user object with NO sessionToken must not call the API', () => {
    // This is exactly what produced "AI Tutor unavailable: uid and sessionToken
    // required" in production - the old guard only checked S.user, so this
    // state sailed through to an API call that could only ever fail.
    const r = resolveTutorResponse({ user: { uid: 'u1' }, sessionToken: null }, null);
    expect(r.shouldCallApi).toBe(false);
    expect(r.note).toMatch(/sign in/i);
  });

  test('a sessionToken with no user object must not call the API either', () => {
    const r = resolveTutorResponse({ user: null, sessionToken: 'tok' }, null);
    expect(r.shouldCallApi).toBe(false);
  });

  test('a user object present but missing uid must not call the API', () => {
    const r = resolveTutorResponse({ user: {}, sessionToken: 'tok' }, null);
    expect(r.shouldCallApi).toBe(false);
  });

  test('a fully valid session DOES proceed to call the API', () => {
    const r = resolveTutorResponse(GOOD, { ok: true, answer: 'Photosynthesis converts light energy.', cap: 20, used: 3 });
    expect(r.shouldCallApi).toBe(true);
    expect(r.source).toBe('ai');
  });
});

describe('BUG 2 (shipped to production): unrecognised response fell through silently', () => {
  test('THE ACTUAL BUG: a backend error object must surface the reason, never a bare reply', () => {
    const r = resolveTutorResponse(GOOD, { error: 'uid and sessionToken required' });
    expect(r.source).toBe('canned');
    expect(r.note).not.toBe('');           // the old code produced exactly this
    expect(r.note).toMatch(/uid and sessionToken required/);
  });

  test('an unrecognised shape with no error field still explains itself', () => {
    const r = resolveTutorResponse(GOOD, { something: 'unexpected' });
    expect(r.note).toMatch(/unavailable/i);
    expect(r.note).not.toBe('');
  });

  test('a null response (network throw) explains itself', () => {
    const r = resolveTutorResponse(GOOD, null);
    expect(r.source).toBe('canned');
    expect(r.note).toMatch(/could not reach/i);
  });

  test('INVARIANT: no reachable path ever returns a canned reply with an empty note', () => {
    const cases = [
      [{ user: null, sessionToken: null }, null],
      [{ user: { uid: 'u1' }, sessionToken: null }, null],
      [GOOD, null],
      [GOOD, {}],
      [GOOD, { error: 'boom' }],
      [GOOD, { ok: false }],
      [GOOD, { fallback: true, message: 'capped' }],
    ];
    cases.forEach(([session, response]) => {
      const r = resolveTutorResponse(session, response);
      if (r.source === 'canned') {
        expect(r.note.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Fallback reasons from the backend are shown verbatim to the student', () => {
  test('plan gate', () => {
    const r = resolveTutorResponse(GOOD, { ok: false, fallback: true, reason: 'plan', message: 'AI Tutor is available on paid plans.' });
    expect(r.source).toBe('canned');
    expect(r.note).toMatch(/paid plans/);
  });

  test('daily cap reached', () => {
    const r = resolveTutorResponse(GOOD, { ok: false, fallback: true, reason: 'cap', message: 'You have used all 20 AI Tutor questions for today.' });
    expect(r.note).toMatch(/all 20/);
  });

  test('API key not configured', () => {
    const r = resolveTutorResponse(GOOD, { ok: false, fallback: true, reason: 'unconfigured', message: 'AI Tutor is not configured yet.' });
    expect(r.note).toMatch(/not configured/);
  });
});

describe('Successful AI answers and the remaining-questions counter', () => {
  test('shows how many questions remain when a cap applies', () => {
    const r = resolveTutorResponse(GOOD, { ok: true, answer: 'An answer.', cap: 20, used: 7 });
    expect(r.source).toBe('ai');
    expect(r.note).toBe('13 AI questions left today');
  });

  test('unlimited plans (cap null) show no counter rather than "null left"', () => {
    const r = resolveTutorResponse(GOOD, { ok: true, answer: 'An answer.', cap: null, used: 500 });
    expect(r.source).toBe('ai');
    expect(r.note).toBe('');
  });

  test('never shows a negative remaining count if usage overshoots the cap', () => {
    const r = resolveTutorResponse(GOOD, { ok: true, answer: 'An answer.', cap: 5, used: 9 });
    expect(r.note).toBe('0 AI questions left today');
  });

  test('ok:true but a missing answer is treated as an unrecognised shape, not silently rendered', () => {
    const r = resolveTutorResponse(GOOD, { ok: true });
    expect(r.source).toBe('canned');
    expect(r.note.length).toBeGreaterThan(0);
  });
});
