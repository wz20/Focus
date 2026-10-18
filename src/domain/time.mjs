/** Local calendar view boundaries; domain timestamps remain absolute instants. */
export function timelineRange(anchor,scale){
 const start=new Date(anchor);start.setHours(0,0,0,0);
 if(scale==='week')start.setDate(start.getDate()-(start.getDay()+6)%7);
 if(scale==='month')start.setDate(1);
 const end=new Date(start);if(scale==='day')end.setDate(end.getDate()+1);else if(scale==='week')end.setDate(end.getDate()+7);else end.setMonth(end.getMonth()+1);
 const columns=[];let cursor=new Date(start);
 while(cursor<end){const next=new Date(cursor);if(scale==='day')next.setHours(next.getHours()+1);else next.setDate(next.getDate()+1);columns.push({start:new Date(cursor),end:next});cursor=next;}
 return {start,end,columns,scale};
}
export function barPosition(start,end,range){
 if(!start||!end)return null;const a=+new Date(start),b=+new Date(end),rs=+range.start,re=+range.end;
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b<=rs||a>=re)return null;
 return {left:Math.max(0,(a-rs)/(re-rs)*100),width:(Math.min(b,re)-Math.max(a,rs))/(re-rs)*100,clippedLeft:a<rs,clippedRight:b>re};
}
export function navigateRange(anchor,scale,direction){const d=new Date(anchor);if(scale==='month'){d.setDate(1);d.setMonth(d.getMonth()+direction);}else d.setDate(d.getDate()+direction*(scale==='week'?7:1));return d;}

/** Month view is a read-only projection of the existing task store, not a second calendar database. */
export function calendarDateKey(value) {
 const date=new Date(value);
 if(!Number.isFinite(+date))throw new Error('无效日期');
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function calendarParseDay(key) {
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(key||'');
 if(!match)throw new Error('无效日期');
 const d=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
 if(calendarDateKey(d)!==key)throw new Error('无效日期');
 return d;
}
export function calendarMonth(anchor) {
 const first=new Date(anchor);
 if(!Number.isFinite(+first))throw new Error('无效日期');
 first.setDate(1);first.setHours(0,0,0,0);
 const end=new Date(first);end.setMonth(end.getMonth()+1);
 const start=new Date(first);start.setDate(start.getDate()-(start.getDay()+6)%7);
 const count=Math.ceil(((first.getDay()+6)%7+new Date(first.getFullYear(),first.getMonth()+1,0).getDate())/7)*7;
 const cells=[];
 for(let i=0;i<count;i++){
  const date=new Date(start);date.setDate(start.getDate()+i);
  const next=new Date(date);next.setDate(date.getDate()+1);
  cells.push({key:calendarDateKey(date),date,end:next,inMonth:date>=first&&date<end});
 }
 return {first,end,cells,weeks:count/7,year:first.getFullYear(),month:first.getMonth()+1};
}
// Offline calendar annotations, not task data. Other years intentionally have no inferred holidays.
// Source: State Council 2026 notice, official republication:
// https://www.wuhan.gov.cn/zwgk/tzgg/202609/t20260907_2844002.shtml
const CAL_HOLIDAYS_2026=[
 ['01-01','01-03','元旦'],['02-15','02-23','春节'],['04-04','04-06','清明节'],
 ['05-01','05-05','劳动节'],['06-19','06-21','端午节'],['09-25','09-27','中秋节'],['10-01','10-07','国庆节']
];
const CAL_MAKEUP_2026=['01-04','02-14','02-28','05-09','09-20','10-10'];
export function calendarDayInfo(key) {
 const date=calendarParseDay(key),short=key.slice(5);
 if(date.getFullYear()===2026){
  if(CAL_MAKEUP_2026.includes(short))return {kind:'makeup',label:'补班 · 上班'};
  const holiday=CAL_HOLIDAYS_2026.find(([a,b])=>short>=a&&short<=b);
  if(holiday)return {kind:'holiday',label:`${holiday[2]} · 休`};
 }
 return [0,6].includes(date.getDay())?{kind:'weekend',label:'周末'}:{kind:'workday',label:''};
}
export function calendarMonthNote(anchor) {
 const d=new Date(anchor);
 if(d.getFullYear()!==2026)return '该年份仅标注周末，节假日与调休尚未配置。';
 const prefix=String(d.getMonth()+1).padStart(2,'0');
 const holidays=CAL_HOLIDAYS_2026.filter(([a])=>a.startsWith(prefix)).map(([a,b,name])=>`${name} ${a.replace('-','.')}—${b.replace('-','.')}`);
 const workdays=CAL_MAKEUP_2026.filter(k=>k.startsWith(prefix)).map(k=>`${k.replace('-','.')} 补班`);
 return [...holidays,...workdays].join('  ·  ')||'中国大陆 2026 年工作日历；公司自定义调休请以实际安排为准。';
}
/** Plan intervals are half-open. A deadline is a separate instant, never a rescheduled plan end. */
export function calendarEntries(tasks,month) {
 const days=month.cells.filter(c=>c.inMonth),map=new Map(days.map(c=>[c.key,[]]));
 for(const task of tasks){
  if(task.archivedAt)continue;
  const a=Date.parse(task.plannedStart),b=Date.parse(task.plannedEnd),d=Date.parse(task.deadline);
  if(!(a<+month.end&&b>+month.first)&&!(d>=+month.first&&d<+month.end))continue;
  for(const cell of days){
   const planned=a<+cell.end&&b>+cell.date,deadline=d>=+cell.date&&d<+cell.end;
   if(!planned&&!deadline)continue;
   map.get(cell.key).push({task,key:cell.key,planned,deadline,continued:planned&&a<+cell.date,continues:planned&&b>+cell.end,sortAt:planned?Math.max(a,+cell.date):d});
  }
 }
 for(const entries of map.values())entries.sort((a,b)=>(a.task.status==='done')-(b.task.status==='done')||a.sortAt-b.sortAt||a.task.title.localeCompare(b.task.title,'zh-CN')||a.task.id.localeCompare(b.task.id));
 return map;
}
export function calendarTaskDefaults(key) {
 const start=calendarParseDay(key);start.setHours(9,0,0,0);
 const end=new Date(start);end.setHours(10,0,0,0);
 return {plannedStart:start.toISOString(),plannedEnd:end.toISOString()};
}
export function calendarEntryLabel(entry) {
 const clock=value=>{const d=new Date(value);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
 const plan=entry.planned?(entry.continued?'跨日':clock(entry.task.plannedStart)):'';
 const due=entry.deadline?`截止 ${clock(entry.task.deadline)}`:'';
 return [plan,due].filter(Boolean).join(' · ');
}
