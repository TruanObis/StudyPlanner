const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const APP_FILE = process.env.PLANNER_APP_FILE || 'cpa_app_timetable_monthly.html';
const IS_V2 = APP_FILE === 'cpa_app_timetable_monthly_v2.html';
const STORAGE_KEY = IS_V2 ? 'studyplanner_v2_timeline_data' : 'universal_planner_v28_data';
const PEER_STORAGE_KEY = IS_V2 ? 'universal_planner_v28_data' : 'studyplanner_v2_timeline_data';

// Execute the shipped single-file app. Only browser I/O is replaced; model,
// migration, timer and backup functions are the actual production functions.
function app() {
  const html = fs.readFileSync(path.join(__dirname, '..', APP_FILE), 'utf8');
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n').replace(/\ninit\(\);\s*$/, '');
  const storage = new Map();
  const timeouts = new Map();
  let clock = 0, nextTimer = 1;
  const element = () => ({ style: {}, classList: { contains: () => false, add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, querySelectorAll: () => [] });
  const context = vm.createContext({ console, URL, Blob, Date,
    setTimeout: (fn, ms) => { const id = nextTimer++; timeouts.set(id, {fn, at: clock + ms}); return id; },
    clearTimeout: id => timeouts.delete(id), setInterval: () => 0, clearInterval() {},
    window: { addEventListener() {} }, document: { getElementById: () => element(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, documentElement: element(), body: element() },
    location: { hash: '#/', protocol: 'file:', href: 'file:///planner.html' }, navigator: {},
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    alert() {}, confirm: () => true
  });
  vm.runInContext(script, context);
  const run = code => vm.runInContext(code, context);
  run("DATA = baseData(); VIEW_DATE = '2026-10-17';");
  return { run, storage, json: code => JSON.parse(JSON.stringify(run(code))),
    advance(ms) { clock += ms; for (const [id, timer] of [...timeouts]) if (timer.at <= clock) { timeouts.delete(id); timer.fn(); } }
  };
}

function gestureApp() {
  const a = app();
  a.run(`
    const nodes = new Map();
    function node(id) {
      if (!nodes.has(id)) nodes.set(id, {id, style:{}, innerHTML:'', hidden:true, offsetWidth:180, offsetHeight:220,
        dataset:{date:VIEW_DATE}, classList:{add(){},remove(){},toggle(){}},
        getBoundingClientRect:()=>({left:50,top:100,width:360,height:520,bottom:620}),
        addEventListener(){}, removeEventListener(){}, setAttribute(){}, focus(){document.activeElement=this}, setPointerCapture(){}, hasPointerCapture:()=>true,
        releasePointerCapture(){}, appendChild(child){nodes.set(child.id,child)}, remove(){nodes.delete(this.id)} });
      return nodes.get(id);
    }
    document.getElementById=node;
    document.createElement=()=>({style:{},remove(){nodes.delete(this.id)}});
    window.innerWidth=390; window.innerHeight=844;
    renderDailySidebar=()=>{}; renderWithScrollPreserved=()=>{};
    DATA.home.subjects=[{id:'a',title:'경영학',time:0,isRunning:false}];
    DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',label:'집중 공부',startMinute:300,endMinute:360,
      cardIds:[{type:'subject',id:'a',startMinute:310,endMinute:330}]}],sessions:[]};
    function pointer(x=120,y=210,id=1){return {button:0,pointerId:id,pointerType:'touch',isPrimary:id===1,
      clientX:x,clientY:y,preventDefault(){},stopPropagation(){}}}
  `);
  return a;
}

function polygonContainsPoint(points,x,y) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,yi]=points[i],[xj,yj]=points[j];
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

function startupApp() {
  const a = app();
  a.run(`applyTheme=()=>{}; updateDDayPanel=()=>{}; updateClock=()=>{};
    checkForAppUpdate=async()=>{}; renderRouter=()=>{}; renderDailySidebar=()=>{};
    let startupError=''; showErrorScreen=message=>{startupError=message};
    console={...console,error(){}}; fetch=async()=>({ok:false});`);
  return a;
}

test('startup migrates its own existing planner to the timeline without adopting the peer copy', async () => {
  const a = startupApp();
  const original = a.json(`({...baseData(),schemaVersion:3,
    home:{title:'Working planner',subjects:[{id:'a',name:'경영학',time:123,done:true}],dDays:[]},
    details:{a:{cards:[{id:'topic',title:'메모',userNote:'Keep this note'}]}},
    dailyHistory:{'2026-10-16':{goalStr:'02:00:00',totalSeconds:123,slots:[
      {id:'s',label:'오전 (09-12)',cardIds:[{type:'subject',id:'a',time:123,done:true}]},
      {id:'later',label:'미정',cardIds:[{type:'adhoc',id:'read',title:'읽기',done:true}]}]}}})`);
  const peer = JSON.stringify({...original,home:{...original.home,title:'Separate planner'}});
  a.storage.set(STORAGE_KEY,JSON.stringify(original));
  a.storage.set(PEER_STORAGE_KEY,peer);
  await a.run('init()');
  const saved = JSON.parse(a.storage.get(STORAGE_KEY));
  assert.equal(saved.schemaVersion,a.run('PLANNER_SCHEMA_VERSION'));
  assert.equal(saved.home.title,'Working planner');
  assert.equal(saved.home.subjects[0].time,123);
  assert.equal(saved.details.a.cards[0].userNote,'Keep this note');
  assert.equal(saved.dailyHistory['2026-10-16'].goalStr,'02:00:00');
  assert.equal(saved.dailyHistory['2026-10-16'].totalSeconds,123);
  assert.deepEqual(saved.dailyHistory['2026-10-16'].slots.map(s=>[s.startMinute,s.endMinute]),[[540,720],[null,null]]);
  assert.equal(saved.dailyHistory['2026-10-16'].slots[0].cardIds[0].time,123);
  assert.equal(saved.dailyHistory['2026-10-16'].slots[1].cardIds[0].done,true);
  assert.equal(a.storage.get(PEER_STORAGE_KEY),peer);
  assert.equal(a.run('startupError'),'');
});

test('schema-five upgrade preserves existing plans, subgoals and execution independently of the peer planner', async () => {
  const a = startupApp();
  const original = a.json(`({...baseData(),schemaVersion:5,
    home:{title:'Existing planner',subjects:[{id:'a',name:'경영학',time:123}],dDays:[]},
    details:{a:{id:'a',cards:[{id:'topic',title:'메모',done:true,userNote:'![keep](app://asset/retained-image)'}]}},
    timelineColors:{'subject|a|':265},
    dailyHistory:{'2026-10-16':{goalStr:'02:00:00',totalSeconds:123,
      sessions:[{id:'record',ref:{type:'subject',id:'a'},startMs:1792108800000,endMs:1792108923000}],
      slots:[{id:'s',label:'집중 공부',color:42,startMinute:540,endMinute:660,
        cardIds:[{type:'subject',id:'a',startMinute:550,endMinute:580,time:123,isRunning:false,
          progressTargets:[{type:'detail',id:'topic',pid:'a'}]}]}]}}})`);
  delete original.periodGoals;
  const peer = JSON.stringify({...original,home:{...original.home,title:'Separate peer'}});
  a.storage.set(STORAGE_KEY,JSON.stringify(original));
  a.storage.set(PEER_STORAGE_KEY,peer);
  await a.run('init()');
  const saved = JSON.parse(a.storage.get(STORAGE_KEY));
  assert.equal(saved.schemaVersion,7);
  assert.deepEqual(saved.periodGoals,[]);
  assert.deepEqual(saved.home,original.home);
  assert.deepEqual(saved.details,original.details);
  assert.deepEqual(saved.timelineColors,original.timelineColors);
  const upgradedDay=structuredClone(saved.dailyHistory['2026-10-16']);
  assert.ok(upgradedDay.slots[0].cardIds[0].planId);
  delete upgradedDay.slots[0].cardIds[0].planId;
  assert.deepEqual(upgradedDay,original.dailyHistory['2026-10-16']);
  assert.equal(a.storage.get(PEER_STORAGE_KEY),peer);
  assert.deepEqual(a.json('migratePlannerData(DATA)'),saved);
  assert.equal(a.run('startupError'),'');
});

test('only experimental first use can copy the main planner', async () => {
  const a = startupApp();
  const peer = JSON.stringify(a.json(`({...baseData(),home:{title:'Peer only',subjects:[],dDays:[]}})`));
  a.storage.set(PEER_STORAGE_KEY,peer);
  await a.run('init()');
  const saved = JSON.parse(a.storage.get(STORAGE_KEY));
  assert.equal(saved.home.title === 'Peer only',IS_V2);
  assert.equal(a.storage.get(PEER_STORAGE_KEY),peer);
});

test('startup preserves malformed or future own storage instead of falling back to another planner', async () => {
  for(const raw of ['{broken',JSON.stringify({schemaVersion:99,home:{subjects:[]}})]){
    const a = startupApp();
    a.storage.set(STORAGE_KEY,raw);
    a.storage.set(PEER_STORAGE_KEY,JSON.stringify(a.json('baseData()')));
    await a.run('init()');
    assert.equal(a.storage.get(STORAGE_KEY),raw);
    assert.notEqual(a.run('startupError'),'');
  }
});

test('shared image cleanup preserves images used by either planner', async () => {
  const a = app();
  a.storage.set(PEER_STORAGE_KEY,JSON.stringify({note:'![peer](app://asset/peer-image)'}));
  a.run(`DATA.home.subtitle='![own](app://asset/own-image)';
    let deletedImages=[];
    refreshAssetStorageUsage=async()=>({assetCount:3,assetBytes:30});
    listAssetRecords=async()=>[{id:'own-image',size:10},{id:'peer-image',size:10},{id:'unused',size:10}];
    deleteAssetRecords=async ids=>{deletedImages.push(...ids)};`);
  await a.run('showAssetStorageDetails()');
  assert.deepEqual(a.json('deletedImages'),['unused']);
  a.storage.set(PEER_STORAGE_KEY,'{broken');
  a.run('deletedImages=[]');
  await a.run('showAssetStorageDetails()');
  assert.deepEqual(a.json('deletedImages'),[]);
});

test('release version checks follow the current app channel without reloading a matching build', async () => {
  const a = app();
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'../app_version.json'),'utf8'));
  a.run(`location.protocol='https:'; location.href='https://example.com/${APP_FILE}#/detail/a';
    let replacement=''; location.replace=url=>{replacement=url};
    const sessionValues=new Map(); sessionStorage={getItem:k=>sessionValues.get(k),setItem:(k,v)=>sessionValues.set(k,v),removeItem:k=>sessionValues.delete(k)};
    let versionManifest=${JSON.stringify(manifest)}; fetch=async()=>({ok:true,json:async()=>versionManifest});`);
  await a.run('checkForAppUpdate()');
  a.advance(300);
  assert.equal(a.run('replacement'),'');
  a.run(`versionManifest={buildId:'next-main',v2BuildId:'next-experimental'};`);
  await a.run('checkForAppUpdate()');
  a.advance(300);
  const updated = new URL(a.run('replacement'));
  assert.equal(updated.searchParams.get('appv'),IS_V2 ? 'next-experimental' : 'next-main');
  assert.equal(updated.hash,'#/detail/a');
});

