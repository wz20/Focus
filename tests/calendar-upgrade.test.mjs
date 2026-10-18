import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {Repository,ReminderService} from '../src/electron/repository.mjs';
import {createTask,setTaskStatus,archiveTask,reminderEvents,validateSnapshot} from '../src/domain/model.mjs';
import {TaskStore} from '../src/domain/store.mjs';
import {calendarMonth,calendarEntries} from '../src/domain/time.mjs';
const root=new URL('../',import.meta.url),hash=data=>createHash('sha256').update(data).digest('hex');
const now=new Date('2026-10-13T08:00:00.000Z');
function previousSnapshot(){
 const tasks=Array.from({length:1000},(_,i)=>createTask({title:`旧版任务 ${i}`,notes:'原有备注\n不修改内容 😀',important:i%2===0,urgent:i%3===0,plannedStart:'2026-10-13T09:00:00.000Z',plannedEnd:'2026-10-16T10:00:00.000Z',deadline:'2026-10-18T10:00:00.000Z',reminders:{startMinutes:10,deadlineMinutes:30},estimateMinutes:90},'2026-10-10T00:00:00.000Z'));
 tasks[0]=setTaskStatus(tasks[0],'ing',now);tasks[1]=setTaskStatus(tasks[1],'done',now);tasks[2]=archiveTask(setTaskStatus(tasks[2],'done',now),now);
 return {version:1,tasks};
}
test('persistence and schema match v0.1.3 bytewise; production native code preserves baseline; smoke cleanup belongs to builder',async()=>{
 const checks=JSON.parse(await fs.readFile(new URL('tests/fixtures/pre-calendar-code-hashes.json',root),'utf8'));
 for(const [f,want]of Object.entries(checks)){let bytes=await fs.readFile(new URL(f,root));if(f==='src/electron/main.cjs')bytes=Buffer.from(bytes.toString().replace("windowRef.destroy();app.exit(0);","windowRef.destroy();await fs.rm(smokeDirectory,{recursive:true,force:true});app.exit(0);").replace("applicationVersion:'0.1.4',version:'0.1.4'","applicationVersion:'0.1.3',version:'0.1.3'"));assert.equal(hash(bytes),want,f);}
 const main=await fs.readFile(new URL('src/electron/main.cjs',root),'utf8');assert.match(main,/app\.setName\('Focus'\)/);assert.match(main,/app\.getPath\('appData'\),\s*'Focus'/);
 const build=await fs.readFile(new URL('scripts/build-mac.sh',root),'utf8');assert.match(build,/com\.focuslocal\.desktop/);
});
test('loading 1000 old tasks, viewing all months and restarting performs no disk mutation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'focus-calendar-upgrade-'));
 try{
 const original=previousSnapshot(),text=JSON.stringify(original,null,2);
 await fs.writeFile(path.join(dir,'tasks.json'),text);await fs.writeFile(path.join(dir,'tasks.backup.json'),text);
 const before=hash(text),repo=new Repository(dir),{snapshot}=await repo.load(),store=new TaskStore(snapshot);
 let saves=0;store.subscribe(()=>saves++);
 for(let i=0;i<24;i++)calendarEntries(store.tasks,calendarMonth(new Date(2026,i,1)));
 assert.equal(saves,0);assert.deepEqual(store.snapshot,original);
 assert.equal(hash(await fs.readFile(path.join(dir,'tasks.json'))),before);assert.equal(hash(await fs.readFile(path.join(dir,'tasks.backup.json'))),before);
 assert.deepEqual((await new Repository(dir).load()).snapshot,original);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('first explicit save after upgrade preserves every existing task field and backup',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'focus-calendar-save-'));
 try{
 const original=previousSnapshot(),old=JSON.stringify(original);
 await fs.writeFile(path.join(dir,'tasks.json'),old);
 const repo=new Repository(dir),store=new TaskStore((await repo.load()).snapshot);
 store.create({title:'仅新增这一条',plannedStart:'2026-10-20T01:00:00.000Z',plannedEnd:'2026-10-20T02:00:00.000Z'});
 await repo.save(store.snapshot);
 const read=(await new Repository(dir).load()).snapshot;
 assert.equal(read.tasks.length,1001);assert.deepEqual(read.tasks.slice(0,1000),original.tasks);
 assert.equal(await fs.readFile(path.join(dir,'tasks.backup.json'),'utf8'),old);
 assert.deepEqual(validateSnapshot(read),read);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('recent reminder ledger loads without resetting notification deduplication',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'focus-calendar-reminder-'));
 try{
 const task=createTask({title:'旧版已发出的提醒',deadline:'2026-10-13T08:10:00.000Z',reminders:{deadlineMinutes:30}},'2026-10-10T00:00:00Z');
 const key=reminderEvents(task)[0].key,state={version:1,sent:{[key]:+now-60000},inbox:[key]};const bytes=JSON.stringify(state);
 await fs.writeFile(path.join(dir,'reminders.json'),bytes);let notices=0;
 const service=new ReminderService(dir,{now:()=>now,onNotify:()=>notices++});await service.load([task]);await service.flush();
 assert.equal(notices,0);assert.equal(service.getInbox()[0].taskId,task.id);assert.equal(await fs.readFile(path.join(dir,'reminders.json'),'utf8'),bytes);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
