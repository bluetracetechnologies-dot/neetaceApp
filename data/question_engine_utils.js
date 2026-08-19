(function(root,factory){
  const utilsExports=factory();
  const isNodeModule=typeof module!=='undefined'&&typeof module.exports!=='undefined';
  if(isNodeModule){
    module.exports=utilsExports;
  }else if(root){
    root.QuestionEngineUtils=Object.assign({},root.QuestionEngineUtils,utilsExports);
  }
})(typeof globalThis!=='undefined'?globalThis:(typeof window!=='undefined'?window:undefined),function(){
  const DAY_MS=24*60*60*1000;
  const DEFAULT_MAX_REROLLS=10;
  function hashCode(str){let h=0;for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}return Math.abs(h);}
  function seededRandom(seed){let s=seed;return function(){s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  function shuffleSeeded(arr,seed){const rng=seededRandom(seed);const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function getAttemptBucket(ts=Date.now()){return Math.floor(Number(ts)/DAY_MS);}
  function normalizeGenerationOptions(optionsOrAttemptSeed){
    const opts=(optionsOrAttemptSeed&&typeof optionsOrAttemptSeed==='object'&&!Array.isArray(optionsOrAttemptSeed))
      ?{...optionsOrAttemptSeed}
      :{attemptSeed:optionsOrAttemptSeed};
    if(opts.attemptSeed==null){
      opts.attemptSeed=opts.sessionId??opts.attemptId??opts.nonce??getAttemptBucket();
    }
    if(opts.varyStrategy!=='holdOneConstant') opts.varyStrategy='all';
    const maxRerolls=Number(opts.maxRerolls);
    opts.maxRerolls=Number.isFinite(maxRerolls)&&maxRerolls>=0?Math.floor(maxRerolls):DEFAULT_MAX_REROLLS;
    return opts;
  }
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
  return {hashCode,seededRandom,shuffleSeeded,getAttemptBucket,normalizeGenerationOptions,toSignature,extractLastHistoryValue,DEFAULT_MAX_REROLLS};
});
