// lib/ai-tutor-client.js
//
// Pure decision logic extracted from sendAI() in index.html. Exists because
// ALL THREE AI Tutor bugs shipped to production lived in frontend branch
// decisions, and the test suite had 409 backend tests and zero frontend ones -
// so every one of them was invisible by construction:
//
//   1. guard checked S.user but not S.sessionToken, so a signed-out student
//      reached the API and got a raw "uid and sessionToken required"
//   2. an unrecognised response shape fell through to a bare canned reply with
//      no explanation at all
//   3. (backend, related) a throw inside the tutor escaped as a 500, producing
//      exactly that unrecognised shape
//
// Same extraction pattern as lib/score-predictor.js and lib/ncert-filter.js:
// index.html keeps the DOM-touching wrapper, this holds the logic worth
// testing precisely. Kept deliberately free of any DOM reference.

// Decides what the AI Tutor should display, without touching the DOM.
//   session:  { user, sessionToken } as held in the app's S object
//   response: the parsed API response, or null if the call threw/never happened
// Returns: { source, note, shouldCallApi }
//   source 'ai'     -> render response.answer
//   source 'canned' -> render the local notes library
function resolveTutorResponse(session, response) {
  const signedIn = !!(session && session.user && session.user.uid && session.sessionToken);

  // Never call the API without a complete session - the AI Tutor screen has no
  // sign-in gate, so this is genuinely reachable by a signed-out visitor.
  if (!signedIn) {
    return { source: 'canned', note: 'Sign in to get full AI Tutor answers.', shouldCallApi: false };
  }
  if (response === null || response === undefined) {
    return { source: 'canned', note: 'Could not reach AI Tutor. Showing quick notes.', shouldCallApi: true };
  }
  if (response.ok && response.answer) {
    const capped = response.cap !== null && response.cap !== undefined;
    const left = capped ? Math.max(0, response.cap - (response.used || 0)) : null;
    return {
      source: 'ai',
      note: capped ? `${left} AI questions left today` : '',
      shouldCallApi: true,
    };
  }
  if (response.fallback) {
    return { source: 'canned', note: response.message || '', shouldCallApi: true };
  }
  // Unrecognised shape - almost always a backend error object. Must NEVER be
  // silent: a bare canned reply with no note is indistinguishable from a
  // working answer and hides real failures from both student and developer.
  return {
    source: 'canned',
    note: response.error ? `AI Tutor unavailable: ${response.error}` : 'AI Tutor unavailable. Showing quick notes.',
    shouldCallApi: true,
  };
}

module.exports = { resolveTutorResponse };
