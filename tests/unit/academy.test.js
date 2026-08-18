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

describe('Teacher Dashboard V1: batch creation and teacher-owned batch list', () => {
  test('list_my_batches returns only batches created by the signed-in teacher plus academy seat counts', async () => {
    seed('users', 'u_teacher', baseUser({ uid: 'u_teacher', academyId: 'acy1', academyRole: 'teacher' }));
    seed('academies', 'acy1', { ...PENDING_ACADEMY, id: 'acy1', studentCount: 30, seatsUsed: 7 });
    seedNested('academies/acy1/batches/b_own', {
      id: 'b_own', batchName: 'My Batch', batchCode: 'BTOWN01', createdBy: 'u_teacher', studentCount: 4,
      createdAt: '2026-08-19T10:00:00.000Z', active: true,
    });
    seedNested('academies/acy1/batches/b_other', {
      id: 'b_other', batchName: 'Other Batch', batchCode: 'BTOTHER', createdBy: 'u_other', studentCount: 3,
      createdAt: '2026-08-19T11:00:00.000Z', active: true,
    });

    const { req, res } = mockReqRes({
      uid: 'u_teacher', sessionToken: 'valid_session_token_123', action: 'list_my_batches',
    });
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.seatsUsed).toBe(7);
    expect(res._json.studentCount).toBe(30);
    expect(res._json.batches).toHaveLength(1);
    expect(res._json.batches[0]).toMatchObject({ id: 'b_own', batchName: 'My Batch', studentCount: 4 });
  });

  test('list_my_batches rejects an academy student', async () => {
    seed('users', 'u_student', baseUser({ uid: 'u_student', academyId: 'acy1', academyRole: 'student' }));
    const { req, res } = mockReqRes({
      uid: 'u_student', sessionToken: 'valid_session_token_123', action: 'list_my_batches',
    });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test('create_batch rejects an academy student even though the user has an academyId', async () => {
    seed('users', 'u_student', baseUser({ uid: 'u_student', academyId: 'acy1', academyRole: 'student' }));
    const { req, res } = mockReqRes({
      uid: 'u_student', sessionToken: 'valid_session_token_123', action: 'create_batch', batchName: 'Not Allowed',
    });
    await handler(req, res);
    expect(res._status).toBe(403);
  });
});

describe('Teacher batch management and roster security', () => {
  function setupManagedBatch() {
    seed('academies', 'acy1', { ...PENDING_ACADEMY, id: 'acy1', studentCount: 20, seatsUsed: 2 });
    seedNested('academies/acy1/batches/b1', BATCH_FIXTURE('acy1', { id: 'b1', batchName: 'Original', createdBy: 'teacher', studentCount: 1 }));
    seed('users', 'teacher', baseUser({ uid: 'teacher', academyId: 'acy1', academyRole: 'teacher' }));
  }

  test('teacher edits and deactivates only their own batch', async () => {
    setupManagedBatch();
    const updated = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'update_batch', batchId: 'b1', batchName: 'NEET 2027 A', active: false, targetYear: 2027 });
    await handler(updated.req, updated.res);
    expect(updated.res._status).toBe(200);
    expect(db._store.docs['academies/acy1/batches/b1']).toMatchObject({ batchName: 'NEET 2027 A', active: false, targetYear: 2027 });

    seedNested('academies/acy1/batches/b2', BATCH_FIXTURE('acy1', { id: 'b2', createdBy: 'another_teacher' }));
    const forbidden = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'update_batch', batchId: 'b2', active: false });
    await handler(forbidden.req, forbidden.res);
    expect(forbidden.res._status).toBe(403);
  });

  test('roster returns teacher-owned students with existing progress fields', async () => {
    setupManagedBatch();
    seedNested('academies/acy1/batches/b1/students/student', { uid: 'student', joinedAt: '2026-08-01T00:00:00.000Z', active: true });
    seed('users', 'student', baseUser({ uid: 'student', name: 'A Student', academyId: 'acy1', academyRole: 'student', batchId: 'b1', scores: { global: { attempted: 25, accuracy: 72, weighted: 44 } }, lastSessionAt: '2026-08-18T10:00:00.000Z' }));
    const roster = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'get_batch_roster', batchId: 'b1' });
    await handler(roster.req, roster.res);
    expect(roster.res._status).toBe(200);
    expect(roster.res._json.students[0]).toMatchObject({ uid: 'student', name: 'A Student', attempted: 25, accuracy: 72, weighted: 44 });
  });

  test('removing a current academy student releases the seat and academy plan', async () => {
    setupManagedBatch();
    seedNested('academies/acy1/batches/b1/students/student', { uid: 'student', active: true });
    seed('users', 'student', baseUser({ uid: 'student', academyId: 'acy1', academyRole: 'student', batchId: 'b1', paid: true, planKey: 'plan_academy', paidUntil: '2027-05-31T00:00:00.000Z' }));
    const removed = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'remove_student', batchId: 'b1', studentUid: 'student' });
    await handler(removed.req, removed.res);
    expect(removed.res._status).toBe(200);
    expect(removed.res._json.seatReleased).toBe(true);
    expect(db._store.docs['academies/acy1/batches/b1/students/student']).toBeUndefined();
    expect(getDoc('academies', 'acy1').seatsUsed).toBe(1);
    expect(getDoc('users', 'student')).toMatchObject({ academyId: null, batchId: null, paid: false, planKey: null });
  });
});

