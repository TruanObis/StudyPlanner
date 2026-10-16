const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Run the shipped app, replacing browser I/O and the clock only.
function app(){
  const html=fs.readFileSync(path.join(__dirname,'../cpa_app_timetable_monthly_v2.html'),'utf8');
  const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n').replace(/\ninit\(\);\s*$/,'');
  const nodes=new Map(),storage=new Map(),listeners=new Map(),timeouts=new Map();
  let clock=0,nextTimer=1;
  function node(id){
    if(!nodes.has(id)){
      const classes=new Set();
      nodes.set(id,{id,style:{},dataset:{},value:'',innerHTML:'',hidden:true,isConnected:true,offsetWidth:180,offsetHeight:260,
        classList:{contains:v=>classes.has(v),add:(...vs)=>vs.forEach(v=>classes.add(v)),remove:(...vs)=>vs.forEach(v=>classes.delete(v)),toggle(v,on){if(on??!classes.has(v))classes.add(v);else classes.delete(v);}},
        getBoundingClientRect:()=>({left:50,top:100,right:230,bottom:140,width:180,height:40}),
        addEventListener(){},removeEventListener(){},setAttribute(k,v){this[k]=v;},focus(){},select(){},
        querySelectorAll:()=>[],querySelector:()=>null,closest:()=>null});
    }
    return nodes.get(id);
  }
  const location={hash:'#/',protocol:'file:',href:'file:///planner.html'};
  const context=vm.createContext({console,URL,URLSearchParams,Blob,Date,Map,Set,
    window:{location,addEventListener(){},innerWidth:1280,innerHeight:800,scrollY:0,scrollTo(){}},location,
    document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},documentElement:node('html'),body:node('body')},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    navigator:{},setTimeout:(fn,ms)=>{const id=nextTimer++;timeouts.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timeouts.delete(id),
    setInterval:()=>0,clearInterval(){},confirm:()=>true,alert(){}});
  vm.runInContext(script,context);
  const run=code=>vm.runInContext(code,context);
  run(`DATA=baseData(); VIEW_DATE='2026-10-17'; planningActiveView='week';
    const RealDate=Date; let now=RealDate.parse('2026-10-17T09:00:00+09:00');
    Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))} static now(){return now}};
    __lastTimerTickAt=now; __timerCarryMs=0; __timerDate=VIEW_DATE;
    DATA.home.subjects=[{id:'a',name:'경영학',time:60},{id:'b',name:'경제학',time:20}];
    DATA.details={a:{id:'a',title:'경영학',cards:[{id:'topic',title:'동기부여',module:'m'}]},b:{id:'b',title:'경제학',cards:[]}};
    DATA.modules={m:{id:'m',title:'동기부여',tabs:[{id:'core',label:'핵심이론',done:false,questions:[{id:'q1',src:'기출1',done:false}]}]}};
    DATA.dailyHistory={};
    const current=planningPlaceOnDate(VIEW_DATE,{source:'main',type:'subject',id:'b'});
    const later=planningPlaceOnDate('2026-10-18',{source:'main',type:'subject',id:'a'});
    later.startMinute=540;later.endMinute=600;later.time=60;
    DATA.dailyHistory['2026-10-18'].totalSeconds=60;
    DATA.dailyHistory['2026-10-18'].sessions=[{id:'record',ref:{type:'subject',id:'a'},startMs:now-60000,endMs:now}];
    renderWithScrollPreserved=()=>{}; renderDailySidebar=()=>{}; renderRouter=()=>{}; renderPlanningPage=()=>{};
    function pointer(type='touch',x=120,y=110,id=1){return {button:0,pointerId:id,pointerType:type,isPrimary:id===1,
      clientX:x,clientY:y,target:document.getElementById('calendarCard'),currentTarget:document.getElementById('calendarCard'),
      preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};}`);
  return {run,nodes,json:code=>JSON.parse(JSON.stringify(run(code))),
    advance(ms){clock+=ms;run(`now+=${ms}`);for(const [id,timer] of [...timeouts])if(timer.at<=clock){timeouts.delete(id);timer.fn();}},
    dispatch(type,code){const event=run(code);for(const fn of listeners.get(type)||[])fn(event);return event;}};
}

