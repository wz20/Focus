'use strict';
const {app,BrowserWindow,Menu,ipcMain,protocol,session,dialog,shell,Notification,powerMonitor}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const smokeMode=process.argv.includes('--focus-smoke-test');
const smokeDirectory=smokeMode?require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(),'focus-native-smoke-')):null;
const APP_ROOT=path.resolve(__dirname,'..');
let windowRef,repository,validateSnapshot,reminderService,reminderTimer,quitting=false,quitPending=false;
let reminderWarning=null,lastReminderPayload='';
const activeNotifications=new Map();
app.setName('Focus');
const dataDirectory=smokeDirectory||path.join(app.getPath('appData'),'Focus');
require('node:fs').mkdirSync(dataDirectory,{recursive:true,mode:0o700});
app.setPath('userData',dataDirectory);
protocol.registerSchemesAsPrivileged([{scheme:'focus',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',()=>{if(windowRef){if(windowRef.isMinimized())windowRef.restore();windowRef.show();windowRef.focus();}});
function trusted(event){
  if(!windowRef || event.sender.id!==windowRef.webContents.id || !event.senderFrame)throw new Error('请求来源不受信任');
  const url=new URL(event.senderFrame.url);if(url.protocol!=='focus:'||url.hostname!=='app')throw new Error('请求来源不受信任');
}
function send(type,payload={}){if(windowRef&&!windowRef.isDestroyed())windowRef.webContents.send('focus:action',{type,...payload});}
async function exportData(){
  await flushWindow(windowRef);
  const {snapshot}=await repository.load();
  const {canceled,filePath}=await dialog.showSaveDialog(windowRef,{title:'导出 Focus 备份',defaultPath:`Focus-backup-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'Focus 备份',extensions:['json']}]});
  if(canceled||!filePath)return {canceled:true};
  await fs.writeFile(filePath,JSON.stringify(snapshot,null,2),{mode:0o600});return {canceled:false};
}
async function importData(){
  const {canceled,filePaths}=await dialog.showOpenDialog(windowRef,{title:'导入 Focus 备份',properties:['openFile'],filters:[{name:'Focus 备份',extensions:['json']}]});
  if(canceled||!filePaths.length)return {canceled:true};
  const stat=await fs.stat(filePaths[0]);if(stat.size>40*1024*1024)throw new Error('文件超过 40 MB');
  const snapshot=validateSnapshot(JSON.parse(await fs.readFile(filePaths[0],'utf8')));
  const answer=await dialog.showMessageBox(windowRef,{type:'question',message:`用备份中的 ${snapshot.tasks.length} 项任务替换当前数据？`,detail:'当前数据会保留一份本地备份。导入后也可以使用「编辑 → 撤销」恢复。',buttons:['取消','导入并替换'],defaultId:0,cancelId:0});
  if(answer.response!==1)return {canceled:true};
  await repository.importSnapshot(snapshot);
  send('import',{snapshot});await updateReminders(snapshot.tasks);return {canceled:false};
}
function reminderError(error){
 reminderWarning=`提醒暂未正常送达：${error.message}。任务仍保存在本机，可重新打开 Focus 重试。`;
 publishReminders(reminderService?.getInbox()||[]);
}
function publishReminders(items){
 const keys=new Set(items.map(e=>e.key));
 for(const [notification,record] of activeNotifications){
  if(record.keys&&!record.keys.every(k=>keys.has(k))){notification.close();activeNotifications.delete(notification);}
 }
 const payload={items,warning:reminderWarning};const encoded=JSON.stringify(payload);
 if(encoded!==lastReminderPayload){lastReminderPayload=encoded;send('reminders',payload);}
}
async function updateReminders(tasks){
 if(!reminderService)return;
 try{await reminderService.update(tasks);}catch(error){reminderError(error);}
}
async function openReminderTask(taskId){
 if(!windowRef)await createWindow();
 if(windowRef.isMinimized())windowRef.restore();windowRef.show();windowRef.focus();
 // Renderer queues this command if its asynchronous initial data read is unfinished.
 send('open-task',{taskId});
 send('reminders',{items:reminderService?.getInbox()||[],warning:reminderWarning});
}
function nativeNotice(options,record={}){
 if(!Notification.isSupported()){
  reminderWarning='当前系统不支持桌面通知；请在 Focus 中查看提醒弹窗。';publishReminders(reminderService?.getInbox()||[]);
  return Promise.resolve({system:'unsupported'});
 }
 return new Promise(resolve=>{
  let settled=false;let timer;
  const finish=system=>{if(settled)return;settled=true;clearTimeout(timer);resolve({system});};
  try{
   const notice=new Notification(options);activeNotifications.set(notice,record);
   notice.on('click',()=>{openReminderTask(record.taskId||null).catch(reminderError);});
   notice.on('close',()=>activeNotifications.delete(notice));
   notice.on('show',()=>{reminderWarning=null;publishReminders(reminderService?.getInbox()||[]);finish('shown');});
   notice.on('failed',(_event,error)=>{
    activeNotifications.delete(notice);
    reminderWarning='系统通知未送达。请检查 macOS 通知权限与专注模式；提醒仍保留在应用内。';
    publishReminders(reminderService?.getInbox()||[]);finish('failed');
   });
   timer=setTimeout(()=>finish('requested'),3000);
   notice.show();
  }catch(error){reminderError(error);finish('failed');}
 });
}
function shortNativeBody(text){let result='';for(const c of text){if(Buffer.byteLength(result+c,'utf8')>175)break;result+=c;}return result;}
async function notifyDue(events){
 if(smokeMode||windowRef?.isFocused())return; // Foreground uses the non-modal in-app popup, not two competing alerts.
 const first=events[0];const late=Date.parse(first.targetAt)<=Date.now();
 const title=events.length>1?`Focus · ${events.length} 条任务提醒`:(first.kind==='start'?(late?'已到计划开始时间':'任务即将开始'):(late?'已到截止时间':'截止时间即将到达'));
 const time=new Date(first.targetAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 await nativeNotice({title,body:shortNativeBody(`${first.title}\n${first.kind==='start'?'计划开始':'截止时间'} ${time}${events.length>1?' · 点击查看全部':''}`),silent:false},{keys:events.map(e=>e.key),taskId:events.length===1?first.taskId:null});
}
async function testReminder(){
 send('reminder-test');
 return nativeNotice({title:'Focus · 测试提醒',body:'看到这条系统通知，说明系统通知已送达。实际任务提醒只在 Focus 运行时触发。',silent:false});
}
async function safeMenu(fn){try{await fn();}catch(error){dialog.showErrorBox('Focus',error.message);}}
function createMenu(){
 const template=[
  ...(process.platform==='darwin'?[{label:'Focus',submenu:[{role:'about',label:'关于 Focus'},{type:'separator'},{role:'hide',label:'隐藏 Focus'},{role:'hideOthers',label:'隐藏其他'},{role:'unhide',label:'显示全部'},{type:'separator'},{role:'quit',label:'退出 Focus'}]}]:[]),
  {label:'文件',submenu:[{label:'新增任务',accelerator:'CmdOrCtrl+N',click:()=>send('new')},{type:'separator'},
    {label:'导出备份…',click:()=>safeMenu(exportData)},{label:'导入备份…',click:()=>safeMenu(importData)},
    {label:'打开数据文件夹',click:()=>shell.openPath(app.getPath('userData'))},{type:'separator'},{role:'close',label:'关闭窗口'}]},
  {label:'编辑',submenu:[{label:'撤销任务操作',accelerator:'CmdOrCtrl+Z',click:()=>send('undo')},{label:'重做任务操作',accelerator:'CmdOrCtrl+Shift+Z',click:()=>send('redo')},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},
  {label:'视图',submenu:[{label:'四象限',accelerator:'CmdOrCtrl+1',click:()=>send('quadrants')},{label:'时间轴',accelerator:'CmdOrCtrl+2',click:()=>send('timeline')},{label:'归档',click:()=>send('archive')},{label:'搜索任务',accelerator:'CmdOrCtrl+K',click:()=>send('search')},{type:'separator'},{role:'togglefullscreen',label:'切换全屏'},...(!app.isPackaged?[{role:'toggleDevTools',label:'开发者工具'}]:[])]},
  {label:'窗口',submenu:[{role:'minimize',label:'最小化'},{role:'zoom',label:'缩放'}]},
  {label:'帮助',submenu:[{label:'测试任务提醒',click:()=>safeMenu(testReminder)},{label:'使用说明',click:()=>dialog.showMessageBox(windowRef,{type:'info',message:'Focus · 让工作各就其位',detail:'点击卡片打开详情；点击左侧状态圆点依次切换 todo → ing → done，完成后再点击圆点归档。\n\n任务多时自动聚合，点击「查看全部」展开可滚动列表。拖动任务到其他象限，或在详情里修改重要性 / 紧急性。\n\n时间轴表示计划起止，不等于连续投入工时。横条可拖动与拉伸；未设置时间的任务保留在待排期。\n\n截止时间（deadline）单独录入，可留空。提醒可选择开始前或截止前，完成/归档后停止。关闭窗口但不退出 Focus 时继续检查；完全退出或电脑休眠时不能准时提醒，返回后会合并补提醒。系统通知可能受权限或专注模式限制，应用内仍保留待确认提醒。\n\n数据只保存在本机。建议定期使用「文件 → 导出备份」。'})}]}
 ];Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
async function flushWindow(win){
 if(win&&!win.isDestroyed()){
  let timer;
  try{
   await Promise.race([
    win.webContents.executeJavaScript("window.focusFlushPendingSaves ? window.focusFlushPendingSaves() : true"),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('等待本地保存超时，请稍后重试。')),10000);})
   ]);
  }finally{clearTimeout(timer);}
 }
 if(repository)await repository.pending;
 if(reminderService)await reminderService.flush();
}
async function createWindow(){
 windowRef=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:650,title:'Focus',backgroundColor:'#ffffff',show:false,
   titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',trafficLightPosition:{x:18,y:22},
   icon:path.join(__dirname,'../../assets/icon.png'),
   webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
 windowRef.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 windowRef.webContents.on('will-navigate',e=>e.preventDefault());
 windowRef.webContents.on('will-attach-webview',e=>e.preventDefault());
 windowRef.once('ready-to-show',()=>{if(!smokeMode)windowRef.show();});
 const thisWindow=windowRef;let closePending=false,closeApproved=false;
 thisWindow.on('close',event=>{
  if(quitting||smokeMode||closeApproved)return;
  event.preventDefault();if(closePending)return;closePending=true;
  flushWindow(thisWindow).then(()=>{closeApproved=true;thisWindow.close();}).catch(error=>{closePending=false;dialog.showErrorBox('工作尚未保存',`窗口未关闭，避免丢失修改。${error.message}`);});
 });
 windowRef.on('closed',()=>{if(windowRef===thisWindow)windowRef=null;});
 await windowRef.loadURL('focus://app/index.html');
}
app.whenReady().then(async()=>{
 const repoModule=await import(pathToFileURL(path.join(__dirname,'repository.mjs')).href);
 ({validateSnapshot}=await import(pathToFileURL(path.join(APP_ROOT,'domain/model.mjs')).href));
 repository=new repoModule.Repository(app.getPath('userData'));
 app.setAboutPanelOptions({applicationName:'Focus',applicationVersion:'0.1.4',version:'0.1.4',copyright:'Local-first · No account · No telemetry'});
 protocol.handle('focus',async request=>{
   try{
    const url=new URL(request.url);if(url.hostname!=='app')return new Response('Forbidden',{status:403});
    const requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const target=path.resolve(APP_ROOT,`.${requested}`);
    const relative=path.relative(APP_ROOT,target);
    if(relative.startsWith('..')||path.isAbsolute(relative)||!['.html','.css','.mjs','.js','.svg','.png'].includes(path.extname(target)))return new Response('Forbidden',{status:403});
    const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[path.extname(target)];
    return new Response(await fs.readFile(target),{headers:{'Content-Type':type,'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"}});
   }catch{return new Response('Not found',{status:404});}
 });
 session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 session.defaultSession.setPermissionCheckHandler(()=>false);
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{const scheme=new URL(details.url).protocol;callback({cancel:!['focus:','devtools:'].includes(scheme)});});
 ipcMain.handle('focus:load',async event=>{trusted(event);return repository.load();});
 ipcMain.handle('focus:save',async(event,snapshot)=>{trusted(event);const clean=validateSnapshot(snapshot);const result=await repository.save(clean);await updateReminders(clean.tasks);return result;});
 ipcMain.handle('focus:export',async event=>{trusted(event);return exportData();});
 ipcMain.handle('focus:import',async event=>{trusted(event);return importData();});
 ipcMain.handle('focus:reveal-data',async event=>{trusted(event);return shell.openPath(app.getPath('userData'));});
 reminderService=new repoModule.ReminderService(app.getPath('userData'),{onUpdate:publishReminders,onNotify:notifyDue,onError:reminderError});
 try{const {snapshot}=await repository.load();await reminderService.load(snapshot.tasks);}catch(error){reminderError(error);}
 ipcMain.handle('focus:reminders',async event=>{trusted(event);return {items:reminderService.getInbox(),warning:reminderWarning};});
 ipcMain.handle('focus:dismiss-reminders',async(event,keys)=>{trusted(event);return reminderService.dismiss(keys);});
 ipcMain.handle('focus:test-reminder',async event=>{trusted(event);return testReminder();});
 if(!smokeMode){
  reminderTimer=setInterval(()=>{reminderService.tick().catch(reminderError);},5000);reminderTimer.unref?.();
  powerMonitor.on('resume',()=>{reminderService.tick().catch(reminderError);});
 }
 createMenu();await createWindow();
 if(smokeMode){
  const timeout=setTimeout(()=>{console.error('Native smoke timed out');app.exit(1);},30000);
  try{await require('./native-smoke.cjs')(windowRef,process.env.FOCUS_SMOKE_SCREENSHOT);clearTimeout(timeout);quitting=true;windowRef.destroy();app.exit(0);}
  catch(error){console.error(error.stack||error);clearTimeout(timeout);quitting=true;app.exit(1);}
  return;
 }
 app.on('activate',()=>{if(!windowRef)createWindow();});
}).catch(error=>{if(smokeMode){console.error(error.stack||error);app.exit(1);}else{dialog.showErrorBox('Focus 无法启动',error.stack||error.message);app.quit();}});
app.on('before-quit',event=>{if(repository&&!quitting){event.preventDefault();if(quitPending)return;quitPending=true;flushWindow(windowRef).then(()=>{quitting=true;app.quit();}).catch(error=>{quitPending=false;dialog.showErrorBox('数据尚未保存',`退出已取消，避免丢失工作。${error.message}`);});}});
app.on('will-quit',()=>{clearInterval(reminderTimer);});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
