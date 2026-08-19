// lib/ncert-filter.js
//
// Extracted for testability - ncertPracticePool() in index.html reads its
// inputs from document.getElementById(...), which can't be unit tested
// without a full jsdom environment. This file holds the actual filtering
// DECISION logic as pure functions taking explicit parameters, mirroring the
// same extraction already done for lib/score-predictor.js. index.html's
// ncertPracticePool remains the DOM-reading wrapper; this is the part that's
// actually worth testing precisely, since range-boundary and fallback logic
// are easy to get subtly wrong.
//
// Confirmed finding this logic exists specifically to handle: 62% of the
// question bank has no real NCERT page tag (just the coded default '1'),
// concentrated entirely in packs built after the original four. Range
// filtering must recognize untagged questions as "not a match" for a page
// range, while a plain chapter/subject/class filter (no range given) must
// still include them normally.

function isRealNcertPage(page){
  const s = String(page||'').trim();
  return s !== '' && s !== '1' && s !== '-' && !isNaN(parseInt(s));
}

function filterQuestionsByNcert(questions, opts){
  const { sub, cls, chapter, pageFrom, pageTo } = opts;
  const hasRange = !!(pageFrom || pageTo);
  return questions.filter(function(q){
    if (q.sub !== sub || parseInt(q.ncertCl) !== cls) return false;
    if (chapter && String(q.ch||'') !== chapter) return false;
    if (hasRange) {
      if (!isRealNcertPage(q.ncertPg)) return false;
      const p = parseInt(q.ncertPg);
      if (pageFrom && p < parseInt(pageFrom)) return false;
      if (pageTo && p > parseInt(pageTo)) return false;
    }
    return true;
  });
}

// Resolves the actual pool + whether a fallback was needed, in one call -
// the exact decision startNcertPractice() and updateNcertPracticeCount()
// both need, kept in one place so they can never disagree with each other.
function resolveNcertPool(questions, opts){
  const strict = filterQuestionsByNcert(questions, opts);
  const hasRange = !!(opts.pageFrom || opts.pageTo);
  if (hasRange && strict.length === 0) {
    const fallback = filterQuestionsByNcert(questions, { ...opts, pageFrom: null, pageTo: null });
    return { pool: fallback, usedFallback: true };
  }
  return { pool: strict, usedFallback: false };
}

module.exports = { isRealNcertPage, filterQuestionsByNcert, resolveNcertPool };
