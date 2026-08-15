// NEETAce 2026 — Parameterized Question Engine
// Generates unique numerical values per student per session.
// Same concept tested, different numbers — zero cheating possible.

const PARAM_QUESTIONS = [

// PHYSICS
{id:'pp1',sub:'PHYSICS',ch:'Laws of Motion',tid:'p3',
template:'A block of mass {m} kg is on a frictionless surface. Force of {F} N applied. Acceleration is:',
params:{m:{min:2,max:10,step:1},F:{min:10,max:50,step:5}},
correct_expr:'F/m',correct_unit:'m/s²',
distractor_exprs:['m/F','F*m','F/(2*m)'],
explanation_template:'F = ma → a = F/m = {F}/{m} = {answer} m/s².',
ncertCl:11,ncertCh:5,ncertPg:'94',unit:'Newton\'s Laws',diff:'easy',pyq:false,
trick:'F=ma. a=F/m on frictionless surface.'},

{id:'pp2',sub:'PHYSICS',ch:'Laws of Motion',tid:'p3',
template:'Block of mass {m} kg, μ={mu}. Force to just move it (g=10):',
params:{m:{min:2,max:20,step:2},mu:{min:0.1,max:0.5,step:0.1}},
correct_expr:'Math.round(mu*m*10*10)/10',correct_unit:'N',
distractor_exprs:['mu*m','m*10','mu*10'],
explanation_template:'f = μmg = {mu}×{m}×10 = {answer} N.',
ncertCl:11,ncertCh:5,ncertPg:'97',unit:'Friction',diff:'easy',pyq:false,
trick:'f=μmg on horizontal surface.'},

{id:'pp3',sub:'PHYSICS',ch:'Work Energy Power',tid:'p4',
template:'Mass {m} kg moving at {v} m/s brought to rest. Work done by braking force:',
params:{m:{min:1,max:10,step:1},v:{min:2,max:20,step:2}},
correct_expr:'Math.round(-0.5*m*v*v*10)/10',correct_unit:'J',
distractor_exprs:['0.5*m*v*v','m*v','m*v*v'],
explanation_template:'W = ΔKE = 0 − ½mv² = −½×{m}×{v}² = {answer} J.',
ncertCl:11,ncertCh:6,ncertPg:'119',unit:'Work Energy Theorem',diff:'medium',pyq:false,
trick:'W=ΔKE. Negative because opposing motion.'},

{id:'pp4',sub:'PHYSICS',ch:'Simple Harmonic Motion',tid:'p7',
template:'Simple pendulum of length {L} m. Time period (g=10):',
params:{L:{min:1,max:10,step:1}},
correct_expr:'Math.round(2*Math.PI*Math.sqrt(L/10)*10)/10',correct_unit:'s',
distractor_exprs:['Math.round(2*Math.PI*Math.sqrt(L/9.8)*10)/10','Math.round(Math.PI*Math.sqrt(L/10)*10)/10','Math.round(2*Math.PI*Math.sqrt(L/10)*5)/5'],
explanation_template:'T = 2π√(L/g) = 2π√({L}/10) = {answer} s.',
ncertCl:11,ncertCh:14,ncertPg:'341',unit:'SHM',diff:'easy',pyq:false,
trick:'T=2π√(L/g). Independent of mass and amplitude.'},

{id:'pp5',sub:'PHYSICS',ch:'Current Electricity',tid:'p12',
template:'{R} Ω resistor connected to {V} V battery. Current flowing:',
params:{R:{min:2,max:20,step:2},V:{min:4,max:24,step:2}},
correct_expr:'Math.round(V/R*100)/100',correct_unit:'A',
distractor_exprs:['Math.round(R/V*100)/100','Math.round(V*R*100)/100','Math.round(V/(2*R)*100)/100'],
explanation_template:'Ohm\'s Law: I = V/R = {V}/{R} = {answer} A.',
ncertCl:12,ncertCh:3,ncertPg:'84',unit:'Ohm\'s Law',diff:'easy',pyq:false,
trick:'V=IR → I=V/R. VIR triangle.'},

{id:'pp6',sub:'PHYSICS',ch:'Electrostatics',tid:'p11',
template:'Charges {q1} μC and {q2} μC, {r} m apart. Force (k=9×10⁹):',
params:{q1:{min:1,max:8,step:1},q2:{min:1,max:8,step:1},r:{min:1,max:4,step:1}},
correct_expr:'Math.round(9*q1*q2/(r*r)*1000)/1000',correct_unit:'×10⁻³ N',
distractor_exprs:['Math.round(9*q1*q2/(r)*1000)/1000','Math.round(9*q1*q2/(r*r*r)*1000)/1000','Math.round(9*(q1+q2)/(r*r)*1000)/1000'],
explanation_template:'F = kq₁q₂/r² = 9×10⁹×{q1}×10⁻⁶×{q2}×10⁻⁶/{r}² = {answer}×10⁻³ N.',
ncertCl:12,ncertCh:1,ncertPg:'8',unit:'Coulomb\'s Law',diff:'medium',pyq:false,
trick:'F=kq₁q₂/r². k=9×10⁹. Inverse square law.'},

{id:'pp7',sub:'PHYSICS',ch:'Wave Optics',tid:'p15',
template:'Young\'s DSE: λ={lambda} nm, D={D} m, d={d} mm. Fringe width:',
params:{lambda:{min:400,max:700,step:50},D:{min:1,max:3,step:0.5},d:{min:0.5,max:2,step:0.5}},
correct_expr:'Math.round(lambda*1e-9*D/(d*1e-3)*1e3*100)/100',correct_unit:'mm',
distractor_exprs:['Math.round(lambda*1e-9*d*1e-3/D*1e3*100)/100','Math.round(lambda*1e-9*D/(d*1e-3)*1e3/2*100)/100','Math.round(lambda*1e-9*D*2/(d*1e-3)*1e3*100)/100'],
explanation_template:'β = λD/d = {lambda}×10⁻⁹×{D}/({d}×10⁻³) = {answer} mm.',
ncertCl:12,ncertCh:10,ncertPg:'362',unit:'Wave Optics — Fringe Width',diff:'medium',pyq:false,
trick:'β=λD/d. Fringe width proportional to λ and D, inversely to d.'},

// CHEMISTRY
{id:'pc1',sub:'CHEMISTRY',ch:'Mole Concept',tid:'c1',
template:'{g} g of NaOH (MW=40). Number of moles:',
params:{g:{min:20,max:200,step:20}},
correct_expr:'g/40',correct_unit:'mol',
distractor_exprs:['g*40','40/g','g/20'],
explanation_template:'Moles = mass/MW = {g}/40 = {answer} mol.',
ncertCl:11,ncertCh:1,ncertPg:'13',unit:'Mole Concept',diff:'easy',pyq:false,
trick:'Moles = mass/molar mass. Always divide.'},

{id:'pc2',sub:'CHEMISTRY',ch:'Solutions',tid:'c15',
template:'{g} g NaOH (MW=40) dissolved in {V} mL solution. Molarity:',
params:{g:{min:4,max:40,step:4},V:{min:100,max:1000,step:100}},
correct_expr:'Math.round((g/40)/(V/1000)*100)/100',correct_unit:'M',
distractor_exprs:['Math.round(g/(40*V)*100)/100','Math.round(g*1000/(40*V)*100)/100','Math.round((g/40)*V/1000*100)/100'],
explanation_template:'M = (g/MW)/V(L) = ({g}/40)/({V}/1000) = {answer} M.',
ncertCl:12,ncertCh:2,ncertPg:'42',unit:'Solutions — Molarity',diff:'easy',pyq:false,
trick:'M = moles/L. First find moles=g/MW, then divide by volume in litres.'},

{id:'pc3',sub:'CHEMISTRY',ch:'Ideal Gas',tid:'c4',
template:'{n} mol gas at {T} K, {P} atm. Volume (R=0.0821):',
params:{n:{min:1,max:4,step:1},T:{min:273,max:373,step:25},P:{min:1,max:4,step:1}},
correct_expr:'Math.round(n*0.0821*T/P*100)/100',correct_unit:'L',
distractor_exprs:['Math.round(n*0.0821*T*P*100)/100','Math.round(P/(n*0.0821*T)*100)/100','Math.round(n*0.0821/T/P*100)/100'],
explanation_template:'PV=nRT → V=nRT/P = {n}×0.0821×{T}/{P} = {answer} L.',
ncertCl:11,ncertCh:5,ncertPg:'151',unit:'States of Matter',diff:'medium',pyq:false,
trick:'PV=nRT. At STP: 1mol=22.4L.'},

{id:'pc4',sub:'CHEMISTRY',ch:'Electrochemistry',tid:'c7',
template:'E°cathode={ec} V, E°anode={ea} V. Cell EMF:',
params:{ec:{min:0.5,max:1.5,step:0.1},ea:{min:-0.4,max:0.4,step:0.1}},
correct_expr:'Math.round((ec-ea)*100)/100',correct_unit:'V',
distractor_exprs:['Math.round((ec+ea)*100)/100','Math.round((ea-ec)*100)/100','Math.round((ec-ea)/2*100)/100'],
explanation_template:'E°cell = E°cathode − E°anode = {ec} − ({ea}) = {answer} V.',
ncertCl:12,ncertCh:3,ncertPg:'82',unit:'Electrochemistry',diff:'medium',pyq:false,
trick:'E°cell = E°cathode − E°anode. Cathode=reduction. Anode=oxidation.'},

{id:'pc5',sub:'CHEMISTRY',ch:'Chemical Kinetics',tid:'c8',
template:'First order reaction, k={k} min⁻¹. Half-life:',
params:{k:{min:0.1,max:1.0,step:0.1}},
correct_expr:'Math.round(0.693/k*100)/100',correct_unit:'min',
distractor_exprs:['Math.round(k/0.693*100)/100','Math.round(1/k*100)/100','Math.round(0.5/k*100)/100'],
explanation_template:'t½ = 0.693/k = 0.693/{k} = {answer} min.',
ncertCl:12,ncertCh:4,ncertPg:'107',unit:'Chemical Kinetics',diff:'easy',pyq:false,
trick:'First order: t½=0.693/k. Independent of concentration.'},

// BIOLOGY
{id:'pb1',sub:'BIOLOGY',ch:'Cell Division',tid:'b4',
template:'Cell with {n} chromosomes undergoes MITOSIS. Chromosomes in each daughter:',
params:{n:{min:4,max:46,step:2}},
correct_expr:'n',correct_unit:'chromosomes',
distractor_exprs:['n/2','n*2','n*4'],
explanation_template:'Mitosis = same chromosome number. {n} → {answer} in each daughter (2n maintained).',
ncertCl:11,ncertCh:10,ncertPg:'171',unit:'Cell Division',diff:'easy',pyq:false,
trick:'Mitosis: daughter=parent (2n→2n+2n). Meiosis: daughter=half (2n→n).'},

{id:'pb2',sub:'BIOLOGY',ch:'Cell Division',tid:'b4',
template:'Cell with {n} chromosomes undergoes MEIOSIS. Chromosomes in each result:',
params:{n:{min:8,max:46,step:2}},
correct_expr:'n/2',correct_unit:'chromosomes',
distractor_exprs:['n','n*2','n/4'],
explanation_template:'Meiosis halves chromosome number. 2n={n} → n={answer} in each haploid cell.',
ncertCl:11,ncertCh:10,ncertPg:'177',unit:'Cell Division',diff:'easy',pyq:false,
trick:'Meiosis: 2n → n. 4 cells total, each with n chromosomes.'},

{id:'pb3',sub:'BIOLOGY',ch:'Genetics',tid:'b14',
template:'Cross Aa × Aa gives {total} offspring. Expected number with genotype AA:',
params:{total:{min:100,max:1000,step:100}},
correct_expr:'total/4',correct_unit:'offspring',
distractor_exprs:['total/2','Math.round(total*3/4)','total'],
explanation_template:'Aa×Aa → 1AA:2Aa:1aa. P(AA)=25%. Expected = {total}×0.25 = {answer}.',
ncertCl:12,ncertCh:5,ncertPg:'86',unit:'Monohybrid Cross',diff:'medium',pyq:false,
trick:'Aa×Aa: 25%AA, 50%Aa, 25%aa. Phenotypic: 3:1.'},

{id:'pb4',sub:'BIOLOGY',ch:'Respiration',tid:'b6',
template:'{n} glucose molecules undergo aerobic respiration (38 ATP each). Total ATP:',
params:{n:{min:1,max:10,step:1}},
correct_expr:'n*38',correct_unit:'ATP',
distractor_exprs:['n*2','n*36','n*32'],
explanation_template:'{n} × 38 = {answer} ATP total.',
ncertCl:11,ncertCh:14,ncertPg:'240',unit:'Respiration',diff:'easy',pyq:false,
trick:'1 glucose = 38 ATP aerobic. Glycolysis=2, Krebs=2, ETC=34.'},

];

