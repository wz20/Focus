import {localDateInput,createTask,validateWindow,STATUSES,STATUS_LABELS,QUADRANTS,quadrantOf,reminderLeadLabel,reminderHeading,dateLabel} from '../domain/model.mjs';
import {el,button,icon,iconButton,statusMark,trapFocus} from './dom.mjs';
export function showConfirm({title,description,confirmLabel='确认',danger=false,onConfirm}){
 const previous=document.activeElement;
 const overlay=el('div',{class:'modal-backdrop confirm-backdrop'});const modal=el('section',{class:'confirm-dialog',role:'dialog','aria-modal':'true','aria-label':title,tabIndex:-1},el('h2',{},title),el('p',{},description));
 const close=()=>{overlay.remove();previous?.focus();};
 modal.append(el('div',{class:'modal-actions'},button('取消',close,{className:'secondary'}),button(confirmLabel,()=>{close();onConfirm();},{className:danger?'danger':'primary'})));overlay.append(modal);document.getElementById('overlay-root').append(overlay);trapFocus(modal,close);modal.querySelector('button').focus();return close;
}
/** One accessible 2x2 choice updates both axes; order is shared with the home board. */
function taskQuadrantPicker(values,onChange){
 const group=el('div',{class:'task-quadrant-picker',role:'radiogroup','aria-label':'所在象限'});
 const grid=el('div',{class:'picker-grid'});
 const cells=[];
 function refresh(){
  const selected=quadrantOf(values);
  for(const {q,cell} of cells){
   const checked=q.id===selected;
   cell.classList.toggle('selected',checked);
   cell.setAttribute('aria-checked',String(checked));
   cell.tabIndex=checked?0:-1;
  }
 }
 function select(index,focus=false){
  const {q,cell}=cells[index];
  if(values.important!==q.important||values.urgent!==q.urgent){
   values.important=q.important;values.urgent=q.urgent;onChange();
  }
  refresh();if(focus)cell.focus();
 }
 QUADRANTS.forEach((q,index)=>{
  const cell=el('button',{
   type:'button',class:'quadrant-choice',role:'radio','aria-label':q.name,
   dataset:{choiceQuadrant:q.id},style:{'--q':q.color,'--qfill':q.fill},
   onClick:()=>select(index),
   onKeyDown:event=>{
    let next=index;
    if(event.key==='ArrowRight'&&index%2===0)next=index+1;
    else if(event.key==='ArrowLeft'&&index%2===1)next=index-1;
    else if(event.key==='ArrowDown'&&index<2)next=index+2;
    else if(event.key==='ArrowUp'&&index>=2)next=index-2;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=3;
    else if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();select(next,true);
   }
  },el('span',{class:'quadrant-choice-label'},q.name),el('span',{class:'quadrant-choice-check','aria-hidden':'true'},icon('check',13)));
  cells.push({q,cell});grid.append(cell);
 });
 // The axes are decoration for the same two categorical dimensions, never extra controls.
 const axes=document.createElementNS('http://www.w3.org/2000/svg','svg');
 for(const [key,value] of Object.entries({class:'picker-axes',viewBox:'0 0 100 100',preserveAspectRatio:'none','aria-hidden':'true'}))axes.setAttribute(key,value);
 const path=document.createElementNS(axes.namespaceURI,'path');
 path.setAttribute('d','M1 50.1 L50 49.9 L99 50 M1 50 L3 48 M1 50 L3 52 M99 50 L97 48 M99 50 L97 52 M50 1 L49.9 50 L50.1 99 M50 1 L48.5 4 M50 1 L51.5 4 M50.1 99 L48.5 96 M50.1 99 L51.5 96');
 path.setAttribute('vector-effect','non-scaling-stroke');axes.append(path);
 group.append(axes,grid,...[['north','重要'],['south','不重要'],['west','不紧急'],['east','紧急']].map(([direction,text])=>el('span',{class:`picker-axis-label ${direction}`,'aria-hidden':'true'},text)));
 refresh();return el('div',{class:'quadrant-choice-row'},el('span',{class:'muted'},'所在象限'),group);
}
export function showTaskModal({task=null,defaults={},onSave,onClose,onTestReminder}){
 const previous=document.activeElement;
 let dirty=false;const values={title:'',notes:'',important:true,urgent:false,status:'todo',plannedStart:null,plannedEnd:null,estimateMinutes:null,deadline:null,reminders:{startMinutes:10,deadlineMinutes:30},...defaults,...(task||{})};
 const overlay=el('div',{class:'modal-backdrop'});const form=el('form',{class:'task-modal',role:'dialog','aria-modal':'true','aria-label':task?'编辑任务':'新增任务',noValidate:true});
 const close=()=>{overlay.remove();onClose?.();previous?.focus();};
 const requestClose=()=>{if(dirty)showConfirm({title:'放弃未保存的修改？',description:'当前输入尚未保存，已有任务不会受到影响。',confirmLabel:'放弃修改',onConfirm:close});else close();};
 form.append(el('div',{class:'modal-titlebar'},el('h2',{},task?'编辑任务':'新增任务'),iconButton('close','关闭新增任务',requestClose)));
 const title=el('input',{id:'task-title',name:'title',type:'text',value:values.title,maxlength:'120',autocomplete:'off',placeholder:'这件事叫什么？','aria-required':'true'});
 const notes=el('textarea',{id:'task-notes',name:'notes',rows:'3',maxlength:'10000',placeholder:'补充说明（可选）'},values.notes);
 form.append(el('label',{class:'form-label',for:'task-title'},'任务名称'),title,el('label',{class:'form-label',for:'task-notes'},'备注'),notes);
 const choices=el('div',{class:'form-choices'});
 function choiceRow(label,options,key){const group=el('div',{class:'choice-buttons',role:'group','aria-label':label});const update=()=>{group.replaceChildren(...options.map(([value,text])=>button(text,()=>{values[key]=value;dirty=true;update();},{className:`choice ${values[key]===value?'selected':''} ${key==='status'?'status-choice '+value:''}`,'aria-pressed':values[key]===value})));};update();return el('div',{class:'choice-row'},el('span',{class:'muted'},label),group);}
 choices.append(taskQuadrantPicker(values,()=>{dirty=true;}),choiceRow('状态',STATUSES.map(s=>[s,`${s} ${STATUS_LABELS[s]}`]),'status'));form.append(choices);
 const start=el('input',{id:'task-start',name:'start',type:'datetime-local',value:localDateInput(values.plannedStart)}),end=el('input',{id:'task-end',name:'end',type:'datetime-local',value:localDateInput(values.plannedEnd)});
 const dates=el('div',{class:'date-fields'},el('div',{},el('label',{class:'form-label',for:'task-start'},'计划开始（可选）'),start),el('div',{},el('label',{class:'form-label',for:'task-end'},'计划结束（可选）'),end));
 form.append(dates,el('div',{class:'field-help inline spread'},el('span',{},'计划起止用于时间轴；同时留空则保留在待排期。'),button('清除时间',()=>{start.value='';end.value='';dirty=true;syncReminderFields();},{className:'text-button small'})));
 const deadline=el('input',{id:'task-deadline',name:'deadline',type:'datetime-local',value:localDateInput(values.deadline)});
 const deadlineWarning=el('p',{class:'field-help deadline-warning',hidden:true,role:'status'});
 form.append(el('div',{class:'deadline-field'},el('div',{class:'inline spread'},el('label',{class:'form-label',for:'task-deadline'},'截止时间（可选）'),button('清除截止时间',()=>{deadline.value='';dirty=true;syncReminderFields();},{className:'text-button small'})),deadline,el('p',{class:'field-help'},'独立于计划结束时间；不填也可以创建任务。'),deadlineWarning));
 function leadSelect(id,label,value){
  const options=[null,0,5,10,15,30,60,1440];if(value!=null&&!options.includes(value))options.push(value);
  return el('select',{id,'aria-label':label},options.map(n=>el('option',{value:n==null?'off':String(n),selected:n===value},reminderLeadLabel(n))));
 }
 const startReminder=leadSelect('task-start-reminder','开始提醒',values.reminders?.startMinutes??null);
 const deadlineReminder=leadSelect('task-deadline-reminder','截止提醒',values.reminders?.deadlineMinutes??null);
 const reminderFields=el('div',{class:'reminder-fields'},el('div',{},el('label',{class:'form-label',for:'task-start-reminder'},'开始提醒'),startReminder),el('div',{},el('label',{class:'form-label',for:'task-deadline-reminder'},'截止提醒'),deadlineReminder));
 form.append(reminderFields,el('div',{class:'field-help inline spread'},el('span',{},'未填写对应时间则不提醒。Focus 完全退出后不提醒。')));
 function syncReminderFields(){
  startReminder.disabled=!start.value;deadlineReminder.disabled=!deadline.value;
  const d=Date.parse(deadline.value),p=Date.parse(end.value);
  const warning=Number.isFinite(d)&&Number.isFinite(p)&&p>d?'计划结束晚于截止时间，请确认安排。':Number.isFinite(d)&&d<Date.now()?'该截止时间已过去，仍可保存以记录逾期任务。':'';
  deadlineWarning.textContent=warning;deadlineWarning.hidden=!warning;
 }
 for(const field of [start,end,deadline])field.addEventListener('input',syncReminderFields);
 syncReminderFields();
 const estimate=el('input',{id:'task-estimate',name:'estimate',type:'number',min:'1',max:'100000',step:'1',value:values.estimateMinutes||'',placeholder:'例如 60'});form.append(el('div',{class:'estimate-row'},el('label',{class:'muted',for:'task-estimate'},'预计用时'),estimate,el('span',{class:'muted'},'分钟')));
 const error=el('div',{class:'form-error',role:'alert',hidden:true});form.append(error);
 const save=el('button',{type:'submit',class:'button primary'},task?'保存修改':'创建任务');form.append(el('div',{class:'modal-actions'},button('取消',requestClose,{className:'secondary'}),save));
 form.addEventListener('input',()=>{dirty=true;error.hidden=true;});
 form.addEventListener('submit',event=>{event.preventDefault();try{
   const input={title:title.value,notes:notes.value,important:values.important,urgent:values.urgent,status:values.status,plannedStart:start.value||null,plannedEnd:end.value||null,estimateMinutes:estimate.value||null,deadline:deadline.value||null,reminders:{startMinutes:start.value&&startReminder.value!=='off'?Number(startReminder.value):null,deadlineMinutes:deadline.value&&deadlineReminder.value!=='off'?Number(deadlineReminder.value):null}};
   createTask(input);onSave(input);dirty=false;close();
  }catch(err){error.textContent=err.message;error.hidden=false;if(!title.value.trim())title.focus();}});
 form.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();form.requestSubmit();}});
 trapFocus(form,requestClose);overlay.append(form);document.getElementById('overlay-root').append(overlay);requestAnimationFrame(()=>{if(form.isConnected&&!form.contains(document.activeElement))title.focus();});return requestClose;
}


