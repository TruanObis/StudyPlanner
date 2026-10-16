const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function app(){
  const html=fs.readFileSync(path.join(__dirname,'../cpa_app_timetable_monthly_v2.html'),'utf8');
  const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n').replace(/\ninit\(\);\s*$/,'');
  const storage=new Map(), nodes=new Map();
  const classes=()=>{const values=new Set();return {contains:v=>values.has(v),add:(...vs)=>vs.forEach(v=>values.add(v)),remove:(...vs)=>vs.forEach(v=>values.delete(v)),toggle(v,on){if(on??!values.has(v))values.add(v);else values.delete(v);}};};
  const node=id=>{
    if(!nodes.has(id)) nodes.set(id,{id,style:{},dataset:{},value:'',innerHTML:'',hidden:false,
      classList:classes(),addEventListener(){},setAttribute(k,v){this[k]=v;},focus(){},
      querySelectorAll:()=>[],querySelector:()=>null});
    return nodes.get(id);
  };
  const location={hash:'#/',protocol:'file:',href:'file:///planner.html'};
  const context=vm.createContext({console,URL,URLSearchParams,Blob,Date,Map,Set,
    window:{location,addEventListener(){},innerWidth:1280,scrollY:0,scrollTo(){}},location,
    document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},documentElement:node('html'),body:node('body')},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    navigator:{},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},confirm:()=>true,alert(){}});
  vm.runInContext(script,context);
  const run=code=>vm.runInContext(code,context);
  run(`DATA=baseData(); VIEW_DATE='2026-10-17';
    const RealDate=Date; let now=RealDate.parse('2026-10-17T09:00:00+09:00');
    Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))} static now(){return now}};
    __lastTimerTickAt=now; __timerCarryMs=0; __timerDate=VIEW_DATE;
    DATA.home.subjects=[{id:'a',name:'경영학',time:60}];
    DATA.details={a:{id:'a',title:'경영학',cards:[{id:'topic',title:'동기부여',module:'m'},{id:'loose',title:'요약'}]}};
    DATA.modules={m:{id:'m',title:'동기부여',tabs:[
      {id:'core',label:'핵심이론',done:false,questions:[{id:'q1',src:'기출1',done:false}]},
      {id:'other',label:'기타이론',done:false,questions:[{id:'q2',src:'기출2',done:false}]}]}};
    DATA.dailyHistory={};
    const root={type:'subject',id:'a'};
    const config={kind:'month',root,startDate:'2026-10-17',endDate:'2026-10-18',weekdays:[0,1,2,3,4,5,6]};
    renderWithScrollPreserved=()=>{}; renderDailySidebar=()=>{}; renderRouter=()=>{};`);
  return {run,storage,nodes,json:code=>JSON.parse(JSON.stringify(run(code)))};
}

test('schema five migrates stable plan identities without altering plans or execution',()=>{
  const a=app();
  a.run(`DATA.schemaVersion=5; DATA.dailyHistory[VIEW_DATE]={totalSeconds:60,goalStr:'02:00:00',slots:[
    {id:'s',label:'오전',startMinute:300,endMinute:360,cardIds:[{type:'subject',id:'a',startMinute:310,endMinute:330,time:60,progressTargets:[{type:'theory',id:'core',pid:'m'}]}]}],
    sessions:[{id:'run',ref:{type:'subject',id:'a'},startMs:now-60000,endMs:now}]};
    const original=clonePlain(DATA); const migrated=migratePlannerData(DATA);`);
  assert.equal(a.run('migrated.schemaVersion'),7);
  assert.deepEqual(a.json('migrated.periodGoals'),[]);
  assert.ok(a.run('migrated.dailyHistory[VIEW_DATE].slots[0].cardIds[0].planId'));
  assert.deepEqual(a.json('migrated.dailyHistory[VIEW_DATE].sessions'),a.json('original.dailyHistory[VIEW_DATE].sessions'));
  a.run('delete migrated.dailyHistory[VIEW_DATE].slots[0].cardIds[0].planId');
  assert.deepEqual(a.json('migrated.dailyHistory'),a.json('original.dailyHistory'));
});

test('monthly allocation creates weekly topic goals and independent daily learning cards',()=>{
  const a=app();
  a.run(`const goal=planningCreateGoal({...config,startDate:'2026-10-19',endDate:'2026-10-30',weekdays:[1,2,3,4,5]});
    const preview=planningBuildAllocation(goal.id); planningApplyAllocation(preview);
    const children=DATA.periodGoals.filter(g=>g.parentGoalId===goal.id);
    const plans=Object.keys(DATA.dailyHistory).sort().flatMap(date=>planningPlans(date));`);
  assert.deepEqual(a.json('plans.map(p=>p.ref.id)'),['core','q1','other','q2','loose']);
  assert.ok(a.run('plans.every(p=>p.ref.type!=="subject" && !p.ref.progressTargets && p.ref.startMinute===null)'));
  assert.ok(a.run('children.length>0 && children.every(g=>g.kind==="week" && g.root.type==="detail")'));
  assert.ok(a.run('plans.every(p=>children.some(g=>g.id===p.ref.goalId && g.startDate<=p.date && g.endDate>=p.date && g.targets.some(r=>planningKey(r)===planningKey(p.ref))))'));
  assert.ok(a.run('preview.weeks.length>0'));
  a.run(`VIEW_DATE='2026-10-19'; renderPlanningPage('week');`);
  const weekly=a.nodes.get('planningContent').innerHTML;
  assert.match(weekly,/주간 목표/);
  assert.match(weekly,/동기부여/);
  assert.doesNotMatch(weekly,/class="planning-badge">월간 목표/);
  a.run(`renderPlanningPage('month');`);
  assert.doesNotMatch(a.nodes.get('planningContent').innerHTML,/class="planning-badge">주간 목표/);
  assert.doesNotThrow(()=>a.run('validateImportedPlannerData(unpackPlannerBackup(buildPlannerBackupEnvelope(DATA)).data)'));
});

