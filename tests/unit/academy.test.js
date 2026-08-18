const { resetDb, seed, seedNested, getDoc, db } = require('../helpers/withMockDb');
const { baseUser, ACADEMY_STUDENT_USER } = require('../fixtures/users.fixture');
const { PENDING_ACADEMY, FULL_ACADEMY, PAID_ACADEMY, BATCH_FIXTURE } = require('../fixtures/academies.fixture');
const handler = require('../../api/academy');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}

beforeEach(() => resetDb());

describe('Priority 12: Academy pricing - tiered discounts', () => {
  test('10-24 students: 0% discount, ₹499/student', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_quote', studentCount: 15 });
    await handler(req, res);
    expect(res._json.pricing.discountPct).toBe(0);
    expect(res._json.pricing.pricePerStudentRupees).toBe(499);
  });

  test('25-49 students: 10% discount, ₹449.10/student (₹499 × 0.9, not a round number)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_quote', studentCount: 30 });
    await handler(req, res);
    expect(res._json.pricing.discountPct).toBe(10);
    expect(res._json.pricing.pricePerStudentRupees).toBe(449.1);
  });

  test('50-99 students: 20% discount, ₹399.20/student (₹499 × 0.8, not a round number)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_quote', studentCount: 75 });
    await handler(req, res);
    expect(res._json.pricing.discountPct).toBe(20);
    expect(res._json.pricing.pricePerStudentRupees).toBe(399.2);
  });

  test('100+ students: 30% discount, ₹349.30/student (₹499 × 0.7, not a round number)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_quote', studentCount: 150 });
    await handler(req, res);
    expect(res._json.pricing.discountPct).toBe(30);
    expect(res._json.pricing.pricePerStudentRupees).toBe(349.3);
  });

  test('below minimum (10) students is rejected', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_quote', studentCount: 5 });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('totalRupees = pricePerStudent * studentCount exactly (₹449.10 × 30, not ₹449 × 30)', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'get_quote', studentCount: 30 });
    await handler(req, res);
    expect(res._json.pricing.totalRupees).toBe(449.1 * 30);
  });
});

