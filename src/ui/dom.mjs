import { STATUS_LABELS } from '../domain/model.mjs';
export function el(tag,props={},...children){
 const node=document.createElement(tag);
 for(const [key,value] of Object.entries(props||{})){
  if(value===undefined||value===null)continue;
  if(key==='class')node.className=value;
  else if(key==='style'&&typeof value==='object'){for(const [k,v] of Object.entries(value))node.style.setProperty(k,String(v));}
  else if(key.startsWith('on')&&typeof value==='function')node.addEventListener(key.slice(2).toLowerCase(),value);
  else if(key==='dataset'){for(const [k,v] of Object.entries(value))node.dataset[k]=String(v);}
  else if(['value','checked','disabled','selected','hidden','draggable','tabIndex'].includes(key))node[key]=value;
  else node.setAttribute(key,String(value));
 }
 for(const child of children.flat(Infinity)){if(child===null||child===undefined||child===false)continue;node.append(child instanceof Node?child:document.createTextNode(String(child)));}
 return node;
}
const paths={
 plus:'M12 5v14M5 12h14',search:'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM16 16l5 5',
 close:'M5 5l14 14M19 5L5 19',archive:'M3 6h18v4H3zM5 10v11h14V10M9 14h6',
 grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
 timeline:'M3 5h8M7 12h12M12 19h9M3 12h1M3 19h6',back:'M14 5l-7 7 7 7',next:'M10 5l7 7-7 7',
 chevron:'M6 9l6 6 6-6',check:'M5 12l4 4L19 6',edit:'M14 5l5 5M4 20l5-1L21 7l-4-4L5 15z',
 more:'M5 12h.01M12 12h.01M19 12h.01',download:'M12 3v12M7 10l5 5 5-5M4 17v4h16v-4',upload:'M12 16V4M7 9l5-5 5 5M4 17v4h16v-4',
 trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
 clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',expand:'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5',undo:'M8 4L3 9l5 5M3 9h11a7 7 0 0 1 0 14',
 circle:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',calendar:'M4 5h16v16H4zM4 10h16M8 2v6M16 2v6',
};
export function icon(name,size=18){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width',size);svg.setAttribute('height',size);svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
 const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.circle);svg.append(p);return svg;
}
export function button(label,onClick,{className='',title='',iconName=null,...rest}={}){
 return el('button',{type:'button',class:`button ${className}`,title:title||label,onClick,...rest},iconName?icon(iconName):null,label?el('span',{},label):null);
}
export function iconButton(name,label,onClick,className=''){return button('',onClick,{className:`icon-button ${className}`,title:label,'aria-label':label,iconName:name});}
export function statusMark(status){return el('span',{class:`status-mark ${status}`,'aria-hidden':'true'},status==='done'?icon('check',13):status==='ing'?el('span',{class:'half-dot'}):null);}
export function statusButton(task,onAdvance,{text=false}={}){
 const next=task.status==='done'?'归档':task.status==='ing'?'标记为已完成':'开始任务';
 return el('button',{type:'button',class:`status-button ${task.status}`,title:`${STATUS_LABELS[task.status]} · 点击${next}`,'aria-label':`${task.title}：${next}`,onClick:e=>{e.stopPropagation();onAdvance(task.id);},onPointerDown:e=>e.stopPropagation(),draggable:false},statusMark(task.status),text?task.status:null);
}
export function selectControl(label,value,options,onChange){const select=el('select',{'aria-label':label,onChange:e=>onChange(e.target.value)},options.map(([v,text])=>el('option',{value:v,selected:v===value},text)));return el('div',{class:'select-wrap'},select,icon('chevron',14));}
export function statusOptions(){return [['all','全部状态'],['todo','todo · 待办'],['ing','ing · 进行中'],['done','done · 已完成']];}
export function toast(message,actionLabel,action){
 const root=document.getElementById('toast-root');root.replaceChildren();const node=el('div',{class:'toast',role:'status'},el('span',{},message));
 if(actionLabel&&action)node.append(button(actionLabel,()=>{action();node.remove();},{className:'toast-action'}));root.append(node);const id=setTimeout(()=>node.remove(),5500);node.addEventListener('mouseenter',()=>clearTimeout(id));
}
export function hashString(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function trapFocus(container,onEscape){
 const key=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onEscape();return;}
  if(e.key!=='Tab')return;
  const nodes=[...container.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(n=>!n.hidden&&n.getClientRects().length);
  if(!nodes.length)return;
  if(e.shiftKey&&document.activeElement===nodes[0]){nodes.at(-1).focus();e.preventDefault();}
  else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){nodes[0].focus();e.preventDefault();}
 };container.addEventListener('keydown',key);return()=>container.removeEventListener('keydown',key);
}