test('schema six expands untimed allocated wrappers without moving plans or rewriting execution',()=>{
  const a=app();
  a.run(`const goal=planningCreateGoal(config); DATA.schemaVersion=6;
    DATA.dailyHistory[VIEW_DATE]={totalSeconds:60,slots:[{id:'s',cardOnly:true,cardIds:[
      {type:'subject',id:'a',planId:'legacy',goalId:goal.id,startMinute:null,endMinute:null,time:0,progressTargets:goal.targets.slice(0,3)},
      {type:'subject',id:'a',planId:'timed',goalId:goal.id,startMinute:540,endMinute:600,time:60,progressTargets:goal.targets.slice(3)},
      {type:'subject',id:'a',planId:'manual',startMinute:null,endMinute:null,time:0}]}],
      sessions:[{id:'run',ref:{type:'subject',id:'a'},startMs:now-60000,endMs:now}]};
    const before=clonePlain(DATA); const migrated=migratePlannerData(DATA);
    const converted=migrated.dailyHistory[VIEW_DATE].slots[0].cardIds;`);
  assert.equal(a.run('migrated.schemaVersion'),7);
  assert.deepEqual(a.json('converted.map(r=>r.id)'),['core','q1','other','a','a']);
  assert.equal(a.run('converted[0].planId'),'legacy');
  assert.deepEqual(a.json('converted.slice(3)'),a.json('before.dailyHistory[VIEW_DATE].slots[0].cardIds.slice(1)'));
  assert.deepEqual(a.json('migrated.dailyHistory[VIEW_DATE].sessions'),a.json('before.dailyHistory[VIEW_DATE].sessions'));
  assert.deepEqual(a.json('migratePlannerData(migrated)'),a.json('migrated'));
  assert.doesNotThrow(()=>a.run('validateImportedPlannerData(migrated)'));
});

test('moving a generated daily card across weeks updates its weekly topic goal and deleting the month detaches all plans',()=>{
  const a=app();
  a.run(`const goal=planningCreateGoal({...config,endDate:'2026-10-31'});
    planningApplyAllocation(planningBuildAllocation(goal.id));
    const plan=planningPlans(VIEW_DATE)[0].ref, old=plan.goalId;
    planningMovePlan(plan.planId,'2026-10-26',600,630);
    const child=planningGoal(plan.goalId);`);
  assert.notEqual(a.run('plan.goalId'),a.run('old'));
  assert.equal(a.run('child.parentGoalId'),a.run('goal.id'));
  assert.equal(a.run('child.startDate'),'2026-10-26');
  assert.ok(a.run('child.targets.some(r=>planningKey(r)===planningKey(plan))'));
  a.run(`planningDeleteGoal(goal.id);`);
  assert.equal(a.run('DATA.periodGoals.length'),0);
  assert.equal(a.run('plan.goalId'),undefined);
  assert.equal(a.run('planningFindPlan(plan.planId).date'),'2026-10-26');
});

test('migration preserves generated wrappers whose canonical source timer is running in the imported data',()=>{
  for(const root of [{type:'subject',id:'a'},{type:'detail',id:'topic',pid:'a'}]){
    const a=app();
    a.run(`const goal=planningCreateGoal({...config,root:${JSON.stringify(root)}});
      DATA.dailyHistory['2026-10-18']={slots:[{id:'s',cardOnly:true,cardIds:[
        {...goal.scope,planId:'running',goalId:goal.id,startMinute:null,endMinute:null,time:0,isRunning:false,progressTargets:goal.targets}]}],sessions:[]};
      const imported=clonePlain(DATA); imported.schemaVersion=6;
      const source=goal.root.type==='subject' ? imported.home.subjects[0] : imported.details.a.cards[0];source.isRunning=true;
      const migrated=migratePlannerData(imported);`);
    assert.deepEqual(a.json('migrated.dailyHistory'),a.json('imported.dailyHistory'));
    assert.deepEqual(a.json('migrated.periodGoals'),a.json('imported.periodGoals'));
    assert.equal(a.run('migrated.schemaVersion'),7);
  }
});

test('period goals retain only unique learning units and survive official backup',()=>{
  const a=app();
  assert.equal(a.run('typeof planningCreateGoal'),'function');
  a.run('const goal=planningCreateGoal(config);');
  assert.deepEqual(a.json('goal.targets.map(r=>r.id)'),['core','q1','other','q2','loose']);
  assert.ok(a.run("goal.knownRefs.some(r=>r.id==='topic')"));
  a.run('const restored=unpackPlannerBackup(buildPlannerBackupEnvelope(DATA)).data; validateImportedPlannerData(restored);');
  assert.deepEqual(a.json('restored.periodGoals'),a.json('DATA.periodGoals'));
  assert.throws(()=>a.run(`validateImportedPlannerData({...DATA,periodGoals:[{...goal,endDate:'2026-10-01'}]})`),/기간|목표/);
  assert.throws(()=>a.run(`validateImportedPlannerData({...DATA,periodGoals:[{...goal,weekdays:[8]}]})`),/요일|목표/);
});

test('new cards appear once in both week and month ranges, while renames and known cards do not',()=>{
  const a=app();
  assert.equal(a.run('typeof planningNewCards'),'function');
  a.run(`const g1=planningCreateGoal(config),g2=planningCreateGoal({...config,kind:'week'});
    DATA.modules.m.tabs[0].label='이름 변경';
    DATA.modules.m.tabs[1].questions.push({id:'new-q',src:'추가 기출'});`);
  for(const range of [['2026-10-12','2026-10-18'],['2026-10-01','2026-10-31']]){
    assert.deepEqual(a.json(`planningNewCards('${range[0]}','${range[1]}').map(r=>r.ref.id)`),['new-q']);
    assert.equal(a.run(`planningNewCards('${range[0]}','${range[1]}')[0].goalIds.length`),2);
  }
  a.run(`planningDismissNewCards([g1.id,g2.id],[{type:'question',id:'new-q',pid:'m'}]);`);
  assert.deepEqual(a.json("planningNewCards('2026-10-01','2026-10-31')"),[]);
  assert.equal(a.run('g1.targets.length'),5);
});