test('copy uses visible region names and current card positions, excluding hidden storage headings', () => {
  const a = app();
  a.run(`DATA.home.subjects=[{id:'a',name:'경영학'},{id:'b',name:'회계학'}];
    DATA.dailyHistory[VIEW_DATE]={totalSeconds:64,goalStr:'01:00:00',slots:[
      {id:'old',label:'시간 블록',startMinute:300,endMinute:360,cardIds:[{type:'subject',id:'a',startMinute:640,endMinute:660,time:64}]},
      {id:'named',label:'오전 집중',startMinute:600,endMinute:660,cardIds:[]},
      {id:'hidden',cardOnly:true,label:'',startMinute:null,endMinute:null,cardIds:[{type:'subject',id:'b',startMinute:10,endMinute:20}]}
    ]};`);
  const txt = a.run('buildDailyPlanText(VIEW_DATE)');
  assert.match(txt, /■ 오전 집중\n  - \[ \] 경영학 \(00:01:04\)/);
  assert.match(txt, /■ 05:00–06:00/);
  assert.match(txt, /■ 영역 밖 계획\n  - \[ \] 회계학/);
  assert.doesNotMatch(txt, /■ 시간 블록|■ \n/);
  assert.equal(txt.match(/경영학/g).length, 1);
  a.run(`let copied; navigator.clipboard={writeText:txt=>{copied=txt;return Promise.resolve()}}; copyDailyPlan();`);
  assert.equal(a.run('copied'), txt);
});

test('touch hold opens card menu without starting recording or moving the card', () => {
  const a = gestureApp();
  a.run("startTimelineGesture(pointer(),'card',0,0)");
  a.advance(550);
  assert.deepEqual(a.json('[timelineMenuState.sIdx,timelineMenuState.cIdx]'), [0,0]);
  assert.equal(a.run('timelineGesture'), null);
  a.run('finishTimelineGesture(pointer())');
  assert.equal(a.run('DATA.home.subjects[0].isRunning'), false);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.startMinute,r.endMinute])'), [[310,330]]);
});

test('a short touch tap toggles recording once and retains the selected card handles', () => {
  const a = gestureApp();
  a.run("startTimelineGesture(pointer(),'card',0,0); finishTimelineGesture(pointer(122,211));");
  a.advance(550);
  assert.equal(a.run('DATA.home.subjects[0].isRunning'), true);
  assert.equal(a.run('timelineMenuState'), null);
  assert.deepEqual(a.json('timelineTouchSelection'), {date:'2026-10-17',slotId:'s',cardIndex:0});
});

test('touch dragging and edge resizing snap to ten minutes without opening menus or recording', () => {
  const a = gestureApp();
  a.run("startTimelineGesture(pointer(),'card',0,0); moveTimelineGesture(pointer(180,210));");
  a.advance(550);
  a.run("finishTimelineGesture(pointer(180,210)); startTimelineGesture(pointer(240,210),'card-end',0,0); moveTimelineGesture(pointer(300,210)); finishTimelineGesture(pointer(300,210));");
  assert.equal(a.run('DATA.home.subjects[0].isRunning'), false);
  assert.equal(a.run('timelineMenuState'), null);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.startMinute,r.endMinute])'), [[320,350]]);
});

test('timetable pointer dragging moves a plan onto either diary calendar without changing its time or records',()=>{
  for(const view of ['week','month']) for(const pointerType of ['mouse','touch']){
    const a=gestureApp();
    a.run(`planningActiveView='${view}'; renderPlanningPage=()=>{}; planningEnsureData(DATA);
      const ref=DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[0],planId=ref.planId;
      ref.time=60; ref.progressTargets=[{type:'detail',id:'topic',pid:'a'}];
      DATA.dailyHistory[VIEW_DATE].totalSeconds=60; DATA.dailyHistory[VIEW_DATE].sessions=[{id:'run',ref:{type:'subject',id:'a'},startMs:1000,endMs:61000}];
      const sessions=clonePlain(DATA.dailyHistory[VIEW_DATE].sessions);
      const target=node('calendar-day'); target.dataset={planDate:'2026-10-18'};
      let highlighted=false; target.classList={add(){highlighted=true},remove(){highlighted=false}};
      document.elementFromPoint=(x,y)=>x>=420?{closest:()=>target}:null;
      const down={...pointer(),pointerType:'${pointerType}'},up={...pointer(500,220),pointerType:'${pointerType}'};
      startTimelineGesture(down,'card',0,0);moveTimelineGesture(up);`);
    assert.equal(a.run('highlighted'),true);
    assert.deepEqual(a.json('[ref.startMinute,ref.endMinute]'),[310,330]);
    a.run('finishTimelineGesture(up)');
    assert.equal(a.run('planningFindPlan(planId).date'),'2026-10-18');
    assert.equal(a.run("planningPlans('2026-10-17').length"),0);
    assert.deepEqual(a.json('[ref.startMinute,ref.endMinute]'),[310,330]);
    assert.deepEqual(a.json('ref.progressTargets'),[{type:'detail',id:'topic',pid:'a'}]);
    assert.deepEqual(a.json("DATA.dailyHistory['2026-10-17'].sessions"),a.json('sessions'));
    assert.equal(a.run("DATA.dailyHistory['2026-10-17'].totalSeconds"),60);
    assert.equal(a.run('getCardInfo(ref).isRunning'),false);
    assert.equal(a.run('planningView()'),view);
    assert.equal(a.run('highlighted'),false);
  }
});

test('dropping a timetable card outside a valid target or cancelling leaves its original time intact',()=>{
  for(const finish of ['finishTimelineGesture(up)','cancelTimelineGesture(up)']){
    const a=gestureApp();
    a.run(`document.elementFromPoint=()=>null; planningEnsureData(DATA); const before=clonePlain(DATA.dailyHistory);
      const up=pointer(600,300);startTimelineGesture(pointer(),'card',0,0);moveTimelineGesture(up);${finish};`);
    assert.deepEqual(a.json('DATA.dailyHistory'),a.json('before'));
    assert.equal(a.run('timelineGesture'),null);
  }
});

test('a timetable pointer drop inserts above an existing calendar plan without changing either time',()=>{
  const a=gestureApp();
  a.run(`renderPlanningPage=()=>{};planningEnsureData(DATA);
    const original=DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[0];
    const other=planningPlaceOnDate('2026-10-18',{source:'main',type:'subject',id:'a'});
    other.startMinute=60;other.endMinute=90;
    const target=node('calendar-day');target.dataset={planDate:'2026-10-18'};
    const card=node('destination-card');card.dataset.planId=other.planId;
    card.getBoundingClientRect=()=>({top:200,bottom:240,height:40});target.querySelectorAll=()=>[card];
    document.elementFromPoint=x=>x>=420?{closest:()=>target}:null;
    startTimelineGesture(pointer(),'card',0,0);finishTimelineGesture(pointer(500,205));`);
  assert.deepEqual(a.json("planningCalendarPlans('2026-10-18').map(p=>p.ref.planId)"),a.json('[original.planId,other.planId]'));
  assert.deepEqual(a.json('[original.startMinute,original.endMinute,other.startMinute,other.endMinute]'),[310,330,60,90]);
});

