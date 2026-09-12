const fs=require('fs'),vm=require('vm'),path=require('path');
const {El}=require(path.join(__dirname,'dom.js'));
const SRC=fs.readFileSync(process.argv[2],'utf8');
const cssFiles=process.argv.slice(3);
const defined=new Set();
for(const f of cssFiles){
  /* strip comments first: prose that mentions a class name is not a rule */
  const css=fs.readFileSync(f,'utf8').replace(/\/\*[\s\S]*?\*\//g,' ');
  for(const m of css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) defined.add(m[1]);
}

const QS=[{prompt:'What is the capital of Peru?',answer:'Lima',options:['Sucre','Lima','Buenos Aires','Caracas']},
          {prompt:'What is the capital of Kenya?',answer:'Nairobi',options:['Nairobi','Kampala','Dodoma','Lusaka']}];
const emitted=new Map();
function collect(host,phase){host.children.forEach(function walk(n){
  n.classes.forEach(c=>{ if(!emitted.has(c)) emitted.set(c,phase); });
  n.children.forEach(walk);
});}

function build(signedOut){
  const host=new El('div'); const docL={};
  const document={hidden:false,addEventListener(t,f){(docL[t]=docL[t]||[]).push(f)},removeEventListener(){},createElement:t=>new El(t),
    fire(t,x){(docL[t]||[]).forEach(f=>f(Object.assign({type:t,preventDefault(){}},x||{})))}};
  let onChange=null;
  const win={};Object.assign(win,{window:win,document,console,setInterval,clearInterval,setTimeout,clearTimeout,Promise,Date,Math,
    addEventListener(){},removeEventListener(){},
    Cloud:{signedIn:!signedOut,user:signedOut?null:{id:'u1'}},
    WW:{escapeHtml:s=>String(s==null?'':s),state:{profile:{displayName:'Owen'}},accountId:()=>'l1'},
    GeoLive:{current:s=>(s.questions||[])[s.index]||null,standings:s=>s.standings||[],answered:()=>3},
    GeoLiveCloud:{join:()=>Promise.resolve({sessionId:'S1',playerId:'P1'}),
      watch:(id,fn)=>{onChange=fn;return Promise.resolve(()=>{})},
      answer:()=>Promise.resolve({correct:true,points:812})}});
  vm.runInNewContext(SRC,win);
  win.GeoLiveStudent.mount(host,{});
  return {host,push:s=>onChange&&onChange(s),classesOf:()=>host.classes};
}

(async()=>{
  const tick=()=>new Promise(r=>setImmediate(r));
  const so=build(true); collect(so.host,'signin');

  const e=build(false); collect(e.host,'join');
  e.host.classes.forEach(c=>{ if(!emitted.has(c)) emitted.set(c,'container'); });
  /* error states count: a phase only reachable by getting something wrong
     is still a phase, and its classes still have to be styled */
  const bad=e.host.querySelectorAll('.gl-join__field'); bad[0].value='AB'; bad[1].value='';
  e.host.fire('click',e.host.querySelector('[data-gl-go]')); await tick();
  collect(e.host,'join-error');

  const f=e.host.querySelectorAll('.gl-join__field'); f[0].value='ABCD'; f[1].value='Owen';
  e.host.fire('click',e.host.querySelector('[data-gl-go]')); await tick(); await tick();
  collect(e.host,'lobby');
  e.push({status:'lobby',index:0,questions:QS,total:2,players:[{id:'a'},{id:'b'}]}); collect(e.host,'lobby');
  e.push({status:'asking',index:0,questions:QS,total:2,askedAt:Date.now()}); collect(e.host,'asking');
  e.host.fire('click',e.host.querySelector('.gl-target--b')); await tick(); collect(e.host,'locked');
  e.push({status:'reveal',index:0,questions:QS,total:2,standings:[{id:'P1',name:'Owen',score:812}]}); collect(e.host,'reveal');
  e.push({status:'asking',index:1,questions:QS,total:2,askedAt:Date.now()}); collect(e.host,'asking2');
  e.push({status:'reveal',index:1,questions:QS,total:2,standings:[{id:'P1',name:'Owen',score:812}]}); collect(e.host,'reveal2');
  e.push({status:'asking',index:0,questions:QS,total:2,askedAt:Date.now()-99000,timeLimitMs:20000});
  e.host.fire('click',e.host.querySelector('.gl-target--a')); await tick(); collect(e.host,'time-up');

  /* the switched-off phase, which only a null snapshot reaches */
  e.push(null); collect(e.host,'off');
  e.push({status:'asking',index:1,questions:QS,total:2,askedAt:Date.now()});

  e.push({status:'ended',index:1,questions:QS,total:2,
    standings:[{id:'X',name:'Ada',score:2400},{id:'P1',name:'Owen',score:812},{id:'Y',name:'Sam',score:400}]}); collect(e.host,'ended');

  if(process.env.LIST){ const g={}; [...emitted].forEach(([c,ph])=>{const k=c.startsWith('gl-')?'gl- (oy-06 blocks)':c.startsWith('gl__')?'gl__ (oy-06 shared)':c.startsWith('is-')?'is- (states)':'app.css / other'; (g[k]=g[k]||[]).push(c);});
    Object.keys(g).sort().forEach(k=>console.log('\n'+k+':\n  '+g[k].sort().join(' ')));console.log(''); }
  const miss=[...emitted].filter(([c])=>!defined.has(c));
  console.log('classes emitted: '+emitted.size+'   stylesheets scanned: '+cssFiles.length);
  if(!miss.length) console.log('\nEVERY CLASS I EMIT IS DEFINED IN A STYLESHEET');
  else { console.log('\nNOT DEFINED ANYWHERE:'); miss.forEach(([c,p])=>console.log('  .'+c+'   (first seen in '+p+')')); }
  process.exit(miss.length?1:0);
})();
