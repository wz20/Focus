import {TaskStore} from './domain/store.mjs';
import {validateSnapshot,filterTasks,QUADRANTS,quadrantInfo,dateLabel,reminderEvents,dueReminders} from './domain/model.mjs';
import {demoInputs} from './domain/demo.mjs';
import {el,button,iconButton,icon,selectControl,statusOptions,toast} from './ui/dom.mjs';
import {renderHome} from './ui/home.mjs';
import {renderExpanded,renderDetail,renderArchive} from './ui/panels.mjs';
import {renderTimeline,renderCalendarDay} from './ui/timeline.mjs';
import {showTaskModal,showConfirm,renderReminderPopup} from './ui/modal.mjs';
const native=window.focusNative||null;
const STORAGE_KEY='focus.tasks.v1';
const REMINDER_KEY='focus.reminders.v1';
let currentReminders=[],reminderWarning=null,testPopup=false,pendingOpenId=null,previewReminderTimer=null,previewLedger={sent:{},inbox:[]};
let store,renderers=[],modalOpen=false,pendingSaves=0,saveFailure=null,saveQueue=Promise.resolve();
const ui={view:'quadrants',query:'',status:'all',expanded:null,selected:null,panelStatus:'all',sort:'priority',zoom:100,listScroll:0,scale:'week',anchor:new Date(),timelineQuadrant:'all',timeMode:'gantt',calendarDay:null,calendarScroll:0,calendarDayScroll:0,timelineScroll:{top:0,left:0}};
const root=document.getElementById('app');
if(native?.platform==='darwin')document.documentElement.classList.add('is-mac');
const safe=fn=>(...args)=>{try{return fn(...args);}catch(error){toast(error.message||'操作未完成');}};
const actions={
 navigate(view){ui.view=view;ui.selected=null;ui.expanded=null;ui.calendarDay=null;ui.listScroll=0;render();},
 select(id){ui.selected=id;render();},
 expand(q){ui.expanded=q;ui.selected=null;ui.panelStatus='all';ui.listScroll=0;render();},
 closePanel(){if(ui.selected)ui.selected=null;else if(ui.calendarDay)ui.calendarDay=null;else ui.expanded=null;render();},
 panelFilter(s){ui.panelStatus=s;ui.listScroll=0;render();},sort(by){ui.sort=by;ui.listScroll=0;render();},
 newTask(defaults={}){if(modalOpen)return;modalOpen=true;showTaskModal({defaults,onSave:input=>{const t=store.create(input);toast(`已添加「${t.title}」`,'撤销',actions.undo);},onTestReminder:testReminders,onClose:()=>{modalOpen=false;if(pendingOpenId)openReminder(pendingOpenId);}});},
 editTask(id){const t=store.get(id);if(!t||t.archivedAt||modalOpen)return;modalOpen=true;showTaskModal({task:t,onSave:input=>{store.update(id,input);toast('任务已更新','撤销',actions.undo);},onTestReminder:testReminders,onClose:()=>{modalOpen=false;if(pendingOpenId)openReminder(pendingOpenId);}});},
 advance:safe(id=>{const t=store.get(id);if(!t)return;const archived=t.status==='done';if(archived)ui.selected=null;store.advance(id);toast(archived?`已归档「${t.title}」`:t.status==='todo'?'已开始任务':'已完成，再次点击完成标记即可归档','撤销',actions.undo);}),
 setStatus:safe((id,status)=>{const t=store.get(id);if(t.status===status){if(status==='done')actions.archive(id);return;}store.setStatus(id,status);toast(status==='done'?'已完成，任务仍保留在工作区':'任务状态已更新','撤销',actions.undo);}),
 archive:safe(id=>{const t=store.get(id);ui.selected=null;store.archive(id);toast(`已归档「${t.title}」`,'撤销',actions.undo);}),
 restore:safe(id=>{ui.selected=null;store.restore(id);toast('已恢复到原象限，保留 done 状态','查看',()=>actions.navigate('quadrants'));}),
 move:safe((id,q)=>{store.move(id,q);toast(`已移至${quadrantInfo(q).name}`,'撤销',actions.undo);}),
 schedule:safe((id,start,end)=>{store.update(id,{plannedStart:start,plannedEnd:end});toast('计划时间已调整','撤销',actions.undo);}),
 confirmDelete(id){const t=store.get(id);showConfirm({title:'删除这个任务？',description:`「${t.title}」将从工作区中删除。你可以在本次会话中撤销。`,confirmLabel:'删除任务',danger:true,onConfirm:()=>{ui.selected=null;store.remove(id);toast('任务已删除','撤销',actions.undo);}});},
 undo(){if(store.undo())toast('已撤销');else toast('没有可撤销的操作');},redo(){if(store.redo())toast('已重做');else toast('没有可重做的操作');},
 demo(){store.append(demoInputs());toast('已载入虚构示例任务，可随时清除');},
 clearDemos(){showConfirm({title:'清除示例任务？',description:'只移除标记为示例的任务，保留你自己添加的内容。',confirmLabel:'清除示例',onConfirm:()=>{ui.selected=null;store.clearDemos();toast('已清除示例','撤销',actions.undo);}});},
 timeMode(mode){ui.timeMode=mode;ui.calendarDay=null;ui.selected=null;render();},
 calendarDay(key){ui.calendarDay=key;ui.selected=null;ui.calendarDayScroll=0;render();},
 timeAnchor(d){ui.anchor=d;ui.calendarDay=null;ui.calendarScroll=0;ui.timelineScroll={top:0,left:0};render();},timeScale(s){ui.scale=s;ui.timelineScroll={top:0,left:0};render();},timelineFilter(q){ui.timelineQuadrant=q;ui.timelineScroll.top=0;render();},
 timeStatus(s){ui.status=s;ui.timelineScroll.top=0;render();},
 search(){document.getElementById('global-search')?.focus();},
};
async function load(){
 if(native)return native.load();
 let data=localStorage.getItem(STORAGE_KEY);
 if(!data)return {snapshot:{version:1,tasks:[]},warning:null};
 try{return {snapshot:validateSnapshot(JSON.parse(data)),warning:null};}
 catch(error){const backup=localStorage.getItem(STORAGE_KEY+'.backup');if(backup){const snapshot=validateSnapshot(JSON.parse(backup));localStorage.setItem(STORAGE_KEY+'.corrupt',data);localStorage.setItem(STORAGE_KEY,backup);return {snapshot,warning:'本地数据异常，已恢复上一次有效备份。'};}throw new Error('本地数据无法读取。原数据未被覆盖，请导入一份有效备份。');}
}
function persist(snapshot){
 const captured=structuredClone(snapshot);pendingSaves++;updateSaveStatus();
 saveQueue=saveQueue.catch(()=>{}).then(async()=>{
  if(native)await native.save(captured);
  else{
   const previous=localStorage.getItem(STORAGE_KEY);if(previous){validateSnapshot(JSON.parse(previous));localStorage.setItem(STORAGE_KEY+'.backup',previous);}
   localStorage.setItem(STORAGE_KEY,JSON.stringify(captured));
  }
  saveFailure=null;if(!native)refreshPreviewReminders();
 }).catch(error=>{saveFailure=error.message;toast(`保存失败：${error.message}`,'重试',()=>persist(store.snapshot));}).finally(()=>{pendingSaves--;updateSaveStatus();});
}
// Native close/quit waits for this queue, including writes not yet sent over IPC.
window.focusFlushPendingSaves=async()=>{await saveQueue;if(saveFailure)throw new Error(saveFailure);return true;};
function updateSaveStatus(){const indicator=document.getElementById('save-status');if(indicator){indicator.textContent=saveFailure?'尚未保存 · 点击重试':pendingSaves?'正在保存…':native?'本地已保存':'浏览器本地保存';indicator.classList.toggle('save-error',Boolean(saveFailure));indicator.title=saveFailure||'数据仅保存在当前设备，不上传云端';}}
function render(){
 const focus=document.activeElement?.id;const selection=focus==='global-search'?document.activeElement.selectionStart:null;
 renderers.forEach(r=>r?.destroy());renderers=[];root.replaceChildren();
 const shell=el('div',{class:'app-shell'});root.append(shell);
 const header=el('header',{class:'app-header'},el('span',{class:'brand'},'Focus'),el('nav',{class:'segments view-switch','aria-label':'视图切换'},button('四象限',()=>actions.navigate('quadrants'),{className:ui.view==='quadrants'?'active':'',iconName:'grid','aria-pressed':ui.view==='quadrants'}),button('时间轴',()=>actions.navigate('timeline'),{className:ui.view==='timeline'?'active':'',iconName:'timeline','aria-pressed':ui.view==='timeline'})),el('div',{class:'header-spacer'}));
 const search=el('input',{id:'global-search',type:'search',value:ui.query,placeholder:ui.view==='archive'?'搜索归档任务…':'搜索任务…','aria-label':'搜索任务',onInput:e=>{ui.query=e.target.value;ui.listScroll=0;render();}});
 header.append(el('label',{class:'search-box'},icon('search'),search,el('kbd',{},'⌘ K')),button('归档',()=>actions.navigate('archive'),{className:`archive-nav ${ui.view==='archive'?'active':''}`,iconName:'archive'}),button('新增任务',()=>actions.newTask(),{className:'primary new-task',iconName:'plus'}),iconButton('more','数据与帮助',event=>showDataMenu(event.currentTarget),'data-menu-button'));shell.append(header);
 const tasks=filterTasks(store.tasks,{query:ui.query,status:ui.view==='archive'?'all':ui.status,archived:ui.view==='archive'});
 const ctx={store,ui,actions,tasks};
 if(ui.view==='quadrants'){
  const sub=el('div',{class:'workspace-toolbar'},el('div',{class:'workspace-heading'},el('h1',{},'我的四象限'),el('span',{class:'muted'},`${tasks.length} 项`)),selectControl('任务状态筛选',ui.status,statusOptions(),s=>{ui.status=s;ui.listScroll=0;render();}));shell.append(sub);
 }
 const workspace=el('main',{class:`workspace${ui.selected||ui.expanded||ui.calendarDay?' with-panel':''}`});shell.append(workspace);
 const primary=ui.view==='quadrants'?renderHome(ctx):ui.view==='timeline'?renderTimeline(ctx):renderArchive(ctx);renderers.push(primary);workspace.append(primary.element);
 const secondary=ui.selected?renderDetail(ctx):ui.calendarDay&&ui.view==='timeline'&&ui.timeMode==='calendar'?renderCalendarDay(ctx):ui.expanded&&ui.view==='quadrants'?renderExpanded(ctx):null;if(secondary){renderers.push(secondary);workspace.append(secondary.element);}
 if(ui.view!=='archive'){
  const footer=el('footer',{class:'app-footer'},ui.view==='quadrants'?el('div',{class:'zoom-controls'},button('−',()=>{ui.zoom=Math.max(80,ui.zoom-10);render();},{title:'缩小卡片',disabled:ui.zoom<=80}),el('span',{},`${ui.zoom}%`),button('+',()=>{ui.zoom=Math.min(130,ui.zoom+10);render();},{title:'放大卡片',disabled:ui.zoom>=130})):el('span',{class:'muted'},`${tasks.length} 项任务`),
    el('span',{class:'footer-hint'},'点击卡片查看详情 · 点击状态标记切换状态'),
    store.tasks.some(t=>t.isDemo)?button('示例任务 · 清除示例',actions.clearDemos,{className:'text-button small'}):null,
    el('button',{id:'save-status',class:'save-indicator',onClick:()=>{if(saveFailure)persist(store.snapshot);}},''));shell.append(footer);
 }
 updateSaveStatus();refreshReminderPopup();if(focus==='global-search'){search.focus();if(selection!=null)search.setSelectionRange?.(selection,selection);}
}
function showDataMenu(anchor){
 document.querySelector('.data-popover')?.remove();const pop=el('div',{class:'data-popover',role:'menu'});
 const entries=[['download','导出 JSON 备份',()=>exportData()],['upload','导入 JSON 备份',()=>importData()],['undo','撤销上一步',actions.undo],['clock','测试提醒',testReminders]];
 if(store.tasks.length===0)entries.push(['plus','载入虚构示例',actions.demo]);
 for(const [i,label,fn] of entries)pop.append(button(label,()=>{close();Promise.resolve(fn()).catch(e=>toast(e.message));},{className:'menu-item',iconName:i,role:'menuitem'}));
 const close=()=>{pop.remove();document.removeEventListener('pointerdown',outside);};
 const outside=event=>{if(!pop.contains(event.target)&&event.target!==anchor)close();};
 root.append(pop);const rect=anchor.getBoundingClientRect();pop.style.top=`${rect.bottom+8}px`;pop.style.right='24px';setTimeout(()=>document.addEventListener('pointerdown',outside),0);
 pop.addEventListener('keydown',event=>{if(event.key==='Escape'){close();anchor.focus();}});pop.querySelector('button')?.focus();
}
async function exportData(){
 if(native){const result=await native.exportData();if(!result.canceled)toast('备份已导出');return;}
 const blob=new Blob([JSON.stringify(store.snapshot,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=el('a',{href:url,download:`Focus-backup-${new Date().toISOString().slice(0,10)}.json`});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('备份已导出');
}
async function importData(){
 if(native)return native.importData();
 const input=el('input',{type:'file',accept:'.json,application/json',hidden:true});document.body.append(input);
 input.addEventListener('change',async()=>{try{const file=input.files[0];if(!file)return;if(file.size>40*1024*1024)throw new Error('文件超过 40 MB');const snapshot=validateSnapshot(JSON.parse(await file.text()));showConfirm({title:`导入 ${snapshot.tasks.length} 项任务？`,description:'将替换当前任务。建议先导出当前数据作为备份；导入后可撤销。',confirmLabel:'导入并替换',onConfirm:()=>{ui.selected=null;ui.expanded=null;if(store){store.replace(snapshot);toast('备份已导入','撤销',actions.undo);}else{const damaged=localStorage.getItem(STORAGE_KEY);if(damaged)localStorage.setItem(STORAGE_KEY+'.corrupt-'+Date.now(),damaged);localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));installStore(snapshot);toast('已从备份恢复工作区');}}});}catch(error){toast(`导入失败：${error.message}`);}finally{input.remove();}});input.click();
}
function isEditing(){return document.activeElement?.matches('input,textarea,select,[contenteditable=true]');}
document.addEventListener('keydown',event=>{
 if(!store)return;
 const mod=event.metaKey||event.ctrlKey;
 if(event.key==='Escape'&&!modalOpen){ui.query='';actions.closePanel();}
 if(!mod)return;
 if(event.key.toLowerCase()==='k'){event.preventDefault();actions.search();}
 else if(event.key.toLowerCase()==='n'){event.preventDefault();actions.newTask();}
 else if(event.key==='1'&&!modalOpen){event.preventDefault();actions.navigate('quadrants');}
 else if(event.key==='2'&&!modalOpen){event.preventDefault();actions.navigate('timeline');}
 else if(event.key.toLowerCase()==='z'&&!isEditing()&&!modalOpen){event.preventDefault();event.shiftKey?actions.redo():actions.undo();}
});
if(native)native.onAction(action=>{
 if(action.type==='reminders'){currentReminders=action.items||[];reminderWarning=action.warning;refreshReminderPopup();return;}
 if(action.type==='reminder-test'){testPopup=true;refreshReminderPopup();return;}
 if(action.type==='open-task'){if(action.taskId)openReminder(action.taskId);else refreshReminderPopup();return;}

 if(['undo','redo'].includes(action.type)&&isEditing()){document.execCommand(action.type);return;}
 if(action.type==='import'){ui.selected=null;ui.expanded=null;if(store){store.replace(action.snapshot);toast('备份已导入','撤销',actions.undo);}else{installStore(action.snapshot);toast('已从备份恢复工作区');}return;}
 if(!store)return;
 if(modalOpen)return;
 ({new:actions.newTask,quadrants:()=>actions.navigate('quadrants'),timeline:()=>actions.navigate('timeline'),archive:()=>actions.navigate('archive'),undo:actions.undo,redo:actions.redo,search:actions.search}[action.type]||(()=>{}))();
});
function installStore(snapshot){
 store=new TaskStore(snapshot);store.subscribe(value=>{persist(value);render();});render();
 if(pendingOpenId)openReminder(pendingOpenId);
 if(native){native.getReminders?.().then(data=>{currentReminders=data.items||[];reminderWarning=data.warning;refreshReminderPopup();}).catch(error=>toast(`无法读取提醒：${error.message}`));}
 else{
  try{const saved=JSON.parse(localStorage.getItem(REMINDER_KEY)||'null');if(saved&&saved.sent&&Array.isArray(saved.inbox))previewLedger=saved;}catch{toast('浏览器提醒记录异常，最近的提醒可能再次显示。');}
  refreshPreviewReminders();clearInterval(previewReminderTimer);previewReminderTimer=setInterval(refreshPreviewReminders,5000);
 }
}
load().then(({snapshot,warning})=>{installStore(snapshot);if(warning)toast(warning);}).catch(error=>{root.replaceChildren(el('div',{class:'fatal-error'},el('h1',{},'工作区暂时无法打开'),el('p',{},error.message),el('p',{class:'muted'},'未覆盖已有数据。请检查数据目录或导入有效备份。'),button('重试',()=>location.reload(),{className:'primary'}),button('导入备份恢复',()=>Promise.resolve(importData()).catch(e=>toast(e.message)),{className:'secondary'}),native?button('打开数据目录',()=>native.revealData(),{className:'secondary'}):null));});


function validReminderItems(){
 if(!store)return [];
 const keys=new Set(store.tasks.flatMap(reminderEvents).map(e=>e.key));
 return currentReminders.filter(e=>keys.has(e.key));
}
function refreshReminderPopup(){
 const items=validReminderItems();
 renderReminderPopup(items,{warning:reminderWarning,testing:testPopup,onOpen:openReminder,onDismiss:dismissReminders,
   onDismissAll:()=>dismissReminders(items.map(e=>e.key)),onDismissTest:()=>{testPopup=false;refreshReminderPopup();}});
}
function openReminder(id){
 if(!store){pendingOpenId=id;return;}
 if(modalOpen){pendingOpenId=id;toast('请先保存或取消正在编辑的任务，再查看提醒。');return;}
 pendingOpenId=null;const task=store.get(id);if(!task){toast('这个任务已删除。');return;}
 ui.view=task.archivedAt?'archive':'quadrants';ui.calendarDay=null;ui.status='all';ui.query='';ui.expanded=null;actions.select(id);
}
async function dismissReminders(keys){
 try{
  if(native){currentReminders=await native.dismissReminders(keys);}
  else{previewLedger.inbox=previewLedger.inbox.filter(k=>!keys.includes(k));localStorage.setItem(REMINDER_KEY,JSON.stringify(previewLedger));refreshPreviewReminders();}
  refreshReminderPopup();
 }catch(error){toast(`提醒确认未保存：${error.message}`);}
}
async function testReminders(){
 testPopup=true;refreshReminderPopup();
 if(!native){toast('已显示页内测试弹窗。浏览器预览仅在页面打开时检查提醒。');return;}
 try{
  const result=await native.testReminder();
  toast(result.system==='shown'?'系统通知已收到展示确认。':result.system==='requested'?'已请求系统通知，尚未收到展示确认。请检查通知设置。':'系统通知未送达，请检查通知权限；应用内弹窗仍可使用。');
 }catch(error){toast(`系统通知测试未成功：${error.message}；应用内弹窗仍可使用。`);}
}
function refreshPreviewReminders(){
 if(native||!store)return;
 try{
  const now=Date.now(),events=new Map(store.tasks.flatMap(reminderEvents).map(e=>[e.key,e]));
  const sent=Object.fromEntries(Object.entries(previewLedger.sent).filter(([,v])=>Number.isFinite(v)&&v>=now-7*86400000));
  const inbox=previewLedger.inbox.filter(k=>events.has(k)&&Date.parse(events.get(k).expiresAt)>=now);
  for(const e of dueReminders(store.tasks,sent,new Date(now))){sent[e.key]=now;if(!inbox.includes(e.key))inbox.push(e.key);}
  const next={sent,inbox};if(JSON.stringify(next)!==JSON.stringify(previewLedger))localStorage.setItem(REMINDER_KEY,JSON.stringify(next));
  previewLedger=next;currentReminders=inbox.map(k=>events.get(k));refreshReminderPopup();
 }catch(error){reminderWarning=`提醒记录未保存：${error.message}`;}
}