test('a timetable drag uses stable plan identity when the source list changes before calendar drop',()=>{
  const a=gestureApp();
  a.run(`renderPlanningPage=()=>{};planningEnsureData(DATA);
    const original=DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[0];
    const target=node('calendar-day');target.dataset={planDate:'2026-10-18'};document.elementFromPoint=x=>x>=420?{closest:()=>target}:null;
    startTimelineGesture(pointer(),'card',0,0);
    const other={type:'adhoc',id:'other',title:'다른 계획',planId:'other-plan',startMinute:600,endMinute:630};
    DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.unshift(other);
    finishTimelineGesture(pointer(500,220));`);
  assert.equal(a.run('planningFindPlan(original.planId).date'),'2026-10-18');
  assert.equal(a.run('planningFindPlan(other.planId).date'),'2026-10-17');
  assert.deepEqual(a.json('[other.startMinute,other.endMinute]'),[600,630]);
});

test('dragging a timetable card onto period goals creates a goal without moving the daily plan',()=>{
  const a=gestureApp();
  a.run(`planningActiveView='month';renderPlanningPage=()=>{};planningEnsureData(DATA);
    const before=clonePlain(DATA.dailyHistory),target=node('period-goals');target.dataset={planGoalView:'month'};
    document.elementFromPoint=x=>x>=420?{closest:()=>target}:null;
    startTimelineGesture(pointer(),'card',0,0);finishTimelineGesture(pointer(500,220));`);
  assert.deepEqual(a.json('DATA.dailyHistory'),a.json('before'));
  assert.equal(a.run('DATA.periodGoals[0].kind'),'month');
  assert.equal(a.run('DATA.periodGoals[0].root.id'),'a');
});

test('the timetables exact right grid line remains a valid card move destination',()=>{
  const a=gestureApp();
  a.run(`document.elementFromPoint=()=>null;
    startTimelineGesture(pointer(),'card',0,0);finishTimelineGesture(pointer(410,210));`);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.startMinute,r.endMinute])'),[[360,380]]);
});

test('cancel, multi-touch and a date change cancel pending long presses', () => {
  for (const cancel of ['cancelTimelineGesture()', "startTimelineGesture(pointer(180,210,2),'card',0,0)", "VIEW_DATE='2026-10-18'"]) {
    const a = gestureApp();
    a.run(`startTimelineGesture(pointer(),'card',0,0); ${cancel};`);
    a.advance(550);
    a.run('finishTimelineGesture(pointer())');
    assert.equal(a.run('timelineMenuState'), null);
    assert.equal(a.run('DATA.home.subjects[0].isRunning'), false);
  }
});

test('touch hold exposes the empty-cell picker and block name editor in their respective modes', () => {
  const a = gestureApp();
  a.run("startTimelineGesture(pointer(120,130),'create')");
  a.advance(550);
  assert.match(a.run("node('timelineMenu').innerHTML"), /카드 추가/);
  a.run("closeTimelineMenu(); timelineAdding=true; startTimelineGesture(pointer(),'slot',0)");
  a.advance(550);
  assert.match(a.run("node('timelineMenu').innerHTML"), /이름 변경/);
  a.run("closeTimelineMenu(); startTimelineGesture(pointer(),'card',0,0)");
  a.advance(550);
  assert.equal(a.run('timelineMenuState'), null);
});

test('clicking empty grid space deselects a block without creating one, in either editing mode', () => {
  for (const pointerType of ['mouse','touch']) for (const editing of [false,true]) {
    const a = gestureApp();
    const original = a.json('DATA.dailyHistory[VIEW_DATE]');
    a.run(`selectTimelineSlot(0); timelineAdding=${editing};
      const event={...pointer(120,130),pointerType:'${pointerType}'};
      startTimelineGesture(event,'create'); finishTimelineGesture(event);`);
    a.advance(550);
    assert.equal(a.run('timelineSelection.slotId'), null, `${pointerType}, editing=${editing}`);
    assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE]'), original);
    assert.equal(a.run('timelineGesture'), null);
    assert.equal(a.run('timelineMenuState'), null);
    a.run('renderTimeline(DATA.dailyHistory[VIEW_DATE])');
    assert.doesNotMatch(a.run("node('dailySlots').innerHTML"), /class="tl-slot selected"/);
  }
});

test('dragging empty grid space still creates and selects a ten-minute-snapped block', () => {
  const a = gestureApp();
  a.run(`timelineAdding=true; selectTimelineSlot(0);
    startTimelineGesture(pointer(120,130),'create'); moveTimelineGesture(pointer(240,150)); finishTimelineGesture(pointer(240,150));`);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots.map(s=>[s.startMinute,s.endMinute])'), [[300,360],[70,150]]);
  assert.equal(a.run('timelineSelection.slotId === DATA.dailyHistory[VIEW_DATE].slots[1].id'), true);
});

test('coordinate mapping covers all 26 hours at different fitted canvas heights', () => {
  const a = gestureApp();
  for (const height of [260, 520, 780]) {
    a.run(`node('timelineCanvas').getBoundingClientRect=()=>({left:50,top:100,width:360,height:${height}})`);
    assert.equal(a.run(`timelineMinuteAt(170,100+5.5*${height}/26)`), 320);
    assert.equal(a.run(`timelineMinuteAt(410,100+25.5*${height}/26)`), 1560);
  }
});

