/* oy-05: class tags. Dropping is tested before adopting on purpose:
   the order that already works is not the one that breaks. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const SRC=fs.readFileSync(process.argv[2],'utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+(x?'\n        '+x:''))); };
const tick=()=>new Promise(r=>setImmediate(r));

function env(opts={}){
  const saves=[], emits=[], pushed=[], sharedCalls=[];
  const state={
    profile:{ displayName:'Owen', verified:false },
    enrolled: opts.enrolled===undefined
      ? { classId:'c1', className:'9B Geography', code:'ZQ4T', tag: opts.tag===undefined?'GEOG':opts.tag, tagGlyph: opts.glyphName || null }
      : opts.enrolled
  };
  if (opts.worn !== undefined) state.profile.tagClassId = opts.worn;
  const win={};
  Object.assign(win,{window:win,console,Promise,Math,JSON,
    WW:{ escapeHtml:s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
         state, save(){saves.push(1);}, emit(k,v){emits.push([k,v]);} }});
  if (opts.cloud) win.Cloud={
    wearTag(v){ pushed.push(v); return opts.cloudFails?Promise.reject(new Error('not online')):Promise.resolve(v); },
    myTag(){ return Promise.resolve(opts.myTag || {known:false, why:'absent'}); },
    myClasses: opts.myClasses ? (()=>opts.myClasses) : undefined
  };
  /* the live class-tag.js, as it really behaves: it owns the markup,
     the four letter rule and the glyph set */
  if (!opts.noShared) win.ClassTag={
    clean(raw){ var t=String(raw==null?'':raw).trim().toUpperCase(); return /^[A-Z]{4}$/.test(t)?t:''; },
    length:4,
    html(text, mark){ sharedCalls.push([text, mark]);
      return '<span class="ct-tag">'+(mark?'<span class="ct-tag__mark">M</span>':'')+
             '<span class="ct-tag__txt">'+text+'</span></span>'; }
  };
  vm.runInNewContext(SRC,win);
  return {T:win.WornTag, state, saves, emits, pushed, sharedCalls, win};
}