describe('Priority 12: Seat enforcement (join_batch)', () => {
  function setupAcademyWithBatch(academyOverrides = {}, batchOverrides = {}) {
    const acad = { ...PENDING_ACADEMY, ...academyOverrides };
    seed('academies', acad.id, acad);
    const batch = BATCH_FIXTURE(acad.id, batchOverrides);
    seedNested(`academies/${acad.id}/batches/${batch.id}`, batch);
    return { acad, batch };
  }

  test('allows join when seats are available', async () => {
    const { acad, batch } = setupAcademyWithBatch({ studentCount: 30, seatsUsed: 10 });
    seed('users', 'u_new', baseUser({ uid: 'u_new' }));
    const { req, res } = mockReqRes({ uid: 'u_new', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: batch.batchCode });
    await handler(req, res);
    expect(res._status).toBe(200);
    const updatedAcad = getDoc('academies', acad.id);
    expect(updatedAcad.seatsUsed).toBe(11);
  });

  test('REJECTS join when seats are full (seatsUsed >= studentCount)', async () => {
    const { acad, batch } = setupAcademyWithBatch({ studentCount: 10, seatsUsed: 10 });
    seed('users', 'u_new', baseUser({ uid: 'u_new' }));
    const { req, res } = mockReqRes({ uid: 'u_new', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: batch.batchCode });
    await handler(req, res);
    expect(res._status).toBe(403);
    expect(res._json.error).toMatch(/Seat limit reached/);
    const updatedAcad = getDoc('academies', acad.id);
    expect(updatedAcad.seatsUsed).toBe(10); // unchanged - rejected join must not consume a seat
  });

  test('already-member rejoining a DIFFERENT batch in the SAME academy does NOT consume a new seat', async () => {
    const { acad, batch } = setupAcademyWithBatch({ studentCount: 10, seatsUsed: 10 }); // full
    seed('users', 'u_existing', baseUser({ uid: 'u_existing', academyId: acad.id })); // already a member
    const { req, res } = mockReqRes({ uid: 'u_existing', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: batch.batchCode });
    await handler(req, res);
    expect(res._status).toBe(200); // allowed even though seats are "full" - re-joining, not a new seat
    const updatedAcad = getDoc('academies', acad.id);
    expect(updatedAcad.seatsUsed).toBe(10); // unchanged
  });

  test('LATE-JOINER ACTIVATION: joining an already-PAID academy activates the student immediately', async () => {
    const { batch } = setupAcademyWithBatch({ studentCount: 30, seatsUsed: 5, paid: true, status: 'active', name: 'Paid Academy' });
    seed('users', 'u_new', baseUser({ uid: 'u_new', paid: false }));
    const { req, res } = mockReqRes({ uid: 'u_new', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: batch.batchCode });
    await handler(req, res);
    const user = getDoc('users', 'u_new');
    expect(user.paid).toBe(true);
    expect(user.planKey).toBe('plan_academy');
    expect(user.paidUntil).toBeTruthy();
  });

  test('joining an UNPAID academy does NOT activate the student (stays on trial)', async () => {
    const { batch } = setupAcademyWithBatch({ studentCount: 30, seatsUsed: 5, paid: false });
    seed('users', 'u_new', baseUser({ uid: 'u_new', paid: false }));
    const { req, res } = mockReqRes({ uid: 'u_new', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: batch.batchCode });
    await handler(req, res);
    const user = getDoc('users', 'u_new');
    expect(user.paid).toBe(false);
  });

  test('invalid batch code returns 404, not a crash', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: 'NONEXISTENT' });
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  test('inactive batch (active:false) is not joinable even with correct code', async () => {
    const { batch } = setupAcademyWithBatch({}, { active: false });
    seed('users', 'u1', baseUser({ uid: 'u1' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: batch.batchCode });
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  // ── CONCURRENCY: investigated via real interleaved Promise.all calls, not a
  // simulation. Result across 5 repeated runs was fully deterministic: Call A
  // always completes its entire read-check-write sequence before Call B's
  // continuation reaches the same section, so seatsUsed never exceeds the cap
  // in this test.
  //
  // IMPORTANT - what this does and does NOT prove: this mock's get()/update()
  // resolve with zero real latency (no network round-trip), so there is no
  // genuine timing window for two requests' reads to both land before either
  // write does. Real Firestore has actual network latency (tens of
  // milliseconds per call), which creates exactly the window this mock cannot
  // reproduce. A passing result here demonstrates the code path is at least
  // structurally reachable and doesn't crash under concurrent calls - it does
  // NOT prove the production seat limit is race-safe. The join_batch handler
  // still does a plain read-then-write with no Firestore transaction; the
  // correct fix, if this is worth closing, is wrapping the seat check in
  // `db.runTransaction()`. This risk stays in the "unverified, needs live
  // infrastructure or a latency-aware emulator to settle" category from the
  // earlier False Positive Audit - this test cannot close it either way.
  test('concurrent joins at the seat limit do not corrupt seatsUsed in THIS mock (see comment - does not prove production safety)', async () => {
    const { acad, batch } = setupAcademyWithBatch({ studentCount: 10, seatsUsed: 9 }); // exactly 1 seat left
    seed('users', 'u_a', baseUser({ uid: 'u_a' }));
    seed('users', 'u_b', baseUser({ uid: 'u_b' }));

    const callA = mockReqRes({ uid: 'u_a', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: batch.batchCode });
    const callB = mockReqRes({ uid: 'u_b', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: batch.batchCode });

    await Promise.all([handler(callA.req, callA.res), handler(callB.req, callB.res)]);

    const finalAcad = getDoc('academies', acad.id);
    // Whatever happened, the invariant that MUST hold is seatsUsed <= studentCount.
    // If this ever fails, something got worse, not better - investigate immediately.
    expect(finalAcad.seatsUsed).toBeLessThanOrEqual(acad.studentCount);
    // Exactly one of the two calls should have succeeded (last seat, two claimants).
    const successCount = [callA.res._status, callB.res._status].filter((s) => s === 200).length;
    expect(successCount).toBe(1);
  });
});

describe('Priority 12: academy.js — remaining admin actions (untested until now)', () => {
  test('admin_list requires admin role', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', role: 'user' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'admin_list' });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test('admin_list returns all academies for a real admin', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    seed('academies', 'acy1', { ...PENDING_ACADEMY, id: 'acy1', createdAt: '2026-08-01T00:00:00.000Z' });
    seed('academies', 'acy2', { ...PENDING_ACADEMY, id: 'acy2', academyCode: 'ACY2', createdAt: '2026-08-02T00:00:00.000Z' });
    const { req, res } = mockReqRes({ uid: 'u_admin', sessionToken: 'valid_session_token_123', action: 'admin_list' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.total).toBe(2);
  });

  test('admin_update requires admin role', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', role: 'user' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'admin_update', academyId: 'acy1', updates: { name: 'Hacked' } });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test('admin_update applies partial updates and stamps updatedAt', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    seed('academies', 'acy1', { ...PENDING_ACADEMY, id: 'acy1' });
    const { req, res } = mockReqRes({ uid: 'u_admin', sessionToken: 'valid_session_token_123', action: 'admin_update', academyId: 'acy1', updates: { name: 'Renamed Academy' } });
    await handler(req, res);
    expect(res._status).toBe(200);
    const acad = getDoc('academies', 'acy1');
    expect(acad.name).toBe('Renamed Academy');
    expect(acad.updatedAt).toBeTruthy();
  });

  test('admin_update rejects missing academyId', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    const { req, res } = mockReqRes({ uid: 'u_admin', sessionToken: 'valid_session_token_123', action: 'admin_update', updates: {} });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('admin_update_config converts rupees to paise correctly', async () => {
    seed('users', 'u_admin', baseUser({ uid: 'u_admin', role: 'admin' }));
    const { req, res } = mockReqRes({ uid: 'u_admin', sessionToken: 'valid_session_token_123', action: 'admin_update_config', pricePerStudent: 599 });
    await handler(req, res);
    expect(res._status).toBe(200);
    const cfg = getDoc('config', 'academy');
    expect(cfg.pricePerStudent).toBe(59900); // Rs 599 -> 59900 paise
  });

  test('admin_update_config requires admin role', async () => {
    seed('users', 'u1', baseUser({ uid: 'u1', role: 'user' }));
    const { req, res } = mockReqRes({ uid: 'u1', sessionToken: 'valid_session_token_123', action: 'admin_update_config', pricePerStudent: 999 });
    await handler(req, res);
    expect(res._status).toBe(403);
  });
});

describe('Priority 12: academy.js — batch_leaderboard (untested until now)', () => {
  test('returns ranked students sorted by weighted score', async () => {
    seedNested('academies/acy1/batches/b1/students/u_a', { uid: 'u_a' });
    seedNested('academies/acy1/batches/b1/students/u_b', { uid: 'u_b' });
    seed('users', 'u_a', baseUser({ uid: 'u_a', name: 'Low Scorer', scores: { global: { weighted: 20, attempted: 25 } } }));
    seed('users', 'u_b', baseUser({ uid: 'u_b', name: 'High Scorer', scores: { global: { weighted: 80, attempted: 30 } } }));
    seed('users', 'u_caller', baseUser({ uid: 'u_caller' }));
    const { req, res } = mockReqRes({ uid: 'u_caller', sessionToken: 'valid_session_token_123', action: 'batch_leaderboard', batchId: 'b1', academyId: 'acy1' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.leaderboard[0].name).toBe('High Scorer'); // highest weighted first
    expect(res._json.leaderboard[0].rank).toBe(1);
  });

  test('a student with fewer than 5 attempted questions does NOT appear on the leaderboard (real minimum-sample gate)', async () => {
    seedNested('academies/acy1/batches/b1/students/u_new', { uid: 'u_new' });
    seed('users', 'u_new', baseUser({ uid: 'u_new', name: 'Just Joined', scores: { global: { weighted: 100, attempted: 2 } } }));
    seed('users', 'u_caller', baseUser({ uid: 'u_caller' }));
    const { req, res } = mockReqRes({ uid: 'u_caller', sessionToken: 'valid_session_token_123', action: 'batch_leaderboard', batchId: 'b1', academyId: 'acy1' });
    await handler(req, res);
    expect(res._json.leaderboard).toEqual([]); // filtered out despite a high score, per the real gate
  });

  test('empty batch returns an empty leaderboard, not an error', async () => {
    seed('users', 'u_caller', baseUser({ uid: 'u_caller' }));
    const { req, res } = mockReqRes({ uid: 'u_caller', sessionToken: 'valid_session_token_123', action: 'batch_leaderboard', batchId: 'ghost', academyId: 'acy1' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.leaderboard).toEqual([]);
  });

  test('rejects missing batchId or academyId', async () => {
    seed('users', 'u_caller', baseUser({ uid: 'u_caller' }));
    const { req, res } = mockReqRes({ uid: 'u_caller', sessionToken: 'valid_session_token_123', action: 'batch_leaderboard', batchId: 'b1' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  // FINDING (not a fix — documenting current behavior per this session's testing pass,
  // consistent with "test first, decide later" sequencing): this action has NO check that
  // the caller actually belongs to the batch/academy they're querying. Any authenticated
  // user who knows or guesses a batchId+academyId pair can see that batch's leaderboard
  // (names + weighted scores). Not severely sensitive data, but a real, confirmed scoping
  // gap - flagging via this test rather than silently working around or silently fixing it.
  test('DOCUMENTS FINDING: a user with NO relationship to the batch/academy can still query its leaderboard (no scoping check exists)', async () => {
    seedNested('academies/acy_other/batches/b_other/students/u_member', { uid: 'u_member' });
    seed('users', 'u_member', baseUser({ uid: 'u_member', name: 'Batch Member', scores: { global: { weighted: 50, attempted: 10 } } }));
    seed('users', 'u_stranger', baseUser({ uid: 'u_stranger' })); // has no academyId, no batchId - unrelated
    const { req, res } = mockReqRes({ uid: 'u_stranger', sessionToken: 'valid_session_token_123', action: 'batch_leaderboard', batchId: 'b_other', academyId: 'acy_other' });
    await handler(req, res);
    expect(res._status).toBe(200); // succeeds - confirms no scoping check, documented not fixed
    expect(res._json.leaderboard.length).toBe(1);
  });
});
