import test from 'node:test';
import assert from 'node:assert/strict';
import * as time from '../src/domain/time.mjs';
import {createTask, archiveTask, setTaskStatus} from '../src/domain/model.mjs';
const anchor=new Date(2026,9,12,12);
const stamp=(day,h=9,m=0)=>new Date(2026,9,day,h,m).toISOString();
const fixture=(v={})=>createTask({title:'日历任务',...v},stamp(1));
test('calendar projection API exists before UI is wired',()=>{
 for(const name of ['calendarMonth','calendarDateKey','calendarEntries','calendarDayInfo','calendarTaskDefaults','calendarEntryLabel','calendarMonthNote'])assert.equal(typeof time[name],'function',name);
});
test('October 2026 is five Monday-first weeks, with three leading blanks',()=>{
 const month=time.calendarMonth(anchor);
 assert.equal(month.cells.length,35);assert.equal(month.weeks,5);
 assert.equal(month.cells[0].key,'2026-09-28');assert.equal(month.cells[0].inMonth,false);
 assert.equal(month.cells[3].key,'2026-10-01');assert.equal(month.cells.at(-1).key,'2026-11-01');
 assert.equal(month.cells.filter(c=>c.inMonth).length,31);
});
test('leap February, short months and six-row months have correct cells',()=>{
 assert.equal(time.calendarMonth(new Date(2028,1,20)).cells.filter(c=>c.inMonth).length,29);
 assert.equal(time.calendarMonth(new Date(2021,1,10)).cells.length,28);
 assert.equal(time.calendarMonth(new Date(2026,7,10)).cells.length,42);
});
test('year navigation does not overflow a 31st into the following month',()=>{
 const next=time.navigateRange(new Date(2026,11,31),'month',1);
 assert.equal(time.calendarDateKey(next),'2027-01-01');
});
test('holiday and make-up days override ordinary weekend classification',()=>{
 assert.deepEqual(time.calendarDayInfo('2026-10-01'),{kind:'holiday',label:'国庆节 · 休'});
 assert.deepEqual(time.calendarDayInfo('2026-10-10'),{kind:'makeup',label:'补班 · 上班'});
 assert.equal(time.calendarDayInfo('2026-10-11').kind,'weekend');
 assert.equal(time.calendarDayInfo('2026-10-12').kind,'workday');
 assert.equal(time.calendarDayInfo('2026-09-20').kind,'makeup');
 assert.equal(time.calendarDayInfo('2026-02-15').kind,'holiday');
 assert.equal(time.calendarDayInfo('2027-10-01').kind,'workday');
 assert.match(time.calendarMonthNote(new Date(2027,9,1)),/仅标注周末/);
});
test('planning span is start inclusive, end exclusive including exactly midnight',()=>{
 const task=fixture({plannedStart:stamp(8),plannedEnd:stamp(10,0)});
 const entries=time.calendarEntries([task],time.calendarMonth(anchor));
 assert.equal(entries.get('2026-10-08').length,1);assert.equal(entries.get('2026-10-09').length,1);
 assert.equal(entries.get('2026-10-10').length,0);
 assert.equal(entries.get('2026-10-09')[0].continued,true);
});
test('only a deadline still appears; a same-day plan + deadline is one entry',()=>{
 const a=fixture({deadline:stamp(13,18)}),b=fixture({plannedStart:stamp(14),plannedEnd:stamp(14,11),deadline:stamp(14,18)});
 const entries=time.calendarEntries([a,b],time.calendarMonth(anchor));
 assert.equal(entries.get('2026-10-13')[0].deadline,true);assert.equal(entries.get('2026-10-13')[0].planned,false);
 assert.equal(entries.get('2026-10-14').length,1);assert.equal(entries.get('2026-10-14')[0].deadline,true);
 assert.match(time.calendarEntryLabel(entries.get('2026-10-14')[0]),/截止/);
});
test('deadline on a different date is a second dated occurrence of the same task ID',()=>{
 const task=fixture({plannedStart:stamp(8),plannedEnd:stamp(8,10),deadline:stamp(12,18)});
 const entries=time.calendarEntries([task],time.calendarMonth(anchor));
 assert.equal(entries.get('2026-10-12')[0].task.id,task.id);assert.equal(entries.get('2026-10-12')[0].planned,false);
 assert.equal(entries.get('2026-10-08')[0].deadline,false);
});
test('done remains visible; archived and fully unscheduled tasks are never placed arbitrarily',()=>{
 const done=setTaskStatus(fixture({deadline:stamp(8)}),'done',stamp(8));
 const archived=archiveTask(setTaskStatus(fixture({deadline:stamp(9)}),'done',stamp(9)),stamp(9));
 const entries=time.calendarEntries([done,archived,fixture()],time.calendarMonth(anchor));
 assert.equal([...entries.values()].flat().length,1);assert.equal(entries.get('2026-10-08')[0].task.status,'done');
});
test('projection and reading all months never mutate any task or reminder settings',()=>{
 const tasks=[fixture({plannedStart:stamp(8),plannedEnd:stamp(9),deadline:stamp(12,18),notes:'完整备注',reminders:{startMinutes:10,deadlineMinutes:30}})];
 const before=JSON.stringify(tasks);Object.freeze(tasks[0].reminders);Object.freeze(tasks[0]);Object.freeze(tasks);
 for(let i=0;i<12;i++)time.calendarEntries(tasks,time.calendarMonth(new Date(2026,i,1)));
 assert.equal(JSON.stringify(tasks),before);
});
test('day defaults are only form suggestions, with optional deadline unchanged/absent',()=>{
 const values=time.calendarTaskDefaults('2026-10-13');
 assert.equal(new Date(values.plannedStart).getHours(),9);assert.equal(new Date(values.plannedEnd).getHours(),10);
 assert.equal(time.calendarDateKey(new Date(values.plannedStart)),'2026-10-13');
 assert.equal(values.deadline,undefined);
 assert.throws(()=>time.calendarTaskDefaults('2026-02-31'),/日期/);
});
test('overflow supports dozens and thousands of same-day tasks without loss or duplication',()=>{
 const tasks=Array.from({length:1800},(_,i)=>fixture({title:`任务${i}`,plannedStart:stamp(12,9),plannedEnd:stamp(12,10)}));
 const rows=time.calendarEntries(tasks,time.calendarMonth(anchor)).get('2026-10-12');
 assert.equal(rows.length,1800);assert.equal(new Set(rows.map(e=>e.task.id)).size,1800);
});
test('cross-month and long spans are clipped to the displayed month',()=>{
 const t=fixture({plannedStart:new Date(2020,0,1).toISOString(),plannedEnd:new Date(2030,0,1).toISOString()});
 const rows=time.calendarEntries([t],time.calendarMonth(anchor));
 assert.equal([...rows.values()].flat().length,31);assert.equal(rows.has('2026-09-28'),false);
});
test('calendar local-day boundaries follow DST rather than 24h millisecond arithmetic',()=>{
 const old=process.env.TZ;process.env.TZ='America/New_York';
 try{
 const month=time.calendarMonth(new Date(2026,10,1));
 const c=month.cells.find(c=>c.key==='2026-11-01');assert.equal((c.end-c.date)/3600000,25);
 const t=fixture({plannedStart:new Date(2026,10,1,0).toISOString(),plannedEnd:new Date(2026,10,2,0).toISOString()});
 const rows=time.calendarEntries([t],month);assert.equal(rows.get('2026-11-01').length,1);assert.equal(rows.get('2026-11-02').length,0);
 }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