function calendarHandler(a,view,attribute){
  const html=a.run(`planningCalendarHTML('${view}',planningPeriodBounds('${view}'))`);
  const title='경영학 2026-10-18 계획 편집';
  const card=[...html.matchAll(/<button\b[^>]*>/g)].map(m=>m[0]).find(tag=>tag.includes(title));
  assert.ok(card,`${view} should show the scheduled card`);
  const value=new RegExp(`${attribute}="([^"]*)"`).exec(card)?.[1];
  assert.ok(value,`${attribute} should be available on ${view} calendar cards`);
  return value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
}

test('weekly and monthly card menus edit the selected plan date and time while preserving execution',()=>{
  for(const view of ['week','month']){
    const a=app();
    const handler=calendarHandler(a,view,'oncontextmenu');
    a.run(`planningActiveView='${view}';const beforeSessions=clonePlain(DATA.dailyHistory['2026-10-18'].sessions);const event=pointer('mouse');${handler}`);
    assert.equal(a.run('VIEW_DATE'),'2026-10-17');
    assert.equal(a.run('timelineMenuState.date'),'2026-10-18');
    assert.match(a.nodes.get('planningCalendarMenu').innerHTML,/날짜·시간/);
    assert.match(a.nodes.get('planningCalendarMenu').innerHTML,/원본 카드/);
    assert.match(a.nodes.get('planningCalendarMenu').innerHTML,/세부목표/);
    assert.match(a.nodes.get('planningCalendarMenu').innerHTML,/계획에서 제거/);
    a.run("timelineMenuAction('edit')");
    assert.equal(a.run('planningModalState.id'),a.run('later.planId'));
    a.run(`document.getElementById('planningEditDate').value='2026-10-19';
      document.getElementById('planningEditStart').value='620';
      document.getElementById('planningEditEnd').value='680';planningSaveEdit()`);
    assert.deepEqual(a.json('[planningFindPlan(later.planId).date,later.startMinute,later.endMinute]'),['2026-10-19',620,680]);
    assert.deepEqual(a.json("DATA.dailyHistory['2026-10-18'].sessions"),a.json('beforeSessions'));
    assert.equal(a.run("planningPlans('2026-10-17')[0].ref.planId"),a.run('current.planId'));
  }
});

test('calendar deletion follows the selected plan identity and preserves source cards and execution history',()=>{
  const a=app();
  const handler=calendarHandler(a,'week','oncontextmenu');
  a.run(`const beforeSource=clonePlain(DATA.home.subjects);const beforeSessions=clonePlain(DATA.dailyHistory['2026-10-18'].sessions);
    const event=pointer('mouse');${handler}
    const first=planningPlaceOnDate('2026-10-18',{source:'main',type:'subject',id:'b'});
    const cards=planningFindPlan(later.planId).slot.cardIds;cards.unshift(cards.pop());
    timelineMenuAction('delete');`);
  assert.equal(a.run('planningFindPlan(later.planId)'),null);
  assert.ok(a.run('planningFindPlan(first.planId)'));
  assert.ok(a.run('planningFindPlan(current.planId)'));
  assert.deepEqual(a.json('DATA.home.subjects'),a.json('beforeSource'));
  assert.deepEqual(a.json("DATA.dailyHistory['2026-10-18'].sessions"),a.json('beforeSessions'));
  assert.equal(a.run("DATA.dailyHistory['2026-10-18'].totalSeconds"),60);
});

test('calendar colors use the selected source color across dates and reset to its default',()=>{
  const a=app();
  const handler=calendarHandler(a,'month','oncontextmenu');
  a.run(`const event=pointer('mouse');${handler};setTimelineMenuColor(265);`);
  assert.equal(a.run("DATA.timelineColors['subject|a|']"),265);
  assert.equal(a.run("DATA.timelineColors['subject|b|']"),undefined);
  assert.match(a.run("planningCalendarHTML('month',planningPeriodBounds('month'))"),/265 65% 43%/);
  a.run(`${handler};setTimelineMenuColor(null);`);
  assert.equal(a.run("DATA.timelineColors['subject|a|']"),undefined);
});

test('touch hold opens a calendar menu and release never opens the edit dialog',()=>{
  const a=app();
  const down=calendarHandler(a,'week','onpointerdown');
  const click=calendarHandler(a,'week','onclick');
  a.run(`const event=pointer();${down}`);
  a.advance(500);
  assert.equal(a.run('timelineMenuState?.date'),'2026-10-18');
  a.advance(1500);
  a.dispatch('pointerup','pointer()');
  a.run(click);
  assert.equal(a.run('planningModalState'),null);
  assert.equal(a.run('getCardInfo(later).isRunning'),false);
  assert.deepEqual(a.json('[later.startMinute,later.endMinute]'),[540,600]);
});

