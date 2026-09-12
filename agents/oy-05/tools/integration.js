/* oy-05 against the REAL geolive.js, with the REAL snapshot player shape,
   where the row id and the account id are deliberately different strings. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const {El}=require(path.join(__dirname,'dom.js'));
const MINE=fs.readFileSync(process.argv[2],'utf8');
const RULES=fs.readFileSync(process.argv[3],'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
let pass=0,fail=0;
const ok=(n,c,x)=>{ c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+(x?'\n        '+x:''))); };

const QS=[{prompt:'Capital of Peru?',answer:'Lima',options:['Sucre','Lima','Buenos Aires','Caracas']},
          {prompt:'Capital of Kenya?',answer:'Nairobi',options:['Nairobi','Kampala','Dodoma','Lusaka']}];

/* the shape oy-03's snapshot really returns: id is the live_players row,
   student_id is the account. Different strings on purpose. */
const PLAYERS=[
  {id:'row-owen', student_id:'acct-owen', name:'Owen', score:600, streak:1, joined_at:'2026-09-12T00:00:00Z'},
  {id:'row-ada',  student_id:'acct-ada',  name:'Ada',  score:900, streak:2, joined_at:'2026-09-12T00:00:01Z'}
];
const snap=extra=>Object.assign({
  status:'asking', index:0, questions:QS, timeLimitMs:20000,
  players:JSON.parse(JSON.stringify(PLAYERS)), answers:[], at:Date.now(), msLeft:15000
}, extra||{});

function env(joinReturns){
  const host=new El('div'); const docL={}; let onChange=null; const calls={answer:[]};
  const document={hidden:false,addEventListener(t,f){(docL[t]=docL[t]||[]).push(f)},removeEventListener(){},
    createElement:t=>new El(t),fire(t,x){(docL[t]||[]).forEach(f=>f(Object.assign({type:t,preventDefault(){}},x||{})))}};
  const win={}; Object.assign(win,{window:win,document,console,setInterval,clearInterval,setTimeout,clearTimeout,
    Promise,Date,Math,JSON,addEventListener(){},removeEventListener(){},
    Cloud:{signedIn:true,user:{id:'acct-owen'}},
    WW:{escapeHtml:s=>String(s==null?'':s),state:{profile:{displayName:'Owen'}},accountId:()=>'acct-owen'},
    GeoLiveCloud:{
      join:()=>Promise.resolve(joinReturns),
      watch:(id,fn)=>{onChange=fn;return Promise.resolve(()=>{})},
      answer:(...a)=>{calls.answer.push(a);return Promise.resolve({accepted:true,first:true,row:null})},
      serverNow:()=>Date.now(), get clockSource(){return 'server';}
    }});
  vm.runInNewContext(RULES,win);              /* the real GeoLive */
  vm.runInNewContext(MINE,win);               /* my screen on top of it */
  const api=win.GeoLiveStudent.mount(host,{});
  return {host,win,calls,api,push:s=>onChange&&onChange(s),
          html:()=>host.children.map(function r(n){return (n.text||'')+n.children.map(r).join('')}).join(' ')};
}
async function joinGame(e){ const f=e.host.querySelectorAll('.gl-join__field');
  f[0].value='ABCD'; f[1].value='Owen';
  e.host.fire('click',e.host.querySelector('[data-gl-go]')); await tick(); await tick(); }

(async()=>{
  console.log('\n--- the real GeoLive, real player shape ---');
  console.log('  GeoLive loaded:', typeof (env({sessionId:'S',playerId:'row-owen'}).win.GeoLive));

  {
    /* join() hands back the live_players ROW id, which is what it really does */
    const e=env({sessionId:'S1',playerId:'row-owen'});
    await joinGame(e);
    e.push(snap({status:'reveal'}));
    /* assert on the element, not on flattened text: the mixed content in
       .gl-place does not survive this parser in document order */
    const place=e.host.querySelector('.gl-place');
    const ns=e.host.querySelectorAll('.gl-place__n').map(n=>n.text);
    ok('keyed on the row id, the student is found in the standings', !!place && ns[0]==='2nd',
       'place n values: '+JSON.stringify(ns));
    ok('and shows their real score', ns[1]==='600', JSON.stringify(ns));
    ok('place carries a rank class', place.classList.contains("is-second"),
       place && place.attrs.style);
  }
  {
    /* the failure mode Master describes: keyed on the account id instead */
    const e=env({sessionId:'S1',playerId:'acct-owen'});
    await joinGame(e);
    e.push(snap({status:'reveal'}));
    ok('an account id finds nobody, which is the silent break',
       e.host.querySelectorAll('.gl-place__n').length===0,
       'it matched anyway, so the two ids are interchangeable here');
  }
  {
    /* end of game: podium must mark the right row as theirs */
    const e=env({sessionId:'S1',playerId:'row-owen'});
    await joinGame(e);
    e.push(snap({status:'ended', msLeft:null}));
    const me=e.host.querySelectorAll('.gl-podium__place').filter(n=>n.classList.contains('is-me'));
    ok('podium marks exactly one row as theirs', me.length===1, 'marked '+me.length);
    ok('and it is Owen, not Ada', me.length===1 && /Owen/.test(me[0].children.map(c=>c.text).join('')));
  }
  {
    /* the standings delta, end to end, on real ids */
    const e=env({sessionId:'S1',playerId:'row-owen'});
    await joinGame(e);
    e.push(snap({index:1, msLeft:20000}));
    e.host.fire('click', e.host.querySelector('.gl-target--a'));   /* Nairobi, right */
    await tick();
    const after=snap({status:'reveal', index:1, msLeft:null});
    after.players[0].score=1487;
    e.push(after);
    ok('points come through as the real delta on real ids', /\+887/.test(e.html()), e.html().slice(0,200));
  }
  {
    /* GeoLive.answered against the real module and a real answers array */
    const e=env({sessionId:'S1',playerId:'row-owen'});
    await joinGame(e);
    const s=snap({});
    s.answers=[{player_id:'row-ada',question_index:0,choice:'Lima',correct:null,points:null,ms:900}];
    e.push(s);
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick();
    ok('the locked line survives the real module', /Locked in|did not count/.test(e.html()), e.html().slice(0,160));
  }


  {
    /* a late joiner whose row is not in players yet: until oy-02's
       addPlayer lands, GeoLive has never heard of them */
    const e=env({sessionId:'S1',playerId:'row-newcomer'});
    await joinGame(e);
    let threw=null;
    try {
      e.push(snap({status:'reveal'}));
      e.push(snap({status:'ended', msLeft:null}));
    } catch(err){ threw=err; }
    ok('a player GeoLive has never heard of does not throw', !threw, threw && threw.message);
    ok('and no place is claimed for them', e.host.querySelectorAll('.gl-place__n').length===0);
    ok('the end screen still renders', /That is the game/.test(e.html()));
    ok('nobody else is marked as them',
       e.host.querySelectorAll('.gl-podium__place').filter(n=>n.classList.contains('is-me')).length===0);
  }
  {
    const e=env({sessionId:'S1',playerId:'row-owen'});
    await joinGame(e);
    e.push(snap({status:'lobby', msLeft:null}));
    /* joined_at is set on both fixtures, so presence is now a real thing
       to say and the old seated wording would be underselling it */
    ok('the lobby reports who has actually turned up', /2 people here/.test(e.html()), e.html().slice(0,160));
    ok('and does not fall back to the seated wording', !/Set up for/.test(e.html()));
  }

  console.log('\n'+(fail===0?'ALL PASS':fail+' FAILED')+'  ('+pass+' passed)');
  process.exit(fail?1:0);
})();
