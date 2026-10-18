import {quadrantInfo,QUADRANTS,sortTasks,formatDuration,dateLabel,plannedOverlap} from '../domain/model.mjs';
import {timelineRange,barPosition,navigateRange,calendarMonth,calendarDateKey,calendarEntries,calendarDayInfo,calendarTaskDefaults,calendarEntryLabel,calendarMonthNote} from '../domain/time.mjs';
import {el,button,iconButton,statusButton,selectControl,statusOptions} from './dom.mjs';
export function renderTimeline(ctx){
 if(ctx.ui.timeMode==='calendar')return renderMonthCalendar(ctx);
 const {ui,actions,store}=ctx;const range=timelineRange(ui.anchor,ui.scale);const now=new Date();const all=ctx.tasks.filter(t=>ui.timelineQuadrant==='all'||quadrantInfo(t).id===ui.timelineQuadrant);
 const deadlineInRange=t=>t.deadline&&Date.parse(t.deadline)>=+range.start&&Date.parse(t.deadline)<+range.end;
 const items=sortTasks(all.filter(t=>barPosition(t.plannedStart,t.plannedEnd,range)||deadlineInRange(t)));const pending=all.filter(t=>!t.plannedStart);
 const ing=all.filter(t=>t.status==='ing').length;const concurrent=plannedOverlap(all,now.toISOString());
 const root=el('div',{class:'timeline-view',dataset:{testid:'timeline-view'}});
 const toolbar=el('div',{class:'timeline-toolbar'},el('div',{class:'inline'},el('h1',{},'时间轴'),timeViewSwitch(ui,actions),el('span',{class:'ing-count',title:'状态为 ing 的未归档任务数量；不代表同时实际投入工时。'},`进行中 ${ing} 项`)),el('div',{class:'timeline-tools'},button('今天',()=>actions.timeAnchor(new Date()),{className:'secondary small'}),iconButton('back','上一段时间',()=>actions.timeAnchor(navigateRange(ui.anchor,ui.scale,-1))),iconButton('next','下一段时间',()=>actions.timeAnchor(navigateRange(ui.anchor,ui.scale,1))),el('div',{class:'segments compact'},[['day','日'],['week','周'],['month','月']].map(([s,label])=>button(label,()=>actions.timeScale(s),{className:ui.scale===s?'active':'','aria-pressed':ui.scale===s}))),selectControl('时间轴状态筛选',ui.status,statusOptions(),actions.timeStatus),selectControl('时间轴象限筛选',ui.timelineQuadrant,[['all','全部象限'],...QUADRANTS.map(q=>[q.id,q.name])],actions.timelineFilter)));
 root.append(toolbar,el('div',{class:'timeline-subbar'},el('span',{},`${range.start.getFullYear()}.${dateLabel(range.start.toISOString())} — ${dateLabel(new Date(+range.end-1).toISOString())}`),el('span',{class:'muted',title:'基于未完成任务的计划起止计算。'},`此时 ${concurrent} 项计划跨度重叠`)));
 const scroll=el('div',{class:'timeline-scroll',dataset:{testid:'timeline-scroll'},'aria-label':'时间轴，可横向和纵向滚动',tabIndex:0});const grid=el('div',{class:'timeline-grid',style:{'min-width':`${260+range.columns.length*(ui.scale==='day'?64:ui.scale==='month'?52:132)}px`}});scroll.append(grid);root.append(scroll);
 const head=el('div',{class:'timeline-head'},el('div',{class:'timeline-name-head'},'任务',el('span',{},'状态')));const labels=el('div',{class:'timeline-head-lane'});head.append(labels);grid.append(head);
 const nowPct=(+now-+range.start)/(+range.end-+range.start)*100;const nowVisible=nowPct>=0&&nowPct<=100;
 const weekNames=['周日','周一','周二','周三','周四','周五','周六'];
 for(const c of range.columns){const width=(+c.end-+c.start)/(+range.end-+range.start)*100;const weekend=[0,6].includes(c.start.getDay());labels.append(el('div',{class:`time-column ${weekend?'weekend':''}`,style:{width:`${width}%`}},ui.scale==='day'?`${String(c.start.getHours()).padStart(2,'0')}:00`:dateLabel(c.start.toISOString()),ui.scale==='day'?null:el('small',{},weekNames[c.start.getDay()])));}
 if(nowVisible)labels.append(el('div',{class:'now-head',style:{left:`${nowPct}%`}},el('span',{},ui.scale==='day'?'现在':'今天')));
 const rowHeight=62;const rows=el('div',{class:'timeline-row-space',style:{height:`${Math.max(items.length*rowHeight,200)}px`}});grid.append(rows);
 function renderRow(t,i){
  const q=quadrantInfo(t);const pos=barPosition(t.plannedStart,t.plannedEnd,range);
  const row=el('div',{class:`timeline-row${ui.selected===t.id?' selected':''}`,style:{top:`${i*rowHeight}px`},dataset:{taskId:t.id}});
  const name=el('div',{class:'timeline-task-label'},el('span',{class:'q-dot',style:{background:q.color}}),el('button',{type:'button',class:'timeline-task-name',onClick:()=>actions.select(t.id)},el('span',{},t.title),el('small',{class:'muted'},`预计 ${formatDuration(t.estimateMinutes)}`)),statusButton(t,actions.advance,{text:true}));
  const lane=el('div',{class:'timeline-row-lane'});
  let acc=0;for(const c of range.columns){const width=(+c.end-+c.start)/(+range.end-+range.start)*100;lane.append(el('span',{class:`lane-cell ${[0,6].includes(c.start.getDay())?'weekend':''}`,style:{left:`${acc}%`,width:`${width}%`}}));acc+=width;}
  if(nowVisible)lane.append(el('span',{class:'now-line',style:{left:`${nowPct}%`}}));
  if(pos){
  const bar=el('div',{class:`timeline-bar ${t.status}${pos.clippedLeft?' clipped-left':''}${pos.clippedRight?' clipped-right':''}`,tabIndex:0,role:'button','aria-label':`${t.title}，${dateLabel(t.plannedStart,true)}至${dateLabel(t.plannedEnd,true)}`,title:`${t.title}\n${dateLabel(t.plannedStart,true)} → ${dateLabel(t.plannedEnd,true)}\n计划跨度，不等于连续工时`,style:{left:`${pos.left}%`,width:`max(8px, ${pos.width}%)`,'--q':q.color,'--qfill':q.fill},onKeyDown:e=>{if(e.key==='Enter')actions.select(t.id);}},el('span',{class:'bar-label'},t.title));
  for(const side of ['start','end'])if(!(side==='start'?pos.clippedLeft:pos.clippedRight)){const handle=el('span',{class:`bar-handle ${side}`,'aria-hidden':'true'});handle.addEventListener('pointerdown',e=>drag(e,bar,lane,t,side));bar.append(handle);}
  bar.addEventListener('pointerdown',e=>{if(!e.target.closest('.bar-handle'))drag(e,bar,lane,t,'move');});lane.append(bar);
  }
  if(deadlineInRange(t)){
   const pct=(Date.parse(t.deadline)-+range.start)/(+range.end-+range.start)*100;
   const marker=el('button',{type:'button',class:`deadline-marker${t.status==='done'?' completed':''}`,style:{left:`${pct}%`},title:`截止 ${dateLabel(t.deadline,true)}（独立于计划时间）`,'aria-label':`${t.title}的截止时间：${dateLabel(t.deadline,true)}`,onClick:()=>actions.select(t.id)},el('span',{'aria-hidden':'true'},'◆'));
   lane.append(marker);
  }
  row.append(name,lane);return row;
 }
 function drag(event,bar,lane,task,mode){
  if(event.button!==0)return;event.preventDefault();event.stopPropagation();
  const x=event.clientX,w=lane.getBoundingClientRect().width,start=Date.parse(task.plannedStart),end=Date.parse(task.plannedEnd),span=+range.end-+range.start;
  const snap=ui.scale==='day'?15*60*1000:ui.scale==='week'?60*60*1000:24*60*60*1000;
  let a=start,b=end,moved=false;bar.classList.add('bar-dragging');
  const move=e=>{
   const delta=Math.round(((e.clientX-x)/w*span)/snap)*snap;moved=moved||Math.abs(e.clientX-x)>4;
   if(mode==='move'){a=start+delta;b=end+delta;}else if(mode==='start'){a=Math.min(start+delta,end-15*60*1000);}else b=Math.max(end+delta,start+15*60*1000);
   const p=barPosition(new Date(a),new Date(b),range);if(p){bar.style.left=`${p.left}%`;bar.style.width=`max(8px, ${p.width}%)`;}
  };
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);bar.classList.remove('bar-dragging');if(moved&&(a!==start||b!==end))actions.schedule(task.id,new Date(a).toISOString(),new Date(b).toISOString());else actions.select(task.id);};
  const cancel=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);const p=barPosition(task.plannedStart,task.plannedEnd,range);bar.style.left=`${p.left}%`;bar.style.width=`max(8px, ${p.width}%)`;bar.classList.remove('bar-dragging');};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',cancel,{once:true});
 }
 const paint=()=>{ui.timelineScroll={top:scroll.scrollTop,left:scroll.scrollLeft};const a=Math.max(0,Math.floor((scroll.scrollTop-64)/rowHeight)-4),b=Math.min(items.length,Math.ceil((scroll.scrollTop+scroll.clientHeight)/rowHeight)+4);rows.replaceChildren();for(let i=a;i<b;i++)rows.append(renderRow(items[i],i));if(!items.length)rows.append(el('div',{class:'timeline-empty'},'这个时间范围内没有已排期任务。',el('small',{},pending.length?'点击下方待排期任务，补充计划时间。':'切换时间范围，或添加一个任务。')));};
 scroll.addEventListener('scroll',paint,{passive:true});const observer=new ResizeObserver(paint);observer.observe(scroll);requestAnimationFrame(()=>{scroll.scrollTop=ui.timelineScroll?.top||0;scroll.scrollLeft=ui.timelineScroll?.left||0;paint();});
 root.append(el('div',{class:'pending-tray'},el('span',{class:'pending-label'},`待排期 ${pending.length}`),el('div',{class:'pending-items'},pending.length?pending.map(t=>button(t.title,()=>actions.editTask(t.id),{className:'pending-task',title:`给「${t.title}」安排时间`})) :el('span',{class:'muted'},'所有任务均已设置计划时间'))));
 root.append(el('div',{class:'timeline-help'},'拖动横条调整计划，拖动两端修改起止时间。',el('span',{},all.some(t=>t.deadline)?'◆ 为独立截止时间；拖动计划横条不会修改它。':'横条表示计划跨度，不等于连续投入工时。')));
 return {element:root,destroy:()=>observer.disconnect()};
}

