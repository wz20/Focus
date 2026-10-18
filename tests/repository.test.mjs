import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import { Repository } from '../src/electron/repository.mjs';import {createTask} from '../src/domain/model.mjs';
async function setup(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'focus-test-'));return {dir,repo:new Repository(dir)};}
test('new install creates an empty store, not fake personal tasks',async()=>{const {dir,repo}=await setup();try{const v=await repo.load();assert.deepEqual(v.snapshot,{version:1,tasks:[]});assert.equal(v.warning,null);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('snapshot survives file roundtrip',async()=>{const {dir,repo}=await setup();try{const snapshot={version:1,tasks:[createTask({title:'保存内容'})]};await repo.save(snapshot);const value=await repo.load();assert.deepEqual(value.snapshot,snapshot);}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('invalid save cannot overwrite existing data',async()=>{const {dir,repo}=await setup();try{await repo.save({version:1,tasks:[createTask({title:'safe'})]});await assert.rejects(repo.save({version:55,tasks:[]}));assert.equal((await repo.load()).snapshot.tasks[0].title,'safe');}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('corrupt main file recovers valid backup with visible warning',async()=>{const {dir,repo}=await setup();try{const a={version:1,tasks:[createTask({title:'backup'})]};await repo.save(a);await repo.save({version:1,tasks:[createTask({title:'new'})]});await fs.writeFile(path.join(dir,'tasks.json'),'broken');const v=await repo.load();assert.equal(v.snapshot.tasks[0].title,'backup');assert.ok(v.warning);assert.ok((await fs.readdir(dir)).some(x=>x.startsWith('tasks.corrupt-')));}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('unrecoverable corruption is not silently reset',async()=>{const {dir,repo}=await setup();try{await fs.writeFile(path.join(dir,'tasks.json'),'broken');await assert.rejects(repo.load(),/损坏/);assert.equal(await fs.readFile(path.join(dir,'tasks.json'),'utf8'),'broken');}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('concurrent saves are serialized and last write wins',async()=>{const {dir,repo}=await setup();try{await Promise.all(Array.from({length:20},(_,i)=>repo.save({version:1,tasks:[createTask({title:String(i)})]})));assert.equal((await repo.load()).snapshot.tasks[0].title,'19');}finally{await fs.rm(dir,{recursive:true,force:true});}});
test('file permissions protect data from other local users',async()=>{const {dir,repo}=await setup();try{await repo.save({version:1,tasks:[]});const stat=await fs.stat(path.join(dir,'tasks.json'));assert.equal(stat.mode&0o777,0o600);}finally{await fs.rm(dir,{recursive:true,force:true});}});

test('explicit backup import preserves unreadable original and opens recovered workspace',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'focus-recover-test-'));
 try{
  const repo=new Repository(directory);await fs.writeFile(repo.file,'not json');
  const snapshot={version:1,tasks:[createTask({title:'Recovered'})]};
  await repo.importSnapshot(snapshot);
  assert.equal((await repo.load()).snapshot.tasks[0].title,'Recovered');
  const saved=(await fs.readdir(directory)).filter(n=>n.startsWith('tasks.before-import-'));
  assert.equal(saved.length,1);assert.equal(await fs.readFile(path.join(directory,saved[0]),'utf8'),'not json');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