test('a multi-hour block renders one outline, one name and exactly two edge handles', () => {
  const a = gestureApp();
  a.run(`const slot=DATA.dailyHistory[VIEW_DATE].slots[0]; slot.startMinute=240; slot.endMinute=480;
    renderTimeline(DATA.dailyHistory[VIEW_DATE]);`);
  const markup = a.run("node('dailySlots').innerHTML");
  assert.equal((markup.match(/class="tl-slot /g) || []).length, 1);
  assert.equal((markup.match(/class="tl-slot-label"/g) || []).length, 1);
  assert.equal((markup.match(/class="tl-slot-edge"/g) || []).length, 2);
  assert.equal((markup.match(/class="tl-slot-shape"/g) || []).length, 1);
  assert.deepEqual(a.json('timelineSlotShape({startMinute:260,endMinute:460})'), {
    firstHour:4,rows:4,start:20/60*100,end:40/60*100,
    points:[[20/60*100,0],[100,0],[100,75],[40/60*100,75],[40/60*100,100],[0,100],[0,25],[20/60*100,25]]
  });
});

test('a multi-hour plan has one continuous surface, one label and two terminal handles', () => {
  for (const [startMinute,endMinute] of [[240,480],[260,460],[590,640],[1440,1560]]) {
    const a = gestureApp();
    a.run(`DATA.home.subjects[0].name='경영학'; const slot=DATA.dailyHistory[VIEW_DATE].slots[0]; slot.cardOnly=true;
      Object.assign(slot.cardIds[0],{startMinute:${startMinute},endMinute:${endMinute}});
      renderTimeline(DATA.dailyHistory[VIEW_DATE]);`);
    const markup = a.run("node('dailySlots').innerHTML");
    assert.equal((markup.match(/class="tl-plan"/g) || []).length,1,`${startMinute}–${endMinute}`);
    assert.equal((markup.match(/<polygon /g) || []).length,1);
    assert.equal((markup.match(/<strong>경영학<\/strong>/g) || []).length,1);
    assert.equal((markup.match(new RegExp(`<small>${endMinute-startMinute}분<\\/small>`,'g')) || []).length,1);
    assert.equal((markup.match(/class="tl-resize start"/g) || []).length,1);
    assert.equal((markup.match(/class="tl-resize end"/g) || []).length,1);
    assert.match(markup,/onpointerdown="startTimelineGesture\(event,'card',0,0\)"/);
    assert.match(markup,/onkeydown="timelineKey\(event,'card',0,0\)"/);
    assert.match(markup,/oncontextmenu="openTimelineMenu\(event,0,0\)"/);
  }
});

test('short wrapped cards have a filled connection between their first and last hourly bands', () => {
  const a=app(), missing=[];
  const cases=[
    {lane:0,lanes:1,inset:0,path:[[90,25],[83.7,25],[83.7,50],[66.2,50],[66.2,75]]},
    {lane:0,lanes:1,inset:7,path:[[90,25],[83.7,25],[83.7,50],[66.2,50],[66.2,75]]},
    {lane:0,lanes:2,inset:0,path:[[90,12.5],[83.7,12.5],[83.7,37.5],[66.2,37.5],[66.2,62.5]]},
    {lane:1,lanes:2,inset:0,path:[[90,37.5],[83.7,37.5],[83.7,62.5],[66.2,62.5],[66.2,87.5]]}
  ];
  for(const {lane,lanes,inset,path} of cases) {
    const points=a.json(`timelinePlanShape({startMinute:590,endMinute:640,lane:${lane},lanes:${lanes}},${inset}).points`);
    // A corridor with positive width must connect the interiors of 09:50–10:00 and 10:00–10:40.
    let failure;
    for(let index=1;index<path.length && !failure;index++) {
      const [x0,y0]=path[index-1],[x1,y1]=path[index];
      const steps=Math.ceil(Math.hypot(x1-x0,y1-y0)/.2);
      for(let step=0;step<=steps && !failure;step++) {
        const x=x0+(x1-x0)*step/steps,y=y0+(y1-y0)*step/steps;
        if([[.1,0],[-.1,0],[0,.1],[0,-.1]].some(([dx,dy])=>!polygonContainsPoint(points,x+dx,y+dy))) failure=[x,y];
      }
    }
    if(failure) missing.push({lane,lanes,inset,point:failure});
  }
  assert.deepEqual(missing,[]);
});

test('overlapping continuous plans keep their hourly lanes and exact terminal positions', () => {
  const a = gestureApp();
  a.run(`const slot=DATA.dailyHistory[VIEW_DATE].slots[0]; slot.cardOnly=true;
    slot.cardIds=[{type:'subject',id:'a',startMinute:260,endMinute:460},
      {type:'adhoc',id:'other',title:'문제 풀이',startMinute:300,endMinute:420}];
    renderTimeline(DATA.dailyHistory[VIEW_DATE]);`);
  const markup = a.run("node('dailySlots').innerHTML");
  assert.equal((markup.match(/class="tl-plan"/g) || []).length,2);
  const polygons = [...markup.matchAll(/<polygon points="([^"]+)"/g)].map(match=>match[1].split(' ').map(pair=>pair.split(',').map(Number)));
  assert.equal(polygons.length,2);
  // First card is lane 0 across 04:20–07:40; second is lane 1 across 05:00–07:00.
  assert.equal(polygonContainsPoint(polygons[0],50,31.25),true);
  assert.equal(polygonContainsPoint(polygons[0],50,43.75),false);
  assert.equal(polygonContainsPoint(polygons[1],50,37.5),true);
  assert.equal(polygonContainsPoint(polygons[1],50,12.5),false);
  const shape=a.json('timelinePlanShape({startMinute:260,endMinute:460,lane:0,lanes:2})');
  assert.equal(shape.firstHour,4);
  assert.equal(shape.rows,4);
  assert.equal(shape.first.left,20/60*100);
  assert.equal(shape.last.right,40/60*100);
  assert.equal(shape.first.top < shape.last.top,true);
  assert.equal(shape.label.width,100);
});

test('copy assigns a crossing card once to its largest overlap and keeps unnamed tasks', () => {
  const a = app();
  a.run(`DATA.dailyHistory[VIEW_DATE]={slots:[
    {id:'a',label:'아침',startMinute:540,endMinute:600,cardIds:[]},
    {id:'b',label:'오전',startMinute:600,endMinute:660,cardIds:[]},
    {id:'h',cardOnly:true,label:'',cardIds:[{type:'adhoc',title:'읽기',startMinute:590,endMinute:630},{type:'adhoc',title:'정리'}]}
  ]};`);
  const txt = a.run('buildDailyPlanText(VIEW_DATE)');
  assert.match(txt, /■ 오전\n  - \[ \] 읽기/);
  assert.match(txt, /■ 시간 미지정\n  - \[ \] 정리/);
  assert.equal(txt.match(/읽기/g).length, 1);
});

test('old plans retain cards and totals; time labels migrate without inventing execution history', () => {
  const a = app();
  const result = a.json(`migratePlannerData({schemaVersion:3,meta:{},home:{subjects:[]},dailyHistory:{'2026-10-17':{totalSeconds:123,slots:[
    {id:'s1',label:'오전 (09-12)',cardIds:[{type:'subject',id:'a',time:123}]},
    {id:'s2',label:'시간 미정',cardIds:[{type:'adhoc',id:'b',title:'읽기'}]}
  ]}}})`);
  assert.equal(result.dailyHistory['2026-10-17'].slots[0].startMinute, 540);
  assert.equal(result.dailyHistory['2026-10-17'].slots[0].cardIds[0].endMinute, 570);
  assert.equal(result.dailyHistory['2026-10-17'].slots[1].startMinute, null);
  assert.equal(result.dailyHistory['2026-10-17'].totalSeconds, 123);
  assert.deepEqual(result.dailyHistory['2026-10-17'].sessions, []);
});

test('each dropped card resizes independently beyond its slot on the ten-minute grid', () => {
  const a = app();
  a.run(`DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',startMinute:540,endMinute:660,cardIds:[
    {id:'a',type:'subject',startMinute:540,endMinute:570}, {id:'b',type:'subject',startMinute:600,endMinute:630}]}],sessions:[]};`);
  assert.equal(a.run('typeof resizePlannedCard'), 'function');
  a.run('resizePlannedCard(VIEW_DATE,0,0,596)');
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.startMinute,r.endMinute])'), [[540,600],[600,630]]);
  a.run('resizePlannedCard(VIEW_DATE,0,0,900)');
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[0].endMinute'),900);
  a.run('resizePlannedCard(VIEW_DATE,0,0,520)');
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[0].endMinute'),550);
});

test('moving and shrinking a slot leave card times unchanged', () => {
  const a = app();
  a.run(`DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',startMinute:540,endMinute:660,cardIds:[{id:'a',startMinute:570,endMinute:600}]}],sessions:[]};`);
  assert.equal(a.run('typeof moveTimelineSlot'), 'function');
  a.run('moveTimelineSlot(VIEW_DATE,0,1520)');
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0]'), {id:'s',startMinute:1440,endMinute:1560,cardIds:[{id:'a',startMinute:570,endMinute:600}]});
  a.run('moveTimelineSlot(VIEW_DATE,0,540); resizeTimelineSlot(VIEW_DATE,0,550);');
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0]'), {id:'s',startMinute:540,endMinute:550,cardIds:[{id:'a',startMinute:570,endMinute:600}]});
});

test('unplanned execution is recorded, continuous ticks merge, and a pause remains a gap', () => {
  const a = app();
  assert.equal(a.run('typeof recordTimelineSession'), 'function');
  a.run(`const r={type:'subject',id:'a',title:'회계'}; const t=Date.parse('2026-10-17T09:00:00+09:00');
    recordTimelineSession(r,t,t+60000); recordTimelineSession(r,t+60000,t+120000); recordTimelineSession(r,t+180000,t+240000);`);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].sessions.length'),2);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots.length'),0);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].sessions[0].endMs - DATA.dailyHistory[VIEW_DATE].sessions[0].startMs'),120000);
});

test('multi-hour execution renders once per session with precise times and a preserved pause', () => {
  const a=gestureApp();
  a.run(`const ref={type:'subject',id:'a',title:'경영학'};
    recordTimelineSession(ref,Date.parse('2026-10-17T04:20:30+09:00'),Date.parse('2026-10-17T07:40:15+09:00'));
    recordTimelineSession(ref,Date.parse('2026-10-17T08:15:20+09:00'),Date.parse('2026-10-17T09:10:40+09:00'));`);
  const recorded=a.json('DATA.dailyHistory[VIEW_DATE].sessions');
  a.run('updateTimelineExecution()');
  const markup=a.run("node('timelineActual').innerHTML");
  assert.equal((markup.match(/class="tl-actual"/g) || []).length,2);
  assert.equal((markup.match(/<span>경영학<\/span>/g) || []).length,2);
  const polygons=[...markup.matchAll(/<polygon points="([^"]+)"/g)].map(match=>match[1].split(' ').map(pair=>pair.split(',').map(Number)));
  assert.equal(polygons.length,2);
  assert.equal(polygons[0][0][0],20.5/60*100);
  assert.equal(polygons[0][3][0],40.25/60*100);
  const positions=[...markup.matchAll(/class="tl-actual"[^>]*style="[^"]*top:([^%;]+)%;height:([^%;]+)%/g)].map(match=>match.slice(1).map(Number));
  assert.deepEqual(positions,[[4*100/26,4*100/26],[8*100/26,2*100/26]]);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].sessions'),recorded);
});

test('overlapping execution near an hour boundary keeps its fractional-minute endpoints', () => {
  const a=gestureApp();
  a.run(`for(const id of ['a','b']) recordTimelineSession({type:'subject',id,title:id},
    Date.parse('2026-10-17T09:59:59.500+09:00'),Date.parse('2026-10-17T10:00:00.500+09:00'));
    updateTimelineExecution();`);
  const markup=a.run("node('timelineActual').innerHTML");
  assert.equal((markup.match(/class="tl-actual"/g) || []).length,2);
  const polygons=[...markup.matchAll(/<polygon points="([^"]+)"/g)].map(match=>match[1].split(' ').map(pair=>pair.split(',').map(Number)));
  assert.equal(polygons.length,2);
  for(const points of polygons) {
    assert.equal(points.every(([x,y])=>x>=0 && x<=100 && y>=0 && y<=100),true);
    assert.ok(Math.abs(points[0][0]-99.98611111111111)<1e-9);
  }
});

test('overnight execution joins only adjacent same-source sessions for display', () => {
  const a=gestureApp();
  a.run(`recordTimelineSession({type:'subject',id:'a',title:'경영학'},
    Date.parse('2026-10-17T23:50:00+09:00'),Date.parse('2026-10-18T00:40:00+09:00'));
    updateTimelineExecution();`);
  const markup=a.run("node('timelineActual').innerHTML");
  assert.equal((markup.match(/class="tl-actual"/g) || []).length,1);
  assert.equal((markup.match(/<span>경영학<\/span>/g) || []).length,1);
  assert.deepEqual(a.json('getTimelineSessions(VIEW_DATE).map(s=>[s.startMinute,s.endMinute])'),[[1430,1440],[1440,1480]]);
});

