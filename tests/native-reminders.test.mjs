import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {EventEmitter} from 'node:events';import {createRequire} from 'node:module';
import {createTask,setTaskStatus} from '../src/domain/model.mjs';
const realRequire=createRequire(import.meta.url);
async function boot(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'focus-main-test-'));
 const handlers=new Map(),notices=[],sent=[],intervals=[],windows=[];const powerMonitor=new EventEmitter();let ready;
 class Web extends EventEmitter{constructor(){super();this.id=7;}setWindowOpenHandler(){}send(c,v){sent.push([c,v]);}executeJavaScript(){return Promise.resolve(true);}}
 class Window extends EventEmitter{constructor(){super();this.webContents=new Web();windows.push(this);this.focused=false;this.shown=false;}loadURL(){this.emit('ready-to-show');return Promise.resolve();}isFocused(){return this.focused;}isMinimized(){return false;}isDestroyed(){return false;}show(){this.shown=true;}focus(){this.focused=true;}restore(){}close(){this.emit('closed');}}
 class Notice extends EventEmitter{static isSupported(){return true;}constructor(options){super();this.options=options;notices.push(this);}show(){this.emit('show');}close(){this.closed=true;this.emit('close');}}
 const app=new EventEmitter();Object.assign(app,{isPackaged:true,setName(){},getPath:k=>k==='userData'?path.join(dir,'Focus'):dir,setPath(){},requestSingleInstanceLock:()=>true,setAboutPanelOptions(){},quit(){},whenReady:()=>({then:cb=>{ready=Promise.resolve().then(cb);return ready;}})});
 const electron={app,BrowserWindow:Window,Notification:Notice,powerMonitor,Menu:{buildFromTemplate:t=>t,setApplicationMenu(){}},protocol:{registerSchemesAsPrivileged(){},handle(){}},session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}}}},ipcMain:{handle:(k,fn)=>handlers.set(k,fn)},dialog:{showErrorBox:()=>{}},shell:{openPath:()=>Promise.resolve()}};
 try{
  const code=await fs.readFile('src/electron/main.cjs','utf8');
  new Function('require','__dirname','process','setInterval','clearInterval',code)(n=>n==='electron'?electron:realRequire(n),path.resolve('src/electron'),{platform:'darwin',argv:[],env:{}},fn=>{intervals.push(fn);return{unref(){}};},()=>{});
  await ready;
  const event={sender:{id:7},senderFrame:{url:'focus://app/index.html'}};
  await fn({handlers,notices,sent,windows,powerMonitor,event,dir,intervals,Notice});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
function dueTask(){const now=Date.now();return createTask({title:'真正的任务提醒',deadline:new Date(now+20*60000).toISOString(),reminders:{deadlineMinutes:30,startMinutes:null}});}
test('main process schedules reminders and exposes protected inbox IPC',()=>boot(async c=>{
 assert.ok(c.handlers.has('focus:reminders'));assert.ok(c.handlers.has('focus:dismiss-reminders'));assert.ok(c.handlers.has('focus:test-reminder'));
 const t=dueTask();await c.handlers.get('focus:save')(c.event,{version:1,tasks:[t]});
 const inbox=await c.handlers.get('focus:reminders')(c.event);assert.equal(inbox.items.length,1);assert.equal(inbox.items[0].taskId,t.id);
 assert.equal(c.notices.length,1);assert.match(c.notices[0].options.body,/真正的任务提醒/);assert.ok(c.intervals.length>0);assert.ok(c.powerMonitor.listenerCount('resume')>0);
 await assert.rejects(c.handlers.get('focus:reminders')({sender:{id:99},senderFrame:{url:'https://evil.example'}}),/不受信任/);
 await c.handlers.get('focus:dismiss-reminders')(c.event,[inbox.items[0].key]);assert.equal(c.notices[0].closed,true);
}));
test('notification click opens the correct task and completed task cancels alerts',()=>boot(async c=>{
 assert.ok(c.handlers.has('focus:reminders'));
 const t=dueTask();await c.handlers.get('focus:save')(c.event,{version:1,tasks:[t]});
 c.notices[0].emit('click');await new Promise(r=>setImmediate(r));assert.ok(c.windows[0].shown);assert.ok(c.sent.some(([,a])=>a.type==='open-task'&&a.taskId===t.id));
 await c.handlers.get('focus:save')(c.event,{version:1,tasks:[setTaskStatus(t,'done')]});assert.equal((await c.handlers.get('focus:reminders')(c.event)).items.length,0);
 assert.ok(c.notices[0].closed);
}));
test('native test reminder reports display acknowledgement and does not create a task',()=>boot(async c=>{
 assert.ok(c.handlers.has('focus:test-reminder'));
 const result=await c.handlers.get('focus:test-reminder')(c.event);assert.equal(result.system,'shown');
 assert.ok(c.sent.some(([,a])=>a.type==='reminder-test'));assert.equal((await c.handlers.get('focus:load')(c.event)).snapshot.tasks.length,0);
}));

test('scheduled background reminder still fires after the Mac window is closed',()=>boot(async c=>{
 const t=createTask({title:'关闭窗口仍提醒',deadline:new Date(Date.now()+150).toISOString(),reminders:{deadlineMinutes:0}});
 await c.handlers.get('focus:save')(c.event,{version:1,tasks:[t]});assert.equal(c.notices.length,0);
 c.windows[0].close();await new Promise(r=>setTimeout(r,170));c.intervals[0]();await new Promise(r=>setTimeout(r,40));
 assert.equal(c.notices.length,1);assert.match(c.notices[0].options.body,/关闭窗口仍提醒/);
}));
test('foreground reminder uses in-app popup without a duplicate system alert',()=>boot(async c=>{
 c.windows[0].focus();await c.handlers.get('focus:save')(c.event,{version:1,tasks:[dueTask()]});
 assert.equal(c.notices.length,0);assert.ok(c.sent.some(([,a])=>a.type==='reminders'&&a.items.length===1));
}));
test('OS notification failure exposes a warning while retaining persistent reminder',()=>boot(async c=>{
 c.Notice.prototype.show=function(){this.emit('failed',{},'denied');};
 await c.handlers.get('focus:save')(c.event,{version:1,tasks:[dueTask()]});
 const inbox=await c.handlers.get('focus:reminders')(c.event);assert.equal(inbox.items.length,1);assert.match(inbox.warning,/系统通知未送达/);
}));
test('a grouped system alert is withdrawn when any included task is completed',()=>boot(async c=>{
 const a=dueTask(),b=dueTask();b.title='另一个未完成任务';
 await c.handlers.get('focus:save')(c.event,{version:1,tasks:[a,b]});assert.equal(c.notices.length,1);
 await c.handlers.get('focus:save')(c.event,{version:1,tasks:[setTaskStatus(a,'done'),b]});
 assert.equal(c.notices[0].closed,true);assert.equal((await c.handlers.get('focus:reminders')(c.event)).items.length,1);
}));
