import { createTask, updateTask, setTaskStatus, advanceTask, archiveTask, restoreTask, validateSnapshot, QUADRANTS } from './model.mjs';
export class TaskStore {
  constructor(snapshot = {version:1,tasks:[]}) {
    this.snapshot=validateSnapshot(snapshot);this.listeners=new Set();this.history=[];this.future=[];
  }
  get tasks(){return this.snapshot.tasks;}
  get active(){return this.tasks.filter(t=>!t.archivedAt);}
  get(id){return this.tasks.find(t=>t.id===id);}
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  emit(){for(const fn of this.listeners)fn(this.snapshot);}
  commit(tasks){this.history.push(structuredClone(this.snapshot));if(this.history.length>60)this.history.shift();this.future=[];this.snapshot={version:1,tasks};this.emit();}
  apply(id,fn){const task=this.get(id);if(!task)throw new Error('任务不存在');const updated=fn(task);this.commit(this.tasks.map(t=>t.id===id?updated:t));return updated;}
  create(input){const t=createTask(input);this.commit([...this.tasks,t]);return t;}
  update(id,patch){return this.apply(id,t=>updateTask(t,patch));}
  setStatus(id,status){return this.apply(id,t=>setTaskStatus(t,status));}
  advance(id){return this.apply(id,t=>advanceTask(t));}
  archive(id){return this.apply(id,t=>archiveTask(t));}
  restore(id){return this.apply(id,t=>restoreTask(t));}
  move(id,qid){const q=QUADRANTS.find(q=>q.id===qid);if(!q)throw new Error('象限不存在');return this.update(id,{important:q.important,urgent:q.urgent});}
  remove(id){if(!this.get(id))throw new Error('任务不存在');this.commit(this.tasks.filter(t=>t.id!==id));}
  clearDemos(){this.commit(this.tasks.filter(t=>!t.isDemo));}
  replace(snapshot){const validated=validateSnapshot(snapshot);this.commit(validated.tasks);}
  append(inputs){const fresh=inputs.map(input=>createTask(input));this.commit([...this.tasks,...fresh]);return fresh;}
  undo(){if(!this.history.length)return false;this.future.push(structuredClone(this.snapshot));this.snapshot=this.history.pop();this.emit();return true;}
  redo(){if(!this.future.length)return false;this.history.push(structuredClone(this.snapshot));this.snapshot=this.future.pop();this.emit();return true;}
}