test('allocation divides ordered units evenly, creates unscheduled plans and skips existing assignments',()=>{
  const a=app();
  assert.equal(a.run('typeof planningBuildAllocation'),'function');
  a.run(`const goal=planningCreateGoal(config); const preview=planningBuildAllocation(goal.id);
    const applied=planningApplyAllocation(preview);`);
  assert.equal(a.run('applied.applied'),5);
  assert.deepEqual(a.json('preview.entries.map(e=>[e.date,e.refs.map(r=>r.id)])'),[
    ['2026-10-17',['core','q1','other']],['2026-10-18',['q2','loose']]
  ]);
  assert.equal(a.run('planningPlans(VIEW_DATE)[0].ref.startMinute'),null);
  const before=a.json('DATA.dailyHistory');
  a.run('planningApplyAllocation(preview);');
  assert.deepEqual(a.json('DATA.dailyHistory'),before);
  a.run('const overlapping=planningCreateGoal(config); const p2=planningBuildAllocation(overlapping.id);');
  assert.equal(a.run('p2.entries.length'),0);
  assert.equal(a.run('p2.skipped.length'),5);
});

test('parent plans without selected subgoals do not block allocating their children',()=>{
  for(const ref of [{type:'subject',id:'a'},{type:'detail',id:'topic',pid:'a'}]){
    const a=app();
    a.run(`const existing=planningPlaceOnDate(VIEW_DATE,{source:'main',...${JSON.stringify(ref)}});
      existing.startMinute=540;existing.endMinute=600;existing.time=60;
      const before=clonePlain(existing);
      const goal=planningCreateGoal(config),preview=planningBuildAllocation(goal.id);`);
    assert.deepEqual(a.json('preview.entries.map(e=>[e.date,e.refs.map(r=>r.id)])'),[
      ['2026-10-17',['core','q1','other']],['2026-10-18',['q2','loose']]
    ]);
    assert.deepEqual(a.json('preview.skipped'),[]);
    a.run('planningApplyAllocation(preview);');
    assert.deepEqual(a.json('existing'),a.json('before'));
    assert.equal(a.run("planningPlans('2026-10-18').length"),2);
    assert.match(a.run("planningDayHTML('2026-10-18')"),/기출2/);
    assert.match(a.run("planningDayHTML('2026-10-18')"),/요약/);
    a.run('const repeated=planningBuildAllocation(goal.id);');
    assert.equal(a.run('repeated.entries.length'),0);
    assert.equal(a.run('repeated.skipped.length'),5);
  }
});

test('allocation respects remaining weekdays and refuses stale plans without moving existing work',()=>{
  const a=app();
  assert.equal(a.run('typeof planningApplyAllocation'),'function');
  a.run(`const goal=planningCreateGoal({...config,startDate:'2026-10-01',endDate:'2026-10-20',weekdays:[1]});
    const preview=planningBuildAllocation(goal.id);
    DATA.modules.m.tabs[0].questions[0].done=true;
    const result=planningApplyAllocation(preview);`);
  assert.deepEqual(a.json('preview.entries.map(e=>e.date)'),['2026-10-19']);
  assert.equal(a.run('result.stale'),true);
  assert.deepEqual(a.json('DATA.dailyHistory'),{});
  a.run('const applied=planningApplyAllocation(result.preview);');
  assert.equal(a.run('applied.applied'),4);
  assert.throws(()=>a.run(`planningBuildAllocation(goal.id,undefined,'2026-10-01','2026-10-02')`),/날짜/);
});

test('new-card allocation adds a separate plan without moving existing cards or changing their targets',()=>{
  const a=app();
  assert.equal(a.run('typeof planningCreateGoal'),'function');
  a.run(`const goal=planningCreateGoal({...config,endDate:VIEW_DATE});
    planningApplyAllocation(planningBuildAllocation(goal.id));
    const scheduled=planningPlans(VIEW_DATE)[0].ref;
    scheduled.startMinute=540; scheduled.endMinute=600;
    DATA.modules.m.tabs[1].questions.push({id:'new-q',src:'새 문제'});
    const added=planningNewCards(VIEW_DATE,VIEW_DATE)[0].ref;
    planningApplyAllocation(planningBuildAllocation(goal.id,[added]));`);
  assert.deepEqual(a.json('[scheduled.startMinute,scheduled.endMinute]'),[540,600]);
  assert.equal(a.run('planningPlans(VIEW_DATE).length'),6);
  assert.equal(a.run('scheduled.progressTargets'),undefined);
  assert.equal(a.run('planningPlans(VIEW_DATE).at(-1).ref.id'),'new-q');
  assert.equal(a.run('planningNewCards(VIEW_DATE,VIEW_DATE).length'),0);
  assert.deepEqual(a.json('planningNewCards(VIEW_DATE,VIEW_DATE)'),[]);
});

test('moving a plan retains its identity and execution history and validates ten-minute bounds',()=>{
  const a=app();
  assert.equal(a.run('typeof planningMovePlan'),'function');
  a.run(`DATA.dailyHistory[VIEW_DATE]={totalSeconds:60,slots:[{id:'s',cardIds:[{type:'subject',id:'a',time:60,startMinute:300,endMinute:330}]}],
    sessions:[{id:'run',ref:{type:'subject',id:'a'},startMs:now-60000,endMs:now}]};
    planningEnsureData(DATA); const planId=planningPlans(VIEW_DATE)[0].ref.planId;
    const records=clonePlain(DATA.dailyHistory[VIEW_DATE].sessions);`);
  assert.throws(()=>a.run(`planningMovePlan(planId,'2026-10-18',541,600)`),/10분/);
  a.run(`planningMovePlan(planId,'2026-10-18',1440,1560);`);
  assert.equal(a.run('planningFindPlan(planId).date'),'2026-10-18');
  assert.equal(a.run('planningFindPlan(planId).ref.time'),0);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].sessions'),a.json('records'));
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].totalSeconds'),60);
});

