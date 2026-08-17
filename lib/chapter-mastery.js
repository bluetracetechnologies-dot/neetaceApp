// lib/chapter-mastery.js
//
// EXTRACTED FOR TESTABILITY - verbatim copy. See lib/galti-classify.js header
// for the full duplication/drift-risk note that applies to all lib/ files.
//
// buildChapterMasteryList references `QUESTIONS` as a bare global - tests must
// set `global.QUESTIONS = [...]` before calling.
//
// Source: index.html inline <script>, function buildChapterMasteryList.
// Extracted 2026-08-17, verified byte-identical.

function buildChapterMasteryList(list){
  // Shared helper - the exact grouping logic Chapter Mastery uses, now reusable by
  // Score Predictor V2 too. No duplicate grouping logic in two places.
  const bySubject = { PHYSICS: [], CHEMISTRY: [], BIOLOGY: [] };
  list.forEach(function(cs){
    if(cs.attempted < 1) return;
    const matches = QUESTIONS.filter(function(q){ return q.tid === cs.tid; });
    if(!matches.length) return;
    const sub = matches[0].sub;
    if(!bySubject[sub]) bySubject[sub] = [];
    const chCounts = {};
    matches.forEach(function(q){ chCounts[q.ch] = (chCounts[q.ch]||0) + 1; });
    const chapter = Object.keys(chCounts).sort(function(a,b){ return chCounts[b]-chCounts[a]; })[0];
    const theta = cs.theta !== null ? cs.theta : 500;
    const pct = Math.max(0, Math.min(100, Math.round((((theta-100)/800)*0.6 + (cs.accuracy/100)*0.4) * 100)));
    bySubject[sub].push({
      tid: cs.tid, chapter: chapter, sub: sub, pct: pct, accuracy: cs.accuracy, attempted: cs.attempted,
      masteryBand: cs.masteryBand, improving: (cs.correctStreak || 0) >= 3, errorTypes: cs.errorTypes||{},
    });
  });
  return bySubject;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildChapterMasteryList };
}