test('midnight execution appears in both 26-hour views without duplicate stored sessions', () => {
  const a = app();
  assert.equal(a.run('typeof recordTimelineSession'), 'function');
  a.run(`recordTimelineSession({type:'subject',id:'a',title:'회계'},Date.parse('2026-10-17T23:50:00+09:00'),Date.parse('2026-10-18T02:10:00+09:00'))`);
  assert.deepEqual(a.json("getTimelineSessions('2026-10-17').map(s=>[s.startMinute,s.endMinute])"), [[1430,1440],[1440,1560]]);
  assert.deepEqual(a.json("getTimelineSessions('2026-10-18').map(s=>[s.startMinute,s.endMinute])"), [[0,130]]);
  assert.equal(a.run('Object.values(DATA.dailyHistory).reduce((n,d)=>n+d.sessions.length,0)'),2);
});

test('timer ticks create history for an unscheduled source card and count concurrent time once', () => {
  const a = app();
  a.run(`DATA.home.subjects=[{id:'a',title:'A',isRunning:true,time:0},{id:'b',title:'B',isRunning:true,time:0}];
    __lastTimerTickAt=Date.now()-60000; __timerCarryMs=0; tickOneSecond();`);
  assert.equal(a.run('DATA.dailyHistory[getLogicalDate()].sessions?.length'),2);
  assert.equal(a.run('DATA.dailyHistory[getLogicalDate()].totalSeconds'),60);
});

test('daily reset clears only the selected date execution while preserving its complete plan', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{}; VIEW_DATE=addDaysYMD(getLogicalDate(),-1);
    DATA.home.subjects=[{id:'a',name:'경영학',time:3600,done:true}];
    DATA.dailyHistory[VIEW_DATE]={totalSeconds:900,goalStr:'02:00:00',sessions:[{id:'run',ref:{type:'subject',id:'a'},startMs:1,endMs:900001}],slots:[
      {id:'s',label:'집중 공부',colorHue:150,startMinute:300,endMinute:420,cardIds:[
        {type:'subject',id:'a',startMinute:310,endMinute:330,time:900,done:true,progressTargets:[{type:'theory',id:'core',pid:'m'}]}]},
      {id:'outside',cardOnly:true,label:'',startMinute:null,endMinute:null,cardIds:[
        {type:'adhoc',id:'read',title:'읽기',startMinute:600,endMinute:630,time:120,done:true}]}]};
    DATA.dailyHistory[getLogicalDate()]={totalSeconds:60,goalStr:'01:00:00',slots:[],sessions:[{id:'next-day',startMs:900001,endMs:960001}]};`);
  const before = a.json('DATA.dailyHistory[VIEW_DATE]');
  const otherDay = a.json('DATA.dailyHistory[getLogicalDate()]');
  const sources = a.json('DATA.home.subjects');
  a.run('resetDailyToday()');
  before.totalSeconds = 0;
  before.sessions = [];
  before.slots.forEach(slot=>slot.cardIds.forEach(ref=>ref.time=0));
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE]'),before);
  assert.deepEqual(a.json('DATA.dailyHistory[getLogicalDate()]'),otherDay);
  assert.deepEqual(a.json('DATA.home.subjects'),sources);
  assert.deepEqual(JSON.parse(a.storage.get(STORAGE_KEY)).dailyHistory[a.run('VIEW_DATE')],before);
});

test('daily reset restarts the recorded interval at reset time without stopping active timers', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{};
    const RealDate=Date; let now=RealDate.parse('2026-10-17T09:00:00+09:00');
    Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))} static now(){return now}};
    __timerDate=VIEW_DATE; __lastTimerTickAt=now-2250; __timerCarryMs=0;
    DATA.home.subjects=[{id:'a',name:'경영학',time:60,isRunning:true}];
    DATA.dailyHistory[VIEW_DATE]={totalSeconds:60,goalStr:'01:00:00',sessions:[],slots:[{id:'s',label:'공부',startMinute:300,endMinute:600,cardIds:[
      {type:'subject',id:'a',startMinute:310,endMinute:330,time:60,isRunning:true},
      {type:'adhoc',id:'read',title:'읽기',startMinute:340,endMinute:350,time:60,isRunning:true}]}]};
    resetDailyToday();`);
  assert.equal(a.run('DATA.home.subjects[0].time'),62);
  assert.equal(a.run('DATA.home.subjects[0].isRunning'),true);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].totalSeconds'),0);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].sessions'),[]);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.time,r.isRunning])'),[[0,true],[0,true]]);
  a.run('now+=1000; tickOneSecond()');
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].totalSeconds'),1);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>r.time)'),[1,1]);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].sessions.map(s=>[s.startMs,s.endMs])'),[
    [Date.parse('2026-10-17T09:00:00+09:00'),Date.parse('2026-10-17T09:00:01+09:00')],
    [Date.parse('2026-10-17T09:00:00+09:00'),Date.parse('2026-10-17T09:00:01+09:00')]
  ]);
});

test('cancelling daily reset preserves all records', () => {
  const a = gestureApp();
  a.run(`DATA.dailyHistory[VIEW_DATE].totalSeconds=123; confirm=()=>false;`);
  const before = a.json('DATA');
  a.run('resetDailyToday()');
  assert.deepEqual(a.json('DATA'),before);
});

test('future and malformed timeline backups are rejected', () => {
  const a = app();
  assert.throws(()=>a.run('migratePlannerData({...baseData(),schemaVersion:99})'),/최신/);
  assert.throws(()=>a.run(`validateImportedPlannerData({...baseData(),dailyHistory:{'2026-10-17':{slots:[{id:'s',startMinute:900,endMinute:800,cardIds:[]}]}}})`),/시간/);
});

test('saving the current app leaves the other app planner record untouched', () => {
  const a = app();
  a.storage.set(PEER_STORAGE_KEY,'original');
  a.run('saveData()');
  assert.equal(a.storage.get(PEER_STORAGE_KEY),'original');
  assert.ok(a.storage.has(STORAGE_KEY));
});

test('upward drawing ends exactly at its starting grid line', () => {
  const a = app();
  a.run(`timelineMinuteAt=()=>540; timelineGesture={kind:'create',date:VIEW_DATE,sIdx:-1,anchor:600,start:600,end:610,clientY:0}; ensureDailyData(VIEW_DATE); previewTimelineGesture();`);
  assert.deepEqual(a.json('[timelineGesture.nextStart,timelineGesture.nextEnd]'),[540,600]);
});

test('a pending legacy slot from another day never replaces the current day slot', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{}; previewTimelineGesture=()=>{};
    DATA.dailyHistory[VIEW_DATE]={slots:[{id:'existing',label:'기존',startMinute:900,endMinute:960,cardIds:[]}],sessions:[]};
    timelinePendingSlot={date:'2026-10-16',slotId:'existing'};
    timelineGesture={kind:'create',date:VIEW_DATE,sIdx:-1,nextStart:600,nextEnd:660,pointerId:1,moved:true};
    cleanupTimelineGesture=()=>{const g=timelineGesture;timelineGesture=null;return g;};
    finishTimelineGesture({pointerId:1,clientY:0});`);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots.map(s=>[s.startMinute,s.endMinute])'),[[900,960],[600,660]]);
});

test('inspector drop preserves the full card duration even beyond the target slot', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{};
    DATA.dailyHistory[VIEW_DATE]={slots:[{id:'a',startMinute:540,endMinute:600,cardIds:[{type:'subject',id:'x',startMinute:540,endMinute:580}]},
      {id:'b',startMinute:900,endMinute:930,cardIds:[{type:'subject',id:'y',startMinute:900,endMinute:910}]}],sessions:[]};
    dropOnCard({preventDefault(){},stopPropagation(){},currentTarget:{closest:()=>null},dataTransfer:{getData:()=>JSON.stringify({source:'sidebar',date:VIEW_DATE,sIdx:0,cIdx:0})}},VIEW_DATE,1,0);`);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[1].cardIds[0]'),{type:'subject',id:'x',startMinute:910,endMinute:950});
});

test('subject planning and execution use the same color when the selector has a redundant parent id', () => {
  const a = app();
  assert.equal(a.run("timelineColor({type:'subject',id:'subject_management',pid:'subject_management'})"),a.run("timelineColor({type:'subject',id:'subject_management',pid:null})"));
});

test('official backup round trip retains plan durations and execution history', () => {
  const a = app();
  a.run(`DATA.home.subjects=[{id:'a',title:'회계'}]; createTimelineSlot(VIEW_DATE,1380,1560);
    const slot=DATA.dailyHistory[VIEW_DATE].slots[0]; const ref={type:'subject',id:'a'}; placePlannedCard(slot,ref,1440); slot.cardIds.push(ref);
    recordTimelineSession(ref,Date.parse('2026-10-18T00:10:00+09:00'),Date.parse('2026-10-18T00:30:00+09:00'));`);
  const original = a.json('DATA');
  a.run('const restored=unpackPlannerBackup(JSON.parse(JSON.stringify(buildPlannerBackupEnvelope(DATA,[]))));');
  assert.deepEqual(a.json('restored.data'),original);
});

test('left card edge changes the start in ten-minute steps without moving its end or other cards', () => {
  const a = app();
  a.run(`DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',startMinute:540,endMinute:660,cardIds:[
    {id:'a',type:'subject',startMinute:570,endMinute:630},{id:'b',type:'subject',startMinute:600,endMinute:650}]}],sessions:[]};
    resizePlannedCard(VIEW_DATE,0,0,554,'start');`);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.startMinute,r.endMinute])'),[[550,630],[600,650]]);
  a.run("resizePlannedCard(VIEW_DATE,0,0,650,'start')");
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.startMinute,r.endMinute])'),[[620,630],[600,650]]);
});