test('copy preserves destination data, skips repeated copies and never copies execution or active flags',()=>{
  const a=app();
  assert.equal(a.run('typeof planningCopyPreview'),'function');
  a.run(`DATA.dailyHistory[VIEW_DATE]={totalSeconds:60,slots:[{id:'s',label:'집중',colorHue:150,startMinute:540,endMinute:660,cardIds:[
    {type:'subject',id:'a',startMinute:550,endMinute:600,time:60,isRunning:true,goalId:'old',progressTargets:[{type:'theory',id:'core',pid:'m'}]},
    {type:'adhoc',id:'read',title:'읽기',startMinute:600,endMinute:630,time:30,isRunning:true,done:true}]}],
    sessions:[{id:'run',ref:{type:'subject',id:'a'},startMs:now-60000,endMs:now}]};
    DATA.dailyHistory['2026-10-18']={totalSeconds:10,slots:[{id:'keep',label:'유지',startMinute:300,endMinute:360,cardIds:[]}],sessions:[]};
    planningEnsureData(DATA); const source=clonePlain(DATA.dailyHistory[VIEW_DATE]);
    const preview=planningCopyPreview(VIEW_DATE,['2026-10-18'],true); planningApplyCopy(preview);`);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE]'),a.json('source'));
  assert.equal(a.run("DATA.dailyHistory['2026-10-18'].totalSeconds"),10);
  assert.deepEqual(a.json("DATA.dailyHistory['2026-10-18'].sessions"),[]);
  assert.deepEqual(a.json("planningPlans('2026-10-18').map(p=>[p.ref.time,p.ref.isRunning,p.ref.goalId||null])"),[[0,false,null],[0,false,null]]);
  assert.equal(a.run("planningPlans('2026-10-18')[1].ref.done"),false);
  assert.notEqual(a.run("planningPlans('2026-10-18')[1].ref.id"),'read');
  const copied=a.json("DATA.dailyHistory['2026-10-18']");
  a.run('planningApplyCopy(planningCopyPreview(VIEW_DATE,["2026-10-18"],true));');
  assert.deepEqual(a.json("DATA.dailyHistory['2026-10-18']"),copied);
});

test('block-only copying leaves plans out and stale copy previews do not overwrite edits',()=>{
  const a=app();
  assert.equal(a.run('typeof planningApplyCopy'),'function');
  a.run(`DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',label:'공부',startMinute:540,endMinute:600,cardIds:[{type:'subject',id:'a',startMinute:540,endMinute:570}]}],sessions:[]};
    planningEnsureData(DATA); const preview=planningCopyPreview(VIEW_DATE,['2026-10-18'],false);
    DATA.dailyHistory[VIEW_DATE].slots[0].endMinute=660;
    const result=planningApplyCopy(preview);`);
  assert.equal(a.run('result.stale'),true);
  assert.equal(a.run("DATA.dailyHistory['2026-10-18']"),undefined);
  a.run('planningApplyCopy(result.preview);');
  assert.equal(a.run("planningPlans('2026-10-18').length"),0);
  assert.equal(a.run("DATA.dailyHistory['2026-10-18'].slots[0].endMinute"),660);
});

test('source identity updates follow period goals and removing goals preserves allocated plans',()=>{
  const a=app();
  assert.equal(a.run('typeof planningDeleteGoal'),'function');
  a.run(`const goal=planningCreateGoal(config); planningApplyAllocation(planningBuildAllocation(goal.id));
    __updateDailyRefs(r=>r.type==='question'&&r.id==='q1',r=>{r.id='q1-new'});`);
  assert.ok(a.run("goal.targets.some(r=>r.id==='q1-new') && goal.knownRefs.some(r=>r.id==='q1-new')"));
  const count=a.run('Object.values(DATA.dailyHistory).flatMap(d=>d.slots.flatMap(s=>s.cardIds)).length');
  a.run('planningDeleteGoal(goal.id);');
  assert.equal(a.run('DATA.periodGoals.length'),0);
  assert.equal(a.run('Object.values(DATA.dailyHistory).flatMap(d=>d.slots.flatMap(s=>s.cardIds)).length'),count);
  assert.equal(a.run('Object.values(DATA.dailyHistory).flatMap(d=>d.slots.flatMap(s=>s.cardIds)).some(r=>r.goalId)'),false);
});

test('goal deletion asks before changing data and cancel preserves the whole planner',()=>{
  for(const kind of ['month','week']){
    const a=app();
    a.run(`const goal=planningCreateGoal({...config,kind:'${kind}'}); planningApplyAllocation(planningBuildAllocation(goal.id));
      const before=clonePlain(DATA); planningRemoveGoal(goal.id);`);
    assert.deepEqual(a.json('DATA'),a.json('before'));
    assert.match(a.nodes.get('planningModalBody').innerHTML,/일간 계획 5개/);
    assert.match(a.nodes.get('planningModalBody').innerHTML,/일간 계획 유지/);
    assert.match(a.nodes.get('planningModalBody').innerHTML,/일간 계획도 삭제/);
    if(kind==='month') assert.match(a.nodes.get('planningModalBody').innerHTML,/주간 목표 2개/);
    a.run('planningCloseModal();');
    assert.deepEqual(a.json('DATA'),a.json('before'));
  }
});

