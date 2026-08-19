const { resetDb, seed, seedNested, getDoc, db } = require('../helpers/withMockDb');
const { baseUser } = require('../fixtures/users.fixture');
const handler = require('../../api/academy');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}

function question(id, sub, ch, correct, estimatedTime = 60) {
  return {
    id, sub, ch, tid: `${sub}_${ch}`, text: `Question ${id}?`,
    opts: ['A1', 'B1', 'C1', 'D1'], correct,
    explanation: `Explanation ${id}`, diff: 'medium', estimatedTime,
  };
}

async function call(body) {
  const { req, res } = mockReqRes(body);
  await handler(req, res);
  return res;
}

beforeEach(() => resetDb());

function setup() {
  seed('academies', 'acy1', { id: 'acy1', name: 'Academy', studentCount: 20, seatsUsed: 1 });
  seedNested('academies/acy1/batches/b1', { id: 'b1', batchName: 'Batch A', academyId: 'acy1', createdBy: 'teacher', active: true });
  seedNested('academies/acy1/batches/b2', { id: 'b2', batchName: 'Other Batch', academyId: 'acy1', createdBy: 'other_teacher', active: true });
  seedNested('academies/acy1/batches/b1/students/student', { uid: 'student', joinedAt: '2026-01-01T00:00:00.000Z' });
  seedNested('academies/acy1/batches/b1/students/not_started', { uid: 'not_started', joinedAt: '2026-01-01T00:00:00.000Z' });
  seed('users', 'teacher', baseUser({ uid: 'teacher', name: 'Teacher', academyId: 'acy1', academyRole: 'teacher' }));
  seed('users', 'student', baseUser({ uid: 'student', name: 'Student', academyId: 'acy1', academyRole: 'student', batchId: 'b1' }));
  seed('users', 'outsider', baseUser({ uid: 'outsider', academyId: 'acy1', academyRole: 'student', batchId: 'b2' }));
}

describe('Test Series: security and fixed paper creation', () => {
  test('student cannot create a test', async () => {
    setup();
    const res = await call({ uid: 'student', sessionToken: 'valid_session_token_123', action: 'create_test', batchId: 'b1', title: 'Hack', questions: [question('q1', 'PHYSICS', 'Motion', 1)] });
    expect(res._status).toBe(403);
  });

  test('teacher cannot assign a test to another teacher-owned batch', async () => {
    setup();
    const res = await call({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'create_test', batchId: 'b2', title: 'Wrong Batch', questions: [question('q1', 'PHYSICS', 'Motion', 1)] });
    expect(res._status).toBe(403);
  });

  test('assigned student receives the fixed paper without answer keys; outsider is rejected', async () => {
    setup();
    const created = await call({
      uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'create_test',
      batchId: 'b1', title: 'Fixed Chapter Test', durationMinutes: 20, attemptLimit: 2, templateKey: 'weekly_neet',
      questions: [question('q1', 'PHYSICS', 'Motion', 1), question('q2', 'BIOLOGY', 'Cell', 2)],
    });
    expect(created._status).toBe(200);
    const testId = created._json.test.id;

    const studentView = await call({ uid: 'student', sessionToken: 'valid_session_token_123', action: 'get_test', testId });
    expect(studentView._status).toBe(200);
    expect(studentView._json.questions).toHaveLength(2);
    expect(studentView._json.questions[0].correct).toBeUndefined();
    expect(studentView._json.questions[0].explanation).toBeUndefined();
    expect(studentView._json.test.templateKey).toBe('weekly_neet');

    const outsiderView = await call({ uid: 'outsider', sessionToken: 'valid_session_token_123', action: 'get_test', testId });
    expect(outsiderView._status).toBe(403);
  });
});

describe('Test Series: attempt persistence, analytics, history, and teacher results', () => {
  test('student saves, resumes, submits, gets detailed analytics, and teacher sees the result', async () => {
    setup();
    const created = await call({
      uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'create_test',
      batchId: 'b1', title: 'Analytics Test', durationMinutes: 30,
      questions: [
        question('q1', 'PHYSICS', 'Motion', 1, 60),
        question('q2', 'PHYSICS', 'Motion', 2, 60),
        question('q3', 'BIOLOGY', 'Cell', 0, 60),
      ],
    });
    const testId = created._json.test.id;

    const saved = await call({
      uid: 'student', sessionToken: 'valid_session_token_123', action: 'save_progress', testId,
      answers: [1, 0, null], responseTimes: [30000, 10000, 0],
    });
    expect(saved._status).toBe(200);

    const resumed = await call({ uid: 'student', sessionToken: 'valid_session_token_123', action: 'get_test', testId });
    expect(resumed._json.attempt.answers).toEqual([1, 0, null]);

    const submitted = await call({
      uid: 'student', sessionToken: 'valid_session_token_123', action: 'submit_test', testId,
      answers: [1, 0, null], responseTimes: [30000, 10000, 0],
    });
    expect(submitted._status).toBe(200);
    expect(submitted._json.attempt).toMatchObject({ correct: 1, wrong: 1, skipped: 1, score: 3, maxScore: 12 });
    expect(submitted._json.attempt.bySubject.PHYSICS).toMatchObject({ correct: 1, wrong: 1, score: 3 });
    expect(submitted._json.attempt.byChapter.Motion.accuracy).toBe(50);
    expect(submitted._json.attempt.behaviours.tooFastIncorrect).toBe(1);
    expect(submitted._json.attempt.rank).toBe(1);

    const user = getDoc('users', 'student');
    expect(user.galtiMistakes.q2).toBeDefined();
    expect(user.totalQuestionsAttempted).toBe(3);
    const usage = getDoc('usage_daily', 'student_' + new Date().toISOString().slice(0, 10));
    expect(usage).toMatchObject({ questionsAttempted: 3, totalTimeSec: 0, testsSubmitted: 1 });
    expect(usage.sections.test_series.questions).toBe(3);

    const history = await call({ uid: 'student', sessionToken: 'valid_session_token_123', action: 'get_attempt_history' });
    expect(history._json.attempts).toHaveLength(1);
    expect(history._json.attempts[0]).toMatchObject({ testTitle: 'Analytics Test', score: 3, accuracy: 50 });

    const teacherResults = await call({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'get_test_results', testId });
    expect(teacherResults._status).toBe(200);
    expect(teacherResults._json.summary).toMatchObject({ assigned: 2, submitted: 1, notAttempted: 1, totalSubmissions: 1, averageScore: 3, highestScore: 3 });
    expect(teacherResults._json.attempts[0].studentName).toBe('Student');
  });

  test('attempt limit is enforced after submission', async () => {
    setup();
    const created = await call({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'create_test', batchId: 'b1', title: 'One Attempt', attemptLimit: 1, questions: [question('q1', 'PHYSICS', 'Motion', 1)] });
    const testId = created._json.test.id;
    await call({ uid: 'student', sessionToken: 'valid_session_token_123', action: 'submit_test', testId, answers: [1], responseTimes: [30000] });
    const second = await call({ uid: 'student', sessionToken: 'valid_session_token_123', action: 'save_progress', testId, answers: [1] });
    expect(second._status).toBe(403);
    expect(second._json.error).toMatch(/Attempt limit/);
  });
});
