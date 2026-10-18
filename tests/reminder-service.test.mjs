import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import * as repo from '../src/electron/repository.mjs';
import {createTask,updateTask,setTaskStatus,archiveTask} from '../src/domain/model.mjs';
const due='2026-10-10T01:50:00.000Z';
function task(){return createTask({title:'截止提醒测试',plannedStart:'2026-10-10T02:00:00Z',plannedEnd:'2026-10-10T03:00:00Z',deadline:'2026-10-10T02:20:00Z',reminders:{startMinutes:10,deadlineMinutes:30}},'2026-10-10T00:00:00Z');}
async function setup(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'focus-reminders-test-'));try{assert.equal(typeof repo.ReminderService,'function');await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('durable event ledger deduplicates checks, restart and dismiss',()=>setup(async dir=>{
 const t=task(),batches=[];const s=new repo.ReminderService(dir,{now:()=>new Date(due),onNotify:e=>batches.push(e)});
 await s.load([t]);assert.equal(batches.length,1);assert.equal(batches[0].length,2);assert.equal(s.getInbox().length,2);
 await Promise.all([s.tick(),s.tick(),s.tick()]);assert.equal(batches.length,1);
 const saved=JSON.parse(await fs.readFile(path.join(dir,'reminders.json'),'utf8'));assert.equal(Object.keys(saved.sent).length,2);
 const reopened=new repo.ReminderService(dir,{now:()=>new Date(due),onNotify:e=>batches.push(e)});await reopened.load([t]);assert.equal(batches.length,1);assert.equal(reopened.getInbox().length,2);
 await reopened.dismiss(reopened.getInbox().map(e=>e.key));assert.equal(reopened.getInbox().length,0);
 const third=new repo.ReminderService(dir,{now:()=>new Date(due),onNotify:e=>batches.push(e)});await third.load([t]);assert.equal(third.getInbox().length,0);assert.equal(batches.length,1);
}));
test('done, archive, deletion and turning reminders off cancel pending reminders',()=>setup(async dir=>{
 for(const mode of ['done','archive','delete','off']){
  const t=task();const s=new repo.ReminderService(path.join(dir,mode),{now:()=>new Date(due)});await s.load([t]);assert.equal(s.getInbox().length,2);
  let tasks=[setTaskStatus(t,'done')];if(mode==='archive')tasks=[archiveTask(tasks[0])];if(mode==='delete')tasks=[];if(mode==='off')tasks=[updateTask(t,{reminders:{startMinutes:null,deadlineMinutes:null}})];
  await s.update(tasks);assert.equal(s.getInbox().length,0);
 }
}));
test('rescheduling withdraws old deadline, keeps independent start and waits for new time',()=>setup(async dir=>{
 const t=task();let clock=new Date(due);const batches=[];const s=new repo.ReminderService(dir,{now:()=>clock,onNotify:e=>batches.push(e)});await s.load([t]);
 const edited=updateTask(t,{deadline:'2026-10-10T04:00:00Z'});await s.update([edited]);assert.deepEqual(s.getInbox().map(e=>e.kind),['start']);
 clock=new Date('2026-10-10T03:30:00Z');await s.tick();assert.equal(batches.length,2);assert.equal(batches[1][0].kind,'deadline');
}));
test('native delivery failure leaves a persisted in-app popup; never loses tasks',()=>setup(async dir=>{
 const t=task();const errors=[];const s=new repo.ReminderService(dir,{now:()=>new Date(due),onNotify:()=>{throw new Error('通知权限未开启');},onError:e=>errors.push(e.message)});
 await s.load([t]);assert.equal(s.getInbox().length,2);assert.match(errors[0],/权限/);
 await assert.rejects(fs.access(path.join(dir,'tasks.json')));assert.equal((await fs.stat(path.join(dir,'reminders.json'))).mode&0o777,0o600);
}));
test('failed disk checkpoint does not pretend notification was sent',()=>setup(async dir=>{
 await fs.mkdir(path.join(dir,'reminders.json'));let delivered=0;
 const s=new repo.ReminderService(dir,{now:()=>new Date(due),onNotify:()=>delivered++});s.tasks=[task()];
 await assert.rejects(s.tick());assert.equal(delivered,0);assert.equal(s.getInbox().length,0);
}));
test('corrupt reminder ledger is preserved and does not alter task store',()=>setup(async dir=>{
 await fs.writeFile(path.join(dir,'reminders.json'),'{bad');await fs.writeFile(path.join(dir,'tasks.json'),'untouched');const errors=[];
 const s=new repo.ReminderService(dir,{now:()=>new Date(due),onError:e=>errors.push(e.message)});await s.load([]);
 assert.equal(await fs.readFile(path.join(dir,'tasks.json'),'utf8'),'untouched');assert.ok((await fs.readdir(dir)).some(n=>n.startsWith('reminders.corrupt-')));assert.ok(errors.length);assert.equal(JSON.parse(await fs.readFile(path.join(dir,'reminders.json'),'utf8')).version,1);
}));
