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
  assert.equal(a.run('migrated.schemaVersion'),6);
  assert.deepEqual(a.json('migrated.periodGoals'),[]);
  assert.ok(a.run('migrated.dailyHistory[VIEW_DATE].slots[0].cardIds[0].planId'));
  assert.deepEqual(a.json('migrated.dailyHistory[VIEW_DATE].sessions'),a.json('original.dailyHistory[VIEW_DATE].sessions'));
  a.run('delete migrated.dailyHistory[VIEW_DATE].slots[0].cardIds[0].planId');
  assert.deepEqual(a.json('migrated.dailyHistory'),a.json('original.dailyHistory'));
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

test('new-card allocation appends to a scheduled plan without moving its time or changing existing targets',()=>{
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
  assert.equal(a.run('scheduled.progressTargets.length'),6);
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

test('daily details expose assigned subgoals and completion changes the original card',()=>{
  const a=app();
  assert.equal(a.run('typeof renderPlanningPage'),'function');
  a.run(`const goal=planningCreateGoal({...config,endDate:VIEW_DATE}); planningApplyAllocation(planningBuildAllocation(goal.id));
    location.hash='#/plans/day'; renderPlanningPage('day'); const plan=planningPlans(VIEW_DATE)[0].ref;`);
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
  assert.equal(a.run('DATA.home.subjects[0].isRunning'),true);
  a.run(`plan.progressTargets=plan.progressTargets.filter(r=>r.id!=='q1');
    planningToggleDone(plan.planId,planningKey({type:'question',id:'q1',pid:'m'}),true);`);
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
  assert.equal(a.run('plan.id'),'topic');
  assert.deepEqual(a.json('selectedTimelineSubgoals(plan).map(r=>r.id).sort()'),['core','other','q1']);
  assert.deepEqual(a.json('[plan.startMinute,plan.endMinute]'),[540,600]);
  a.run(`DATA.modules.n.tabs[0].questions.push({id:'new-n',src:'새 기출'});
    const fresh=planningNewCards(VIEW_DATE,VIEW_DATE).find(r=>r.ref.id==='new-n');
    planningApplyAllocation(planningBuildAllocation(goal.id,[fresh.ref]));`);
  assert.equal(a.run('planningPlans(VIEW_DATE).length'),1);
  assert.equal(a.run('selectedTimelineSubgoals(plan).length'),4);
  a.run(`planningApplyCopy(planningCopyPreview(VIEW_DATE,['2026-10-18'],true)); planningDeleteGoal(goal.id);`);
  assert.equal(a.run('selectedTimelineSubgoals(plan).length'),4);
  assert.equal(a.run("selectedTimelineSubgoals(planningPlans('2026-10-18')[0].ref).length"),4);
  assert.doesNotThrow(()=>a.run('validateImportedPlannerData(unpackPlannerBackup(buildPlannerBackupEnvelope(DATA)).data)'));
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
