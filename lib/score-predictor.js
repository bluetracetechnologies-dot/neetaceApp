// lib/score-predictor.js
//
// UNLIKE the other three lib/ files, this is NOT a byte-verbatim extraction.
// It cannot be: the live `renderScorePredictor` in index.html fuses pure
// computation with `el.innerHTML = ...` DOM writes in one function. A true
// verbatim copy would require either (a) mocking `document`/`S.user` with no
// clean way to assert on the computed numbers except parsing HTML strings back
// out - a worse, more brittle test than the alternative - or (b) this: an
// honest, clearly-labeled computational extraction.
//
// What changed vs the live source:
//   - Reads `dash` and `g` (user.scores.global) as PARAMETERS, not from
//     `document.getElementById(...)` / `S.user` globals.
//   - Returns a plain data object instead of building an HTML string.
//   - Calls the REAL buildChapterMasteryList from lib/chapter-mastery.js
//     (not a re-copy - avoids a second copy of that grouping logic existing
//     in three places instead of two).
//   - NEET_SYLLABUS and getWeightage are still bare-global dependencies,
//     exactly as in the live code - tests must inject them.
// What did NOT change: every formula, threshold, and constant is copied
// character-for-character from the live computation block (currentBase,
// confidence blend, potentialScore projection, all five Top-5/Fastest-Areas
// filters) - only the two DOM-reading lines and the final render step differ.
//
// DRIFT RISK IS HIGHER for this file than the other three lib/ files, because
// a change to the live formula does not have to touch a recognizable function
// signature to drift from this copy. Mitigation: tests/regression/
// lib-drift-check.test.js asserts the exact formula substrings below are still
// present verbatim in index.html's live renderScorePredictor - if that
// assertion fails, this file is out of sync with production and must be
// re-extracted before being trusted.
//
// Source: index.html inline <script>, function renderScorePredictor
// (computational portion only, before the "// RENDER" marker).
// Extracted 2026-08-17.
//
// BUG FOUND AND FIXED 2026-08-17 (via this test suite - see tests/unit/
// score-predictor.test.js "higher recovery rate narrows confidence band"):
// reliabilityFactor was `0.75 + (...)*0.25`, which made the confidence band
// WIDER for students with good recovery rate/consistency - backwards from its
// own comment ("narrows for demonstrated follow-through"). Fixed to
// `1.0 - (...)*0.25`, same 0.75-1.0 range, correct direction. This fix has
// been applied to both this file and the live index.html.

function computeScorePrediction(dash, g, buildChapterMasteryList, NEET_SYLLABUS, getWeightage) {
  const list = (dash && dash.conceptStats) || [];
  if (!list.length || !g.attempted) {
    return { ready: false, reason: 'Solve 20+ questions to unlock your NEET score prediction.' };
  }
  const withTheta = list.filter(function(x){return x.theta!==null});
  if (!withTheta.length) {
    return { ready: false, reason: 'Solve 20+ adaptive questions to unlock your NEET score prediction.' };
  }

  // CURRENT SCORE: the exact same formula V1 always used - not a new one.
  const avgTheta = withTheta.reduce(function(s,m){return s+m.theta},0)/withTheta.length;
  const acc = (g.accuracy||50)/100;
  const currentBase = ((avgTheta-100)/800)*0.6 + acc*0.4;
  const currentScore = Math.round(currentBase*720);

  // CONFIDENCE: V1's exact attempt-based width, modulated by recovery + consistency.
  const baseConf = Math.max(30, 90 - Math.min(60, g.attempted/5));
  const galtiSummary = dash.galtiSummary || [];
  const recoveryRate = galtiSummary.length>=3 ? galtiSummary.filter(function(x){return x.recovered}).length/galtiSummary.length : 0.5;
  const consistency7d = dash.consistency7d||0;
  const consistencyNorm = Math.min(1, consistency7d/7);
  const reliabilityFactor = 1.0 - (recoveryRate*0.5 + consistencyNorm*0.5)*0.25;
  const conf = Math.round(baseConf*reliabilityFactor);
  const lo=Math.max(0,currentScore-conf), hi=Math.min(720,currentScore+conf);
  const confidencePct = Math.max(35, Math.min(90, Math.round(100-(conf/90)*60)));

  // CHAPTER MASTERY (shared helper, zero new grouping logic)
  const bySubject = buildChapterMasteryList(list);
  const allChapters = [].concat(bySubject.PHYSICS||[], bySubject.CHEMISTRY||[], bySubject.BIOLOGY||[]);

  const top5Chapters = allChapters.filter(function(c){return c.attempted>=3})
    .sort(function(a,b){return a.pct-b.pct}).slice(0,5);

  const concepts = allChapters.filter(function(c){return c.attempted>=3}).map(function(c){
    const errs = Object.entries(c.errorTypes||{});
    const dominant = errs.length ? errs.sort(function(a,b){return b[1]-a[1]})[0] : null;
    const labels={concept:'Concept',formula:'Formula Recall',unit:'Unit Conversion',calc:'Calculation',careless:'Careless',time:'Time Pressure'};
    return { chapter:c.chapter, sub:c.sub, pct:c.pct, cause: dominant?labels[dominant[0]]||dominant[0]:null, causeCount: dominant?dominant[1]:0 };
  }).filter(function(c){return c.cause}).sort(function(a,b){return a.pct-b.pct}).slice(0,5);

  const top5Recovery = (dash.recoveryQueue||[]).slice(0,5);

  const fastestAreas = allChapters.filter(function(c){return c.attempted>=3 && c.pct>=35 && c.pct<=65})
    .map(function(c){
      const unit = (function(){ for(var s in NEET_SYLLABUS){ var u=NEET_SYLLABUS[s].units.find(function(u){return u.name===c.chapter||u.tids.indexOf(c.tid)>=0}); if(u) return u; } return null; })();
      const weight = unit ? getWeightage(unit.id) : 4;
      return Object.assign({}, c, { weight: weight, score: weight*(65-Math.abs(c.pct-50)) });
    }).sort(function(a,b){return b.score-a.score}).slice(0,3);

  // POTENTIAL SCORE: same formula, hypothetical inputs if top-5 recovery + weakest chapters were fixed.
  const targetTids = {};
  top5Chapters.forEach(function(c){targetTids[c.tid]=true});
  top5Recovery.forEach(function(r){targetTids[r.tid]=true});
  const simulated = withTheta.map(function(m){
    if(targetTids[m.tid]) return Object.assign({},m,{theta:Math.min(750,m.theta+120)});
    return m;
  });
  const potentialTheta = simulated.reduce(function(s,m){return s+m.theta},0)/simulated.length;
  const fixedCount = Object.keys(targetTids).length;
  const potentialAccBoost = Math.min(0.15, fixedCount*0.02);
  const potentialAcc = Math.min(0.95, acc+potentialAccBoost);
  const potentialBase = ((potentialTheta-100)/800)*0.6 + potentialAcc*0.4;
  const potentialScore = Math.max(currentScore, Math.round(potentialBase*720));

  return {
    ready: true, currentScore, potentialScore, confidencePct, lo, hi,
    top5Chapters, concepts, top5Recovery, fastestAreas,
    consistency7d, attempted: g.attempted,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeScorePrediction };
}
