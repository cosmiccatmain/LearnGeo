/* Class audit for oy-04's teacher screen.
   Adapted from oy-05/tools/classcheck.js, keeping BOTH of its fixes:
     1. CSS comments stripped before matching, so a class merely discussed
        in prose does not count as styled.
     2. Error and empty states driven, not just the happy path, because a
        class that only appears when something goes wrong is still a class
        that has to be styled. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const {El}=require(path.join(__dirname,'dom.js'));
const SRC=fs.readFileSync(process.argv[2],'utf8');
const cssFiles=process.argv.slice(3);
const defined=new Set();
for(const f of cssFiles){
  const css=fs.readFileSync(f,'utf8').replace(/\/\*[\s\S]*?\*\//g,' ');
  for(const m of css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) defined.add(m[1]);
}

const emitted=new Map();
function collect(host,phase){
  host.walk(n=>{ (n.classes||[]).forEach(c=>{ if(!emitted.has(c)) emitted.set(c,phase); }); });
}

const ROSTER=[
  {id:'p1',key:'p1',name:'Amara Okafor',playerId:'p1'},
  {id:'p2',key:'p2',name:'Dev Patel',playerId:'p2'},
  {id:'p3',key:'p3',name:'Chloe Barnes',playerId:'p3'},
  {id:'p4',key:'p4',name:'Ben Adeyemi'}          /* no playerId -> is-out */
];
const STAND=[{id:'p1',name:'Amara Okafor',score:2840,streak:3},
             {id:'p2',name:'Dev Patel',score:2610,streak:0},
             {id:'p3',name:'Chloe Barnes',score:1980,streak:0}];
const Q={kind:'country-capital',prompt:'What is the capital of Peru?',answer:'Lima',
         options:['Sucre','Lima','Buenos Aires','Caracas'],code:'PER'};

function build(opts){
  opts=opts||{};
  const host=new El('div'); const docL={};
  const document={hidden:false,addEventListener(t,f){(docL[t]=docL[t]||[]).push(f)},
    removeEventListener(){},createElement:t=>new El(t),
    fire(t,x){(docL[t]||[]).forEach(f=>f(Object.assign({type:t,preventDefault(){}},x||{})))}};
  const W={
    $:(s,r)=>(r||host).querySelector(s),
    $$:(s,r)=>(r||host).querySelectorAll(s),
    escapeHtml:s=>String(s==null?'':s),
    toast(){},confetti(){},
    state:{profile:{displayName:'Owen'}}
  };
  let onChange=null;
  const win={};Object.assign(win,{window:win,document,console,
    setInterval:()=>0,clearInterval(){},setTimeout:(f)=>{return 0},clearTimeout(){},
    Promise,Date,Math,JSON,Number,String,Object,Array,
    addEventListener(){},removeEventListener(){},
    W:W, WW:Object.assign({Icons:{}},W),
    GeoLive:{standings:()=>STAND,current:s=>Q,create:()=>({}),start:s=>s,
             answer:()=>({correct:true,points:812}),reveal:()=>({answer:'Lima',counts:{Lima:14}}),
             next:s=>s},
    GeoLiveQuestions:{premade:()=>[
        {id:'caps',label:'Capitals',note:'Name the capital of a country',build:n=>[Q,Q]},
        {id:'rev',label:'Countries from capitals',note:'The other way round',build:n=>[Q,Q]}],
      fromCodes:()=>[Q,Q]},
    GeoLiveCloud:{
      available:()=>!opts.offline,
      open:()=>opts.offline?Promise.resolve(null):Promise.resolve({sessionId:'S1',code:'7KQP'}),
      join:()=>Promise.resolve({sessionId:'S1',playerId:'P1'}),
      watch:(id,fn)=>{onChange=fn;return Promise.resolve(()=>{})},
      answer:()=>Promise.resolve({}),setStatus:()=>Promise.resolve(),close:()=>Promise.resolve()}
  });
  vm.runInNewContext(SRC,win);
  win.GeoLiveTeacher.mount(host,{classId:'c1',roster:opts.roster===undefined?ROSTER:opts.roster});
  return {host,api:win.GeoLiveTeacher,push:s=>onChange&&onChange(s)};
}

const click=(host,sel)=>{const el=host.querySelector(sel); if(el) host.fire('click',el); return !!el;};
const tick=()=>new Promise(r=>setImmediate(r));

(async()=>{
  /* happy path */
  const t=build({});
  collect(t.host,'players');
  click(t.host,'#gl-all'); collect(t.host,'players-all');
  click(t.host,'#gl-none'); collect(t.host,'players-none');
  click(t.host,'.gl-pick'); collect(t.host,'players-pick');
  click(t.host,'#gl-all');
  click(t.host,'#gl-to-questions'); await tick(); collect(t.host,'questions');
  click(t.host,'[data-set="custom"]'); await tick(); collect(t.host,'questions-custom');
  click(t.host,'.gl-country'); collect(t.host,'questions-country');
  /* a search that matches nothing -> gl__none */
  const s=t.host.querySelector('#gl-search');
  if(s){ s.value='zzzzzz'; t.host.fire('input',s); await tick(); collect(t.host,'questions-nomatch'); }
  click(t.host,'[data-set="caps"]'); await tick();
  click(t.host,'#gl-open'); await tick(); await tick(); collect(t.host,'lobby');
  t.push({status:'lobby',code:'7KQP',players:[{playerId:'p1',name:'Amara'}]}); collect(t.host,'lobby-joined');
  click(t.host,'#gl-start'); await tick(); await tick(); collect(t.host,'asking');
  click(t.host,'#gl-reveal'); await tick(); await tick(); collect(t.host,'reveal');
  click(t.host,'#gl-next'); await tick(); await tick(); collect(t.host,'next');
  for(let i=0;i<4;i++){ click(t.host,'#gl-reveal'); await tick(); click(t.host,'#gl-next'); await tick(); }
  collect(t.host,'ended');

  /* edge states */
  const empty=build({roster:[]}); collect(empty.host,'empty-roster');
  const off=build({offline:true}); collect(off.host,'offline');
  click(off.host,'#gl-to-questions'); await tick();
  click(off.host,'#gl-open'); await tick(); await tick(); collect(off.host,'offline-open');

  if(process.env.LIST){
    const g={};[...emitted].forEach(([c,ph])=>{const k=c.startsWith('gl-')?'gl- blocks':c.startsWith('gl__')?'gl__ shared':c.startsWith('is-')?'is- states':'app.css / other';(g[k]=g[k]||[]).push(c+' ['+ph+']');});
    Object.keys(g).sort().forEach(k=>console.log('\n'+k+':\n  '+g[k].sort().join('\n  ')));console.log('');
  }
  const miss=[...emitted].filter(([c])=>!defined.has(c));
  console.log('classes emitted: '+emitted.size+'   stylesheets scanned: '+cssFiles.length);
  if(!miss.length) console.log('\nEVERY CLASS THE TEACHER SCREEN EMITS IS DEFINED IN A STYLESHEET');
  else { console.log('\nNOT DEFINED ANYWHERE:'); miss.forEach(([c,p])=>console.log('  .'+c+'   (first seen in '+p+')')); }
  process.exit(miss.length?1:0);
})();
