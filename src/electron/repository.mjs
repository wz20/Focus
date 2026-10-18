import fs from 'node:fs/promises';
import path from 'node:path';
import { validateSnapshot, reminderEvents, dueReminders } from '../domain/model.mjs';
/** Serialized atomic saves. Previous valid snapshot stays in tasks.backup.json. */
export class Repository {
  constructor(directory){this.directory=directory;this.file=path.join(directory,'tasks.json');this.backup=path.join(directory,'tasks.backup.json');this.pending=Promise.resolve();}
  async read(file){const stat=await fs.stat(file);if(stat.size>40*1024*1024)throw new Error('任务文件超过 40 MB');return validateSnapshot(JSON.parse(await fs.readFile(file,'utf8')));}
  async load(){
    await this.pending;
    await fs.mkdir(this.directory,{recursive:true,mode:0o700});
    try{return {snapshot:await this.read(this.file),warning:null};}
    catch(error){
      if(error.code==='ENOENT')return {snapshot:{version:1,tasks:[]},warning:null};
      try{
        const snapshot=await this.read(this.backup);
        await fs.copyFile(this.file,path.join(this.directory,`tasks.corrupt-${Date.now()}.json`));
        await fs.copyFile(this.backup,this.file);
        return {snapshot,warning:'主数据文件损坏，已恢复上一次有效备份。损坏原文件仍保留在数据目录。'};
      }catch{throw new Error('任务数据损坏，且没有可恢复的备份。原文件已保留，请从备份导入，或检查数据目录。');}
    }
  }
  /** User-confirmed import is the only operation permitted to replace corrupt data. */
  async importSnapshot(value){
    const data=validateSnapshot(value);
    const next=this.pending.catch(()=>{}).then(async()=>{
      await fs.mkdir(this.directory,{recursive:true,mode:0o700});
      const stamp=`${Date.now()}-${process.pid}`;
      const preserved=path.join(this.directory,`tasks.before-import-${stamp}.json`);
      const temp=path.join(this.directory,`import-${stamp}.tmp`);
      try{
        try{await fs.copyFile(this.file,preserved);await fs.chmod(preserved,0o600);}
        catch(error){if(error.code!=='ENOENT')throw error;}
        const handle=await fs.open(temp,'w',0o600);
        try{await handle.writeFile(JSON.stringify(data,null,2),'utf8');await handle.sync();}finally{await handle.close();}
        await fs.rename(temp,this.file);
        await syncDirectory(this.directory);
        return {savedAt:new Date().toISOString()};
      }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
    });
    this.pending=next;return next;
  }
  async save(value){
    const data=validateSnapshot(value);
    const next=this.pending.catch(()=>{}).then(async()=>{
      await fs.mkdir(this.directory,{recursive:true,mode:0o700});
      const temp=path.join(this.directory,`tasks-${process.pid}-${Date.now()}.tmp`);
      try{
        try{await this.read(this.file);await fs.copyFile(this.file,this.backup);await fs.chmod(this.backup,0o600);}catch(error){if(error.code!=='ENOENT')throw new Error('现有数据无法读取，已停止保存，避免覆盖。');}
        const handle=await fs.open(temp,'w',0o600);
        try{await handle.writeFile(JSON.stringify(data,null,2),'utf8');await handle.sync();}finally{await handle.close();}
        await fs.rename(temp,this.file);
        await syncDirectory(this.directory);
        return {savedAt:new Date().toISOString()};
      }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
    });
    this.pending=next;return next;
  }
}

/** File contents are already fsynced. Some file systems do not support directory fsync. */
async function syncDirectory(directory){
 let handle;
 try{handle=await fs.open(directory,'r');await handle.sync();}
 catch(error){if(!['EINVAL','ENOTSUP','EISDIR'].includes(error.code))throw error;}
 finally{if(handle)await handle.close();}
}


