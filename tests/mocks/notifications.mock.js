// tests/mocks/notifications.mock.js
// Drop-in replacement for api/notifications.js during tests. Real SMTP is
// NEVER contacted - dispatch() and sendEmail() are jest.fn()s that tests
// assert against directly, proving what auth.js/admin.js actually call
// (and with what arguments), not just that the source code contains the
// right-looking strings.

const dispatch = jest.fn(async () => ({ email: { sent: true } }));
// Actually invokes the templateFn argument, exactly like the real sendEmail does -
// more faithful to reality than a bare stub, and organically exercises callers'
// template-building code (e.g. admin.js's feedback email template) without
// artificially forcing coverage on it.
const sendEmail = jest.fn(async (to, templateFn, ...args) => {
  const { subject, html } = templateFn(...args);
  return { sent: true, to, subject, html };
});

function resetNotificationMocks() {
  dispatch.mockClear();
  sendEmail.mockClear();
}

module.exports = { dispatch, sendEmail, resetNotificationMocks };
