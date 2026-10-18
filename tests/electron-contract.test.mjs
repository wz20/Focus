import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import fsp from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
const actualRequire=createRequire(import.meta.url);
test('first launch creates its private data directory before configuring Electron',async()=>{
 const parent=await fsp.mkdtemp(path.join(os.tmpdir(),'focus-bootstrap-test-'));
 try{
  let configured;
  const app={setName(){},getPath(){return parent;},setPath(_key,value){assert.ok(fs.existsSync(value),'directory must exist before app.setPath');configured=value;},requestSingleInstanceLock(){return true;},on(){},whenReady(){return {then(){return{catch(){}};}};}};
  const mock={app,protocol:{registerSchemesAsPrivileged(){}},BrowserWindow:class{},Menu:{},ipcMain:{},session:{},dialog:{},shell:{}};
  const source=await fsp.readFile('src/electron/main.cjs','utf8');
  vm.runInNewContext(source,{require:n=>n==='electron'?mock:actualRequire(n),__dirname:path.resolve('src/electron'),process:{platform:'darwin',argv:[]},console,URL,setTimeout,clearTimeout});
  assert.equal(configured,path.join(parent,'Focus'));
  assert.equal(fs.statSync(configured).mode&0o777,0o700);
 }finally{await fsp.rm(parent,{recursive:true,force:true});}
});
test('renderer receives only a small whitelisted bridge, not raw Electron or Node access',async()=>{
 let bridge,namespace;const invoked=[];
 const mock={contextBridge:{exposeInMainWorld(n,v){namespace=n;bridge=v;}},ipcRenderer:{invoke:(...args)=>{invoked.push(args);return Promise.resolve({});},on(){},removeListener(){}}};
 const source=await fsp.readFile('src/electron/preload.cjs','utf8');
 vm.runInNewContext(source,{require:n=>{assert.equal(n,'electron');return mock;},process:{platform:'darwin'}});
 assert.equal(namespace,'focusNative');
 assert.deepEqual(Object.keys(bridge).sort(),['platform','load','save','exportData','importData','revealData','onAction','getReminders','dismissReminders','testReminder'].sort());
 await bridge.load();assert.equal(invoked[0][0],'focus:load');
 assert.equal(bridge.require,undefined);assert.equal(bridge.ipcRenderer,undefined);
});
