/* oy-05 testing round 3: the student experience of oy-04's and oy-01's
   changes, driven down the failure paths rather than the demo. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const {El}=require(path.join(__dirname,'dom.js'));
const MINE=fs.readFileSync(process.argv[2],'utf8');
const RULES=fs.readFileSync(process.argv[3],'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
let pass=0,fail=0;
const ok=(n,c,x)=>{ c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+(x?'\n        '+x:''))); };

const QS=[{prompt:'Capital of Peru?',answer:'Lima',options:['Sucre','Lima','Buenos Aires','Caracas']},
          {prompt:'Capital of Kenya?',answer:'Nairobi',options:['Nairobi','Kampala','Dodoma','Lusaka']}];

/* a bare context just for the rules module */
function rules(){ const w={}; Object.assign(w,{window:w,console,Date,Math,JSON,Promise}); vm.runInNewContext(RULES,w); return w.GeoLive; }

function env(opts={}){
  const host=new El('div');
  let liveFlag=false; const liveCalls=[]; const docL={}; let onChange=null; const calls={answer:[],join:[],watch:[]};
  let enabled = opts.enabled !== false;
  const document={hidden:false,addEventListener(t,f){(docL[t]=docL[t]||[]).push(f)},removeEventListener(t,f){docL[t]=(docL[t]||[]).filter(x=>x!==f)},
    createElement:t=>new El(t),fire(t,x){(docL[t]||[]).forEach(f=>f(Object.assign({type:t,preventDefault(){}},x||{})))},
    get listenerCount(){ return (docL.keydown||[]).length; }};
  const win={}; Object.assign(win,{window:win,document,console,setInterval,clearInterval,setTimeout,clearTimeout,
    Promise,Date,Math,JSON,addEventListener(){},removeEventListener(){},
    Cloud:{signedIn:true,user:{id:'acct-owen'}},
    Admin:{unlocked:!!opts.god},
    GodMode:{
      get on(){return !!opts.god;}, available(){return !!opts.god;},
      get live(){return liveFlag;},
      setLive(v){ liveFlag=!!v; liveCalls.push(!!v); return liveFlag; },
      liveReveal(q){ if(!opts.god||!q||q.answer==null) return null; liveFlag=true; liveCalls.push(true); return q.answer; },
      liveChoice(q,picked){ if(!opts.god||!q||q.answer==null) return picked; liveFlag=true; liveCalls.push(true); return q.answer; }
    },
    WW:{escapeHtml:s=>String(s==null?'':s),state:{profile:{displayName:'Owen'}},accountId:()=>'acct-owen'},
    GeoLiveCloud:{
      join:(...a)=>{calls.join.push(a);return Promise.resolve(opts.joinReturns||{sessionId:'S1',playerId:'row-owen'})},
      watch:(id,fn)=>{calls.watch.push(id);onChange=fn; if(!enabled){ fn(null); return Promise.resolve(()=>{}); } return Promise.resolve(()=>{})},
      answer:(...a)=>{calls.answer.push(a);return Promise.resolve({accepted:true,first:true,row:null})},
      serverNow:()=>Date.now(), get clockSource(){return 'server';},
      isEnabled:()=>enabled,
      setEnabled(v){ enabled=!!v; }
    }});
  vm.runInNewContext(RULES,win);
  vm.runInNewContext(MINE,win);
  const api=win.GeoLiveStudent.mount(host,{});
  return {host,win,calls,api,document,
    get liveFlag(){return liveFlag;}, liveCalls,
    setEnabled:v=>{enabled=!!v;},
    push:s=>onChange&&onChange(s),
    stop:()=>onChange&&onChange(null),
    remount:()=>win.GeoLiveStudent.mount(host,{}),
    html:()=>host.children.map(function r(n){return (n.text||'')+' '+n.children.map(r).join('')}).join(' ')};
}
const secsOf=e=>{const b=e.host.querySelector('.gl-timer__bar');const m=b&&/--gl-secs:([\d.]+)s/.exec(b.attrs.style||'');return m?Number(m[1]):null;};
async function joinGame(e){const f=e.host.querySelectorAll('.gl-join__field');f[0].value='ABCD';f[1].value='Owen';
  e.host.fire('click',e.host.querySelector('[data-gl-go]'));await tick();await tick();}
