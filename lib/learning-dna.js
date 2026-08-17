// lib/learning-dna.js
//
// EXTRACTED FOR TESTABILITY - verbatim copy of the live functions/constants in
// index.html's inline <script>. Same trade-off as lib/galti-classify.js (see its
// header) - index.html has its own inline copy that is the actual runtime source
// of truth; this file exists so Jest can require() and unit-test the pure logic.
//
// computeSubjectDNA references `QUESTIONS` as a bare global - the full,
// dynamically-loaded question bank. It is NOT bundled here (it's runtime data,
// not a constant) - tests must set `global.QUESTIONS = [...]` before calling.
//
// Source: index.html inline <script>, DNA_DIMENSIONS / MIN_ATTEMPTS_FOR_DNA /
// computeSubjectDNA. Extracted 2026-08-17, verified byte-identical.

const DNA_DIMENSIONS = [
  { key:'concept',  label:'Concept Understanding', errType:'concept' },
  { key:'formula',  label:'Formula Recall',        errType:'formula' },
  { key:'unit',     label:'Unit Conversion',       errType:'unit'    },
  { key:'calc',     label:'Calculation Accuracy',  errType:'calc'    },
];
const MIN_ATTEMPTS_FOR_DNA = 5; // below this, don't show a misleadingly precise number

function computeSubjectDNA(sub, list, galtiSummary, consistency7d){
  const tidsInSub = QUESTIONS.filter(function(q){return q.sub===sub}).reduce(function(acc,q){acc[q.tid]=true;return acc;},{});
  const rows = list.filter(function(cs){return tidsInSub[cs.tid]});
  const totalAttempted = rows.reduce(function(s,r){return s+r.attempted},0);
  if(totalAttempted < MIN_ATTEMPTS_FOR_DNA){
    return { sub:sub, ready:false, totalAttempted:totalAttempted };
  }

  const errSums = {concept:0,formula:0,unit:0,calc:0};
  let timeMsSum=0, timeCount=0, improvingTids=0;
  rows.forEach(function(r){
    Object.keys(errSums).forEach(function(k){ errSums[k] += (r.errorTypes&&r.errorTypes[k])||0; });
    if(r.avgTimeMs){ timeMsSum += r.avgTimeMs*r.attempted; timeCount += r.attempted; }
    if((r.correctStreak||0) >= 3) improvingTids++;
  });

  const scores = {};
  DNA_DIMENSIONS.forEach(function(d){
    scores[d.key] = Math.max(0, Math.min(100, Math.round(100*(1 - errSums[d.errType]/Math.max(1,totalAttempted)))));
  });

  // Speed: actual avg time vs question metadata estimatedTime (same fallback-by-difficulty as Phase 1)
  const subQs = QUESTIONS.filter(function(q){return q.sub===sub});
  const estTimes = subQs.map(function(q){
    return q.estimatedTime || (q.diff==='hard'||q.diff==='exam'?90:q.diff==='medium'?60:45);
  });
  const estAvgSec = estTimes.length ? estTimes.reduce(function(a,b){return a+b},0)/estTimes.length : 60;
  const actualAvgSec = timeCount ? (timeMsSum/timeCount)/1000 : estAvgSec;
  const speedRatio = actualAvgSec>0 ? estAvgSec/actualAvgSec : 1;
  scores.speed = Math.max(20, Math.min(100, Math.round(speedRatio*100)));

  // Retention: GALTI recovery rate for this subject (primary) + consistency7d (secondary, small weight).
  // NOTE: true multi-day Daily Mission history isn't persisted (by design, avoids storage bloat) -
  // consistency7d (real session-frequency data) stands in as the honest available proxy.
  const subGalti = (galtiSummary||[]).filter(function(g){return g.sub===sub});
  let retentionScore;
  if(subGalti.length >= 3){
    const recoveredCount = subGalti.filter(function(g){return g.recovered}).length;
    const recoveryRate = recoveredCount/subGalti.length;
    const consistencyNorm = Math.min(1, (consistency7d||0)/7);
    retentionScore = Math.round((recoveryRate*0.8 + consistencyNorm*0.2)*100);
  } else {
    // Not enough Galti history yet - consistency-only, clearly lower confidence
    retentionScore = Math.round(Math.min(1,(consistency7d||0)/7)*100);
  }
  scores.retention = Math.max(0, Math.min(100, retentionScore));

  return { sub:sub, ready:true, totalAttempted:totalAttempted, scores:scores,
           retentionConfident: subGalti.length>=3, improvingCount: improvingTids, tidCount: rows.length };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DNA_DIMENSIONS, MIN_ATTEMPTS_FOR_DNA, computeSubjectDNA };
}