test('deleting a monthly goal with linked plans removes only that goal tree and preserves records, sources and blocks',()=>{
  const a=app();
  a.run(`const goal=planningCreateGoal(config); planningApplyAllocation(planningBuildAllocation(goal.id));
    const other=planningCreateGoal({...config,kind:'week'});
    const manual=planningPlaceOnDate(VIEW_DATE,{source:'main',type:'theory',id:'core',pid:'m'});
    const unrelated=planningPlaceOnDate(VIEW_DATE,{source:'main',type:'question',id:'q1',pid:'m'});unrelated.goalId=other.id;
    const legacy=planningPlaceOnDate(VIEW_DATE,{source:'main',type:'subject',id:'a'});legacy.goalId=goal.id;
    DATA.dailyHistory[VIEW_DATE].slots.push({id:'block',label:'집중',startMinute:540,endMinute:600,cardIds:[]});
    DATA.dailyHistory[VIEW_DATE].totalSeconds=60;
    DATA.dailyHistory[VIEW_DATE].sessions=[{id:'run',ref:{type:'theory',id:'core',pid:'m'},startMs:now-60000,endMs:now}];
    const before=clonePlain(DATA);
    planningRemoveGoal(goal.id); document.getElementById('planningDeleteLinked').checked=true; planningSubmitModal();`);
  assert.deepEqual(a.json('DATA.periodGoals.map(g=>g.id)'),[a.run('other.id')]);
  assert.deepEqual(a.json('Object.keys(DATA.dailyHistory).flatMap(d=>planningPlans(d).map(p=>p.ref.planId))'),[a.run('manual.planId'),a.run('unrelated.planId')]);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].sessions'),a.json('before.dailyHistory[VIEW_DATE].sessions'));
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].totalSeconds'),60);
  assert.deepEqual(a.json('DATA.dailyHistory[VIEW_DATE].slots.find(s=>s.id==="block")'),a.json('before.dailyHistory[VIEW_DATE].slots.find(s=>s.id==="block")'));
  assert.deepEqual(a.json('[DATA.home,DATA.details,DATA.modules]'),a.json('[before.home,before.details,before.modules]'));
  assert.doesNotThrow(()=>a.run('validateImportedPlannerData(DATA)'));
});

test('weekly linked deletion preserves its parent and sibling plans, and keeping plans remains the default',()=>{
  for(const removePlans of [false,true]){
    const a=app();
    a.run(`const goal=planningCreateGoal(config); planningApplyAllocation(planningBuildAllocation(goal.id));
      const child=DATA.periodGoals.find(g=>g.parentGoalId===goal.id && g.root.id==='topic');
      const kept=Object.keys(DATA.dailyHistory).flatMap(d=>planningPlans(d)).filter(p=>p.ref.goalId!==child.id).map(p=>p.ref.planId);
      planningRemoveGoal(child.id); document.getElementById('planningDeleteLinked').checked=${removePlans}; planningSubmitModal();`);
    assert.equal(a.run('!!planningGoal(goal.id)'),true);
    assert.equal(a.run('!!planningGoal(child.id)'),false);
    assert.equal(a.run('Object.keys(DATA.dailyHistory).flatMap(d=>planningPlans(d)).length'),removePlans?1:5);
    assert.ok(a.run('kept.every(id=>planningFindPlan(id))'));
  }
});

test('goal deletion refreshes changed linked plans and requires a new choice before deleting',()=>{
  const a=app();
  a.run(`const goal=planningCreateGoal(config); planningApplyAllocation(planningBuildAllocation(goal.id));
    planningRemoveGoal(goal.id); document.getElementById('planningDeleteLinked').checked=true;
    const added=planningPlaceOnDate(VIEW_DATE,{source:'main',type:'subject',id:'a'});added.goalId=goal.id;
    const before=clonePlain(DATA); planningSubmitModal();`);
  assert.deepEqual(a.json('DATA'),a.json('before'));
  assert.match(a.nodes.get('planningModalError').textContent,/변경|다시/);
  assert.match(a.nodes.get('planningModalBody').innerHTML,/일간 계획 6개/);
  a.run(`document.getElementById('planningDeleteLinked').checked=true; planningSubmitModal();`);
  assert.equal(a.run('Object.keys(DATA.dailyHistory).flatMap(d=>planningPlans(d)).length'),0);
});

test('daily details expose assigned subgoals and completion changes the original card',()=>{
  const a=app();
  assert.equal(a.run('typeof renderPlanningPage'),'function');
  a.run(`const goal=planningCreateGoal({...config,endDate:VIEW_DATE}); planningApplyAllocation(planningBuildAllocation(goal.id));
    location.hash='#/plans/day'; renderPlanningPage('day'); const plan=planningPlans(VIEW_DATE).find(p=>p.ref.id==='q1').ref;`);
  assert.match(a.nodes.get('planningContent').innerHTML,/핵심이론/);
  assert.match(a.nodes.get('planningContent').innerHTML,/기출1/);
  assert.match(a.nodes.get('planningContent').innerHTML,/시간 미지정/);
  a.run(`planningToggleDone(plan.planId,planningKey({type:'question',id:'q1',pid:'m'}),true);`);
  assert.equal(a.run('DATA.modules.m.tabs[0].questions[0].done'),true);
  assert.deepEqual(a.json('dailyPlanProgress(DATA.dailyHistory[VIEW_DATE])'),{total:5,done:1,pct:20});
});

test('both period tabs display the same new-card actions and correctly bound the selected date',()=>{
  const a=app();
  assert.equal(a.run('typeof planningPeriodBounds'),'function');
  assert.deepEqual(a.json("planningPeriodBounds('week','2026-10-18')"),{start:'2026-10-12',end:'2026-10-18'});
  a.run(`planningCreateGoal(config); DATA.modules.m.tabs[1].questions.push({id:'new-q',src:'새 기출문제'});`);
  for(const view of ['week','month']){
    a.run(`location.hash='#/plans/${view}'; renderPlanningPage('${view}');`);
    assert.match(a.nodes.get('planningContent').innerHTML,/새 기출문제/);
    assert.match(a.nodes.get('planningContent').innerHTML,/선택 카드 배분/);
    assert.match(a.nodes.get('planningContent').innerHTML,/이번 목표에서 제외/);
  }
});