test('a card crossing an hour wraps into horizontal ten-minute cells with exact first and last edges', () => {
  const a = app();
  assert.equal(a.run('typeof timelineSegments'),'function');
  assert.deepEqual(a.json('timelineSegments({startMinute:590,endMinute:640})'),[
    {hour:9,startMinute:590,endMinute:600,left:50/60*100,width:10/60*100},
    {hour:10,startMinute:600,endMinute:640,left:0,width:40/60*100}
  ]);
});

test('slot edit mode and card edit mode are mutually exclusive for pointer, keyboard and card drops', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{}; DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',startMinute:540,endMinute:660,cardIds:[{type:'subject',id:'a',startMinute:570,endMinute:600}]}],sessions:[]};
    const key={key:'ArrowRight',preventDefault(){},stopPropagation(){}};
    timelineKey(key,'slot-end',0);`);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].endMinute'),660);
  a.run(`timelineAdding=true; timelineKey(key,'card-end',0,0);
    startTimelineGesture({button:0,preventDefault(){},stopPropagation(){}},'card-end',0,0);
    dropOnCard({preventDefault(){},stopPropagation(){}},VIEW_DATE,0,0);`);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[0].endMinute'),600);
  assert.equal(a.run('timelineGesture'),null);
  a.run("timelineKey(key,'slot-end',0)");
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].endMinute'),670);
  a.run("timelineAdding=false; timelineKey(key,'card-end',0,0)");
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[0].endMinute'),610);
});

test('dragging and keyboard movement can take a card completely outside its slot', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{}; DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',startMinute:300,endMinute:360,cardIds:[{type:'subject',id:'a',startMinute:320,endMinute:360}]}],sessions:[]};
    timelineMinuteAt=()=>430; timelineGesture={kind:'card',date:VIEW_DATE,sIdx:0,cIdx:0,anchor:330,start:320,end:360,pointerId:1};
    previewTimelineGesture();`);
  assert.deepEqual(a.json('[timelineGesture.nextStart,timelineGesture.nextEnd]'),[420,460]);
  a.run(`cleanupTimelineGesture=()=>{const g=timelineGesture;timelineGesture=null;return g;}; finishTimelineGesture({pointerId:1});
    timelineKey({key:'ArrowRight',preventDefault(){},stopPropagation(){}},'card',0,0);`);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.startMinute,r.endMinute])'),[[430,470]]);
  assert.deepEqual(a.json('[DATA.dailyHistory[VIEW_DATE].slots[0].startMinute,DATA.dailyHistory[VIEW_DATE].slots[0].endMinute]'),[300,360]);
});

test('cards dropped onto empty timetable space survive backup and time-block deletion', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{}; DATA.home.subjects=[{id:'a',title:'경영학'}]; timelineMinuteAt=()=>410;
    dropOnTimeline({preventDefault(){},stopPropagation(){},target:{closest:()=>null},dataTransfer:{getData:()=>JSON.stringify({source:'main',type:'subject',id:'a'})}});`);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots.flatMap(s=>s.cardIds.map(r=>[r.startMinute,r.endMinute]))'),[[410,440]]);
  a.run(`createTimelineSlot(VIEW_DATE,540,600).cardIds.push({type:'subject',id:'b',startMinute:590,endMinute:650}); removeSlot(VIEW_DATE,1);`);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots.flatMap(s=>s.cardIds.map(r=>[r.startMinute,r.endMinute]))'),[[410,440],[590,650]]);
  a.run('validateImportedPlannerData(DATA);');
  const original = a.json('DATA');
  a.run('const restored=unpackPlannerBackup(JSON.parse(JSON.stringify(buildPlannerBackupEnvelope(DATA,[]))));');
  assert.deepEqual(a.json('restored.data'),original);
});

test('cards outside their source block remain valid and render on the timetable', () => {
  const a = app();
  a.run(`DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',startMinute:300,endMinute:360,cardIds:[{type:'subject',id:'a',startMinute:420,endMinute:470}]}],sessions:[]};
    validateImportedPlannerData(DATA); const container={}; const getElement=document.getElementById;
    document.getElementById=id=>id==='dailySlots'?container:id==='timelineScroll'?null:getElement(id);`);
  // Render the persisted reference even though its time no longer overlaps the block.
  a.run(`const scroll={dataset:{date:VIEW_DATE},scrollTop:0}; document.getElementById=id=>id==='dailySlots'?container:id==='timelineScroll'?scroll:getElement(id); renderTimeline(DATA.dailyHistory[VIEW_DATE]);`);
  assert.match(a.run('container.innerHTML'),/계획 .*07:00–07:50/);
  assert.doesNotMatch(a.run('container.innerHTML'),/tl-inspector|sb-card|\+ 카드 추가/);
});

test('clicking a plan toggles its source timer while dragging and resizing do not', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{}; renderWithScrollPreserved=()=>{}; VIEW_DATE=getLogicalDate();
    DATA.home.subjects=[{id:'a',title:'경영학',time:0,isRunning:false}];
    DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',startMinute:300,endMinute:360,cardIds:[{type:'subject',id:'a',startMinute:320,endMinute:350}]}],sessions:[]};
    previewTimelineGesture=()=>{}; cleanupTimelineGesture=()=>{const g=timelineGesture;timelineGesture=null;return g;};
    const gesture={kind:'card',date:VIEW_DATE,sIdx:0,cIdx:0,nextStart:320,nextEnd:350,pointerId:1,moved:false};
    timelineGesture={...gesture}; finishTimelineGesture({pointerId:1});`);
  assert.equal(a.run('DATA.home.subjects[0].isRunning'),true);
  assert.equal(a.run('location.hash'),'#/detail/a');
  a.run(`location.hash='#/detail/other'; __lastTimerTickAt=Date.now()-1200; timelineGesture={...gesture}; finishTimelineGesture({pointerId:1});`);
  assert.equal(a.run('DATA.home.subjects[0].isRunning'),false);
  assert.equal(a.run('location.hash'),'#/detail/other');
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].sessions.length'),1);
  a.run(`timelineGesture={...gesture,moved:true,nextStart:400,nextEnd:430}; finishTimelineGesture({pointerId:1});
    timelineGesture={...gesture,kind:'card-end',nextStart:400,nextEnd:440}; finishTimelineGesture({pointerId:1});`);
  assert.equal(a.run('DATA.home.subjects[0].isRunning'),false);
  assert.equal(a.run('location.hash'),'#/detail/other');
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.startMinute,r.endMinute])'),[[400,440]]);
});

test('keyboard activation opens the subject page while preserving the open timetable', () => {
  const a = gestureApp();
  a.run(`const openClasses=new Set(['open']), bodyClasses=new Set(['sidebar-active']);
    node('daily-sidebar').classList={contains:k=>openClasses.has(k),add:k=>openClasses.add(k),remove:k=>openClasses.delete(k)};
    document.body.classList={contains:k=>bodyClasses.has(k),add:k=>bodyClasses.add(k),remove:k=>bodyClasses.delete(k)};
    timelineKey({key:'Enter',preventDefault(){},stopPropagation(){}},'card',0,0);`);
  assert.equal(a.run('location.hash'),'#/detail/a');
  assert.equal(a.run('DATA.home.subjects[0].isRunning'),true);
  assert.equal(a.run("node('daily-sidebar').classList.contains('open') && document.body.classList.contains('sidebar-active')"),true);
});

test('starting a detail plan opens its own module instead of its parent detail page', () => {
  const a = gestureApp();
  a.run(`DATA.details.a={title:'경영학',cards:[{id:'motivation',title:'동기부여 이론',module:'motivation-module',time:0,isRunning:false}]};
    DATA.modules['motivation-module']={id:'motivation-module',title:'동기부여 이론',tabs:[]};
    DATA.dailyHistory[VIEW_DATE].slots[0].cardIds=[{type:'detail',id:'motivation',pid:'a',startMinute:310,endMinute:330}];
    startTimelineGesture(pointer(),'card',0,0); finishTimelineGesture(pointer());`);
  assert.equal(a.run('location.hash'),'#/module/motivation-module');
  assert.equal(a.run('DATA.details.a.cards[0].isRunning'),true);
  a.run(`toggleTimelineCardTimer(0,0)`);
  assert.equal(a.run('DATA.details.a.cards[0].isRunning'),false);
  assert.equal(a.run('location.hash'),'#/module/motivation-module');
});

test('detail navigation uses the same module creation and legacy links as opening the source card', () => {
  const a = gestureApp();
  a.run(`DATA.details.a={title:'경영학',cards:[{id:'new-topic',title:'새 주제'},{id:'legacy-topic',title:'기존 주제',moduleId:'legacy-module'}]};
    navigateToCard('detail','new-topic',null);`);
  const mid = a.run('DATA.details.a.cards[0].module');
  assert.ok(mid);
  assert.equal(a.run('location.hash'),`#/module/${mid}`);
  assert.equal(a.run(`DATA.modules[DATA.details.a.cards[0].module].title`),'새 주제');
  a.run(`navigateToCard('detail','legacy-topic','a')`);
  assert.equal(a.run('location.hash'),'#/module/legacy-module');
  assert.equal(a.run('DATA.modules["legacy-module"].backTo'),'#/detail/a');
});