describe('Academy weekly usage and teacher doubt escalation', () => {
  function setup() {
    seed('academies', 'acy1', { ...PENDING_ACADEMY, id: 'acy1', studentCount: 20, seatsUsed: 1 });
    seedNested('academies/acy1/batches/b1', BATCH_FIXTURE('acy1', { id: 'b1', batchName: 'NEET A', createdBy: 'teacher', studentCount: 1 }));
    seedNested('academies/acy1/batches/b1/students/student', { uid: 'student', name: 'Student One', active: true });
    seedNested('academies/acy1/batches/b1/students/inactive', { uid: 'inactive', name: 'Inactive Student', active: true });
    seed('users', 'teacher', baseUser({ uid: 'teacher', name: 'Teacher', academyId: 'acy1', academyRole: 'teacher' }));
    seed('users', 'student', baseUser({ uid: 'student', name: 'Student One', academyId: 'acy1', academyRole: 'student', batchId: 'b1' }));
  }

  test('teacher weekly summary aggregates only the selected owned batch', async () => {
    setup();
    const today = new Date().toISOString().slice(0, 10);
    seed('usage_daily', 'student_' + today, { uid: 'student', userName: 'Student One', academyId: 'acy1', batchId: 'b1', date: today, totalTimeSec: 900, questionsAttempted: 20, aiQuestions: 2, testsSubmitted: 1, sections: { practice: { timeSec: 600, questions: 20 }, ai_tutor: { timeSec: 300, questions: 0 } }, subjects: { BIOLOGY: { timeSec: 900, questions: 20 } }, chapters: { Genetics: { timeSec: 900, questions: 20 } }, lastActiveAt: new Date().toISOString() });
    seed('usage_daily', 'other_' + today, { uid: 'other', userName: 'Other Batch', academyId: 'acy1', batchId: 'b2', date: today, totalTimeSec: 5000, questionsAttempted: 80 });
    const { req, res } = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'get_usage_summary', batchId: 'b1', days: 7 });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.summary).toMatchObject({ activeStudents: 1, assignedStudents: 2, totalTimeSec: 900, questionsAttempted: 20, aiQuestions: 2, testsSubmitted: 1 });
    expect(res._json.summary.chapters[0].name).toBe('Genetics');
    expect(res._json.summary.inactiveStudents).toEqual([expect.objectContaining({ uid: 'inactive', name: 'Inactive Student' })]);
  });

  test('teacher cannot read usage for another teacher batch', async () => {
    setup();
    seedNested('academies/acy1/batches/b2', BATCH_FIXTURE('acy1', { id: 'b2', createdBy: 'another_teacher' }));
    const { req, res } = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'get_usage_summary', batchId: 'b2' });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test('student raises a doubt, owning teacher resolves it, and student sees the reply', async () => {
    setup();
    const raised = mockReqRes({ uid: 'student', sessionToken: 'valid_session_token_123', action: 'raise_doubt', question: 'Why is DNA replication semi-conservative?', aiAnswer: 'One old and one new strand.', subject: 'BIOLOGY', chapter: 'Genetics' });
    await handler(raised.req, raised.res);
    expect(raised.res._status).toBe(200);
    const doubtId = raised.res._json.doubt.id;

    const listed = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'list_batch_doubts', batchId: 'b1' });
    await handler(listed.req, listed.res);
    expect(listed.res._json.doubts[0]).toMatchObject({ id: doubtId, studentUid: 'student', status: 'open' });

    const resolved = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'resolve_doubt', doubtId, teacherReply: 'Each daughter molecule keeps one parental strand.' });
    await handler(resolved.req, resolved.res);
    expect(resolved.res._json.doubt.status).toBe('resolved');

    const studentList = mockReqRes({ uid: 'student', sessionToken: 'valid_session_token_123', action: 'list_my_doubts' });
    await handler(studentList.req, studentList.res);
    expect(studentList.res._json.doubts[0]).toMatchObject({ status: 'resolved', teacherReply: 'Each daughter molecule keeps one parental strand.' });
  });

  test('a teacher who does not own the batch cannot resolve its doubt', async () => {
    setup();
    seed('users', 'outsider', baseUser({ uid: 'outsider', academyId: 'acy1', academyRole: 'teacher' }));
    seed('academy_doubts', 'd1', { id: 'd1', academyId: 'acy1', batchId: 'b1', studentUid: 'student', status: 'open' });
    const { req, res } = mockReqRes({ uid: 'outsider', sessionToken: 'valid_session_token_123', action: 'resolve_doubt', doubtId: 'd1', teacherReply: 'Not allowed' });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test('same-named batch ids cannot expose or resolve a different academy doubt', async () => {
    setup();
    seed('academy_doubts', 'foreign', { id: 'foreign', academyId: 'acy2', batchId: 'b1', studentUid: 'foreign_student', status: 'open' });

    const listed = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'list_batch_doubts', batchId: 'b1' });
    await handler(listed.req, listed.res);
    expect(listed.res._json.doubts).toEqual([]);

    const resolved = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'resolve_doubt', doubtId: 'foreign', teacherReply: 'Not allowed' });
    await handler(resolved.req, resolved.res);
    expect(resolved.res._status).toBe(403);
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

  test('rejoining the SAME batch is idempotent and does not inflate studentCount', async () => {
    const { acad, batch } = setupAcademyWithBatch({ studentCount: 10, seatsUsed: 1 }, { studentCount: 1 });
    seedNested(`academies/${acad.id}/batches/${batch.id}/students/u_existing`, { uid: 'u_existing', active: true });
    seed('users', 'u_existing', baseUser({ uid: 'u_existing', academyId: acad.id, academyRole: 'student', batchId: batch.id }));
    const { req, res } = mockReqRes({ uid: 'u_existing', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: batch.batchCode });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.alreadyJoined).toBe(true);
    expect(db._store.docs[`academies/${acad.id}/batches/${batch.id}`].studentCount).toBe(1);
    expect(getDoc('academies', acad.id).seatsUsed).toBe(1);
  });

  test('moving batches removes the stale old roster membership and keeps one academy seat', async () => {
    const { acad, batch } = setupAcademyWithBatch({ studentCount: 10, seatsUsed: 1 }, { id: 'new_batch', batchCode: 'BTNEW01', studentCount: 0 });
    seedNested(`academies/${acad.id}/batches/old_batch`, BATCH_FIXTURE(acad.id, { id: 'old_batch', batchCode: 'BTOLD01', studentCount: 1 }));
    seedNested(`academies/${acad.id}/batches/old_batch/students/u_existing`, { uid: 'u_existing', active: true });
    seed('users', 'u_existing', baseUser({ uid: 'u_existing', academyId: acad.id, academyRole: 'student', batchId: 'old_batch' }));
    const { req, res } = mockReqRes({ uid: 'u_existing', sessionToken: 'valid_session_token_123', action: 'join_batch', batchCode: batch.batchCode });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(db._store.docs[`academies/${acad.id}/batches/old_batch/students/u_existing`]).toBeUndefined();
    expect(db._store.docs[`academies/${acad.id}/batches/new_batch/students/u_existing`]).toBeDefined();
    expect(db._store.docs[`academies/${acad.id}/batches/old_batch`].studentCount).toBe(0);
    expect(db._store.docs[`academies/${acad.id}/batches/new_batch`].studentCount).toBe(1);
    expect(getDoc('academies', acad.id).seatsUsed).toBe(1);
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
    seedNested('academies/acy1/batches/b1', BATCH_FIXTURE('acy1', { id: 'b1', createdBy: 'u_teacher' }));
    seedNested('academies/acy1/batches/b1/students/u_a', { uid: 'u_a' });
    seedNested('academies/acy1/batches/b1/students/u_b', { uid: 'u_b' });
    seed('users', 'u_a', baseUser({ uid: 'u_a', name: 'Low Scorer', scores: { global: { weighted: 20, attempted: 25 } } }));
    seed('users', 'u_b', baseUser({ uid: 'u_b', name: 'High Scorer', scores: { global: { weighted: 80, attempted: 30 } } }));
    seed('users', 'u_caller', baseUser({ uid: 'u_caller', academyId: 'acy1', academyRole: 'student', batchId: 'b1' }));
    const { req, res } = mockReqRes({ uid: 'u_caller', sessionToken: 'valid_session_token_123', action: 'batch_leaderboard', batchId: 'b1', academyId: 'acy1' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.leaderboard[0].name).toBe('High Scorer'); // highest weighted first
    expect(res._json.leaderboard[0].rank).toBe(1);
  });

  test('a student with fewer than 5 attempted questions does NOT appear on the leaderboard (real minimum-sample gate)', async () => {
    seedNested('academies/acy1/batches/b1', BATCH_FIXTURE('acy1', { id: 'b1', createdBy: 'u_teacher' }));
    seedNested('academies/acy1/batches/b1/students/u_new', { uid: 'u_new' });
    seed('users', 'u_new', baseUser({ uid: 'u_new', name: 'Just Joined', scores: { global: { weighted: 100, attempted: 2 } } }));
    seed('users', 'u_caller', baseUser({ uid: 'u_caller', academyId: 'acy1', academyRole: 'student', batchId: 'b1' }));
    const { req, res } = mockReqRes({ uid: 'u_caller', sessionToken: 'valid_session_token_123', action: 'batch_leaderboard', batchId: 'b1', academyId: 'acy1' });
    await handler(req, res);
    expect(res._json.leaderboard).toEqual([]); // filtered out despite a high score, per the real gate
  });

  test('empty batch returns an empty leaderboard, not an error', async () => {
    seedNested('academies/acy1/batches/ghost', BATCH_FIXTURE('acy1', { id: 'ghost', createdBy: 'u_teacher' }));
    seed('users', 'u_caller', baseUser({ uid: 'u_caller', academyId: 'acy1', academyRole: 'student', batchId: 'ghost' }));
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

  test('rejects a user with no relationship to the requested batch', async () => {
    seedNested('academies/acy_other/batches/b_other', BATCH_FIXTURE('acy_other', { id: 'b_other', createdBy: 'u_other_teacher' }));
    seedNested('academies/acy_other/batches/b_other/students/u_member', { uid: 'u_member' });
    seed('users', 'u_member', baseUser({ uid: 'u_member', name: 'Batch Member', scores: { global: { weighted: 50, attempted: 10 } } }));
    seed('users', 'u_stranger', baseUser({ uid: 'u_stranger' })); // has no academyId, no batchId - unrelated
    const { req, res } = mockReqRes({ uid: 'u_stranger', sessionToken: 'valid_session_token_123', action: 'batch_leaderboard', batchId: 'b_other', academyId: 'acy_other' });
    await handler(req, res);
    expect(res._status).toBe(403);
  });
});