test('detail timer controls do not navigate away and stale completion targets cannot change unrelated cards',()=>{
  const a=app();
  assert.equal(a.run('typeof planningToggleTimer'),'function');
  a.run(`const goal=planningCreateGoal({...config,endDate:VIEW_DATE}); planningApplyAllocation(planningBuildAllocation(goal.id));
    const plan=planningPlans(VIEW_DATE)[0].ref; location.hash='#/plans/day';
    planningToggleTimer(plan.planId);`);
  assert.equal(a.run('location.hash'),'#/plans/day');
  assert.equal(a.run('DATA.modules.m.tabs[0].isRunning'),true);
  a.run(`planningToggleDone(plan.planId,planningKey({type:'question',id:'q1',pid:'m'}),true);`);
  assert.equal(a.run('DATA.modules.m.tabs[0].questions[0].done'),false);
});

test('returning from a directly opened planning page restores the mobile timetable and expand action',()=>{
  const a=app();
  a.run(`window.innerWidth=390; location.hash='#/plans/day'; renderPlanningPage('day'); closePlanningPage();`);
  assert.equal(a.run('location.hash'),'#/');
  assert.equal(a.run("document.getElementById('daily-sidebar').classList.contains('open')"),true);
  assert.equal(a.nodes.get('body').classList.contains('sidebar-active'),true);
  assert.equal(a.nodes.get('planningExpand')['aria-label'],'계획 상세 펼치기');
});

test('legacy blocks receive distinct stable identities before a copy preview',()=>{
  const a=app();
  a.run(`DATA.dailyHistory[VIEW_DATE]={slots:[{label:'오전',startMinute:540,endMinute:600,cardIds:[]},{label:'오후',startMinute:780,endMinute:840,cardIds:[]}],sessions:[]};
    const preview=planningCopyPreview(VIEW_DATE,['2026-10-18'],false);`);
  const ids=a.json('preview.rows[0].blocks.map(s=>s.id)');
  assert.ok(ids.every(Boolean));
  assert.equal(new Set(ids).size,2);
  assert.equal(a.run('planningApplyCopy(preview).stale'),false);
  assert.equal(a.run("planningCopyPreview(VIEW_DATE,['2026-10-18'],false).rows[0].blocks.length"),0);
});

test('new goal forms default to the selected period even when it is in the past',()=>{
  const a=app();
  a.run(`VIEW_DATE='2026-09-12'; location.hash='#/plans/month'; planningOpenGoal();`);
  const body=a.nodes.get('planningModalBody').innerHTML;
  assert.match(body,/id="planningFrom"[^>]*value="2026-09-01"/);
  assert.match(body,/id="planningTo"[^>]*value="2026-09-30"/);
});

test('allocation uses current source order rather than checkbox selection history',()=>{
  const a=app();
  a.run(`const goal=planningCreateGoal(config); goal.targets.push(goal.targets.shift());`);
  assert.deepEqual(a.json('planningBuildAllocation(goal.id).entries.flatMap(e=>e.refs.map(r=>r.id))'),['core','q1','other','q2','loose']);
  a.run('DATA.modules.m.tabs.reverse();');
  assert.deepEqual(a.json('planningBuildAllocation(goal.id).entries.flatMap(e=>e.refs.map(r=>r.id))'),['other','q2','core','q1','loose']);
});

test('aggregate plans cover their child units without treating a theory as its questions',()=>{
  const a=app();
  a.run(`const goal=planningCreateGoal(config);
    DATA.dailyHistory[VIEW_DATE]={slots:[{id:'s',cardOnly:true,cardIds:[{type:'subject',id:'a',goalId:goal.id,progressTargets:[{type:'detail',id:'topic',pid:'a'}]}]}],sessions:[]};
    const preview=planningBuildAllocation(goal.id);`);
  assert.deepEqual(a.json('preview.entries.flatMap(e=>e.refs.map(r=>r.id))'),['loose']);
  assert.equal(a.run('preview.skipped.length'),4);
  a.run(`DATA.dailyHistory[VIEW_DATE].slots[0].cardIds[0].progressTargets=[{type:'theory',id:'core',pid:'m'}];`);
  assert.ok(a.run("planningBuildAllocation(goal.id).entries.some(e=>e.refs.some(r=>r.id==='q1'))"));
});

test('moving a goal root follows its new scope and preserves allocated targets, copies and timer source',()=>{
  const a=app();
  a.run(`DATA.details.a.cards.push({id:'destination',title:'새 단원',module:'n'});
    DATA.modules.n={id:'n',tabs:[{id:'keep',label:'기존 이론',questions:[]}]};
    const goal=planningCreateGoal({...config,root:{type:'theory',id:'core',pid:'m'},endDate:VIEW_DATE});
    planningApplyAllocation(planningBuildAllocation(goal.id));
    planningApplyAllocation(planningBuildAllocation(goal.id,[{type:'theory',id:'other',pid:'m'}]));
    const plan=planningPlans(VIEW_DATE)[0].ref;
    plan.startMinute=540;plan.endMinute=600;
    moveState={fromMid:'m',fromTabId:'core'}; selectorMoveTheory('n');`);
  assert.deepEqual(a.json('goal.scope'),{type:'detail',id:'destination',pid:'a'});
  assert.equal(a.run('plan.id'),'core');
  assert.equal(a.run('plan.pid'),'n');
  assert.deepEqual(a.json('planningGoal(plan.goalId).root'),{type:'detail',id:'destination',pid:'a'});
  assert.deepEqual(a.json('planningPlans(VIEW_DATE).map(p=>p.ref.id).sort()'),['core','other','q1']);
  assert.deepEqual(a.json('[plan.startMinute,plan.endMinute]'),[540,600]);
  a.run(`DATA.modules.n.tabs[0].questions.push({id:'new-n',src:'새 기출'});
    const fresh=planningNewCards(VIEW_DATE,VIEW_DATE).find(r=>r.ref.id==='new-n');
    planningApplyAllocation(planningBuildAllocation(goal.id,[fresh.ref]));`);
  assert.equal(a.run('planningPlans(VIEW_DATE).length'),4);
  a.run(`planningApplyCopy(planningCopyPreview(VIEW_DATE,['2026-10-18'],true)); planningDeleteGoal(goal.id);`);
  assert.equal(a.run('planningPlans(VIEW_DATE).length'),4);
  assert.equal(a.run("planningPlans('2026-10-18').length"),4);
  assert.doesNotThrow(()=>a.run('validateImportedPlannerData(unpackPlannerBackup(buildPlannerBackupEnvelope(DATA)).data)'));
});

