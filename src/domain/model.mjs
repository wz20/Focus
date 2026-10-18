/** Core domain. No browser/Electron dependencies; timestamps are ISO instants. */
export const SCHEMA_VERSION = 1;
export const STATUSES = ['todo', 'ing', 'done'];
export const QUADRANTS = [
  { id: 'q2', important: true, urgent: false, name: '重要 · 不紧急', short: '规划安排', color: '#78500c', fill: '#ffda85' },
  { id: 'q1', important: true, urgent: true, name: '重要 · 紧急', short: '优先处理', color: '#952c34', fill: '#ffbdb7' },
  { id: 'q4', important: false, urgent: false, name: '不重要 · 不紧急', short: '适度搁置', color: '#46546a', fill: '#d7dfed' },
  { id: 'q3', important: false, urgent: true, name: '不重要 · 紧急', short: '简化处理', color: '#215499', fill: '#bcd6ff' },
];
export const STATUS_LABELS = { todo: '待办', ing: '进行中', done: '已完成' };
export function quadrantOf(t) { return t.important ? (t.urgent ? 'q1' : 'q2') : (t.urgent ? 'q3' : 'q4'); }
export function quadrantInfo(t) { return QUADRANTS.find(q => q.id === (typeof t === 'string' ? t : quadrantOf(t))); }
export function isoTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('时间格式不正确');
  return date.toISOString();
}
function nowISO(now) { return isoTime(now || new Date()); }
function validTitle(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请填写任务名称');
  if (value.trim().length > 120) throw new Error('任务名称不能超过 120 个字符');
  return value.trim();
}
function estimate(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 100000) throw new Error('预计用时需要在 1～100000 分钟之间');
  return Math.round(number);
}
export function validateWindow(start, end) {
  if (Boolean(start) !== Boolean(end)) throw new Error('请同时填写计划开始和结束时间，或同时留空');
  const a = isoTime(start), b = isoTime(end);
  if (a && Date.parse(b) <= Date.parse(a)) throw new Error('计划结束时间必须晚于开始时间');
  return { plannedStart: a, plannedEnd: b };
}
export function newTaskId() {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function createTask(input, now) {
  const time = nowISO(now);
  const status = input.status || 'todo';
  if (!STATUSES.includes(status)) throw new Error('不支持的任务状态');
  if (input.notes != null && (typeof input.notes !== 'string' || input.notes.length > 10000)) throw new Error('备注不能超过 10000 个字符');
  return {
    id: newTaskId(), title: validTitle(input.title), notes: input.notes || '',
    important: input.important !== false, urgent: input.urgent === true, status,
    ...validateWindow(input.plannedStart, input.plannedEnd), deadline: isoTime(input.deadline),
    reminders: normalizeReminders(input.reminders, input.plannedStart, input.deadline), estimateMinutes: estimate(input.estimateMinutes),
    createdAt: time, updatedAt: time, startedAt: status === 'ing' ? time : null,
    completedAt: status === 'done' ? time : null, archivedAt: null, isDemo: input.isDemo === true,
  };
}
export function updateTask(task, patch, now) {
  if (task.archivedAt) throw new Error('请先从归档中恢复任务');
  const merged = { ...task, ...patch };
  const fresh = createTask(merged, now);
  const result = { ...task, title: fresh.title, notes: fresh.notes, important: fresh.important, urgent: fresh.urgent,
    plannedStart: fresh.plannedStart, plannedEnd: fresh.plannedEnd, deadline: fresh.deadline, reminders: fresh.reminders, estimateMinutes: fresh.estimateMinutes, updatedAt: fresh.updatedAt };
  return merged.status === task.status ? result : setTaskStatus(result, merged.status, now);
}
export function setTaskStatus(task, status, now) {
  if (!STATUSES.includes(status)) throw new Error('不支持的任务状态');
  if (task.archivedAt) throw new Error('请先从归档中恢复任务');
  const time = nowISO(now);
  return { ...task, status, updatedAt: time,
    startedAt: status === 'ing' ? (task.startedAt || time) : task.startedAt,
    completedAt: status === 'done' ? (task.completedAt || time) : null };
}
export function archiveTask(task, now) {
  if (task.status !== 'done') throw new Error('请先完成任务，再归档');
  return { ...task, archivedAt: nowISO(now), updatedAt: nowISO(now) };
}
export function restoreTask(task, now) { return { ...task, archivedAt: null, updatedAt: nowISO(now) }; }
export function advanceTask(task, now) {
  if (task.archivedAt) throw new Error('请先恢复任务');
  return task.status === 'done' ? archiveTask(task, now) : setTaskStatus(task, task.status === 'todo' ? 'ing' : 'done', now);
}
export function validateSnapshot(input) {
  if (!input || input.version !== SCHEMA_VERSION) throw new Error('不支持的数据文件版本');
  if (!Array.isArray(input.tasks) || input.tasks.length > 100000) throw new Error('任务数据格式不正确或超过 100000 项');
  const ids = new Set();
  const tasks = input.tasks.map(t => {
    if (!t || typeof t.id !== 'string' || !t.id || t.id.length > 200 || typeof t.important !== 'boolean' || typeof t.urgent !== 'boolean' || !STATUSES.includes(t.status) || !t.createdAt || !t.updatedAt) throw new Error('任务数据格式不完整');
    if (ids.has(t.id)) throw new Error('数据中存在重复任务 ID');
    ids.add(t.id);
    const clean = createTask(t, t.createdAt);
    const archivedAt = isoTime(t.archivedAt), completedAt = isoTime(t.completedAt);
    if (archivedAt && t.status !== 'done') throw new Error('归档任务必须是已完成状态');
    if (t.status === 'done' && !completedAt) throw new Error('已完成任务缺少完成时间');
    return { ...clean, id: t.id, updatedAt: isoTime(t.updatedAt), startedAt: isoTime(t.startedAt),
      completedAt: t.status === 'done' ? completedAt : null, archivedAt };
  });
  return { version: SCHEMA_VERSION, tasks };
}
export function filterTasks(tasks, options = {}) {
  const query = (options.query || '').trim().toLocaleLowerCase();
  return tasks.filter(t => {
    if (options.archived ? !t.archivedAt : t.archivedAt) return false;
    if (options.status && options.status !== 'all' && t.status !== options.status) return false;
    if (options.quadrant && options.quadrant !== 'all' && quadrantOf(t) !== options.quadrant) return false;
    return !query || `${t.title}\n${t.notes}`.toLocaleLowerCase().includes(query);
  });
}
export function sortTasks(tasks, by = 'priority') {
  return [...tasks].sort((a, b) => {
    if (by === 'archive') return Date.parse(b.archivedAt) - Date.parse(a.archivedAt);
    if (by === 'created') return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (by === 'title') return a.title.localeCompare(b.title, 'zh-CN');
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (b.status === 'done' && a.status !== 'done') return -1;
    if (by === 'priority') {
      const rank = { ing: 0, todo: 1, done: 2 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    }
    const endA = (by === 'deadline' ? a.deadline : a.plannedEnd) ? Date.parse(by === 'deadline' ? a.deadline : a.plannedEnd) : Infinity;
    const endB = (by === 'deadline' ? b.deadline : b.plannedEnd) ? Date.parse(by === 'deadline' ? b.deadline : b.plannedEnd) : Infinity;
    return (endA - endB) || (Date.parse(a.createdAt) - Date.parse(b.createdAt)) || a.id.localeCompare(b.id);
  });
}
export function plannedOverlap(tasks, at) {
  const time = Date.parse(at);
  return tasks.filter(t => !t.archivedAt && t.status !== 'done' && t.plannedStart && Date.parse(t.plannedStart) <= time && Date.parse(t.plannedEnd) > time).length;
}
export function shiftTaskWindow(task, deltaMs) {
  if (!task.plannedStart || !task.plannedEnd || !Number.isFinite(deltaMs)) throw new Error('任务尚未设置计划时间');
  return { ...task, plannedStart: new Date(Date.parse(task.plannedStart) + deltaMs).toISOString(), plannedEnd: new Date(Date.parse(task.plannedEnd) + deltaMs).toISOString() };
}
export function formatDuration(minutes) {
  if (!minutes) return '未估时';
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}`;
}
export function localDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function dateLabel(iso, withTime = false) {
  if (!iso) return '待排期';
  const d = new Date(iso); const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getMonth()+1)}.${pad(d.getDate())}${withTime ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''}`;
}
export function relativeEnd(task, reference = new Date()) {
  if (task.status === 'done') return '已完成';
  if (!task.plannedEnd) return '待排期';
  const d = new Date(task.plannedEnd), today = new Date(reference);today.setHours(0,0,0,0);
  const endDay = new Date(d);endDay.setHours(0,0,0,0);
  const days = Math.round((endDay-today)/86400000);
  return `${days===0?'今天':days===1?'明天':dateLabel(task.plannedEnd)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}


/** Null means disabled; zero means remind at the exact configured instant. */
export function normalizeReminders(value, start, deadline) {
  if (value != null && (typeof value !== 'object' || Array.isArray(value))) throw new Error('提醒设置格式不正确');
  const lead = n => {
    if (n == null) return null;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 10080) throw new Error('提醒提前时间需为 0～10080 的整数分钟');
    return n;
  };
  const a = lead(value?.startMinutes), b = lead(value?.deadlineMinutes);
  return { startMinutes: start ? a : null, deadlineMinutes: deadline ? b : null };
}

/** Recomputed from current task state. No renderer timers or mutated deadlines. */
export function reminderEvents(task) {
  if (task.archivedAt || task.status === 'done') return [];
  const events = [];
  const add = (kind, target, minutes, grace) => {
    if (!target || minutes == null) return;
    const stamp = Date.parse(target);
    if (!Number.isFinite(stamp)) return;
    events.push({
      key: JSON.stringify([task.id, kind, target, minutes]), taskId: task.id, kind,
      title: task.title, targetAt: target, minutes,
      dueAt: new Date(stamp - minutes * 60000).toISOString(),
      expiresAt: new Date(stamp + grace).toISOString(),
    });
  };
  if (task.status === 'todo') add('start', task.plannedStart, task.reminders?.startMinutes, 15 * 60000);
  add('deadline', task.deadline, task.reminders?.deadlineMinutes, 24 * 3600000);
  return events;
}
export function dueReminders(tasks, sent = {}, now = new Date()) {
  const stamp = new Date(now).getTime();
  return tasks.flatMap(reminderEvents).filter(e => !Object.hasOwn(sent, e.key) && Date.parse(e.dueAt) <= stamp && stamp <= Date.parse(e.expiresAt))
    .sort((a,b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.key.localeCompare(b.key));
}
export function reminderLeadLabel(minutes) {
  if (minutes == null) return '不提醒';
  if (minutes === 0) return '到点提醒';
  if (minutes % 1440 === 0) return `提前 ${minutes / 1440} 天`;
  if (minutes % 60 === 0) return `提前 ${minutes / 60} 小时`;
  return `提前 ${minutes} 分钟`;
}
export function reminderHeading(event, now = new Date()) {
  const late = Date.parse(event.targetAt) <= +new Date(now);
  return event.kind === 'start' ? (late ? '已到计划开始时间' : '任务即将开始') : (late ? '已到截止时间' : '即将到达截止时间');
}
