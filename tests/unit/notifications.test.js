const { resetDb, seed, seedNested, db } = require('../helpers/withMockDb');
const { baseUser } = require('../fixtures/users.fixture');
const { BATCH_FIXTURE } = require('../fixtures/academies.fixture');
const handler = require('../../api/notifications');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}

beforeEach(() => resetDb());

describe('Teacher batch announcements', () => {
  function setup() {
    seed('users', 'teacher', baseUser({ uid: 'teacher', name: 'Teacher', academyId: 'acy1', academyRole: 'teacher' }));
    seedNested('academies/acy1/batches/b1', BATCH_FIXTURE('acy1', { id: 'b1', batchName: 'Batch A', createdBy: 'teacher' }));
    seedNested('academies/acy1/batches/b1/students/s1', { uid: 's1' });
    seedNested('academies/acy1/batches/b1/students/s2', { uid: 's2' });
    seed('users', 's1', baseUser({ uid: 's1', name: 'One', notifPrefs: { email: false, whatsapp: false, parent: false } }));
    seed('users', 's2', baseUser({ uid: 's2', name: 'Two', notifPrefs: { email: false, whatsapp: false, parent: false } }));
  }

  test('teacher announcement is processed only for the owned batch roster', async () => {
    setup();
    const { req, res } = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'teacher_batch_announcement', batchId: 'b1', subject: 'Tomorrow', message: 'Class starts at 9 AM.' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.processed).toBe(2);
    const logs = Object.entries(db._store.docs).filter(([key]) => key.startsWith('notifications/')).map(([, value]) => value);
    expect(logs).toHaveLength(2);
    expect(logs.every((log) => log.event === 'batch_announcement')).toBe(true);
  });

  test('teacher cannot announce to another teacher-owned batch', async () => {
    setup();
    seedNested('academies/acy1/batches/other', BATCH_FIXTURE('acy1', { id: 'other', createdBy: 'someone_else' }));
    const { req, res } = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'teacher_batch_announcement', batchId: 'other', subject: 'No', message: 'Not allowed' });
    await handler(req, res);
    expect(res._status).toBe(403);
  });
});

describe('Parent weekly progress digest', () => {
  test('uses real seven-day usage and returns a parent WhatsApp message without exposing another student', async () => {
    const today = new Date().toISOString().slice(0, 10);
    seed('users', 'student', baseUser({
      uid: 'student', name: 'Student One', parentName: 'Parent One', parentPhone: '9876543210',
      notifPrefs: { email: false, whatsapp: true, parent: true },
      scores: { global: { accuracy: 72.5, rank: 123 } },
      conceptStats: { b7: { attempted: 5, accuracy: 40 } },
      galtiMistakes: { q1: { recovered: false }, q2: { recovered: true } },
    }));
    seed('usage_daily', 'student_' + today, { uid: 'student', userName: 'Student One', date: today, totalTimeSec: 1800, questionsAttempted: 12, sections: { practice: { timeSec: 1800, questions: 12 } } });
    seed('usage_daily', 'other_' + today, { uid: 'other', userName: 'Other Student', date: today, totalTimeSec: 9000, questionsAttempted: 99 });
    const { req, res } = mockReqRes({ uid: 'student', sessionToken: 'valid_session_token_123', action: 'send_parent_weekly' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.stats).toMatchObject({ questionsThisWeek: 12, studyMinutes: 30, accuracy: 72.5, mistakesLogged: 1, weakestTopic: 'b7', topSection: 'practice' });
    expect(res._json.results.parentWaLink).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(decodeURIComponent(res._json.results.parentWaLink)).not.toContain('Other Student');
  });

  test('requires an enabled parent channel and contact', async () => {
    seed('users', 'student', baseUser({ uid: 'student', notifPrefs: { email: true, whatsapp: true, parent: true } }));
    const { req, res } = mockReqRes({ uid: 'student', sessionToken: 'valid_session_token_123', action: 'send_parent_weekly' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});