const snap=x=>Object.assign({status:'asking',index:0,questions:QS,timeLimitMs:20000,
  players:[{id:'row-owen',student_id:'acct-owen',name:'Owen',score:0,streak:0,joined_at:'2026-09-12T00:00:00Z'}],
  answers:[],at:Date.now(),msLeft:15000},x||{});

(async()=>{
  console.log('\n--- 1. a question length nobody would pick (37s) ---');
  {
    const G=rules();
    const s=G.create({questions:QS,players:[{id:'p1',name:'Owen'}],limitMs:37000});
    G.start(s);
    const r=G.answer(s,'p1','Lima',18500);          /* exactly half the limit gone */
    ok('the rules scale the bonus against 37s, not 20s', r && r.points===800,
       'points were '+(r&&r.points)+', wanted 800');
    const s2=G.create({questions:QS,players:[{id:'p1',name:'Owen'}],limitMs:37000});
    G.start(s2);
    const late=G.answer(s2,'p1','Lima',36999);
    ok('an answer just inside 37s still counts', late && late.points>=600,
       'points '+(late&&late.points));
    const s3=G.create({questions:QS,players:[{id:'p1',name:'Owen'}],limitMs:37000});
    G.start(s3);
    const past=G.answer(s3,'p1','Lima',37001);
    ok('FINDING: past the limit still scores the full 600, the clock closes nothing',
       past && past.points===600, JSON.stringify(past));
  }
  {
    const e=env(); await joinGame(e);
    e.push(snap({timeLimitMs:37000,msLeft:37000}));
    ok('the student bar runs for 37s, the same number the scoring uses', secsOf(e)===37, 'bar said '+secsOf(e));
    e.push(snap({timeLimitMs:37000,msLeft:0}));
    e.host.fire('click',e.host.querySelector('.gl-target--b'));
    await tick();
    ok('and time-up lands at 37s, not at the 20s default', e.calls.answer.length===0,
       'it sent '+e.calls.answer.length+' answers after the limit');
  }

  console.log('\n--- 2. a teacher turns GeoLive off mid-game ---');
  {
    const e=env(); await joinGame(e);
    e.push(snap({}));
    ok('mid question to start with', /Capital of Peru/.test(e.html()));
    e.setEnabled(false); e.stop();                   /* what setEnabled+watch really do */
    const h=e.html();
    ok('the student is told, not left on a dead question', /stopped/i.test(h), h.slice(0,200));
    ok('and told taps no longer count', /Nothing you tap now will count/.test(h), h.slice(0,200));
    ok('the question is gone from the screen', !/Capital of Peru/.test(h));
    ok('no timer is still running', !/gl-timer/.test(h));
    const before=e.calls.answer.length;
    e.document.fire('keydown',{key:'2'});
    await tick();
    ok('and the keyboard cannot answer into a stopped game', e.calls.answer.length===before);
  }
  {
    const e=env({enabled:false}); await joinGame(e);
    ok('a student opening it while off is told so', /switched off|are off/i.test(e.html()), e.html().slice(0,160));
    ok('and not left on a spinner', !/Hold on/.test(e.html()));
  }

  console.log('\n--- 3. late joiners, now that addPlayer landed ---');
  {
    const G=rules();
    const s=G.create({questions:QS,players:[{id:'p1',name:'Ada'}],limitMs:20000});
    G.start(s);
    const added=G.addPlayer(s,{id:'p2',name:'Owen'});
    ok('a mid-game joiner is seated', added && added.added===true, JSON.stringify(added));
    ok('and starts at 0 rather than inheriting anything', added && added.score===0);
    const r=G.answer(s,'p2','Lima',1000);
    ok('and their answer actually counts now', r && r.points>0, JSON.stringify(r));
    const st=G.standings(s);
    ok('and they appear in the standings', st.some(p=>p.id==='p2'));
  }
  {
    const G=rules();
    const s=G.create({questions:QS,players:[{id:'p1',name:'Owen'}],limitMs:20000});
    G.start(s);
    G.answer(s,'p1','Lima',1000);
    const scoreBefore=G.standings(s).find(p=>p.id==='p1').score;
    const seatBefore=s.players.find(p=>p.id==='p1').seat;
    const again=G.addPlayer(s,{id:'p1',name:'Owen'});
    ok('a rejoin is not a new player', again && again.added===false, JSON.stringify(again));
    ok('their score survives the rejoin', again.score===scoreBefore,
       'was '+scoreBefore+', came back '+again.score);
    ok('and so does their seat', again.seat===seatBefore);
    ok('nobody is duplicated on the board', G.standings(s).filter(p=>p.id==='p1').length===1);
  }

  console.log('\n--- 4. the lobby says who is actually here ---');
  {
    const e=env(); await joinGame(e);
    e.push(snap({status:'lobby',msLeft:null,players:[
      {id:'row-owen',student_id:'acct-owen',name:'Owen',score:0,joined_at:'2026-09-12T00:00:00Z'},
      {id:'row-ada', student_id:'acct-ada', name:'Ada', score:0,joined_at:null},
      {id:'row-sam', student_id:'acct-sam', name:'Sam', score:0,joined_at:null}
    ]}));
    const h=e.html();
    ok('one of three has turned up, and it says one', /1 person here/.test(h), h.slice(0,200));
    ok('it does not report the three who were only invited', !/3 /.test(h));
  }
  {
    const e=env(); await joinGame(e);
    e.push(snap({status:'lobby',msLeft:null,players:[
      {id:'a',name:'A',score:0,joined_at:'2026-09-12T00:00:00Z'},
      {id:'b',name:'B',score:0,joined_at:'2026-09-12T00:00:01Z'}
    ]}));
    ok('two here reads as two people', /2 people here/.test(e.html()), e.html().slice(0,160));
  }
  {
    /* the trap: oy-02's joinedAt is a question index where 0 means
       "here from the start", the opposite of a null joined_at */
    const e=env(); await joinGame(e);
    e.push(snap({status:'lobby',msLeft:null,players:[
      {id:'a',name:'A',score:0,joined_at:'2026-09-12T00:00:00Z',joinedAt:0},
      {id:'b',name:'B',score:0,joined_at:'2026-09-12T00:00:01Z',joinedAt:0}
    ]}));
    ok('joinedAt of 0 is not mistaken for absent', /2 people here/.test(e.html()), e.html().slice(0,160));
  }

  console.log('\n--- 5. a caller that mounts twice ---');
  {
    const e=env(); await joinGame(e);
    e.push(snap({}));
    const keysBefore=e.document.listenerCount;
    e.remount();                                   /* oy-09 re-renders its view */
    ok('a second mount does not stack keyboard listeners',
       e.document.listenerCount===keysBefore, 'listeners went '+keysBefore+' -> '+e.document.listenerCount);
    const f=e.host.querySelectorAll('.gl-join__field');
    f[0].value='ABCD'; f[1].value='Owen';
    e.host.fire('click',e.host.querySelector('[data-gl-go]')); await tick(); await tick();
    e.push(snap({}));
    const before=e.calls.answer.length;
    e.document.fire('keydown',{key:'2'});
    await tick();
    ok('one keypress sends exactly one answer', e.calls.answer.length===before+1,
       'it sent '+(e.calls.answer.length-before));
  }


  console.log('\n--- 6. the real snapshot shape, not the one the rules module expects ---');
  {
    const G=rules();
    /* exactly what oy-03's snapshot() returns mid-game */
    const real={status:'reveal',index:0,questions:QS,timeLimitMs:20000,
      players:[{id:'row-owen',student_id:'acct-owen',name:'Owen',score:0,streak:0,joined_at:'2026-09-12T00:00:00Z'},
               {id:'row-ada', student_id:'acct-ada', name:'Ada', score:0,streak:0,joined_at:'2026-09-12T00:00:01Z'}],
      answers:[{player_id:'row-owen',question_index:0,choice:'Lima',correct:true,points:940,ms:1200},
               {player_id:'row-ada', question_index:0,choice:'Sucre',correct:false,points:0,ms:3400}],
      at:Date.now(),msLeft:null};
    const st=G.standings(real);
    ok('FINDING: standings on a real snapshot scores everyone 0',
       st.every(p=>p.score===0), JSON.stringify(st));
    ok('FINDING: answered on a real snapshot returns a column count, not a count',
       G.answered(real)===6, 'it returned '+G.answered(real));
  }
  {
    const e=env(); await joinGame(e);
    e.push(Object.assign(snap({status:'reveal',msLeft:null}),{
      players:[{id:'row-owen',student_id:'acct-owen',name:'Owen',score:0,streak:0,joined_at:'2026-09-12T00:00:00Z'},
               {id:'row-ada', student_id:'acct-ada', name:'Ada', score:0,streak:0,joined_at:'2026-09-12T00:00:01Z'}],
      answers:[{player_id:'row-owen',question_index:0,choice:'Lima',correct:true,points:940,ms:1200}]
    }));
    ok('the screen claims no place it cannot support',
       e.host.querySelectorAll('.gl-place__n').length===0, e.html().slice(0,200));
    ok('and does not tell everyone they are first', !/1st/.test(e.html()));
  }
  {
    const e=env(); await joinGame(e);
    e.push(Object.assign(snap({}),{
      players:[{id:'row-owen',name:'Owen',score:0,joined_at:'2026-09-12T00:00:00Z'},
               {id:'row-ada', name:'Ada', score:0,joined_at:'2026-09-12T00:00:01Z'}],
      answers:[{player_id:'row-owen',question_index:0,choice:'Lima',correct:true,points:940,ms:1200}]
    }));
    e.host.fire('click',e.host.querySelector('.gl-target--b'));
    await tick();
    const h=e.html();
    ok('an impossible answered count is not shown', !/ of 2 have answered/.test(h), h.slice(0,200));
    ok('it falls back to plain waiting instead', /Waiting for the rest/.test(h), h.slice(0,200));
  }
  {
    /* and a genuine early zero is still a real place, not suppressed */
    const e=env(); await joinGame(e);
    e.push(Object.assign(snap({status:'reveal',msLeft:null}),{
      players:[{id:'row-owen',name:'Owen',score:0,joined_at:'2026-09-12T00:00:00Z'}],
      answers:[]
    }));
    ok('nobody having scored yet still shows a real place',
       e.host.querySelectorAll('.gl-place__n').length>0, e.html().slice(0,200));
  }


  console.log('\n--- 7. ties, and the number the projector shows ---');
  {
    const e=env(); await joinGame(e);
    /* Owen and Sam dead level on points; the engine's order is total, so
       the teacher's board numbers them 2 and 3, not 2 and 2 */
    e.push(Object.assign(snap({status:'ended',msLeft:null}),{
      players:[{id:'row-ada',name:'Ada',score:2400,joined_at:'2026-09-12T00:00:00Z'},
               {id:'row-owen',name:'Owen',score:1900,joined_at:'2026-09-12T00:00:01Z'},
               {id:'row-sam',name:'Sam',score:1900,joined_at:'2026-09-12T00:00:02Z'}]}));
    const h=e.html();
    ok('shows the same number the teacher board shows, 2nd', /2nd/.test(h), h.slice(0,220));
    ok('says who they are level with', /Level with Sam/.test(h), h.slice(0,260));
    ok('and says how a tie is decided', /Ties go on correct answers, then speed, then who joined first/.test(h));
    ok('no em dashes in the copy', !/—/.test(h));
  }
  {
    /* the student below the tie gets 3rd, not a shared 2nd */
    const e=env({joinReturns:{sessionId:'S1',playerId:'row-sam'}}); await joinGame(e);
    e.push(Object.assign(snap({status:'ended',msLeft:null}),{
      players:[{id:'row-ada',name:'Ada',score:2400,joined_at:'2026-09-12T00:00:00Z'},
               {id:'row-owen',name:'Owen',score:1900,joined_at:'2026-09-12T00:00:01Z'},
               {id:'row-sam',name:'Sam',score:1900,joined_at:'2026-09-12T00:00:02Z'}]}));
    const h=e.html();
    ok('the later joiner is shown third, matching the board', /3rd/.test(h), h.slice(0,220));
    ok('and is told who they are level with', /Level with Owen/.test(h));
  }

  console.log('\n--- 8. joining while an answer is already on screen ---');
  {
    const e=env(); await joinGame(e);
    /* first thing this student ever sees is a reveal they were not there for */
    e.push(snap({status:'reveal',index:0,msLeft:null}));
    const h=e.html();
    ok('is not accused of missing a question they were not in the room for',
       !/You missed that one/.test(h), h.slice(0,200));
    ok('reads as you are in', /You are in/.test(h), h.slice(0,200));
    ok('and tells them what happens next', /Next question shortly/.test(h));
    ok('claims no points for it', !/gl-verdict__points/.test(h));
  }
  {
    /* present the whole time and simply did not answer: that IS a miss */
    const e=env(); await joinGame(e);
    e.push(snap({status:'asking',index:0}));
    e.push(snap({status:'reveal',index:0,msLeft:null}));
    const h=e.html();
    ok('a student who was there and stayed silent is still told they missed it',
       /You missed that one/.test(h), h.slice(0,200));
    ok('and told nothing was sent', /Nothing sent in time/.test(h));
  }
  {
    /* and they can play the next question normally */
    const e=env(); await joinGame(e);
    e.push(snap({status:'reveal',index:0,msLeft:null}));
    e.push(snap({status:'asking',index:1,msLeft:20000}));
    e.host.fire('click',e.host.querySelector('.gl-target--a'));
    await tick();
    ok('a late joiner plays the next question normally', e.calls.answer.length===1,
       'sent '+e.calls.answer.length);
  }

  console.log('\n--- 9. an empty room, which is now the first thing anyone sees ---');
  {
    const e=env(); await joinGame(e);
    e.push(snap({status:'lobby',msLeft:null,players:[],answers:[]}));
    const h=e.html();
    ok('zero players does not throw or blank the screen', /You are in/.test(h), h.slice(0,200));
    ok('and claims no attendance count', !/person here|people here/.test(h));
    ok('no place is invented from an empty board',
       e.host.querySelectorAll('.gl-place__n').length===0);
  }


  console.log('\n--- 10. god mode, off ---');
  {
    const e=env(); await joinGame(e);
    e.push(snap({}));
    const h=e.html();
    ok('no marker anywhere', !/answer<\/span>/.test(h) && !/the correct answer/.test(h), h.slice(0,200));
    e.host.fire('click',e.host.querySelector('.gl-target--a'));   /* Sucre, wrong */
    await tick();
    ok('the tap is sent exactly as tapped', e.calls.answer[0][3]==='Sucre', JSON.stringify(e.calls.answer[0]));
  }
  {
    /* GodMode absent entirely, which is a page that never loaded it */
    const e=env(); delete e.win.GodMode;
    await joinGame(e);
    e.push(snap({}));
    e.host.fire('click',e.host.querySelector('.gl-target--a'));
    await tick();
    ok('no GodMode object means off, not a throw', e.calls.answer.length===1 && e.calls.answer[0][3]==='Sucre');
  }

  console.log('\n--- 11. god mode, on ---');
  {
    const e=env({god:true}); await joinGame(e);
    e.push(snap({}));
    /* assert on the DOM: this harness's html() flattens text and drops
       both class names and attributes */
    const marked=[...e.host.querySelectorAll('.gl-target')]
      .filter(t=>t.querySelectorAll('.gl__eyebrow').length>0);
    ok('exactly one target is marked before anything is tapped', marked.length===1,
       'marked '+marked.length);
    ok('the marker is on Lima, the real answer',
       marked.length===1 && /Lima/.test(marked[0].textContent),
       marked.length? marked[0].textContent : 'none');
    ok('and the marker is announced to a screen reader',
       marked.length===1 && /correct answer/.test(marked[0].attrs['aria-label']||''),
       marked.length? String(marked[0].attrs['aria-label']) : 'none');
    ok('and it is NOT the reveal treatment',
       ![...e.host.querySelectorAll('.gl-target')].some(n=>n.classList.contains('is-right')));
  }
  {
    const e=env({god:true}); await joinGame(e);
    e.push(snap({}));
    e.host.fire('click',e.host.querySelector('.gl-target--c'));   /* taps Buenos Aires */
    await tick();
    ok('whatever is tapped is submitted as the real answer',
       e.calls.answer[0][3]==='Lima', JSON.stringify(e.calls.answer[0]));
    ok('the screen shows what was actually sent, not the tap',
       e.host.querySelector('.gl-target--b').classList.contains('is-picked'));
    ok('and never writes correct or points itself',
       e.calls.answer[0].length===5, 'args: '+JSON.stringify(e.calls.answer[0]));
    e.push(snap({status:'reveal',msLeft:null}));
    ok('the reveal reads as right',
       e.host.querySelector('.gl-verdict').classList.contains('gl-verdict--right'),
       e.host.querySelector('.gl-verdict').className);
  }
  {
    /* keyboard goes through the same rewrite */
    const e=env({god:true}); await joinGame(e);
    e.push(snap({}));
    e.document.fire('keydown',{key:'4'});                          /* Caracas */
    await tick();
    ok('the keyboard is rewritten too', e.calls.answer[0][3]==='Lima', JSON.stringify(e.calls.answer[0]));
  }
  {
    /* a second tap is still ignored, god mode or not */
    const e=env({god:true}); await joinGame(e);
    e.push(snap({}));
    e.host.fire('click',e.host.querySelector('.gl-target--a'));
    e.host.fire('click',e.host.querySelector('.gl-target--c'));
    await tick();
    ok('one answer, not two', e.calls.answer.length===1, 'sent '+e.calls.answer.length);
  }
  {
    /* time up still blocks it: god mode is not a way past a closed question */
    const e=env({god:true}); await joinGame(e);
    e.push(snap({askedAt:Date.now()-25000,timeLimitMs:20000,msLeft:0}));
    e.host.fire('click',e.host.querySelector('.gl-target--a'));
    await tick();
    ok('a closed question stays closed', e.calls.answer.length===0, 'sent '+e.calls.answer.length);
  }
  {
    /* a late joiner in god mode: the walk-in state still reads right */
    const e=env({god:true}); await joinGame(e);
    e.push(snap({status:'reveal',index:0,msLeft:null}));
    ok('the walk-in state is unchanged by god mode', /You are in/.test(e.html()), e.html().slice(0,200));
  }
  {
    /* no answer on the question means nothing to mark, and no throw */
    const e=env({god:true}); await joinGame(e);
    const noAnswer=[{prompt:'Capital of Peru?',options:['Sucre','Lima','Buenos Aires','Caracas']}];
    e.push(Object.assign(snap({}),{questions:noAnswer}));
    ok('a question with no answer field marks nothing and does not throw',
       !/the correct answer/.test(e.html()));
    e.host.fire('click',e.host.querySelector('.gl-target--a'));
    await tick();
    ok('and the tap goes through untouched', e.calls.answer[0][3]==='Sucre');
  }


  console.log('\n--- 12. the banner cannot lie in either direction ---');
  {
    /* the natural order: god mode on FIRST, then walk into GeoLive */
    const e=env({god:true});
    ok('mounting says a live game is happening', e.liveFlag===true,
       'setLive calls: '+JSON.stringify(e.liveCalls));
    await joinGame(e);
    e.push(snap({}));
    ok('still live with a question up', e.liveFlag===true);
    e.api.destroy();
    ok('leaving the screen says it is not', e.liveFlag===false,
       'setLive calls: '+JSON.stringify(e.liveCalls));
  }
  {
    /* god mode OFF: the screen must still tell the banner where it is,
       because the operator can switch it on later without remounting */
    const e=env();
    ok('mount reports live even with god mode off', e.liveFlag===true);
    e.api.destroy();
    ok('and clears it on the way out', e.liveFlag===false);
  }
  {
    /* the marking and the rewrite now come from godmode.js, not from here */
    const e=env({god:true}); await joinGame(e);
    e.push(snap({}));
    const marked=[...e.host.querySelectorAll('.gl-target')].filter(t=>t.querySelector('.gl__eyebrow'));
    ok('liveReveal drives the marker', marked.length===1 && /Lima/.test(marked[0].textContent));
    e.host.fire('click',e.host.querySelector('.gl-target--c'));
    await tick();
    ok('liveChoice drives the rewrite', e.calls.answer[0][3]==='Lima', JSON.stringify(e.calls.answer[0]));
  }
  {
    /* an older godmode.js without the surface is off, not a crash */
    const e=env({god:true});
    delete e.win.GodMode.liveReveal; delete e.win.GodMode.liveChoice; delete e.win.GodMode.setLive;
    await joinGame(e);
    e.push(snap({}));
    ok('no surface means no marker',
       [...e.host.querySelectorAll('.gl-target')].every(t=>!t.querySelector('.gl__eyebrow')));
    e.host.fire('click',e.host.querySelector('.gl-target--a'));
    await tick();
    ok('and the tap goes through untouched', e.calls.answer[0][3]==='Sucre');
  }
  {
    /* a second mount replaces the first and the banner survives it */
    const e=env({god:true}); await joinGame(e);
    e.push(snap({}));
    e.remount();
    ok('a remount leaves the banner saying live, not cleared by the old instance',
       e.liveFlag===true, 'setLive calls: '+JSON.stringify(e.liveCalls));
  }

  console.log('\n'+(fail===0?'ALL PASS':fail+' FAILED')+'  ('+pass+' passed)');
  process.exit(fail?1:0);
})();