(async()=>{
  console.log('\n--- 1. dropping, tested first ---');
  {
    const e=env({worn:'c1'});
    ok('starts out worn', e.T.wearing() !== null);
    await e.T.drop();
    ok('drop clears it', e.T.worn()===null, 'worn: '+e.T.worn());
    ok('and wearing() agrees', e.T.wearing()===null);
    ok('and it renders nothing', e.T.mark(e.state.profile)==='');
    ok('the choice was saved', e.saves.length===1);
  }
  {
    const e=env({worn:'c1'});
    await e.T.drop(); await e.T.drop();
    ok('dropping twice is not an error and does not double save', e.saves.length===1, 'saves '+e.saves.length);
  }
  {
    const e=env({worn:null});
    await e.T.drop();
    ok('dropping when already bare changes nothing', e.T.worn()===null && e.saves.length===0);
  }
  {
    const e=env({worn:'c1',cloud:true});
    await e.T.drop();
    ok('a drop reaches the network as null, not as a missing call',
       e.pushed.length===1 && e.pushed[0]===null, JSON.stringify(e.pushed));
  }
  {
    const e=env({worn:'c1',cloud:true,cloudFails:true});
    await e.T.drop();
    ok('a drop that cannot reach the network still drops locally', e.T.worn()===null);
  }

  console.log('\n--- 2. adopting ---');
  {
    const e=env({worn:null});
    ok('nobody is opted in by joining a class', e.T.worn()===null && e.T.wearing()===null);
    ok('but a tag is available to wear', e.T.available() && e.T.available().tag==='GEOG');
    await e.T.adopt();
    ok('adopt wears it', e.T.worn()==='c1');
    ok('and it renders', /GEOG/.test(e.T.mark(e.state.profile)));
  }
  {
    const e=env({worn:null,cloud:true});
    await e.T.adopt();
    ok('an adopt reaches the network with the class id', e.pushed[0]==='c1', JSON.stringify(e.pushed));
  }
  {
    const e=env({worn:null});
    await e.T.wear('someone-elses-class');
    ok('a class they are not in cannot be worn', e.T.worn()===null, 'worn '+e.T.worn());
  }
  {
    const e=env({worn:null,tag:null});
    await e.T.adopt();
    ok('a class with no tag cannot be worn', e.T.worn()===null);
    ok('and offers nothing to wear', e.T.available()===null);
  }
  {
    const e=env({enrolled:null});
    await e.T.adopt();
    ok('a student in no class cannot wear anything', e.T.worn()===null);
    ok('and nothing renders', e.T.mark(e.state.profile)==='');
  }

  console.log('\n--- 3. it never guesses ---');
  {
    const e=env();
    ['GEO','GEOGRAPHY','GE0G','ge og','12AB','',null,undefined,'  ','GÉOG'].forEach(bad=>{
      if (e.T.clean(bad) !== '') fail++, console.log('  FAIL  refused a bad tag: '+JSON.stringify(bad));
    });
    ok('only four A to Z letters are a tag', e.T.clean('GEOG')==='GEOG');
    ok('lower case from a teacher is tidied, not refused', e.T.clean('geog')==='GEOG');
    ok('an unknown tag renders as nothing at all', e.T.mark({tag:'GEOGRAPHY'})==='' && e.T.mark({})==='');
    ok('no placeholder, no box, no spinner', e.T.mark(null)==='' && e.T.mark(undefined)==='');
  }
  {
    const e=env({worn:'c1'});
    ok('another person with no tag of their own renders nothing',
       e.T.mark({displayName:'Ada'})==='', e.T.mark({displayName:'Ada'}));
    ok('and it never borrows the viewer’s tag for them',
       !/GEOG/.test(e.T.mark({displayName:'Ada'})));
  }

  console.log('\n--- 4. rendering goes through the live shared markup ---');
  {
    const e=env({worn:'c1'});
    const html=e.T.mark(e.state.profile);
    ok('it asks the live renderer rather than writing its own markup',
       e.sharedCalls.length===1 && e.sharedCalls[0][0]==='GEOG', JSON.stringify(e.sharedCalls));
    ok('and returns what that renderer produced', /ct-tag__txt">GEOG</.test(html), html);
    ok('the name is nowhere inside it', !/Owen/.test(html));
  }
  {
    const e=env({worn:'c1',glyphName:'globe'});
    e.T.mark(e.state.profile);
    ok('the glyph name is passed straight through', e.sharedCalls[0][1]==='globe',
       JSON.stringify(e.sharedCalls));
  }
  {
    const e=env({worn:'c1'});
    e.T.mark(e.state.profile);
    ok('no glyph name means an empty mark, not an invented one', e.sharedCalls[0][1]==='');
  }
  {
    /* class-tag.js not loaded: render nothing rather than unstyled markup
       beside a child's name */
    const e=env({worn:'c1',noShared:true});
    ok('no shared renderer means no tag at all', e.T.mark(e.state.profile)==='');
  }
  {
    const e=env({worn:'c1'});
    ok('a person with no tag never reaches the renderer',
       e.T.mark({displayName:'Ada'})==='' && e.sharedCalls.length===0);
  }

  console.log('\n--- 5. it costs nothing when off ---');
  {
    const e=env({worn:null,cloud:true});
    e.T.mark(e.state.profile); e.T.mark({displayName:'Ada'}); e.T.wearing(); e.T.available();
    ok('rendering and reading never touch the network', e.pushed.length===0);
    ok('and never write the save', e.saves.length===0);
  }
  {
    /* the shipping case: 0005 not applied, so no class carries a tag */
    const e=env({tag:null,worn:null,cloud:true});
    ok('no tag column means no tags, quietly', e.T.available()===null && e.T.mark(e.state.profile)==='');
    ok('with no request made', e.pushed.length===0);
  }
  {
    const e=env({enrolled:null,cloud:true});
    ok('a student in no class costs nothing either', e.T.mark(e.state.profile)==='' && e.pushed.length===0);
  }

  console.log('\n--- 6. round trip ---');
  {
    const e=env({worn:null,cloud:true});
    await e.T.adopt();  ok('worn after adopt', e.T.worn()==='c1');
    await e.T.drop();   ok('bare after drop', e.T.worn()===null);
    await e.T.adopt();  ok('worn again', e.T.worn()==='c1');
    await e.T.drop();   ok('and bare again', e.T.worn()===null);
    ok('every change reached the network in order',
       JSON.stringify(e.pushed)===JSON.stringify(['c1',null,'c1',null]), JSON.stringify(e.pushed));
    ok('and each one was saved', e.saves.length===4, 'saves '+e.saves.length);
  }


  console.log('\n--- 7. it is a toggle, and drop is half of it ---');
  {
    const e=env({worn:'c1',cloud:true});
    ok('starts worn', e.T.wearing()!==null);
    await e.T.toggle();
    ok('toggle takes it off', e.T.worn()===null && e.pushed[0]===null, JSON.stringify(e.pushed));
    await e.T.toggle();
    ok('toggle puts it back', e.T.worn()==='c1' && e.pushed[1]==='c1', JSON.stringify(e.pushed));
  }
  {
    const e=env({enrolled:null});
    await e.T.toggle();
    ok('toggling with no class does nothing and does not throw', e.T.worn()===null);
  }
  {
    const e=env({tag:null,worn:null});
    await e.T.toggle();
    ok('toggling when the class has no tag does nothing', e.T.worn()===null);
  }

  console.log('\n--- 8. oy-03 seam names, exactly as built ---');
  {
    const e=env({worn:null,cloud:true});
    await e.T.adopt();
    ok('adopt calls Cloud.wearTag with the class id', e.pushed[0]==='c1', JSON.stringify(e.pushed));
    await e.T.drop();
    ok('drop calls Cloud.wearTag with null', e.pushed[1]===null, JSON.stringify(e.pushed));
  }
  {
    /* wearTag rejects rather than resolving when offline: both handled */
    const e=env({worn:'c1',cloud:true,cloudFails:true});
    await e.T.drop();
    ok('a rejected wearTag still drops locally', e.T.worn()===null);
  }
  {
    const e=env({worn:null,cloud:true,myTag:{known:true,classId:'c1'}});
    await e.T.refresh();
    ok('refresh adopts what the server says is worn', e.T.worn()==='c1');
  }
  {
    const e=env({worn:'c1',cloud:true,myTag:{known:false,why:'absent'}});
    await e.T.refresh();
    ok('known:false absent, which is 0005 unapplied, changes nothing', e.T.worn()==='c1');
  }
  {
    const e=env({worn:'c1',cloud:true,myTag:{known:false,why:'offline'}});
    await e.T.refresh();
    ok('a moment offline does not blank a worn tag', e.T.worn()==='c1');
  }
  {
    const e=env({worn:'c1',cloud:true,myTag:{known:true,classId:null}});
    await e.T.refresh();
    ok('known:true with no class means they chose none', e.T.worn()===null);
  }
  {
    const e=env({worn:null,cloud:true});
    e.T.mark(e.state.profile); e.T.wearing(); e.T.available();
    ok('refresh is the only thing that costs a request, and rendering never calls it',
       e.pushed.length===0);
  }

  console.log('\n--- 9. it does not collide with the live file ---');
  {
    const e=env({worn:'c1'});
    /* the || in an earlier draft of this made the first clause dead, so
       this asserts the one thing that matters: loading this module left
       the live renderer intact */
    ok('loading this module leaves the live renderer intact',
       typeof e.win.ClassTag.html==='function' && typeof e.win.ClassTag.clean==='function');
    ok('this module exports its own name', typeof e.win.WornTag==='object');
    ok('and never defines ClassTag', e.win.ClassTag.adopt===undefined && e.win.ClassTag.drop===undefined);
  }
  {
    const e=env({worn:'c1'});
    ok('the four letter rule comes from the live file, not a second copy',
       e.T.clean('geog')==='GEOG' && e.T.clean('GEO')==='');
  }


  console.log('\n--- 10. Cloud.myClasses, the commissioned list ---');
  {
    const e=env({worn:null,cloud:true,myClasses:[
      {classId:'c1',name:'9B Geography',tag:'GEOG'},
      {classId:'c2',name:'Year 10 Humanities',tag:'HUMS'}
    ]});
    ok('both memberships are seen', e.T.memberships().length===2, JSON.stringify(e.T.memberships()));
    await e.T.wear('c2');
    ok('a second class can be worn once the list is real', e.T.worn()==='c2');
    await e.T.drop();
    ok('and dropped', e.T.worn()===null);
  }
  {
    /* 'nope' was the first draft here and it passes cleanly as NOPE, which
       is four letters. These do not. */
    const e=env({worn:null,cloud:true,myClasses:[
      {classId:'c1',name:'A',tag:'GEOGRAPHY'},
      {classId:'c2',name:'B',tag:'GE0G'},
      {classId:'c3',name:'C',tag:'AB'},
      {classId:'c4',name:'D',tag:null}
    ]});
    ok('memberships with unusable tags are all left out', e.T.memberships().length===0,
       JSON.stringify(e.T.memberships()));
    ok('and a valid one alongside them still comes through',
       env({worn:null,cloud:true,myClasses:[
         {classId:'c1',name:'A',tag:'GEOGRAPHY'},{classId:'c2',name:'B',tag:'HUMS'}
       ]}).T.memberships().length===1);
  }
  {
    const e=env({worn:null,cloud:true});
    ok('no myClasses yet falls back to enrolled, one class',
       e.T.memberships().length===1 && e.T.memberships()[0].classId==='c1');
  }
  {
    const e=env({worn:null,cloud:true,myClasses:[]});
    ok('an empty list is a real answer, not a reason to fall back',
       e.T.memberships().length===0);
  }
  {
    const e=env({worn:null,cloud:true,myClasses:[{classId:'c1',name:'A',tag:'GEOG'}]});
    e.T.memberships(); e.T.mark(e.state.profile); e.T.wearing();
    ok('reading the list never touches the network', e.pushed.length===0);
  }

  console.log('\n'+(fail===0?'ALL PASS':fail+' FAILED')+'  ('+pass+' passed)');
  process.exit(fail?1:0);
})();