/** Shared switch: scale (day/week/month) is independent from presentation (Gantt/calendar). */
function timeViewSwitch(ui,actions) {
 return el('nav',{class:'segments compact time-mode-switch','aria-label':'时间轴显示方式'},
  button('甘特图',()=>actions.timeMode('gantt'),{className:ui.timeMode!=='calendar'?'active':'','aria-pressed':ui.timeMode!=='calendar',iconName:'timeline'}),
  button('月历',()=>actions.timeMode('calendar'),{className:ui.timeMode==='calendar'?'active':'','aria-pressed':ui.timeMode==='calendar',iconName:'calendar'}));
}
function calendarTaskRow(entry,actions,compact=true) {
 const t=entry.task,q=quadrantInfo(t),label=calendarEntryLabel(entry);
 const row=el('div',{class:`${compact?'calendar-event':'calendar-agenda-row'} ${t.status}`,dataset:{taskId:t.id},style:{'--q':q.color,'--qfill':q.fill}});
 const open=el('button',{type:'button',class:compact?'calendar-event-open':'calendar-agenda-open',
  'aria-label':compact?`查看${entry.key}的任务：${t.title}`:`查看当日任务：${t.title}`,
  title:`${t.title}\n${q.name}\n${label||'未安排日期'}${t.deadline?`\n截止 ${dateLabel(t.deadline,true)}`:''}`,
  onClick:()=>actions.select(t.id)},
  el('span',{class:compact?'calendar-event-title':'calendar-agenda-title'},t.title),
  el('span',{class:compact?'calendar-event-meta':'calendar-agenda-meta'},label||'未安排日期',!compact?el('span',{class:'muted'},` · ${q.name}`):null));
 row.append(statusButton(t,actions.advance),open);
 if(entry.deadline)row.append(el('span',{class:'calendar-deadline-tag',title:`独立截止时间 ${dateLabel(t.deadline,true)}`,'aria-label':'当日截止'},'截止'));
 return row;
}
function renderMonthCalendar(ctx) {
 const {ui,actions}=ctx,month=calendarMonth(ui.anchor),today=calendarDateKey(new Date());
 const all=ctx.tasks.filter(t=>ui.timelineQuadrant==='all'||quadrantInfo(t).id===ui.timelineQuadrant);
 const entries=calendarEntries(all,month),pending=all.filter(t=>!t.plannedStart&&!t.deadline);
 const ids=new Set([...entries.values()].flatMap(rows=>rows.map(e=>e.task.id)));
 const deadlines=all.filter(t=>t.deadline&&Date.parse(t.deadline)>=+month.first&&Date.parse(t.deadline)<+month.end);
 const root=el('div',{class:'timeline-view calendar-view',dataset:{testid:'calendar-view'}});
 const monthValue=`${month.year}-${String(month.month).padStart(2,'0')}`;
 const picker=el('input',{type:'month',class:'calendar-month-input','aria-label':'选择月份',value:monthValue,min:'1900-01',max:'2199-12',onChange:e=>{
  const value=e.target.value;
  if(/^\d{4}-\d{2}$/.test(value)){const [y,m]=value.split('-').map(Number);if(y>=1900&&y<=2199&&m>=1&&m<=12)actions.timeAnchor(new Date(y,m-1,1));}
 }});
 const tools=el('div',{class:'timeline-tools calendar-tools'},
  button('本月',()=>actions.timeAnchor(new Date()),{className:'secondary small'}),
  iconButton('back','上一个月',()=>actions.timeAnchor(navigateRange(ui.anchor,'month',-1))),picker,
  iconButton('next','下一个月',()=>actions.timeAnchor(navigateRange(ui.anchor,'month',1))),
  selectControl('月历状态筛选',ui.status,statusOptions(),actions.timeStatus),
  selectControl('月历象限筛选',ui.timelineQuadrant,[['all','全部象限'],...QUADRANTS.map(q=>[q.id,q.name])],actions.timelineFilter));
 root.append(el('div',{class:'timeline-toolbar calendar-toolbar'},el('div',{class:'inline'},el('h1',{},'工作月历'),timeViewSwitch(ui,actions)),tools));
 root.append(el('div',{class:'calendar-summary'},el('div',{},el('h2',{},`${month.year} 年 ${month.month} 月`),el('p',{class:'calendar-month-note'},calendarMonthNote(ui.anchor))),
  el('div',{class:'calendar-legend'},el('span',{class:'holiday'},'假期'),el('span',{class:'makeup'},'补班'),el('span',{class:'weekend'},'周末'),el('span',{class:'calendar-month-count'},`${ids.size} 项工作 · ${deadlines.length} 项截止`))));
 const viewport=el('div',{class:'calendar-viewport','aria-label':'工作月历，可纵向滚动',tabIndex:0});
 const weekday=el('div',{class:'calendar-weekdays'},['周一','周二','周三','周四','周五','周六','周日'].map(label=>el('div',{},label)));
 const grid=el('div',{class:'calendar-grid',style:{'--calendar-weeks':month.weeks},'aria-label':`${month.year}年${month.month}月工作日历`});
 const mounts=[];
 function dayKeyNav(event,key) {
  const deltas={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
  if(!Object.hasOwn(deltas,event.key))return;
  event.preventDefault();const d=new Date(`${key}T12:00:00`);d.setDate(d.getDate()+deltas[event.key]);
  const nextKey=calendarDateKey(d),next=grid.querySelector(`[data-date="${nextKey}"] .calendar-date`);
  if(next)next.focus(); // Boundaries stay within current month; explicit month controls remain available.
 }
 for(const cell of month.cells){
  if(!cell.inMonth){grid.append(el('div',{class:'calendar-cell outside','aria-hidden':'true'}));continue;}
  const info=calendarDayInfo(cell.key),list=entries.get(cell.key);
  const node=el('section',{class:`calendar-cell ${info.kind}${cell.key===today?' is-today':''}${ui.calendarDay===cell.key?' day-selected':''}`,dataset:{date:cell.key},'aria-label':`${cell.key}，${info.label||'工作日'}，${list.length}项任务`,onDblClick:event=>{
   if(!event.target.closest('button'))actions.newTask(calendarTaskDefaults(cell.key));
  }});
  const date=el('button',{class:'calendar-date',type:'button','aria-label':`查看${cell.key}的工作`,onClick:()=>actions.calendarDay(cell.key),onKeyDown:e=>dayKeyNav(e,cell.key)},String(cell.date.getDate()).padStart(2,'0'));
  node.append(el('div',{class:'calendar-day-header'},date,el('span',{class:'calendar-day-note'},info.label),iconButton('plus',`在${cell.key}新增任务`,()=>actions.newTask(calendarTaskDefaults(cell.key)),'calendar-add')));
  const listHost=el('div',{class:'calendar-cell-tasks'});
  const more=button('',()=>actions.calendarDay(cell.key),{className:'calendar-more small','aria-label':`查看${cell.key}全部${list.length}项任务`});
  node.append(listHost,more);grid.append(node);mounts.push({node,list,listHost,more,last:-1});
 }
 viewport.append(weekday,grid);root.append(viewport);
 const foot=el('div',{class:'calendar-foot'},button(`未安排日期 ${pending.length} 项`,()=>actions.calendarDay('pending'),{className:'secondary small'}),
  el('span',{class:'muted'},'点击日期查看当天 · ＋ 添加任务 · 截止时间单独标记'));
 root.append(foot);
 function paint(){
  for(const m of mounts){
   const narrow=viewport.clientWidth<640;
   const available=Math.max(0,m.node.clientHeight-48),full=Math.min(5,Math.floor(available/28));
   const capacity=narrow?0:Math.max(1,m.list.length<=full?full:Math.min(5,Math.floor((available-22)/28)));
   if(capacity===m.last)continue;m.last=capacity;
   m.listHost.replaceChildren(...m.list.slice(0,capacity).map(e=>calendarTaskRow(e,actions)));
   const hidden=m.list.length>capacity;
   m.more.hidden=!hidden;
   m.more.textContent=narrow?`${m.list.length} 项工作`:`查看全部 ${m.list.length} 项`;
   if(narrow&&m.list.some(e=>e.deadline))m.more.append(el('small',{class:'calendar-mobile-deadline'},`${m.list.filter(e=>e.deadline).length} 项截止`));
  }
 }
 viewport.addEventListener('scroll',()=>{ui.calendarScroll=viewport.scrollTop;},{passive:true});
 const observer=new ResizeObserver(paint);observer.observe(viewport);
 requestAnimationFrame(()=>{if(root.isConnected){viewport.scrollTop=ui.calendarScroll||0;paint();}});
 return {element:root,destroy:()=>observer.disconnect()};
}
/** A virtual daily agenda keeps a calendar cell readable with tens or thousands of tasks. */
export function renderCalendarDay(ctx) {
 const {ui,actions}=ctx,key=ui.calendarDay,pending=key==='pending';
 const all=ctx.tasks.filter(t=>ui.timelineQuadrant==='all'||quadrantInfo(t).id===ui.timelineQuadrant);
 const entries=pending?sortTasks(all.filter(t=>!t.plannedStart&&!t.deadline)).map(task=>({task,key,planned:false,deadline:false})):
  (calendarEntries(all,calendarMonth(new Date(`${key}T12:00:00`))).get(key)||[]);
 const title=pending?'未安排日期':`${Number(key.slice(5,7))} 月 ${Number(key.slice(8))} 日`;
 const root=el('aside',{class:'drawer calendar-day-panel',role:'complementary','aria-label':'当日任务'});
 root.append(el('div',{class:'drawer-header calendar-agenda-header'},el('h2',{},title),iconButton('close','关闭当日任务',actions.closePanel)),
  el('div',{class:'inline spread calendar-agenda-summary'},el('span',{class:'calendar-day-count'},`${entries.length} 项工作`),button('新增任务',()=>actions.newTask(pending?{}:calendarTaskDefaults(key)),{className:'text-button small',iconName:'plus'})));
 if(!pending)root.append(el('p',{class:'calendar-day-caption'},calendarDayInfo(key).label||'工作日', ' · 与四象限共用同一份任务'));
 const scroll=el('div',{class:'calendar-agenda-scroll',tabIndex:0,'aria-label':'当日完整任务列表，可滚动'}),space=el('div',{class:'calendar-agenda-space',style:{height:`${entries.length*76}px`}});scroll.append(space);root.append(scroll);
 function paint(){
  ui.calendarDayScroll=scroll.scrollTop;
  const first=Math.max(0,Math.floor(scroll.scrollTop/76)-3),last=Math.min(entries.length,Math.ceil((scroll.scrollTop+scroll.clientHeight)/76)+3);
  space.replaceChildren();
  for(let i=first;i<last;i++){const row=calendarTaskRow(entries[i],actions,false);row.style.top=`${i*76}px`;space.append(row);}
  if(!entries.length)space.append(el('p',{class:'calendar-day-empty'},pending?'没有未安排日期的任务。':'当天没有符合筛选条件的任务。'));
 }
 scroll.addEventListener('scroll',paint,{passive:true});const observer=new ResizeObserver(paint);observer.observe(scroll);
 requestAnimationFrame(()=>{if(root.isConnected){scroll.scrollTop=ui.calendarDayScroll||0;paint();}});
 root.append(el('p',{class:'calendar-agenda-help'},'点击任务查看详情；点击状态标记推进状态。done 再次点击归档。'));
 return {element:root,destroy:()=>observer.disconnect()};
}