test('monthly assignments spanning weeks expose topic goals and discover new cards only through their parent',()=>{
  const a=app();
  a.run(`DATA.modules.m.tabs[1].questions.push(...Array.from({length:20},(_,i)=>({id:'extra-'+i,src:'문제 '+i})));
    const goal=planningCreateGoal({...config,startDate:'2026-10-19',endDate:'2026-10-30',weekdays:[1,2,3,4,5]});
    planningApplyAllocation(planningBuildAllocation(goal.id));
    const children=DATA.periodGoals.filter(g=>g.parentGoalId===goal.id);
    DATA.modules.m.tabs[1].questions.push({id:'late',src:'새 문제'});
    const found=planningNewCards('2026-10-19','2026-10-25');`);
  assert.deepEqual(a.json('[...new Set(children.map(g=>g.startDate))]'),['2026-10-19','2026-10-26']);
  assert.deepEqual(a.json('found.map(r=>[r.ref.id,r.goalIds])'),[['late',[a.run('goal.id')]]]);
  assert.equal(a.run('children.reduce((sum,g)=>sum+g.targets.length,0)'),25);
  a.run(`const invalid=clonePlain(DATA); invalid.periodGoals.find(g=>g.parentGoalId).parentGoalId='missing';`);
  assert.throws(()=>a.run('validateImportedPlannerData(invalid)'),/상위 월간 목표/);
});

test('planning opens alongside the current card page and stays open through source navigation',()=>{
  const a=app();
  a.run(`location.hash='#/module/m'; APP.innerHTML='source-card-page'; openPlanningPage(); renderPlanningPage('week');`);
  assert.equal(a.run('location.hash'),'#/module/m');
  assert.equal(a.run('APP.innerHTML'),'source-card-page');
  assert.match(a.nodes.get('planningContent').innerHTML,/주간/);
  a.run(`location.hash='#/detail/a'; router(true);`);
  assert.equal(a.run('planningView()'),'week');
  a.run('closePlanningPage();');
  assert.equal(a.run('location.hash'),'#/detail/a');
  assert.equal(a.nodes.get('planningPanel').hidden,true);
});

test('legacy planning URLs replace their history entry so browser Back can leave the page',()=>{
  const a=app();
  a.run(`location.hash='#/plans/week'; const replaced=[];
    window.history={replaceState(state,title,url){replaced.push(url);location.hash=url;}};
    router(true);`);
  assert.deepEqual(a.json('replaced'),['#/']);
  assert.equal(a.run('location.hash'),'#/');
  assert.equal(a.run('planningView()'),'week');
});

test('period goals precede diary calendars while all empty and neighboring dates remain droppable',()=>{
  const a=app();
  a.run("renderPlanningPage('month');");
  const month=a.nodes.get('planningContent').innerHTML;
  assert.equal((month.match(/data-plan-date=/g)||[]).length,35);
  assert.match(month,/data-plan-date="2026-09-28"/);
  assert.match(month,/data-plan-date="2026-11-01"/);
  assert.ok(month.indexOf('기간 목표')<month.indexOf('planning-calendar'));
  a.run("renderPlanningPage('week');");
  assert.equal((a.nodes.get('planningContent').innerHTML.match(/data-plan-date=/g)||[]).length,7);
});

test('dropping a source card assigns it to the displayed period without duplicate goals or daily allocation',()=>{
  const a=app();
  assert.equal(a.run('typeof planningAssignPeriodGoal'),'function');
  a.run(`DATA.modules.m.tabs[0].questions[0].done=true;
    const sourceBefore=clonePlain(DATA.modules);
    const first=planningAssignPeriodGoal('week',{source:'main',type:'subject',id:'a',pid:'a'});`);
  assert.deepEqual(a.json('[first.goal.kind,first.goal.root,first.goal.startDate,first.goal.endDate]'),
    ['week',{type:'subject',id:'a'},'2026-10-12','2026-10-18']);
  assert.deepEqual(a.json('first.goal.weekdays'),[0,1,2,3,4,5,6]);
  assert.deepEqual(a.json('first.goal.targets.map(r=>r.id)'),['core','other','q2','loose']);
  assert.equal(a.run('first.created'),true);
  a.run(`first.goal.weekdays=[2];first.goal.targets=[];
    const repeated=planningAssignPeriodGoal('week',{source:'main',type:'subject',id:'a'});
    const monthly=planningAssignPeriodGoal('month',{source:'main',type:'subject',id:'a'});`);
  assert.equal(a.run('repeated.created'),false);
  assert.equal(a.run('repeated.goal.id'),a.run('first.goal.id'));
  assert.deepEqual(a.json('[first.goal.weekdays,first.goal.targets]'),[[2],[]]);
  assert.deepEqual(a.json('[monthly.goal.startDate,monthly.goal.endDate]'),['2026-10-01','2026-10-31']);
  assert.equal(a.run('DATA.periodGoals.length'),2);
  assert.deepEqual(a.json('DATA.dailyHistory'),{});
  assert.deepEqual(a.json('DATA.modules'),a.json('sourceBefore'));
  assert.doesNotThrow(()=>a.run('validateImportedPlannerData(unpackPlannerBackup(buildPlannerBackupEnvelope(DATA)).data)'));
});