/** The reminder checkpoint is separate from task data. Pending reminders survive restart. */
export class ReminderService {
  constructor(directory, {now = () => new Date(), onNotify = () => {}, onUpdate = () => {}, onError = () => {}} = {}) {
    this.directory = directory;
    this.file = path.join(directory, 'reminders.json');
    this.now = now; this.onNotify = onNotify; this.onUpdate = onUpdate; this.onError = onError;
    this.tasks = []; this.state = {version: 1, sent: {}, inbox: []}; this.pending = Promise.resolve();
  }
  async load(tasks) {
    await fs.mkdir(this.directory, {recursive: true, mode: 0o700});
    try {
      const stat = await fs.stat(this.file);
      if (stat.size > 40 * 1024 * 1024) throw new Error('提醒记录过大');
      const state = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (state.version !== 1 || !state.sent || typeof state.sent !== 'object' || Array.isArray(state.sent) || !Array.isArray(state.inbox)
          || !Object.entries(state.sent).every(([k,v]) => k.length < 1000 && Number.isFinite(v))
          || !state.inbox.every(k => typeof k === 'string' && Object.hasOwn(state.sent, k))) throw new Error('提醒记录格式异常');
      this.state = state;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // Do not touch tasks.json when repairing the independently derived ledger.
        await fs.copyFile(this.file, path.join(this.directory, `reminders.corrupt-${Date.now()}.json`));
        await this.checkpoint(this.state);
        this.onError(new Error('提醒记录损坏，原记录已保留；最近到点的提醒可能再次显示。任务数据不受影响。'));
      }
    }
    return this.update(tasks);
  }
  events() { return new Map(this.tasks.flatMap(reminderEvents).map(e => [e.key, e])); }
  getInbox() {
    const events = this.events(), now = +this.now();
    return this.state.inbox.map(k => events.get(k)).filter(e => e && Date.parse(e.expiresAt) >= now)
      .map(e => ({...e, deliveredAt: new Date(this.state.sent[e.key]).toISOString(), overdue: Date.parse(e.targetAt) <= now}));
  }
  async checkpoint(state) {
    await fs.mkdir(this.directory, {recursive: true, mode: 0o700});
    const temp = path.join(this.directory, `reminders-${process.pid}-${Date.now()}.tmp`);
    try {
      const handle = await fs.open(temp, 'w', 0o600);
      try { await handle.writeFile(JSON.stringify(state), 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(temp, this.file);
      await syncDirectory(this.directory);
    } finally { await fs.rm(temp, {force: true}).catch(() => {}); }
  }
  enqueue(work) {
    const next = this.pending.catch(() => {}).then(work);
    this.pending = next; return next;
  }
  update(tasks) {
    this.tasks = structuredClone(tasks); // Invalidations take effect even while a write is queued.
    return this.tick();
  }
  tick() {
    return this.enqueue(async () => {
      const now = +this.now(), events = this.events();
      const fresh = dueReminders(this.tasks, this.state.sent, new Date(now));
      const inbox = this.state.inbox.filter(k => events.has(k) && Date.parse(events.get(k).expiresAt) >= now);
      const sent = Object.fromEntries(Object.entries(this.state.sent).filter(([,time]) => time >= now - 7 * 86400000));
      for (const e of fresh) { sent[e.key] = now; if (!inbox.includes(e.key)) inbox.push(e.key); }
      const next = {version: 1, sent, inbox};
      if (JSON.stringify(next) !== JSON.stringify(this.state)) {
        await this.checkpoint(next); // Persist before any external notification; inbox bridges a crash after this line.
        this.state = next;
      }
      this.onUpdate(this.getInbox());
      const current = this.events();
      const notify = fresh.filter(e => current.has(e.key));
      if (notify.length) {
        try { await this.onNotify(notify); } catch (error) { this.onError(error); }
      }
      return this.getInbox();
    });
  }
  dismiss(keys) {
    if (!Array.isArray(keys) || keys.length > 100000 || !keys.every(k => typeof k === 'string' && k.length < 1000)) return Promise.reject(new Error('提醒请求格式不正确'));
    return this.enqueue(async () => {
      const remove = new Set(keys);
      const next = {...this.state, inbox: this.state.inbox.filter(k => !remove.has(k))};
      await this.checkpoint(next); this.state = next; this.onUpdate(this.getInbox());
      return this.getInbox();
    });
  }
  flush() { return this.pending; }
}
