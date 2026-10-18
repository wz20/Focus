export function demoInputs(dense=false){
 const anchor=new Date();anchor.setHours(0,0,0,0);
 const at=(day,hour)=>{const d=new Date(anchor);d.setDate(d.getDate()+day);d.setHours(hour,0,0,0);return d.toISOString();};
 const rows=[
 ['优化培训模板',true,false,'ing',0,9,4,17,180],
 ['设计课程框架',true,false,'todo',1,9,4,17,120],
 ['准备月度复盘',true,false,'todo',2,9,4,17,120],
 ['完成培训方案',true,true,'ing',0,9,2,18,240],
 ['确认培训场地',true,true,'todo',0,16,0,17,20],
 ['提交活动预算',true,true,'done',0,9,0,12,30],
 ['整理旧文件',false,false,'todo',null,null,null,null,60],
 ['调整模板封面',false,false,'todo',null,null,null,null,30],
 ['活动物料确认',false,true,'ing',0,10,1,17,60],
 ['回复报名咨询',false,true,'todo',1,9,1,17,30],
 ['确认会议室',false,true,'todo',0,15,0,16,10],
 ];
 const result=rows.map(([title,important,urgent,status,sd,sh,ed,eh,estimateMinutes])=>({title,important,urgent,status,plannedStart:sd===null?null:at(sd,sh),plannedEnd:ed===null?null:at(ed,eh),estimateMinutes,isDemo:true,notes:'这是虚构的示例任务，可自由修改。示例不包含公司或员工资料。'}));
 if(dense){const topics=['发送课程安排','复核报名信息','准备培训材料','确认讲师档期','校对课程介绍','汇总公开反馈','核对活动流程','准备签到表'];for(let i=0;i<90;i++)result.push({title:`${topics[i%topics.length]} ${Math.floor(i/topics.length)+1}`,important:i%4<3,urgent:i%5<4,status:i%8===0?'ing':'todo',plannedStart:at(i%7,9),plannedEnd:at(i%7+1,17),estimateMinutes:30,isDemo:true});}
 return result;
}
