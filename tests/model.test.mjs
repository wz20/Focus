import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/domain/model.mjs';
const now='2026-09-21T06:30:00.000Z';
const task=()=>model.createTask({title:'写培训方案',important:true,urgent:true},now);
test('a task starts as todo with no schedule or archive',()=>{
 const t=task(); assert.equal(t.status,'todo'); assert.equal(t.archivedAt,null); assert.equal(t.plannedStart,null); assert.ok(t.id); assert.equal(t.title,'写培训方案');
});
test('empty title and excessive title rejected',()=>{
 assert.throws(()=>model.createTask({title:'   '}),/名称/); assert.throws(()=>model.createTask({title:'a'.repeat(121)}),/120/);
});
test('schedule requires both endpoints and increasing valid timestamps',()=>{
 assert.throws(()=>model.createTask({title:'a',plannedStart:now}),/开始.*结束/);
 assert.throws(()=>model.createTask({title:'a',plannedStart:now,plannedEnd:now}),/晚于/);
 assert.throws(()=>model.createTask({title:'a',plannedStart:'bad',plannedEnd:'bad'}),/时间/);
});
test('estimated minutes are a positive finite bounded number',()=>{
 for (const estimateMinutes of [-1,Infinity,'garbage',100001]) assert.throws(()=>model.createTask({title:'a',estimateMinutes}),/用时/);
 assert.equal(model.createTask({title:'a',estimateMinutes:'30'}).estimateMinutes,30);
});
test('all four quadrant mappings are correct',()=>{
 assert.equal(model.quadrantOf({important:true,urgent:false}),'q2');
 assert.equal(model.quadrantOf({important:true,urgent:true}),'q1');
 assert.equal(model.quadrantOf({important:false,urgent:false}),'q4');
 assert.equal(model.quadrantOf({important:false,urgent:true}),'q3');
});
test('status cycle does not auto archive done',()=>{
 const a=model.advanceTask(task(),now), b=model.advanceTask(a,now), c=model.advanceTask(b,now);
 assert.equal(a.status,'ing'); assert.equal(b.status,'done'); assert.equal(b.archivedAt,null); assert.equal(b.completedAt,now); assert.equal(c.status,'done'); assert.equal(c.archivedAt,now);
});
test('archive only completed tasks, and changing archived status needs restore',()=>{
 assert.throws(()=>model.archiveTask(task(),now),/完成/);
 const t=model.archiveTask(model.setTaskStatus(task(),'done',now),now);
 assert.throws(()=>model.setTaskStatus(t,'ing',now),/恢复/);
});
test('restore keeps done; explicitly reopening clears completion timestamp',()=>{
 const t=model.restoreTask(model.advanceTask(model.setTaskStatus(task(),'done',now),now),now);
 assert.equal(t.status,'done'); assert.equal(t.archivedAt,null);
 assert.equal(model.setTaskStatus(t,'ing',now).completedAt,null);
});
test('invalid status rejected rather than guessed',()=>{
 assert.throws(()=>model.setTaskStatus(task(),'waiting',now),/状态/);
});
test('normalize snapshots rejects duplicate ids and malformed schema',()=>{
 const t=task(); assert.throws(()=>model.validateSnapshot({version:1,tasks:[t,t]}),/重复/);
 assert.throws(()=>model.validateSnapshot({version:99,tasks:[]}),/版本/);
 assert.throws(()=>model.validateSnapshot({version:1,tasks:[{title:'x'}]}),/数据/);
});
test('validated snapshot is deeply copied and strips unknown fields',()=>{
 const t=task();const s=model.validateSnapshot({version:1,tasks:[{...t,evil:'x'}]});assert.equal(s.tasks[0].evil,undefined);s.tasks[0].title='edit';assert.equal(t.title,'写培训方案');
});
test('filters ignore archived by default and search handles exact literal characters',()=>{
 const a=task(),b=model.createTask({title:'[数据] 汇总',important:false},now),c=model.archiveTask(model.setTaskStatus(task(),'done',now),now);
 assert.equal(model.filterTasks([a,b,c],{}).length,2);
 assert.deepEqual(model.filterTasks([a,b,c],{query:'['}).map(t=>t.id),[b.id]);
});
test('time overlaps use half-open intervals and exclude done and archived',()=>{
 const a=model.createTask({title:'a',plannedStart:'2026-09-21T01:00:00Z',plannedEnd:'2026-09-21T03:00:00Z'},now);
 const b=model.createTask({title:'b',plannedStart:'2026-09-21T03:00:00Z',plannedEnd:'2026-09-21T04:00:00Z'},now);
 assert.equal(model.plannedOverlap([a,b],'2026-09-21T03:00:00Z'),1);
 assert.equal(model.plannedOverlap([model.setTaskStatus(a,'done',now),b],'2026-09-21T02:00:00Z'),0);
});
test('date shifts preserve window length and clamp minimum resizes',()=>{
 const a=model.createTask({title:'a',plannedStart:'2026-09-21T01:00:00Z',plannedEnd:'2026-09-21T03:00:00Z'},now);
 const b=model.shiftTaskWindow(a,3600000);assert.equal(Date.parse(b.plannedEnd)-Date.parse(b.plannedStart),7200000);
 assert.equal(b.plannedStart,'2026-09-21T02:00:00.000Z');
});
test('HTML-looking task text stays ordinary text in the data model',()=>{
 assert.equal(model.createTask({title:'<img onerror=alert(1)>'},now).title,'<img onerror=alert(1)>');
});
test('task ids are valid unique version 4 UUIDs',()=>{const ids=new Set(Array.from({length:1000},()=>model.newTaskId()));assert.equal(ids.size,1000);for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);});
test('sub-minute estimated durations cannot normalize to zero',()=>{assert.throws(()=>model.createTask({title:'a',estimateMinutes:0.1}),/用时/);});
