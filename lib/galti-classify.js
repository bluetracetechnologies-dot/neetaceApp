// lib/galti-classify.js
//
// EXTRACTED FOR TESTABILITY - verbatim copy of the live functions in index.html's
// single inline <script> block. index.html does NOT currently import this file;
// it has its own inline copy that is the actual runtime source of truth.
//
// This is a KNOWN, DELIBERATE trade-off (see Architecture Review): these functions
// are pure (no DOM access) but diagnoseWrongAnswer reads THREE bare globals exactly
// as the live browser code does - `window._DASHBOARD`, `ADAPTIVE_MODE`, `DIFF_RANK`.
// Verified byte-identical against the live source (see tests/regression/
// lib-drift-check.test.js). Test setup (not this file) must define
// `global.window = { _DASHBOARD: {...} }`, `global.ADAPTIVE_MODE`, and
// `global.DIFF_RANK` before calling diagnoseWrongAnswer - see
// tests/unit/galti-classify.test.js for the exact pattern.
//
// DRIFT RISK: if index.html's inline copy is edited without updating this file,
// these tests will keep passing against a STALE copy while live behavior changes
// silently. Recommended follow-up: refactor index.html to <script src="lib/...">
// so there is exactly one copy. Until then, re-run the extraction diff check in
// tests/regression/lib-drift-check.test.js before trusting these tests as a
// signal about live behavior.
//
// Source: index.html inline <script>, functions CAUSE_LABELS / diagnoseWrongAnswer /
// classifyError. Extracted 2026-08-17, verified byte-identical against two
// consecutive audits before extraction.

const CAUSE_LABELS = {
  concept:  { label:'Concept Error',         emoji:'\uD83D\uDCA1' },
  formula:  { label:'Formula Error',         emoji:'\uD83D\uDCD0' },
  unit:     { label:'Unit Conversion Error', emoji:'\uD83D\uDCCF' },
  calc:     { label:'Calculation Error',     emoji:'\uD83E\uDDEE' },
  careless: { label:'Careless Error',        emoji:'\uD83E\uDD26' },
  time:     { label:'Time Pressure Error',   emoji:'\u23F0' },
};

function diagnoseWrongAnswer(q, selectedIdx, timeTakenMs){
  // Each signal casts weighted votes for one or more causes. Multiple independent signals
  // agreeing = higher confidence. Capped below 100% - this is heuristic, not a trained model,
  // and should never claim false certainty (same honesty pattern as Score Predictor).
  const votes = { concept:0, formula:0, unit:0, calc:0, careless:0, time:0 };
  const evidence = [];

  const estSec = q.estimatedTime || (q.diff==='hard'||q.diff==='exam'?90:q.diff==='medium'?60:45);
  const actualSec = timeTakenMs ? Math.round(timeTakenMs/1000) : null;

  // Signal 1: Timing vs question metadata estimatedTime (Phase 1 metadata, real use)
  if(actualSec !== null){
    const ratio = actualSec/estSec;
    if(ratio > 1.6){
      votes.time += 3;
      evidence.push('Took '+actualSec+'s vs an expected '+estSec+'s ('+Math.round((ratio-1)*100)+'% over)');
    } else if(ratio < 0.4){
      votes.careless += 2;
      evidence.push('Answered in just '+actualSec+'s - unusually fast for this question');
    }
  }

  // Signal 2: Question metadata - unitType (Phase 1 metadata, real use)
  if(q.unitType === 'unit_variant'){
    votes.unit += 2;
    evidence.push('This question specifically tests unit conversion');
  }

  // Signal 3: Question metadata - formula field present (Phase 1 metadata, real use)
  if(q.formula){
    votes.formula += 2;
    evidence.push('Question involves a formula: '+q.formula);
  }

  // Signal 4: trick field keyword scan (existing content field, now one signal among several)
  if(q.trick){
    const t = q.trick.toLowerCase();
    if(t.indexOf('formula')>=0){ votes.formula += 1; evidence.push('Common trap: '+q.trick); }
    else if(t.indexOf('unit')>=0 || t.indexOf('convert')>=0){ votes.unit += 1; evidence.push('Common trap: '+q.trick); }
    else evidence.push('Watch for: '+q.trick);
  }

  // Signal 5: difficulty - wrong on an easy/starter question leans careless
  if(q.diff === 'starter' || q.diff === 'easy'){
    votes.careless += 1;
    evidence.push('This is a '+q.diff+' question - wrong answers here are often slips, not gaps');
  }

  // Signal 6: HISTORICAL PRIOR - this student's own past error pattern on this exact topic
  // (reuses conceptStats.errorTypes from the cached dashboard - real history, not a new store)
  const dash = window._DASHBOARD;
  if(dash && dash.conceptStats){
    const cs = dash.conceptStats.find(function(c){return c.tid===q.tid});
    if(cs && cs.errorTypes){
      const total = Object.values(cs.errorTypes).reduce(function(a,b){return a+b},0);
      if(total >= 2){
        Object.entries(cs.errorTypes).forEach(function(e){
          const share = e[1]/total;
          if(share >= 0.4 && votes[e[0]] !== undefined){
            votes[e[0]] += 2;
            evidence.push('You have made '+e[1]+' '+(CAUSE_LABELS[e[0]]?CAUSE_LABELS[e[0]].label.toLowerCase():e[0])+' mistakes on this topic before');
          }
        });
      }
    }
  }

  // Default fallback if nothing fired
  if(Object.values(votes).every(function(v){return v===0})){
    votes.concept = 1;
    evidence.push('No strong signal detected - defaulting to concept gap as the most common cause');
  }

  const totalVotes = Object.values(votes).reduce(function(a,b){return a+b},0);
  const sorted = Object.entries(votes).sort(function(a,b){return b[1]-a[1]});
  const primaryCause = sorted[0][0];
  const primaryVotes = sorted[0][1];
  // Confidence: share of total signal weight held by the winning cause, capped at 90% (never claim certainty)
  const confidence = Math.min(90, Math.max(35, Math.round((primaryVotes/Math.max(1,totalVotes))*100)));

  // Recommended recovery - REUSES existing systems, launches nothing new here.
  const inAdaptive = typeof ADAPTIVE_MODE !== 'undefined' && ADAPTIVE_MODE;
  const rank = (typeof DIFF_RANK !== 'undefined' ? DIFF_RANK[q.diff] : 2) || 2;
  const doctorEligible = inAdaptive && rank >= 2 && ['concept','formula','unit','calc'].indexOf(primaryCause) >= 0;
  let recommendation;
  if(doctorEligible){
    recommendation = 'Starting Concept Doctor - a guided step-by-step rebuild for this.';
  } else if(primaryCause === 'careless'){
    recommendation = 'Logged in Galti Copy for spaced review - no need to relearn, just slow down next time.';
  } else if(primaryCause === 'time'){
    recommendation = 'Logged in Galti Copy. Try the timer slider in Practice to build speed on this topic.';
  } else {
    recommendation = 'Added to your Recovery Queue and tomorrow\'s Daily Mission.';
  }

  return { primaryCause:primaryCause, confidence:confidence, evidence:evidence.slice(0,3), recommendation:recommendation, doctorEligible:doctorEligible };
}

function classifyError(q, idx, timeTakenMs, expectedTimeMs){
  return diagnoseWrongAnswer(q, idx, timeTakenMs).primaryCause;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CAUSE_LABELS, diagnoseWrongAnswer, classifyError };
}