test('period goal drops from existing plans preserve their placement and execution records',()=>{
  const a=app();
  assert.equal(a.run('typeof planningAssignPeriodGoal'),'function');
  a.run(`const plan=planningPlaceOnDate(VIEW_DATE,{source:'main',type:'question',id:'q1',pid:'m'});
    plan.startMinute=600;plan.endMinute=630;plan.time=60;
    DATA.dailyHistory[VIEW_DATE].sessions=[{id:'run',ref:{type:'question',id:'q1',pid:'m'},startMs:now-60000,endMs:now}];
    const before=clonePlain(DATA.dailyHistory);
    const assigned=planningAssignPeriodGoal('month',{source:'planning',planId:plan.planId,date:VIEW_DATE});
    const sidebarAssigned=planningAssignPeriodGoal('week',{source:'sidebar',date:VIEW_DATE,sIdx:0,cIdx:0});`);
  assert.deepEqual(a.json('assigned.goal.targets'),[{type:'question',id:'q1',pid:'m'}]);
  assert.deepEqual(a.json('sidebarAssigned.goal.root'),{type:'question',id:'q1',pid:'m'});
  assert.deepEqual(a.json('DATA.dailyHistory'),a.json('before'));
});

test('period goal drops ignore missing cards, stale plans and block edit mode',()=>{
  const a=app();
  assert.equal(a.run('typeof planningAssignPeriodGoal'),'function');
  a.run(`const plan=planningPlaceOnDate(VIEW_DATE,{source:'main',type:'question',id:'q1',pid:'m'});`);
  for(const [view,payload] of [
    ['day',{source:'main',type:'subject',id:'a'}],
    ['week',{source:'main',type:'detail',id:'missing',pid:'a'}],
    ['week',{source:'main',type:'adhoc',id:'local'}],
    ['month',{source:'planning',planId:'missing'}],
    ['month',{source:'slot',sIdx:0}],
    ['month',null]
  ]) assert.equal(a.run(`planningAssignPeriodGoal(${JSON.stringify(view)},${JSON.stringify(payload)})`),null);
  assert.equal(a.run("planningAssignPeriodGoal('month',{source:'planning',planId:plan.planId,date:'2026-10-18'})"),null);
  a.run('timelineAdding=true;');
  assert.equal(a.run("planningAssignPeriodGoal('week',{source:'main',type:'subject',id:'a'})"),null);
  assert.equal(a.run('DATA.periodGoals.length'),0);
});

test('calendar source drops add unscheduled plans and date moves preserve sessions and plan identity',()=>{
  const a=app();
  a.run(`DATA.dailyHistory[VIEW_DATE]={slots:[],sessions:[{id:'run',ref:{type:'question',id:'q1',pid:'m'},startMs:now-60000,endMs:now}],totalSeconds:60};
    const plan=planningPlaceOnDate(VIEW_DATE,{source:'main',type:'question',id:'q1',pid:'m'});
    plan.startMinute=600;plan.endMinute=630;plan.time=60;
    planningPlaceOnDate('2026-10-18',{source:'planning',planId:plan.planId,date:VIEW_DATE});`);
  assert.equal(a.run('planningPlans(VIEW_DATE).length'),0);
  assert.equal(a.run("planningPlans('2026-10-18')[0].ref.planId"),a.run('plan.planId'));
  assert.deepEqual(a.json('[plan.startMinute,plan.endMinute,plan.time]'),[600,630,0]);
  assert.equal(a.run('DATA.dailyHistory[VIEW_DATE].sessions.length'),1);
  a.run(`const fresh=planningPlaceOnDate('2026-10-18',{source:'main',type:'theory',id:'other',pid:'m'});`);
  assert.deepEqual(a.json('[fresh.startMinute,fresh.endMinute,fresh.time]'),[null,null,0]);
  assert.equal(a.run("planningPlaceOnDate('2026-10-19',{source:'main',type:'question',id:'missing',pid:'m'})"),null);
});

test('calendar plans can be dragged back onto the ten-minute timetable',()=>{
  const a=app();
  a.run(`const plan=planningPlaceOnDate('2026-10-18',{source:'main',type:'question',id:'q1',pid:'m'});
    timelineMinuteAt=()=>620;
    dropOnTimeline({preventDefault(){},stopPropagation(){},clientX:0,clientY:0,target:{closest:()=>null},dataTransfer:{getData:()=>JSON.stringify({source:'planning',planId:plan.planId,date:'2026-10-18'})}});`);
  assert.equal(a.run('planningPlans(VIEW_DATE)[0].ref.planId'),a.run('plan.planId'));
  assert.equal(a.run('plan.startMinute'),620);
  assert.equal(a.run("planningPlans('2026-10-18').length"),0);
});

test('direct sidebar date entry validates real dates and preserves the learning page',()=>{
  const a=app();
  a.run("location.hash='#/module/m'; setSidebarDate('2026-11-04');");
  assert.equal(a.run('VIEW_DATE'),'2026-11-04');
  assert.equal(a.run('location.hash'),'#/module/m');
  a.run("setSidebarDate('2026-02-30');");
  assert.equal(a.run('VIEW_DATE'),'2026-11-04');
});

test('keyboard date drafts survive intermediate years and commit on blur while picker changes apply immediately',()=>{
  const a=app();
  a.run(`const input=document.getElementById('navDateDisplay');
    planningDateKeydown({key:'2'},input);
    for(const value of ['0002-10-17','0020-10-17','0202-10-17','2027-10-17']){
      input.value=value; planningDateInput(input);
    }`);
  assert.equal(a.run('VIEW_DATE'),'2026-10-17');
  assert.equal(a.run('input.value'),'2027-10-17');
  a.run('planningDateInput(input,true);');
  assert.equal(a.run('VIEW_DATE'),'2027-10-17');
  a.run("input.value='2027-10-20'; planningDateInput(input);");
  assert.equal(a.run('VIEW_DATE'),'2027-10-20');
  a.run("input.value=''; planningDateInput(input,true);");
  assert.equal(a.run('input.value'),'2027-10-20');
});