// ============================================================
// ENGINE — Seeded random with attempt/session variation
// ============================================================
const PARAM_HISTORY_BY_STUDENT_TEMPLATE = new Map();
const questionEngineUtils=(typeof module!=='undefined'&&module.exports)
  ?require('./question_engine_utils')
  :(typeof globalThis!=='undefined'?globalThis.QuestionEngineUtils:undefined)||{};
const hashCode=questionEngineUtils.hashCode||function(str){let h=0;for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}return Math.abs(h);};
const seededRandom=questionEngineUtils.seededRandom||function(seed){let s=seed;return function(){s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
const shuffleSeeded=questionEngineUtils.shuffleSeeded||function(arr,seed){const rng=seededRandom(seed);const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const normalizeGenerationOptions=questionEngineUtils.normalizeGenerationOptions||function(optionsOrAttemptSeed){
  const opts=(optionsOrAttemptSeed&&typeof optionsOrAttemptSeed==='object'&&!Array.isArray(optionsOrAttemptSeed))
    ?{...optionsOrAttemptSeed}
    :{attemptSeed:optionsOrAttemptSeed};
  if(opts.attemptSeed==null) opts.attemptSeed=Math.floor(Date.now()/(24*60*60*1000));
  if(opts.varyStrategy!=='holdOneConstant') opts.varyStrategy='all';
  const maxRerolls=Number(opts.maxRerolls);
  opts.maxRerolls=Number.isFinite(maxRerolls)&&maxRerolls>=0?Math.floor(maxRerolls):10;
  return opts;
};

function toSignature(value){
  if(typeof value==='string') return value;
  if(value&&typeof value==='object'){
    try{return JSON.stringify(value);}catch(e){return null;}
  }
  return null;
}
function extractLastHistoryValue(history){
  if(history instanceof Set){
    let last;
    for(const item of history) last=item;
    return last;
  }
  if(Array.isArray(history)&&history.length) return history[history.length-1];
  return null;
}

function generateQuestion(tmpl, studentId, optionsOrAttemptSeed){
  const opts=normalizeGenerationOptions(optionsOrAttemptSeed);
  const historyKey=`${studentId}:${tmpl.id}`;
  const historyLimit=Number.isFinite(Number(opts.historyLimit))?Math.max(1,Math.floor(Number(opts.historyLimit))):20;
  const inMemoryHistory=PARAM_HISTORY_BY_STUDENT_TEMPLATE.get(historyKey)||[];
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
  const holdKey=canHoldOne?paramKeys[hashCode(`${studentId}${tmpl.id}:${opts.attemptSeed}:hold`)%paramKeys.length]:null;

  let seed=0;
  let rng=seededRandom(0);
  let vals={};
  let signature='';
  for(let reroll=0;reroll<=opts.maxRerolls;reroll++){
    seed=hashCode(`${studentId}${tmpl.id}:${opts.attemptSeed}:${reroll}`);
    rng=seededRandom(seed);
    const candidateVals={};
    for(const[k,p]of Object.entries(tmpl.params)){
      const steps=Math.round((p.max-p.min)/p.step);
      const idx=Math.floor(rng()*(steps+1));
      candidateVals[k]=Math.round((p.min+idx*p.step)*1000)/1000;
    }
    if(holdKey&&previousVals[holdKey]!=null) candidateVals[holdKey]=previousVals[holdKey];
    const candidateSignature=JSON.stringify(candidateVals);
    vals=candidateVals;
    signature=candidateSignature;
    if(!seenSignatures.has(candidateSignature)) break;
  }
  const updatedHistory=[...inMemoryHistory,signature].slice(-historyLimit);
  PARAM_HISTORY_BY_STUDENT_TEMPLATE.set(historyKey,updatedHistory);
  if(providedHistory instanceof Set) providedHistory.add(signature);
  if(Array.isArray(providedHistory)){
    providedHistory.push(signature);
    if(providedHistory.length>historyLimit) providedHistory.splice(0,providedHistory.length-historyLimit);
  }

  // Evaluate correct answer
  let ans;
  try{
    let e=tmpl.correct_expr;
    for(const[k,v]of Object.entries(vals)) e=e.replace(new RegExp('\\b'+k+'\\b','g'),v);
    ans=Math.round(eval(e)*1000)/1000;
  }catch(e){ans=0;}
  // Build text
  let text=tmpl.template;
  let expl=tmpl.explanation_template;
  for(const[k,v]of Object.entries(vals)){
    text=text.replace(new RegExp('{'+k+'}','g'),v);
    expl=expl.replace(new RegExp('{'+k+'}','g'),v);
  }
  expl=expl.replace('{answer}',ans);
  // Build options
  let distractors=tmpl.distractor_exprs.map(e=>{
    let ev=e;
    for(const[k,v]of Object.entries(vals)) ev=ev.replace(new RegExp('\\b'+k+'\\b','g'),v);
    try{return Math.round(eval(ev)*1000)/1000;}catch(e){return ans*2;}
  }).filter(d=>d!==ans&&!isNaN(d));
  while(distractors.length<3) distractors.push(Math.round((ans*(1.5+distractors.length*0.3))*100)/100);
  distractors=distractors.slice(0,3);
  const allOpts=shuffleSeeded([ans+' '+tmpl.correct_unit,...distractors.map(d=>d+' '+tmpl.correct_unit)],seed+99);
  const correctIdx=allOpts.indexOf(ans+' '+tmpl.correct_unit);
  return{id:tmpl.id+'_'+studentId,sub:tmpl.sub,ch:tmpl.ch,tid:tmpl.tid,text,opts:allOpts,correct:correctIdx,explanation:expl,ncertCl:tmpl.ncertCl,ncertCh:tmpl.ncertCh,ncertPg:tmpl.ncertPg,unit:tmpl.unit,diff:tmpl.diff,pyq:false,trick:tmpl.trick,isParameterized:true,paramValues:vals};
}

function getPersonalizedQuestions(studentId, count=10, optionsOrAttemptSeed){
  const opts=normalizeGenerationOptions(optionsOrAttemptSeed);
  return PARAM_QUESTIONS.slice(0,count).map((t,idx)=>generateQuestion(t,studentId,{...opts,attemptSeed:`${opts.attemptSeed}:${idx}`}));
}
function getParamBySubject(studentId, subject, count=5, optionsOrAttemptSeed){
  const opts=normalizeGenerationOptions(optionsOrAttemptSeed);
  return PARAM_QUESTIONS.filter(q=>q.sub===subject).slice(0,count).map((t,idx)=>generateQuestion(t,studentId,{...opts,attemptSeed:`${opts.attemptSeed}:${idx}`}));
}

if(typeof module!=='undefined') module.exports={PARAM_QUESTIONS,generateQuestion,getPersonalizedQuestions,getParamBySubject,PARAM_HISTORY_BY_STUDENT_TEMPLATE};