function subgoalApp() {
  const a = gestureApp();
  a.run(`DATA.home.subjects=[{id:'a',name:'경영학',time:0}];
    DATA.details.a={title:'경영학',cards:[{id:'topic',title:'동기부여 이론',module:'m'},{id:'other-topic',title:'리더십 이론',done:true}]};
    DATA.modules.m={id:'m',title:'동기부여 이론',activeTab:'core',tabs:[
      {id:'core',label:'핵심이론',done:false,questions:[{id:'core-q',src:'핵심 기출',done:false}]},
      {id:'other',label:'기타이론',done:true,questions:[{id:'other-q',src:'기타 기출',done:false}]}
    ]};
    const parentPlan=DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[0];`);
  return a;
}

test('daily progress replaces a parent with its selected subgoals only on that day', () => {
  const a = subgoalApp();
  const parentProgress={total:5,done:2,pct:40};
  assert.deepEqual(a.json('dailyPlanProgress(DATA.dailyHistory[VIEW_DATE])'),parentProgress);
  a.run(`DATA.dailyHistory['2026-10-18']=JSON.parse(JSON.stringify(DATA.dailyHistory[VIEW_DATE]));
    setTimelineSubgoals(parentPlan,[{type:'theory',id:'other',pid:'m'},{type:'question',id:'core-q',pid:'m'}]);`);
  assert.deepEqual(a.json('dailyPlanProgress(DATA.dailyHistory[VIEW_DATE])'),{total:2,done:1,pct:50});
  assert.deepEqual(a.json("dailyPlanProgress(DATA.dailyHistory['2026-10-18'])"),parentProgress);
  a.run('setTimelineSubgoals(parentPlan,[])');
  assert.deepEqual(a.json('dailyPlanProgress(DATA.dailyHistory[VIEW_DATE])'),parentProgress);
  assert.equal(a.run('parentPlan.progressTargets'),undefined);
});

test('subject and topic plans can choose nested theory and question cards without changing completion', () => {
  const a = subgoalApp();
  assert.deepEqual(a.json('timelineSubgoalOptions(parentPlan).map(r=>[r.type,r.id,r.depth])'),[
    ['detail','topic',0],['theory','core',1],['question','core-q',2],
    ['theory','other',1],['question','other-q',2],['detail','other-topic',0]
  ]);
  a.run(`parentPlan.type='detail'; parentPlan.id='topic'; parentPlan.pid='a';
    setTimelineSubgoals(parentPlan,[{type:'theory',id:'other',pid:'m'},{type:'question',id:'other-q',pid:'m'}]);`);
  assert.deepEqual(a.json('dailyPlanProgress(DATA.dailyHistory[VIEW_DATE])'),{total:2,done:1,pct:50});
  assert.equal(a.run('getCardInfo(parentPlan).done'),false);
  a.run("DATA.modules.m.tabs[1].questions[0].done=true");
  assert.deepEqual(a.json('dailyPlanProgress(DATA.dailyHistory[VIEW_DATE])'),{total:2,done:2,pct:100});
  assert.equal(a.run('getCardInfo(parentPlan).done'),false);
  assert.match(a.run('buildDailyPlanText(VIEW_DATE)'),/\[v\] 동기부여 이론/);
  assert.match(a.run('buildDailyPlanText(VIEW_DATE)'),/\[v\] 기타 기출/);
});

test('imported numeric question sources and text remain selectable as subgoals', () => {
  const a = subgoalApp();
  a.run(`DATA.modules.m.tabs[0].questions[0].src=2026;
    DATA.modules.m.tabs[0].questions[0].text=123;
    DATA.modules.m.tabs[1].questions[0].src='';
    DATA.modules.m.tabs[1].questions[0].text=456;
    validateImportedPlannerData(DATA);`);
  assert.deepEqual(a.json("timelineSubgoalOptions(parentPlan).filter(r=>r.type==='question').map(r=>r.label)"),['2026','456']);
  a.run(`setTimelineSubgoals(parentPlan,[{type:'question',id:'core-q',pid:'m'}]); openTimelineMenu(pointer(),0,0,true);`);
  assert.deepEqual(a.json('dailyPlanProgress(DATA.dailyHistory[VIEW_DATE])'),{total:1,done:0,pct:0});
  assert.match(a.run("node('timelineMenu').innerHTML"),/세부목표 설정/);
});

test('stale, unrelated and duplicate subgoals do not inflate progress and an empty set falls back', () => {
  const a = subgoalApp();
  a.run(`setTimelineSubgoals(parentPlan,[{type:'question',id:'core-q',pid:'m'},{type:'question',id:'core-q',pid:'m'},
    {type:'question',id:'missing',pid:'m'},{type:'detail',id:'foreign',pid:'b'}]);`);
  assert.equal(a.run('parentPlan.progressTargets.length'),1);
  a.run(`DATA.modules.m.tabs[0].questions=[]`);
  assert.deepEqual(a.json('dailyPlanProgress(DATA.dailyHistory[VIEW_DATE])'),{total:4,done:2,pct:50});
  a.run(`setTimelineSubgoals(parentPlan,[{type:'theory',id:'other',pid:'m'}]); purgeDailyRefs(r=>r.type==='theory' && r.id==='other');`);
  assert.equal(a.run('selectedTimelineSubgoals(parentPlan).length'),0);
});

test('subgoal menu edits a draft, cancels cleanly and saves only the intended plan', () => {
  const a = subgoalApp();
  a.run(`openTimelineMenu(pointer(),0,0,true)`);
  assert.match(a.run("node('timelineMenu').innerHTML"),/세부목표 설정/);
  a.run(`timelineMenuAction('subgoals');
    const choice=timelineSubgoalState.options.findIndex(r=>r.id==='other');
    toggleTimelineSubgoal(choice,true); closeTimelineSubgoals();`);
  assert.equal(a.run('parentPlan.progressTargets'),undefined);
  a.run(`openTimelineSubgoals(VIEW_DATE,0,0); toggleTimelineSubgoal(choice,true); saveTimelineSubgoals();`);
  assert.deepEqual(a.json('parentPlan.progressTargets'),[{type:'theory',id:'other',pid:'m'}]);
  assert.equal(a.run('timelineSubgoalState'),null);
  assert.equal(a.run('DATA.home.subjects[0].isRunning'),undefined);
  a.run(`openTimelineSubgoals(VIEW_DATE,0,0); toggleTimelineSubgoal(choice,false); VIEW_DATE='2026-10-18'; saveTimelineSubgoals();`);
  assert.deepEqual(a.json('parentPlan.progressTargets'),[{type:'theory',id:'other',pid:'m'}]);
});

test('subgoal references follow source identity updates and survive backup with validation', () => {
  const a = subgoalApp();
  a.run(`setTimelineSubgoals(parentPlan,[{type:'question',id:'core-q',pid:'m'}]);
    DATA.modules.m.tabs[0].questions[0].id='renamed-q';
    __updateDailyRefs(r=>r.type==='question' && r.id==='core-q',r=>{r.id='renamed-q'});`);
  assert.deepEqual(a.json('parentPlan.progressTargets'),[{type:'question',id:'renamed-q',pid:'m'}]);
  const backup = a.json('unpackPlannerBackup(buildPlannerBackupEnvelope(DATA,[]))');
  assert.deepEqual(backup.data.dailyHistory['2026-10-17'].slots[0].cardIds[0].progressTargets,[{type:'question',id:'renamed-q',pid:'m'}]);
  a.run('parentPlan.progressTargets={}');
  assert.throws(()=>a.run('validateImportedPlannerData(DATA)'),/세부목표/);
  a.run("parentPlan.progressTargets=[{type:'question',id:'q',pid:'__proto__'}]");
  assert.throws(()=>a.run('validateImportedPlannerData(DATA)'),/세부목표/);
});

test('schema four plans migrate without adding subgoals or changing stored study records', () => {
  const a = subgoalApp();
  const before = a.json('DATA.dailyHistory');
  const migrated = a.json('migratePlannerData({...DATA,schemaVersion:4})');
  assert.equal(migrated.schemaVersion,a.run('PLANNER_SCHEMA_VERSION'));
  Object.values(migrated.dailyHistory).forEach(day=>day.slots.forEach(slot=>slot.cardIds.forEach(ref=>{
    assert.ok(ref.planId); delete ref.planId;
  })));
  assert.deepEqual(migrated.dailyHistory,before);
  assert.throws(()=>a.run('migratePlannerData({...DATA,schemaVersion:PLANNER_SCHEMA_VERSION+1})'),/최신/);
});

function modulePlanApp() {
  const a = gestureApp();
  a.run(`scheduleMathRender=()=>{};
    DATA.modules.m={id:'m',title:'동기부여 이론',activeTab:'core',tabs:[
      {id:'core',label:'핵심이론',theoryNote:'핵심 설명',questions:[{id:'core-q',src:'핵심 기출',text:'핵심 문제'}],time:0,isRunning:false},
      {id:'other',label:'기타이론',theoryNote:'기타 설명',questions:[{id:'other-q',src:'기타 기출',text:'기타 문제'}],time:0,isRunning:false}
    ]};
    DATA.dailyHistory[VIEW_DATE].slots[0].cardIds=[
      {type:'theory',id:'core',pid:'m',startMinute:300,endMinute:310},
      {type:'theory',id:'other',pid:'m',startMinute:310,endMinute:320},
      {type:'question',id:'other-q',pid:'m',startMinute:320,endMinute:330}
    ];
    location.hash='#/module/m'; renderModule('m');`);
  return a;
}

