// NEETAce 2026 — Unit Variant Question Engine
// Same concept, different units per student.
// Tests dimensional awareness — a core NEET skill.
// Student must convert to SI first, then solve.

// ===== UNIT CONVERSION TABLES =====
const UNITS = {
  velocity:[
    {label:'m/s',   toSI:v=>v,         factor:1,      display:v=>`${v} m/s`},
    {label:'km/h',  toSI:v=>v/3.6,     factor:1/3.6,  display:v=>`${v} km/h`},
    {label:'cm/s',  toSI:v=>v/100,     factor:0.01,   display:v=>`${v} cm/s`},
    {label:'km/min',toSI:v=>v*1000/60, factor:1000/60,display:v=>`${v} km/min`},
  ],
  mass:[
    {label:'kg', toSI:m=>m,      factor:1,      display:m=>`${m} kg`},
    {label:'g',  toSI:m=>m/1e3,  factor:1e-3,   display:m=>`${m} g`},
    {label:'mg', toSI:m=>m/1e6,  factor:1e-6,   display:m=>`${m} mg`},
  ],
  length:[
    {label:'m',  toSI:l=>l,      factor:1,    display:l=>`${l} m`},
    {label:'cm', toSI:l=>l/100,  factor:0.01, display:l=>`${l} cm`},
    {label:'km', toSI:l=>l*1000, factor:1000, display:l=>`${l} km`},
    {label:'mm', toSI:l=>l/1000, factor:1e-3, display:l=>`${l} mm`},
  ],
  force:[
    {label:'N',  toSI:f=>f,      factor:1,    display:f=>`${f} N`},
    {label:'kN', toSI:f=>f*1000, factor:1000, display:f=>`${f} kN`},
    {label:'dyne',toSI:f=>f/1e5, factor:1e-5, display:f=>`${f} dyne`},
  ],
  frequency:[
    {label:'Hz',  toSI:f=>f,       factor:1,     display:f=>`${f} Hz`},
    {label:'rpm', toSI:f=>f/60,    factor:1/60,  display:f=>`${f} rpm`},
    {label:'rps', toSI:f=>f,       factor:1,     display:f=>`${f} rps`},
    {label:'kHz', toSI:f=>f*1000,  factor:1000,  display:f=>`${f} kHz`},
  ],
  time:[
    {label:'s',   toSI:t=>t,      factor:1,     display:t=>`${t} s`},
    {label:'min', toSI:t=>t*60,   factor:60,    display:t=>`${t} min`},
    {label:'ms',  toSI:t=>t/1000, factor:1e-3,  display:t=>`${t} ms`},
    {label:'hr',  toSI:t=>t*3600, factor:3600,  display:t=>`${t} hr`},
  ],
  // Chemistry
  concentration:[
    {label:'mol/L',  toSI:c=>c,       factor:1,     display:c=>`${c} mol/L`},
    {label:'mmol/L', toSI:c=>c/1000,  factor:1e-3,  display:c=>`${c} mmol/L`},
    {label:'μmol/L', toSI:c=>c/1e6,   factor:1e-6,  display:c=>`${c} μmol/L`},
  ],
  volume:[
    {label:'L',  toSI:v=>v,      factor:1,     display:v=>`${v} L`},
    {label:'mL', toSI:v=>v/1000, factor:1e-3,  display:v=>`${v} mL`},
    {label:'dL', toSI:v=>v/10,   factor:0.1,   display:v=>`${v} dL`},
    {label:'cm³',toSI:v=>v/1000, factor:1e-3,  display:v=>`${v} cm³`},
  ],
  temperature:[
    {label:'K',  toSI:t=>t,       toK:t=>t,       display:t=>`${t} K`},
    {label:'°C', toSI:t=>t+273,   toK:t=>t+273,   display:t=>`${t} °C`},
  ],
  pressure:[
    {label:'atm', toSI:p=>p,          factor:1,         display:p=>`${p} atm`},
    {label:'Pa',  toSI:p=>p/101325,   factor:1/101325,  display:p=>`${p} Pa`},
    {label:'kPa', toSI:p=>p/101.325,  factor:1/101.325, display:p=>`${p} kPa`},
    {label:'bar', toSI:p=>p/1.01325,  factor:1/1.01325, display:p=>`${p} bar`},
    {label:'mmHg',toSI:p=>p/760,      factor:1/760,     display:p=>`${p} mmHg`},
  ],
  // Biology
  cell_size:[
    {label:'μm',  toSI:s=>s*1e-6,   factor:1e-6,  display:s=>`${s} μm`},
    {label:'nm',  toSI:s=>s*1e-9,   factor:1e-9,  display:s=>`${s} nm`},
    {label:'mm',  toSI:s=>s*1e-3,   factor:1e-3,  display:s=>`${s} mm`},
  ],
};