test('calendar touch movement and cancellation cancel hold while a short tap still edits',()=>{
  for(const eventType of ['pointermove','pointercancel']){
    const a=app();
    const down=calendarHandler(a,'week','onpointerdown');
    a.run(`const event=pointer();${down}`);
    a.dispatch(eventType,eventType==='pointermove'?"pointer('touch',140,110)":'pointer()');
    a.advance(600);
    assert.equal(a.run('timelineMenuState'),null);
  }
  const a=app();
  const down=calendarHandler(a,'week','onpointerdown'),click=calendarHandler(a,'week','onclick');
  a.run(`const event=pointer();${down}`);
  a.advance(100);
  a.dispatch('pointerup','pointer()');
  a.run(click);
  assert.equal(a.run('planningModalState.id'),a.run('later.planId'));
});

test('dragging cancels pending calendar hold and keeps cross-date plan transfer data',()=>{
  const a=app();
  const down=calendarHandler(a,'week','onpointerdown');
  const drag=calendarHandler(a,'week','ondragstart');
  a.run(`const event=pointer();let payload;event.dataTransfer={setData(type,value){payload=JSON.parse(value);}};${down};${drag}`);
  a.advance(600);
  assert.equal(a.run('timelineMenuState'),null);
  assert.deepEqual(a.json('payload'),{source:'planning',planId:a.run('later.planId'),date:'2026-10-18'});
});

test('keyboard context-menu shortcut exposes the same calendar edit and delete actions',()=>{
  const a=app();
  const key=calendarHandler(a,'week','onkeydown');
  a.run(`const event={...pointer('keyboard'),key:'F10',shiftKey:true};${key}`);
  assert.equal(a.run('timelineMenuState?.date'),'2026-10-18');
  assert.match(a.nodes.get('planningCalendarMenu').innerHTML,/계획에서 제거/);
  assert.equal(a.run('event.prevented'),true);
});

test('calendar menus remain available when the narrow layout hides the timetable menu',()=>{
  const a=app();
  const handler=calendarHandler(a,'week','oncontextmenu');
  a.run(`const lookupElement=document.getElementById;document.getElementById=id=>id==='timelineMenu'?null:lookupElement(id);
    const event=pointer('mouse');${handler}`);
  assert.equal(a.nodes.get('planningCalendarMenu')?.hidden,false);
  assert.match(a.nodes.get('planningCalendarMenu').innerHTML,/날짜·시간/);
  a.run('closeTimelineMenu()');
  assert.equal(a.nodes.get('planningCalendarMenu').hidden,true);
});

test('a native touch context event does not cancel the pending calendar hold',()=>{
  const a=app();
  const down=calendarHandler(a,'week','onpointerdown'),context=calendarHandler(a,'week','oncontextmenu');
  a.run(`const event=pointer();${down}`);
  a.advance(300);
  a.run(context);
  a.advance(200);
  assert.equal(a.run('timelineMenuState?.date'),'2026-10-18');
  assert.equal(a.run('getCardInfo(later).isRunning'),false);
});

test('a fresh tap after a long press edits normally rather than being blocked by the previous release',()=>{
  const a=app();
  const down=calendarHandler(a,'week','onpointerdown'),click=calendarHandler(a,'week','onclick');
  a.run(`const event=pointer();${down}`);
  a.advance(500);
  a.dispatch('pointerup','pointer()');
  a.advance(1000);
  a.dispatch('pointerdown','pointer()');
  a.run(down);
  a.dispatch('pointerup','pointer()');
  a.run(click);
  assert.equal(a.run('planningModalState?.id'),a.run('later.planId'));
});

test('calendar context menus and hold cannot edit plans while time-block editing is active',()=>{
  for(const type of ['mouse','touch']){
    const a=app();
    const context=calendarHandler(a,'week','oncontextmenu'),down=calendarHandler(a,'week','onpointerdown');
    a.run(`timelineAdding=true;const event=pointer('${type}');${down};${context}`);
    a.advance(600);
    assert.equal(a.run('timelineMenuState'),null);
    assert.equal(a.run('getCardInfo(later).isRunning'),false);
  }
});