test('starting another theory plan selects and persists that module tab', () => {
  const a = modulePlanApp();
  a.run(`toggleTimelineCardTimer(0,1)`);
  assert.equal(a.run('DATA.modules.m.activeTab'),'other');
  assert.equal(a.run('DATA.modules.m.tabs[1].isRunning'),true);
  assert.equal(a.run('location.hash'),'#/module/m?focus=theory-m-other');
  assert.equal(JSON.parse(a.storage.get(STORAGE_KEY)).modules.m.activeTab,'other');
});

test('starting a question plan opens its owning tab and reveals it through any source filter', () => {
  const a = modulePlanApp();
  a.run(`MODULE_QSRC_FILTER['m:other']='핵심 기출'; toggleTimelineCardTimer(0,2); renderModule('m');`);
  assert.equal(a.run('DATA.modules.m.activeTab'),'other');
  assert.equal(a.run('DATA.modules.m.tabs[1].questions[0].isRunning'),true);
  assert.equal(a.run('location.hash'),'#/module/m?focus=other-q');
  assert.match(a.run('APP.innerHTML'),/id="card-other-q"/);
  assert.doesNotMatch(a.run('APP.innerHTML'),/id="card-core-q"/);
});

test('a plan reopens its tab after manual switching even when its URL is already current', () => {
  const a = modulePlanApp();
  a.run(`location.hash='#/module/m?focus=theory-m-other';
    timelineKey({key:'Enter',preventDefault(){},stopPropagation(){}},'card',0,1);`);
  assert.match(a.run('APP.innerHTML'),/id="card-theory-m-other"/);
  a.run(`switchTab('m','core'); toggleTimelineCardTimer(0,1);`);
  assert.equal(a.run('DATA.modules.m.activeTab'),'core');
  assert.equal(a.run('DATA.modules.m.tabs[1].isRunning'),false);
  a.run(`toggleTimelineCardTimer(0,1)`);
  assert.equal(a.run('location.hash'),'#/module/m?focus=theory-m-other');
  assert.match(a.run('APP.innerHTML'),/id="card-theory-m-other"/);
});

test('daily-only tasks and missing source cards do not navigate to unrelated pages', () => {
  const a = gestureApp();
  a.run(`location.hash='#/detail/a'; DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.push({type:'adhoc',id:'read',title:'읽기'});
    toggleTimelineCardTimer(0,1);`);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[1].isRunning'),true);
  assert.equal(a.run('location.hash'),'#/detail/a');
  a.run(`DATA.home.subjects=[]; toggleTimelineCardTimer(0,0);`);
  assert.equal(a.run('location.hash'),'#/detail/a');
});

test('daily-only completion menu updates progress, persists state and stops recording without losing elapsed time', () => {
  const a = gestureApp();
  a.run(`renderRouter=()=>{}; node('daily-sidebar').classList.contains=()=>false;
    const RealDate=Date; let now=RealDate.parse('2026-10-17T09:00:00+09:00');
    Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))} static now(){return now}};
    __timerDate=VIEW_DATE; __lastTimerTickAt=now; __timerCarryMs=0;
    DATA.dailyHistory[VIEW_DATE].slots[0].cardIds=[{type:'adhoc',id:'read',title:'읽기',startMinute:600,endMinute:630,time:0,done:false}];
    toggleTimelineCardTimer(0,0);
    now+=2500;
    openTimelineMenu(pointer(),0,0,true);`);
  assert.match(a.run("node('timelineMenu').innerHTML"),/timelineMenuAction\('done'\).*완료로 표시/);
  a.run("timelineMenuAction('done')");
  assert.deepEqual(a.json('dailyPlanProgress(DATA.dailyHistory[VIEW_DATE])'),{total:1,done:1,pct:100});
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.done,r.isRunning,r.time])'),[[true,false,2]]);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].totalSeconds'),2);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].sessions.map(s=>[s.startMs,s.endMs])'),[
    [Date.parse('2026-10-17T09:00:00+09:00'),Date.parse('2026-10-17T09:00:02+09:00')]
  ]);
  assert.equal(JSON.parse(a.storage.get(STORAGE_KEY)).dailyHistory['2026-10-17'].slots[0].cardIds[0].done,true);
  a.run(`now+=1500; tickOneSecond(); openTimelineMenu(pointer(),0,0,true);`);
  assert.match(a.run("node('timelineMenu').innerHTML"),/미완료로 표시/);
  a.run("timelineMenuAction('done')");
  assert.deepEqual(a.json('dailyPlanProgress(DATA.dailyHistory[VIEW_DATE])'),{total:1,done:0,pct:0});
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.done,r.isRunning,r.time])'),[[false,false,2]]);
  assert.equal(JSON.parse(a.storage.get(STORAGE_KEY)).dailyHistory['2026-10-17'].slots[0].cardIds[0].done,false);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].sessions.length'),1);
});

test('clicking a future plan records only the current real time and current date', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{}; renderWithScrollPreserved=()=>{};
    const today=getLogicalDate(); VIEW_DATE=addDaysYMD(today,1);
    DATA.home.subjects=[{id:'a',title:'경영학',time:0,isRunning:false}];
    createTimelineSlot(VIEW_DATE,900,960).cardIds.push({type:'subject',id:'a',startMinute:900,endMinute:930});
    toggleTimelineCardTimer(0,0); __lastTimerTickAt=Date.now()-2200; toggleTimelineCardTimer(0,0);`);
  assert.equal(a.run('DATA.home.subjects[0].isRunning'),false);
  assert.equal(a.run('DATA.dailyHistory[today].sessions.length'),1);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].sessions.length'),0);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].totalSeconds'),0);
  assert.equal(a.run('Math.abs(DATA.dailyHistory[today].sessions[0].endMs-Date.now()) < 1000'),true);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.startMinute,r.endMinute])'),[[900,930]]);
});

test('deleting a legacy block leaves unscheduled daily tasks accessible without inventing a time', () => {
  const a = app();
  a.run(`const originalRender=renderDailySidebar; renderDailySidebar=()=>{};
    DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',label:'미정',startMinute:null,endMinute:null,cardIds:[{type:'adhoc',id:'a',title:'읽기',startMinute:null,endMinute:null}]}],sessions:[]};
    removeSlot(VIEW_DATE,0);
    const container={},scroll={dataset:{date:VIEW_DATE},scrollTop:0},getElement=document.getElementById;
    document.getElementById=id=>id==='dailySlots'?container:id==='timelineScroll'?scroll:getElement(id);
    renderTimeline(DATA.dailyHistory[VIEW_DATE]);`);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[0].startMinute'),null);
  assert.match(a.run('container.innerHTML'),/시간 미지정/);
  assert.match(a.run('container.innerHTML'),/onclick="toggleTimelineCardTimer\(0,0\)"[^>]*>읽기/);
});

test('card picker adds a daily-only task at the chosen empty grid position', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{}; const daily=ensureDailyData(VIEW_DATE); ungroupedTimelineCards(daily);
    selectorState={date:VIEW_DATE,slotIdx:0,startMinute:430};
    addToSlot(VIEW_DATE,0,{type:'adhoc',id:'a',title:'읽기'});`);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots[0].cardIds.map(r=>[r.startMinute,r.endMinute])'),[[430,460]]);
});

test('card color changes apply to all plans and actual sessions of the same subject and survive backup', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{}; const slot=createTimelineSlot(VIEW_DATE,300,360);
    slot.cardIds.push({type:'subject',id:'a',pid:'a',startMinute:300,endMinute:330});
    const otherColor=timelineColor({type:'subject',id:'b'});
    timelineMenuState={date:VIEW_DATE,sIdx:0,cIdx:0,editing:false}; setTimelineMenuColor(265);`);
  assert.equal(a.run("timelineColor({type:'subject',id:'a',pid:null})"),'265 65% 43%');
  assert.equal(a.run("timelineColor({type:'subject',id:'a',pid:'a'})"),'265 65% 43%');
  assert.equal(a.run("timelineColor({type:'subject',id:'b'})"),a.run('otherColor'));
  a.run('const restored=unpackPlannerBackup(JSON.parse(JSON.stringify(buildPlannerBackupEnvelope(DATA,[]))));');
  assert.deepEqual(a.json('restored.data.timelineColors'),a.json('DATA.timelineColors'));
  assert.equal(JSON.parse(a.storage.get(STORAGE_KEY)).timelineColors['subject|a|'],265);
});

test('block colors are independent and editable only in block edit mode', () => {
  const a = app();
  a.run(`renderDailySidebar=()=>{}; createTimelineSlot(VIEW_DATE,300,360); createTimelineSlot(VIEW_DATE,400,460);
    timelineMenuState={date:VIEW_DATE,sIdx:0,cIdx:-1,editing:false}; setTimelineMenuColor(150);`);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].colorHue'),undefined);
  a.run(`timelineAdding=true; timelineMenuState={date:VIEW_DATE,sIdx:0,cIdx:-1,editing:true}; setTimelineMenuColor(150);`);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].colorHue'),150);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[1].colorHue'),undefined);
  a.run(`timelineMenuState={date:VIEW_DATE,sIdx:0,cIdx:-1,editing:true}; setTimelineMenuColor(null);`);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].slots[0].colorHue'),undefined);
  assert.throws(()=>a.run("validateImportedPlannerData({...DATA,timelineColors:{bad:'red; position:fixed'}})"),/색상/);
});