/** A non-modal popup: it never steals focus or discards an open task form. */
export function renderReminderPopup(items,{onOpen,onDismiss,onDismissAll,warning,testing=false,onDismissTest}={}){
 let host=document.getElementById('reminder-root');
 if(!host){host=el('div',{id:'reminder-root'});document.body.append(host);}
 host.replaceChildren();if(!items.length&&!testing)return;
 const panel=el('section',{class:'reminder-popup',role:'region','aria-label':'任务提醒','aria-live':'polite'},
  el('div',{class:'reminder-popup-head'},el('strong',{},testing?'测试提醒':`任务提醒 · ${items.length}`),items.length>1?button('全部知道了',onDismissAll,{className:'text-button small'}):null));
 const list=el('div',{class:'reminder-popup-list'});
 if(testing){
  list.append(el('article',{class:'reminder-item'},el('h3',{},'提醒弹窗已开启'),el('p',{},'这是测试提醒，不会创建任务或修改已有任务。'),button('知道了',onDismissTest,{className:'secondary small'})));
 }
 for(const e of items){
  list.append(el('article',{class:`reminder-item ${e.kind}`},el('span',{class:'reminder-kind'},reminderHeading(e)),el('h3',{},e.title),el('p',{},`${e.kind==='start'?'计划开始':'截止时间'} · ${dateLabel(e.targetAt,true)}`),
   el('div',{class:'reminder-actions'},button('查看任务',()=>onOpen(e.taskId),{className:'primary small'}),button('知道了',()=>onDismiss([e.key]),{className:'secondary small'}))));
 }
 panel.append(list,el('p',{class:'reminder-popup-help'},warning||'保持 Focus 运行即可提醒；完全退出或休眠时不能准时提醒。'));
 host.append(panel);
}
