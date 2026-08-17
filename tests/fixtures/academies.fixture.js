// tests/fixtures/academies.fixture.js
// Academy documents matching the exact shape written by api/academy.js's
// admin_create action.

function baseAcademy(overrides = {}) {
  return {
    id: 'acy_test1', academyCode: 'ACY4F2B91', name: 'Test Coaching Academy',
    type: 'coaching', city: 'Parbhani', state: '',
    contactName: 'Test Owner', contactEmail: '', contactPhone: '9999999999',
    studentCount: 30, notes: '',
    branding: { logoUrl: '', bannerText: '', bannerColor: '#0d9488', showLogo: false },
    featureOverrides: null, trialOverride: null,
    pricing: { studentCount: 30, pricePerStudent: 44900, pricePerStudentRupees: 449, discountPct: 10, totalPaise: 1347000, totalRupees: 13470, savingsRupees: 1500, tier: '25-49 students' },
    customPrice: false,
    status: 'pending', paid: false, paidAt: null, paidAmount: null,
    batchCount: 0, activeStudents: 0, seatsUsed: 0,
    createdAt: '2026-08-01T00:00:00.000Z', createdBy: 'u_admin',
    ...overrides,
  };
}

const PENDING_ACADEMY = baseAcademy();

const FULL_ACADEMY = baseAcademy({
  id: 'acy_full', academyCode: 'ACYFULL01', studentCount: 10, seatsUsed: 10,
  paid: true, status: 'active',
});

const PAID_ACADEMY = baseAcademy({
  id: 'acy_paid', academyCode: 'ACYPAID01', paid: true, status: 'active',
  seatsUsed: 12, paidAt: '2026-08-05T00:00:00.000Z', paidAmount: 13470,
});

const BATCH_FIXTURE = (academyId = 'acy_test1', overrides = {}) => ({
  id: 'batch_test1', batchCode: 'BT4A2F91', batchName: 'NEET 2026 Batch A',
  subject: 'ALL', targetYear: 2026, academyId, createdBy: 'u_teacher1',
  studentCount: 0, active: true, createdAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

module.exports = { baseAcademy, PENDING_ACADEMY, FULL_ACADEMY, PAID_ACADEMY, BATCH_FIXTURE };
