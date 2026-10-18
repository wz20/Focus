import {QUADRANTS,quadrantInfo,sortTasks,formatDuration,dateLabel,STATUS_LABELS,relativeEnd,reminderLeadLabel} from '../domain/model.mjs';
import {el,button,iconButton,icon,statusButton,statusMark,selectControl} from './dom.mjs';
export function renderExpanded(ctx){
 const {store,ui,actions}=ctx;const q=quadrantInfo(ui.expanded);const all=ctx.tasks.filter(t=>quadrantInfo(t).id===q.id);
 const selected=sortTasks(all.filter(t=>ui.panelStatus==='all'||t.status===ui.panelStatus),ui.sort);
 const pane=el('aside',{class:'drawer quadrant-drawer','aria-label':`${q.name}任务列表`,style:{'--q':q.color,'--qfill':q.fill}},
   el('div',{class:'drawer-top'},el('h2',{class:'quadrant-pane-title'},q.name,el('span',{class:'count-badge'},all.length)),iconButton('close','关闭任务列表',actions.closePanel)),
   el('div',{class:'panel-tabs'},['all','todo','ing','done'].map(s=>button(`${s==='all'?'全部':s} ${s==='all'?all.length:all.filter(t=>t.status===s).length}`,()=>actions.panelFilter(s),{className:`pill ${ui.panelStatus===s?'active':''}`,dataset:{panelStatus:s}}))),
   el('div',{class:'panel-sort'},selectControl('列表排序',ui.sort,[['priority','进行中优先'],['deadline','按截止时间'],['plannedEnd','按计划结束'],['created','按创建时间'],['title','按任务名称']],actions.sort)));
 const viewport=el('div',{class:'virtual-list',tabIndex:0,'aria-label':'滚动查看全部任务',dataset:{testid:'task-list'}});const spacer=el('div',{class:'virtual-spacer'});viewport.append(spacer);pane.append(viewport);
 const rowHeight=80;spacer.style.height=`${selected.length*rowHeight}px`;
 const paint=()=>{
  const top=viewport.scrollTop;ui.listScroll=top;const start=Math.max(0,Math.floor(top/rowHeight)-4),end=Math.min(selected.length,Math.ceil((top+viewport.clientHeight)/rowHeight)+4);spacer.replaceChildren();
  if(!selected.length){spacer.append(el('div',{class:'list-empty'},'这里还没有任务。'));return;}
  for(let i=start;i<end;i++){
   const t=selected[i];const row=el('div',{class:`task-list-row ${t.status}`,style:{top:`${i*rowHeight}px`},dataset:{taskId:t.id}},statusButton(t,actions.advance),el('button',{type:'button',class:'list-task-open',onClick:()=>actions.select(t.id)},el('span',{class:'task-name'},t.title),el('span',{class:'row-meta'},`${t.deadline&&t.status!=='done'?'截止 '+dateLabel(t.deadline,true):relativeEnd(t)} · ${t.estimateMinutes?`预计 ${formatDuration(t.estimateMinutes)}`:'未估时'}`)),el('span',{class:`status-text ${t.status}`},t.status));spacer.append(row);
  }
 };
 viewport.addEventListener('scroll',paint,{passive:true});const ro=new ResizeObserver(paint);ro.observe(viewport);
 requestAnimationFrame(()=>{viewport.scrollTop=ui.listScroll||0;paint();});
 pane.append(el('div',{class:'drawer-footnote'},`共 ${selected.length} 项`,el('span',{},'滚动查看更多')));
 return {element:pane,destroy:()=>ro.disconnect()};
}
export function renderDetail(ctx){
 const {store,ui,actions}=ctx;const t=store.get(ui.selected);if(!t)return null;const q=quadrantInfo(t);const archived=Boolean(t.archivedAt);
 const pane=el('aside',{class:'drawer detail-drawer','aria-label':'任务详情'},
   el('div',{class:'drawer-top'},el('span',{class:'muted'},'任务详情'),el('div',{class:'inline'},!archived?iconButton('edit','编辑任务',()=>actions.editTask(t.id)):null,iconButton('close','关闭任务详情',actions.closePanel))),
   el('h2',{class:'detail-title'},t.title),el('span',{class:'quadrant-badge',style:{'--q':q.color,'--qfill':q.fill}},q.name));
 const body=el('div',{class:'detail-body'});
 body.append(el('div',{class:'field-caption'},'状态'),el('div',{class:'status-segments'},['todo','ing','done'].map(s=>statusSegment(t,s,actions,archived))));
 body.append(el('p',{class:'field-help'},archived?'任务已归档。恢复后可重新调整状态。':'完成后仍保留在工作区，再次点击完成标记即可归档。'));
 if(!archived)body.append(el('div',{class:'detail-quadrant'},el('span',{class:'muted'},'所在象限'),selectControl('修改所在象限',q.id,QUADRANTS.map(x=>[x.id,x.name]),qid=>actions.move(t.id,qid))));
 body.append(el('div',{class:'detail-facts'},fact('计划开始',t.plannedStart?`${new Date(t.plannedStart).getFullYear()}.${dateLabel(t.plannedStart,true)}`:'未设置'),fact('计划结束',t.plannedEnd?`${new Date(t.plannedEnd).getFullYear()}.${dateLabel(t.plannedEnd,true)}`:'未设置'),fact('截止时间',t.deadline?`${new Date(t.deadline).getFullYear()}.${dateLabel(t.deadline,true)}`:'未设置（可选）'),fact('预计用时',formatDuration(t.estimateMinutes))));
 if(t.deadline&&t.status!=='done'){
  if(Date.parse(t.deadline)<Date.now())body.append(el('p',{class:'deadline-detail-warning'},'已超过截止时间'));
  else if(t.plannedEnd&&Date.parse(t.plannedEnd)>Date.parse(t.deadline))body.append(el('p',{class:'deadline-detail-warning'},'当前计划结束晚于截止时间'));
 }
 body.append(el('div',{class:'detail-reminders'},el('div',{class:'field-caption'},'弹窗提醒'),fact('开始提醒',reminderLeadLabel(t.reminders?.startMinutes)),fact('截止提醒',reminderLeadLabel(t.reminders?.deadlineMinutes)),el('p',{class:'field-help'},t.status==='done'||archived?'已完成 / 已归档，后续提醒已停止。':'仅在 Focus 运行时提醒；点击编辑可修改或关闭。')));
 body.append(el('div',{class:'field-caption'},'备注'),el('p',{class:`detail-notes ${t.notes?'':'muted'}`},t.notes||'没有备注。'));
 if(t.status==='done')body.append(el('div',{class:'completion-message'},statusMark('done'),el('div',{},el('span',{},`${archived?'已归档':'已完成'} · ${dateLabel(archived?t.archivedAt:t.completedAt,true)}`),el('small',{},archived?'可恢复到原象限，保留 done 状态。':'仍在工作区中，尚未归档。'))));
 else if(t.status==='ing')body.append(el('p',{class:'started-message'},'进行中',el('span',{class:'muted'},`开始于 ${dateLabel(t.startedAt,true)}`)));
 pane.append(body);
 const footer=el('div',{class:'detail-actions'});
 if(archived){footer.append(button('恢复到工作区',()=>actions.restore(t.id),{className:'primary grow',iconName:'undo'}));}
 else if(t.status==='done'){footer.append(button('设为 ing',()=>actions.setStatus(t.id,'ing'),{className:'secondary'}),button('归档任务',()=>actions.archive(t.id),{className:'primary grow',iconName:'archive'}));}
 else{footer.append(button(t.status==='ing'?'设为 todo':'开始任务',()=>actions.setStatus(t.id,t.status==='ing'?'todo':'ing'),{className:'secondary'}),button('标记 done · 已完成',()=>actions.setStatus(t.id,'done'),{className:'primary grow'}));}
 pane.append(footer,button('删除任务',()=>actions.confirmDelete(t.id),{className:'delete-link',iconName:'trash'}));
 return {element:pane,destroy:()=>{}};
}
function statusSegment(task,status,actions,disabled){return el('button',{type:'button',class:`status-segment ${status}${task.status===status?' active':''}`,disabled,'aria-label':`设为 ${status}`,'aria-pressed':task.status===status,onClick:()=>actions.setStatus(task.id,status)},statusMark(status),el('span',{},`${status} ${STATUS_LABELS[status]}`));}
function fact(label,value){return el('div',{class:'fact'},el('span',{class:'muted'},label),el('span',{},value));}
export function renderArchive(ctx){
 const {store,actions}=ctx;const tasks=sortTasks(ctx.tasks,'archive');
 const root=el('div',{class:'archive-view'},button('返回工作区',()=>actions.navigate('quadrants'),{className:'text-button',iconName:'back'}),el('div',{class:'archive-heading'},el('h1',{},'归档'),el('span',{class:'muted'},`${tasks.length} 项`)),el('p',{class:'muted'},'归档的任务不再出现在四象限和时间轴中。'));
 const scroll=el('div',{class:'archive-scroll'});const table=el('table',{class:'archive-table'},el('thead',{},el('tr',{},['任务名称','原象限','状态','完成时间','归档时间','操作'].map(x=>el('th',{},x)))));const body=el('tbody');
 for(const t of tasks){const q=quadrantInfo(t);body.append(el('tr',{},el('td',{},el('button',{class:'archive-task-title',onClick:()=>actions.select(t.id)},icon('archive'),el('span',{},t.title))),el('td',{},el('span',{class:'quadrant-badge',style:{'--q':q.color,'--qfill':q.fill}},q.name)),el('td',{},el('span',{class:'inline done'},statusMark('done'),'done')),el('td',{},dateLabel(t.completedAt,true)),el('td',{},dateLabel(t.archivedAt,true)),el('td',{},button('恢复',()=>actions.restore(t.id),{className:'text-button'}))));}
 table.append(body);scroll.append(table);if(!tasks.length)scroll.append(el('div',{class:'archive-empty'},icon('archive',38),el('h3',{},ctx.ui.query?'没有找到匹配的归档任务':'归档里还很安静'),el('p',{},'任务完成后，再次点击完成标记即可归档。')));root.append(scroll,el('p',{class:'archive-hint'},'恢复后返回原象限，保留 done 状态；可以再改为 todo 或 ing。'));return {element:root,destroy:()=>{}};
}
