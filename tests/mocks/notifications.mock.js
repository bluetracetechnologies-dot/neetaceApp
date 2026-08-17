// tests/mocks/notifications.mock.js
// Drop-in replacement for api/notifications.js during tests. Real SMTP is
// NEVER contacted - dispatch() and sendEmail() are jest.fn()s that tests
// assert against directly, proving what auth.js/admin.js actually call
// (and with what arguments), not just that the source code contains the
// right-looking strings.

const dispatch = jest.fn(async () => ({ email: { sent: true } }));
const sendEmail = jest.fn(async () => ({ sent: true }));

function resetNotificationMocks() {
  dispatch.mockClear();
  sendEmail.mockClear();
}

module.exports = { dispatch, sendEmail, resetNotificationMocks };
