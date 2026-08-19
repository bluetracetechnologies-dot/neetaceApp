const { resetDb, seed, seedNested, getDoc } = require('../helpers/withMockDb');
const { baseUser } = require('../fixtures/users.fixture');
const { BATCH_FIXTURE } = require('../fixtures/academies.fixture');
const handler = require('../../api/packs');

function mockReqRes(body) {
  const req = { method: 'POST', body };
  const res = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; } };
  return { req, res };
}

const CSV = 'subject,chapter,question,opt_a,opt_b,opt_c,opt_d,correct,explanation\nPHYSICS,Motion,What is velocity?,A,B,C,D,A,Answer';

beforeEach(() => resetDb());

describe('Teacher content-pack batch scoping', () => {
  function setup() {
    seed('users', 'teacher', baseUser({ uid: 'teacher', academyId: 'acy1', academyRole: 'teacher' }));
    seedNested('academies/acy1/batches/own', BATCH_FIXTURE('acy1', { id: 'own', createdBy: 'teacher' }));
    seedNested('academies/acy1/batches/other', BATCH_FIXTURE('acy1', { id: 'other', createdBy: 'another_teacher' }));
  }

  test('teacher can target a newly uploaded pack to one owned batch', async () => {
    setup();
    const { req, res } = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'teacher_upload', name: 'Batch DPP', csvText: CSV, scopeType: 'batch', batchId: 'own' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('content_packs', res._json.packId).scope).toEqual({ type: 'batch', batchId: 'own', academyId: 'acy1' });
  });

  test('teacher cannot target another teacher-owned batch', async () => {
    setup();
    const { req, res } = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'teacher_upload', name: 'Wrong DPP', csvText: CSV, scopeType: 'batch', batchId: 'other' });
    await handler(req, res);
    expect(res._status).toBe(403);
  });

  test('batch scope requires an explicit batch selection', async () => {
    setup();
    const { req, res } = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'teacher_upload', name: 'No Batch DPP', csvText: CSV, scopeType: 'batch' });
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  test('optional faculty QA fields are preserved on uploaded questions', async () => {
    setup();
    const reviewedCsv = 'subject,chapter,question,opt_a,opt_b,opt_c,opt_d,correct,explanation,review_status,reviewer,reviewed_at\nBIOLOGY,Genetics,What is a gene?,A,B,C,D,A,Explanation,approved,Dr Faculty,2026-08-19';
    const { req, res } = mockReqRes({ uid: 'teacher', sessionToken: 'valid_session_token_123', action: 'teacher_upload', name: 'Reviewed DPP', csvText: reviewedCsv, scopeType: 'batch', batchId: 'own' });
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(getDoc('content_packs', res._json.packId).questions[0]).toMatchObject({ reviewStatus: 'approved', reviewer: 'Dr Faculty', reviewedAt: '2026-08-19' });
  });
});
