import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/domain/model.mjs';
const now='2026-10-10T01:00:00.000Z';
const base={title:'培训方案',plannedStart:'2026-10-10T02:00:00.000Z',plannedEnd:'2026-10-10T03:00:00.000Z',deadline:'2026-10-10T05:00:00.000Z',reminders:{startMinutes:10,deadlineMinutes:30}};
const make=(patch={})=>model.createTask({...base,...patch},now);

test('deadline is optional and legacy snapshots migrate without enabling reminders',()=>{
 const old=model.createTask({title:'无时间的任务'},now);delete old.deadline;delete old.reminders;
 const t=model.validateSnapshot({version:1,tasks:[old]}).tasks[0];
 assert.equal(t.deadline,null);assert.deepEqual(t.reminders,{startMinutes:null,deadlineMinutes:null});assert.equal(t.id,old.id);
});
test('deadline-only task is valid without a planned time window',()=>{
 const t=make({plannedStart:null,plannedEnd:null});assert.equal(t.deadline,base.deadline);
 assert.equal(t.reminders.startMinutes,null);assert.equal(t.reminders.deadlineMinutes,30);
});
test('deadline is independent of timeline move and direct planned-date editing',()=>{
 const t=make();assert.equal(t.deadline,base.deadline);
 assert.equal(model.shiftTaskWindow(t,86400000).deadline,base.deadline);
 const moved=model.updateTask(t,{plannedEnd:'2026-10-11T10:00:00Z'});assert.equal(moved.deadline,base.deadline);
 assert.equal(moved.reminders.deadlineMinutes,30);
});
test('deadline can be cleared; its reminder is disabled',()=>{
 const t=model.updateTask(make(),{deadline:null});assert.equal(t.deadline,null);assert.equal(t.reminders.deadlineMinutes,null);assert.equal(t.reminders.startMinutes,10);
});
test('invalid deadline and reminder lead times rejected, zero minutes means at time',()=>{
 assert.throws(()=>make({deadline:'bad date'}),/时间/);
 for(const v of [-1,1.5,10081,NaN,'10',true])assert.throws(()=>make({reminders:{startMinutes:v,deadlineMinutes:null}}),/提醒/);
 const t=make({reminders:{startMinutes:0,deadlineMinutes:0}});assert.equal(t.reminders.deadlineMinutes,0);
});
test('past deadline is allowed without silently changing any date',()=>{
 const t=make({deadline:'2026-10-09T22:00:00Z'});assert.equal(t.deadline,'2026-10-09T22:00:00.000Z');
});
test('reminder candidates compute separate stable keys, timestamp and expiry',()=>{
 assert.equal(typeof model.reminderEvents,'function');
 const events=model.reminderEvents(make());assert.equal(events.length,2);
 assert.equal(events[0].kind,'start');assert.equal(events[0].dueAt,'2026-10-10T01:50:00.000Z');
 assert.equal(events[1].dueAt,'2026-10-10T04:30:00.000Z');assert.notEqual(events[0].key,events[1].key);
});
test('start notification only applies to todo; deadline also applies to ing',()=>{
 assert.equal(typeof model.reminderEvents,'function');
 assert.deepEqual(model.reminderEvents(make({status:'ing'})).map(e=>e.kind),['deadline']);
 assert.equal(model.reminderEvents(make({status:'done'})).length,0);
 assert.equal(model.reminderEvents(model.archiveTask(make({status:'done'}),now)).length,0);
});
test('reminders never fire early and deduplicate across repeat clock checks',()=>{
 assert.equal(typeof model.dueReminders,'function');
 const t=make();assert.equal(model.dueReminders([t],{},'2026-10-10T01:49:59Z').length,0);
 const [e]=model.dueReminders([t],{},'2026-10-10T01:50:00Z');assert.equal(e.kind,'start');
 assert.equal(model.dueReminders([t],{[e.key]:now},'2026-10-10T01:51:00Z').length,0);
});
test('catch up once after sleep; do not emit weeks-old reminders',()=>{
 assert.equal(typeof model.dueReminders,'function');
 const t=make();assert.equal(model.dueReminders([t],{},'2026-10-10T02:10:00Z')[0].kind,'start');
 assert.equal(model.dueReminders([t],{},'2026-10-10T02:16:00Z').length,0);
 assert.equal(model.dueReminders([t],{},'2026-10-11T04:00:00Z')[0].kind,'deadline');
 assert.equal(model.dueReminders([t],{},'2026-10-12T06:00:00Z').length,0);
});
test('changing deadline invalidates previous event and generates a new event key',()=>{
 assert.equal(typeof model.reminderEvents,'function');
 const t=make();const old=model.reminderEvents(t).find(e=>e.kind==='deadline');
 const updated=model.updateTask(t,{deadline:'2026-10-10T06:00:00Z'});const next=model.reminderEvents(updated).find(e=>e.kind==='deadline');
 assert.notEqual(old.key,next.key);
});
test('snapshot roundtrip preserves optional deadline and both reminder settings',()=>{
 const t=make();const s=model.validateSnapshot(JSON.parse(JSON.stringify({version:1,tasks:[t]})));
 assert.equal(s.tasks[0].deadline,base.deadline);assert.deepEqual(s.tasks[0].reminders,base.reminders);
});
