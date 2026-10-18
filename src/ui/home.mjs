import {QUADRANTS,quadrantOf,sortTasks,relativeEnd,formatDuration,dateLabel} from '../domain/model.mjs';
import {el,button,iconButton,statusButton,hashString,icon} from './dom.mjs';
export function renderHome(ctx){
 const {store,ui,actions}=ctx;const tasks=ctx.tasks;
 const board=el('div',{class:'quadrant-board',dataset:{testid:'quadrant-board'}});
 const axes=document.createElementNS('http://www.w3.org/2000/svg','svg');axes.classList.add('axes');axes.setAttribute('aria-hidden','true');
 const path=document.createElementNS(axes.namespaceURI,'path');path.setAttribute('stroke','currentColor');path.setAttribute('fill','none');path.setAttribute('stroke-width','1.6');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');axes.append(path);board.append(axes);
 for(const [cls,label] of [['north','重要'],['south','不重要'],['west','不紧急'],['east','紧急']])board.append(el('span',{class:`axis-label ${cls}`},label));
 board.append(el('span',{class:'origin'}));
 const cleanup=[];
 const axisObserver=new ResizeObserver(()=>{const w=board.clientWidth,h=board.clientHeight,cx=w/2,cy=h/2;axes.setAttribute('viewBox',`0 0 ${w} ${h}`);path.setAttribute('d',`M61 ${cy+.3} Q${cx-100} ${cy-1} ${w-61} ${cy} M${w-71} ${cy-6} L${w-61} ${cy} L${w-71} ${cy+6} M71 ${cy-6} L61 ${cy} L71 ${cy+6} M${cx} 35 Q${cx+1} ${cy} ${cx-.3} ${h-35} M${cx-6} 45 L${cx} 35 L${cx+6} 45 M${cx-6} ${h-45} L${cx-.3} ${h-35} L${cx+6} ${h-45}`);});axisObserver.observe(board);cleanup.push(()=>axisObserver.disconnect());
 for(const q of QUADRANTS){
  const items=sortTasks(tasks.filter(t=>quadrantOf(t)===q.id));
  const section=el('section',{class:`quadrant ${q.id}${ui.expanded===q.id?' is-expanded':''}`,dataset:{quadrant:q.id},'aria-label':q.name,style:{'--q':q.color,'--qfill':q.fill}});
  const header=el('div',{class:'quadrant-header'},button(q.name,()=>actions.expand(q.id),{className:'quadrant-title',title:`展开${q.name}，${items.length}项任务`}),el('span',{class:'quadrant-count'},items.length),iconButton('expand','展开该象限',()=>actions.expand(q.id),'expand-button'));
  const area=el('div',{class:'task-area'});section.append(header,area);board.append(section);
  section.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('application/x-focus-task')){event.preventDefault();event.dataTransfer.dropEffect='move';section.classList.add('drop-target');}});
  section.addEventListener('dragleave',event=>{if(!section.contains(event.relatedTarget))section.classList.remove('drop-target');});
  section.addEventListener('drop',event=>{event.preventDefault();section.classList.remove('drop-target');const id=event.dataTransfer.getData('application/x-focus-task');if(id&&store.get(id))actions.move(id,q.id);});
  area.addEventListener('dblclick',event=>{if(event.target===area)actions.newTask({important:q.important,urgent:q.urgent});});
  const layout=()=>{
    const w=area.clientWidth,h=area.clientHeight;if(!w||!h)return;
    const zoom=ui.zoom/100;const cw=Math.min(w-6,258*zoom,Math.max(185,w*.46));const cardH=88*zoom;
    const cols=w>=cw*2+28?2:1;const rows=Math.max(1,Math.floor((h+12)/(cardH+20)));const capacity=Math.max(1,Math.min(6,cols*rows));
    const dense=items.length>capacity;const show=dense?Math.max(1,capacity-1):items.length;
    area.replaceChildren();
    if(!items.length){area.append(button(tasks.length?'暂无匹配任务':'添加一件事',()=>actions.newTask({important:q.important,urgent:q.urgent}),{className:'quadrant-empty',iconName:'plus'}));return;}
    for(let i=0;i<show;i++){
     const t=items[i];const seed=hashString(t.id);const row=Math.floor(i/cols),col=i%cols;
     const fullRow=i+cols<=show || col>0;
     let x=cols===1?Math.max(0,(w-cw)/2):col===0?6:Math.max(cw+18,w-cw-6);
     if(cols===2&&i===show-1&&i%2===0&&show%2===1&&!dense)x=(w-cw)/2;
     const jitter=(seed%7)-3;const y=row*(cardH+20)+5+(col?6:0);
     const card=renderTaskCard(t,ctx);card.style.width=`${Math.min(cw,w-6)}px`;card.style.height=`${cardH}px`;card.style.left=`${Math.min(Math.max(0,x+jitter),w-cw)}px`;card.style.top=`${y}px`;card.style.setProperty('--tilt',`${((seed%11)-5)/10}deg`);card.style.fontSize=`${17.5*zoom}px`;area.append(card);
    }
    if(dense){
     const i=show,row=Math.floor(i/cols),col=i%cols;let x=cols===1?(w-cw)/2:col?Math.max(cw+18,w-cw-6):6;
     const stack=button('',()=>actions.expand(q.id),{className:'task-stack','aria-label':`查看${q.name}全部${items.length}项任务`});stack.append(el('span',{},`查看全部 ${items.length} 项`),el('span',{class:'stack-more'},`+${items.length-show}`),icon('next',15));
     stack.style.cssText+=`;width:${Math.min(cw,w-6)}px;left:${Math.max(0,x)}px;top:${row*(cardH+20)+7}px;height:${Math.min(cardH,70)}px`;area.append(stack);
    }
  };
  const observer=new ResizeObserver(layout);observer.observe(area);cleanup.push(()=>observer.disconnect());
 }
 if(store.tasks.length===0){board.append(el('div',{class:'empty-start'},el('p',{},'把第一件事，放在合适的位置。'),button('创建第一个任务',()=>actions.newTask(),{className:'primary',iconName:'plus'}),button('先用示例体验',()=>actions.demo(),{className:'text-button'})));}
 return {element:board,destroy:()=>cleanup.forEach(fn=>fn())};
}
export function renderTaskCard(task,ctx){
 const {ui,actions}=ctx;
 const card=el('article',{class:`task-card ${task.status}${ui.selected===task.id?' selected':''}`,tabIndex:0,draggable:true,role:'button','aria-label':`查看任务：${task.title}`,dataset:{taskId:task.id},onClick:()=>actions.select(task.id),onKeyDown:e=>{if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();actions.select(task.id);}}},
   el('div',{class:'task-card-title'},statusButton(task,actions.advance),el('span',{class:'task-name'},task.title)),
   el('div',{class:'task-card-meta'},el('span',{class:task.deadline&&task.status!=='done'?'deadline-card-label':''},task.deadline&&task.status!=='done'?`截止 ${dateLabel(task.deadline,true)}`:relativeEnd(task)),el('span',{class:'meta-separator'},'·'),el('span',{},task.estimateMinutes?`预计 ${formatDuration(task.estimateMinutes)}`:'未估时')),
   el('span',{class:`status-text ${task.status}`},task.status));
 card.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-focus-task',task.id);event.dataTransfer.effectAllowed='move';card.classList.add('dragging');});card.addEventListener('dragend',()=>card.classList.remove('dragging'));
 return card;
}