// ===== UNIT VARIANT QUESTION TEMPLATES =====
const UNIT_QUESTIONS = [

// PHYSICS
{id:'uq1',sub:'PHYSICS',ch:'Kinetic Energy',tid:'p4',
concept:'Kinetic energy of a moving object',
template:'An object of mass {m} moving at {v}. Calculate its kinetic energy in Joules:',
params:{
  m:{type:'mass',   values:[1,2,5,10,20,50], baseUnit:'kg'},
  v:{type:'velocity',values:[5,10,15,20,30],  baseUnit:'m/s'},
},
correct_fn:(vals)=>Math.round(0.5*vals.mSI*vals.vSI*vals.vSI*100)/100,
correct_unit:'J',
explanation_fn:(vals,ans)=>`Convert to SI: m=${round(vals.mSI)} kg, v=${round(vals.vSI)} m/s\nKE = ½mv² = ½×${round(vals.mSI)}×${round(vals.vSI)}² = ${ans} J`,
ncertCl:11,ncertCh:6,ncertPg:'118',unit:'Work Energy Power',diff:'medium',
trick:'Always convert to SI (kg, m/s) FIRST, then apply KE=½mv².'},

{id:'uq2',sub:'PHYSICS',ch:'Speed & Velocity',tid:'p2',
concept:'Unit conversion of speed',
template:'A car travels at {v}. Convert to m/s:',
params:{v:{type:'velocity',values:[36,54,72,90,108,126],exclude:['m/s'],baseUnit:'m/s'}},
correct_fn:(vals)=>Math.round(vals.vSI*100)/100,
correct_unit:'m/s',
explanation_fn:(vals,ans)=>`${vals.vDisplay} × conversion factor = ${ans} m/s\n1 km/h = 1/3.6 m/s. 1 cm/s = 0.01 m/s.`,
ncertCl:11,ncertCh:3,ncertPg:'40',unit:'Kinematics',diff:'easy',
trick:'km/h → m/s: divide by 3.6. m/s → km/h: multiply by 3.6.'},

{id:'uq3',sub:'PHYSICS',ch:'Rotational Motion',tid:'p6',
concept:'Angular velocity from RPM or Hz',
template:'A wheel rotates at {f}. Angular velocity (ω) in rad/s:',
params:{f:{type:'frequency',values:[60,120,300,600,1200],baseUnit:'Hz'}},
correct_fn:(vals)=>Math.round(2*Math.PI*vals.fSI*100)/100,
correct_unit:'rad/s',
explanation_fn:(vals,ans)=>`${vals.fDisplay} = ${round(vals.fSI)} Hz (rps)\nω = 2πf = 2π×${round(vals.fSI)} = ${ans} rad/s`,
ncertCl:11,ncertCh:7,ncertPg:'148',unit:'Rotational Motion',diff:'medium',
trick:'ω = 2πf (Hz) = 2πN/60 (rpm). 1 rpm = π/30 rad/s.'},

{id:'uq4',sub:'PHYSICS',ch:'Laws of Motion',tid:'p3',
concept:'Newton second law with mixed units',
template:'A {m} block on frictionless surface. Force of {F} applied. Acceleration in m/s²:',
params:{
  m:{type:'mass',   values:[500,1000,2000,5000,10000],baseUnit:'kg'},
  F:{type:'force',  values:[1,2,5,10,20],baseUnit:'N'},
},
correct_fn:(vals)=>Math.round(vals.FSI/vals.mSI*1000)/1000,
correct_unit:'m/s²',
explanation_fn:(vals,ans)=>`Convert: m=${round(vals.mSI)} kg, F=${round(vals.FSI)} N\na = F/m = ${round(vals.FSI)}/${round(vals.mSI)} = ${ans} m/s²`,
ncertCl:11,ncertCh:5,ncertPg:'94',unit:'Newton Laws',diff:'medium',
trick:'Convert ALL units to SI first, then apply F=ma.'},

{id:'uq5',sub:'PHYSICS',ch:'Waves',tid:'p8',
concept:'Wave speed from frequency and wavelength',
template:'Wave with frequency {f} and wavelength {lambda}. Speed in m/s:',
params:{
  f:{type:'frequency',values:[100,200,500,1000,5000],baseUnit:'Hz'},
  lambda:{type:'length',values:[10,20,50,100,200],baseUnit:'m'},
},
correct_fn:(vals)=>Math.round(vals.fSI*vals.lambdaSI*100)/100,
correct_unit:'m/s',
explanation_fn:(vals,ans)=>`v = fλ = ${round(vals.fSI)} Hz × ${round(vals.lambdaSI)} m = ${ans} m/s`,
ncertCl:11,ncertCh:15,ncertPg:'364',unit:'Waves',diff:'medium',
trick:'v = fλ. Always in SI: f in Hz, λ in m → v in m/s.'},

// CHEMISTRY
{id:'uq6',sub:'CHEMISTRY',ch:'Solutions',tid:'c15',
concept:'Molarity calculation with volume unit conversion',
template:'2 moles of solute dissolved in {V}. Molarity in mol/L:',
params:{V:{type:'volume',values:[500,250,200,100,2000],baseUnit:'L'}},
correct_fn:(vals)=>Math.round(2/vals.VSI*1000)/1000,
correct_unit:'mol/L',
explanation_fn:(vals,ans)=>`V = ${vals.VDisplay} = ${round(vals.VSI)} L\nM = n/V = 2/${round(vals.VSI)} = ${ans} mol/L`,
ncertCl:12,ncertCh:2,ncertPg:'42',unit:'Solutions',diff:'easy',
trick:'M = mol/L. Convert volume to L first. 1000 mL = 1 L.'},

{id:'uq7',sub:'CHEMISTRY',ch:'Ideal Gas',tid:'c4',
concept:'PV=nRT with pressure unit conversion',
template:'1 mol gas at 273 K, {P}. Volume using R=8.314 J/mol·K:',
params:{P:{type:'pressure',values:[1,2,0.5],baseUnit:'atm'}},
correct_fn:(vals)=>Math.round(1*8.314*273/(vals.PSI*101325)*1000)/1000,
correct_unit:'L',
explanation_fn:(vals,ans)=>`P = ${vals.PDisplay} = ${round(vals.PSI*101325)} Pa\nV = nRT/P = 1×8.314×273/${round(vals.PSI*101325)} = ${ans} L`,
ncertCl:11,ncertCh:5,ncertPg:'151',unit:'States of Matter',diff:'hard',
trick:'PV=nRT. R=8.314 J/mol·K when P in Pa. R=0.0821 L·atm/mol·K when P in atm.'},

{id:'uq8',sub:'CHEMISTRY',ch:'Chemical Kinetics',tid:'c8',
concept:'Half-life in different time units',
template:'First order reaction, k=0.01 s⁻¹. Half-life in {unit}:',
params:{timeunit:{type:'time_label',options:['min','hr','ms'],baseUnit:'s'}},
correct_fn:(vals)=>{const t=0.693/0.01;return Math.round(t/vals.timeUnitFactor*100)/100;},
correct_unit:'(selected unit)',
explanation_fn:(vals,ans)=>`t½ = 0.693/k = 0.693/0.01 = 69.3 s = ${ans} ${vals.timeUnitLabel}`,
ncertCl:12,ncertCh:4,ncertPg:'107',unit:'Kinetics',diff:'medium',
trick:'First find t½ in seconds (=0.693/k), then convert to required unit.'},

// BIOLOGY
{id:'uq9',sub:'BIOLOGY',ch:'Cell Size',tid:'b1',
concept:'Cell size unit conversion',
template:'An RBC has diameter {d}. Convert to {targetUnit}:',
params:{
  d:{type:'cell_size',values:[7,8,6],baseUnit:'μm'},
  targetUnit:{type:'target_unit_label',options:['nm','mm'],baseUnit:'μm'},
},
correct_fn:(vals)=>{
  const SI=vals.dSI;
  if(vals.targetUnit==='nm') return Math.round(SI*1e9);
  if(vals.targetUnit==='mm') return Math.round(SI*1e3*10000)/10000;
  return SI;
},
correct_unit:'(selected)',
explanation_fn:(vals,ans)=>`${vals.dDisplay} = ${vals.dSI} m\n1 μm = 1000 nm = 0.001 mm\nAnswer = ${ans} ${vals.targetUnit}`,
ncertCl:11,ncertCh:8,ncertPg:'130',unit:'Cell Biology',diff:'easy',
trick:'μm to nm: multiply by 1000. μm to mm: divide by 1000.'},

{id:'uq10',sub:'BIOLOGY',ch:'Heart Rate',tid:'b10',
concept:'Heart rate conversion between different units',
template:'Heart beats at {rate}. Express in beats per second:',
params:{rate:{type:'heart_rate',options:[{val:72,unit:'beats/min'},{val:80,unit:'beats/min'},{val:1.5,unit:'beats/s'},{val:0.02,unit:'beats/ms'}],baseUnit:'beats/s'}},
correct_fn:(vals)=>Math.round(vals.rateSI*1000)/1000,
correct_unit:'beats/s',
explanation_fn:(vals,ans)=>`${vals.rateDisplay} = ${ans} beats/s\nNormal: 72 beats/min = 1.2 beats/s = 1200 beats/ms⁻¹`,
ncertCl:11,ncertCh:18,ncertPg:'294',unit:'Circulation',diff:'easy',
trick:'72 beats/min = 72/60 = 1.2 beats/s. Normal HR = 60-100 bpm.'},

];

// ===== UNIT VARIANT ENGINE =====
const UNIT_HISTORY_BY_STUDENT_TEMPLATE = new Map();
const questionEngineUtils=(typeof require==='function')
  ?require('./question_engine_utils')
  :(typeof globalThis!=='undefined'?globalThis.QuestionEngineUtils:undefined)||{};
const hashCode=questionEngineUtils.hashCode||function(str){let h=0;for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}return Math.abs(h);};
const seededRandom=questionEngineUtils.seededRandom||function(seed){let s=seed;return function(){s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
const shuffleSeeded=questionEngineUtils.shuffleSeeded||function(arr,seed){const rng=seededRandom(seed);const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const getAttemptBucket=questionEngineUtils.getAttemptBucket||function(ts=Date.now()){return Math.floor(Number(ts)/(24*60*60*1000));};
const normalizeGenerationOptions=questionEngineUtils.normalizeGenerationOptions||function(optionsOrAttemptSeed){
  const opts=(optionsOrAttemptSeed&&typeof optionsOrAttemptSeed==='object'&&!Array.isArray(optionsOrAttemptSeed))
    ?{...optionsOrAttemptSeed}
    :{attemptSeed:optionsOrAttemptSeed};
  if(opts.attemptSeed==null) opts.attemptSeed=opts.sessionId??opts.attemptId??opts.nonce??getAttemptBucket();
  if(opts.varyStrategy!=='holdOneConstant') opts.varyStrategy='all';
  const maxRerolls=Number(opts.maxRerolls);
  opts.maxRerolls=Number.isFinite(maxRerolls)&&maxRerolls>=0?Math.floor(maxRerolls):10;
  return opts;
};
function round(n){return Math.round(n*10000)/10000;}
function pickFrom(arr,seed){const rng=seededRandom(seed);return arr[Math.floor(rng()*arr.length)];}
const toSignature=questionEngineUtils.toSignature||function(value){
  if(typeof value==='string') return value;
  if(value&&typeof value==='object'){
    try{return JSON.stringify(value);}catch(e){return null;}
  }
  return null;
};
const extractLastHistoryValue=questionEngineUtils.extractLastHistoryValue||function(history){
  if(history instanceof Set){
    let last;
    for(const item of history) last=item;
    return last;
  }
  if(Array.isArray(history)&&history.length) return history[history.length-1];
  return null;
};

function generateUnitQuestion(tmpl, studentId, optionsOrAttemptSeed){
  const opts=normalizeGenerationOptions(optionsOrAttemptSeed);
  const historyKey=`${studentId}:${tmpl.id}`;
  const historyLimit=Number.isFinite(Number(opts.historyLimit))?Math.max(1,Math.floor(Number(opts.historyLimit))):20;
  const inMemoryHistory=UNIT_HISTORY_BY_STUDENT_TEMPLATE.get(historyKey)||[];
  const providedHistory=opts.history;
  const seenSignatures=new Set(inMemoryHistory);
  if(providedHistory instanceof Set||Array.isArray(providedHistory)){
    for(const item of providedHistory){
      const sig=toSignature(item);
      if(sig) seenSignatures.add(sig);
    }
  }
  const previousVals=opts.previousParamValues
    ||(function(){
      const candidates=[extractLastHistoryValue(inMemoryHistory),extractLastHistoryValue(providedHistory)];
      for(const candidate of candidates){
        if(!candidate) continue;
        if(candidate&&typeof candidate==='object'&&!Array.isArray(candidate)) return candidate;
        if(typeof candidate==='string'){
          try{
            const parsed=JSON.parse(candidate);
            if(parsed&&typeof parsed==='object') return parsed;
          }catch(e){}
        }
      }
      return null;
    })();
  const paramKeys=Object.keys(tmpl.params);
  const canHoldOne=opts.varyStrategy==='holdOneConstant'&&previousVals&&paramKeys.length>1;
  const holdKey=canHoldOne?paramKeys[hashCode(`${studentId}:${tmpl.id}:${opts.attemptSeed}:hold`)%paramKeys.length]:null;

  let seed=0;
  let vals={};
  let questionText=tmpl.template;
  let signature='';
  let fallbackVals={};
  let fallbackText=tmpl.template;
  let fallbackSignature='';
  let accepted=false;
  for(let reroll=0;reroll<=opts.maxRerolls;reroll++){
    seed=hashCode(`${studentId}:${tmpl.id}:${opts.attemptSeed}:${reroll}`);
    const rng=seededRandom(seed);
    const candidateVals={};
    let candidateText=tmpl.template;
    for(const [k, p] of Object.entries(tmpl.params)){
      const unitPool = UNITS[p.type] || [];
      const exclude  = p.exclude || [];
      const available = unitPool.filter(u=>!exclude.includes(u.label));
      const chosenUnit = available[Math.floor(rng()*available.length)];
      const valuePool  = p.values || [1,2,5,10];
      const rawVal     = valuePool[Math.floor(rng()*valuePool.length)];
      const siVal      = chosenUnit ? chosenUnit.toSI(rawVal) : rawVal;
      const display    = chosenUnit ? chosenUnit.display(rawVal) : `${rawVal}`;
      candidateVals[k]          = rawVal;
      candidateVals[k+'SI']     = siVal;
      candidateVals[k+'Unit']   = chosenUnit ? chosenUnit.label : p.baseUnit;
      candidateVals[k+'Display']= display;
    }
    if(holdKey&&previousVals[holdKey]!=null){
      for(const suffix of ['', 'SI', 'Unit', 'Display']){
        const key=`${holdKey}${suffix}`;
        if(previousVals[key]!=null) candidateVals[key]=previousVals[key];
      }
    }
    for(const key of Object.keys(tmpl.params)){
      candidateText=candidateText.replace(new RegExp('{'+key+'}','g'),candidateVals[key+'Display']??candidateVals[key]);
    }
    const candidateSignature=JSON.stringify(candidateVals);
    fallbackVals=candidateVals;
    fallbackText=candidateText;
    fallbackSignature=candidateSignature;
    if(!seenSignatures.has(candidateSignature)){
      vals=candidateVals;
      questionText=candidateText;
      signature=candidateSignature;
      accepted=true;
      break;
    }
  }
  if(!accepted){
    vals=fallbackVals;
    questionText=fallbackText;
    signature=fallbackSignature;
  }
  const updatedHistory=[...inMemoryHistory,signature].slice(-historyLimit);
  UNIT_HISTORY_BY_STUDENT_TEMPLATE.set(historyKey,updatedHistory);
  if(providedHistory instanceof Set) providedHistory.add(signature);
  if(Array.isArray(providedHistory)){
    providedHistory.push(signature);
    if(providedHistory.length>historyLimit) providedHistory.splice(0,providedHistory.length-historyLimit);
  }

  let ans;
  try{ ans = tmpl.correct_fn(vals); }catch(e){ ans = 0; }
  if(isNaN(ans)||!isFinite(ans)) ans = 0;
  ans = Math.round(ans*10000)/10000;

  const expl = tmpl.explanation_fn(vals, ans).replace(/\${round\(([^)]+)\)}/g,(_,e)=>{
    try{return round(eval(e));}catch(x){return e;}
  });

  // Build distractors (wrong unit choices)
  const distractors = [
    Math.round(ans*3.6*100)/100,
    Math.round(ans/1000*100)/100,
    Math.round(ans*100*100)/100,
    Math.round(ans/3600*100)/100,
  ].filter(d=>d!==ans&&isFinite(d)&&d>0).slice(0,3);

  while(distractors.length<3) distractors.push(Math.round(ans*(2+distractors.length)*100)/100);

  const correctDisplay = `${ans} ${tmpl.correct_unit}`;
  const allOpts = shuffleSeeded([correctDisplay,...distractors.map(d=>`${d} ${tmpl.correct_unit}`)],seed+7);
  const correctIdx = allOpts.indexOf(correctDisplay);

  return{
    id:`${tmpl.id}_${studentId}`,
    sub:tmpl.sub, ch:tmpl.ch, tid:tmpl.tid,
    text:questionText,
    opts:allOpts,
    correct:correctIdx,
    explanation:`⚠️ Unit Conversion Required!\n${expl}\n\n💡 ${tmpl.trick}`,
    ncertCl:tmpl.ncertCl, ncertCh:tmpl.ncertCh, ncertPg:tmpl.ncertPg,
    unit:tmpl.unit, diff:tmpl.diff, pyq:false,
    trick:tmpl.trick,
    isUnitVariant:true,
    paramValues:vals,
  };
}

function getUnitQuestions(studentId, count=10, optionsOrAttemptSeed){
  const opts=normalizeGenerationOptions(optionsOrAttemptSeed);
  return UNIT_QUESTIONS.slice(0,count).map((t,idx)=>generateUnitQuestion(t,studentId,{...opts,attemptSeed:`${opts.attemptSeed}:${idx}`}));
}
function getUnitQuestionsBySubject(studentId, subject, count=5, optionsOrAttemptSeed){
  const opts=normalizeGenerationOptions(optionsOrAttemptSeed);
  return UNIT_QUESTIONS.filter(q=>q.sub===subject).slice(0,count).map((t,idx)=>generateUnitQuestion(t,studentId,{...opts,attemptSeed:`${opts.attemptSeed}:${idx}`}));
}

if(typeof module!=='undefined') module.exports={UNIT_QUESTIONS,generateUnitQuestion,getUnitQuestions,getUnitQuestionsBySubject,UNITS,UNIT_HISTORY_BY_STUDENT_TEMPLATE};
