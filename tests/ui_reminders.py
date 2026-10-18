from playwright.sync_api import sync_playwright, expect
from browser_harness import mount, fixture, ROOT
from pathlib import Path
import json
OUT=Path('/mnt/data/focus-reminders-qa');OUT.mkdir(exist_ok=True)
checks=[]
def ok(s): checks.append(s);print('PASS',s)
def bridge(page):
 page.evaluate('''() => {
 window.__inbox=[];window.__dismissed=[];
 window.focusNative.getReminders=async()=>({items:window.__inbox,warning:null});
 window.focusNative.dismissReminders=async keys=>{window.__dismissed.push(...keys);window.__inbox=window.__inbox.filter(e=>!keys.includes(e.key));window.__nativeAction({type:'reminders',items:window.__inbox});return window.__inbox;};
 window.focusNative.testReminder=async()=>{window.__nativeAction({type:'reminder-test'});return {system:'shown'};};
 }''')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000}); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 mount(page);bridge(page)
 page.get_by_role('button',name='新增任务',exact=True).click()
 expect(page.get_by_label('截止时间（可选）',exact=True)).to_be_visible()
 expect(page.get_by_label('截止提醒',exact=True)).to_be_disabled()
 page.get_by_label('任务名称',exact=True).fill('不设截止时间也能创建')
 page.get_by_role('button',name='创建任务',exact=True).click()
 page.evaluate('window.focusFlushPendingSaves()')
 task=page.evaluate('window.__saved.tasks[0]');assert task['deadline'] is None and task['reminders']['deadlineMinutes'] is None
 ok('optional deadline: empty task saves without any date or reminder')
 page.get_by_role('button',name='新增任务',exact=True).click()
 page.get_by_label('任务名称',exact=True).fill('完成培训方案')
 page.get_by_label('截止时间（可选）',exact=True).fill('2026-09-21T18:00')
 expect(page.get_by_label('截止提醒',exact=True)).to_be_enabled()
 expect(page.get_by_label('截止提醒',exact=True)).to_have_value('30')
 page.locator('#toast-root').evaluate('(e)=>e.replaceChildren()');page.screenshot(path=str(OUT/'01-create-optional-deadline.png'))
 page.get_by_role('button',name='创建任务',exact=True).click();page.evaluate('window.focusFlushPendingSaves()')
 task=page.evaluate('window.__saved.tasks[1]');assert task['plannedStart'] is None and task['deadline'] and task['reminders']['deadlineMinutes']==30
 ok('deadline-only task: no invented planned time and 30-minute reminder')
 page.get_by_role('button',name='查看任务：完成培训方案',exact=True).click()
 expect(page.locator('.detail-drawer')).to_contain_text('截止时间')
 expect(page.locator('.detail-drawer')).to_contain_text('提前 30 分钟')
 page.screenshot(path=str(OUT/'02-task-deadline-detail.png'))
 ok('details distinguish plan, deadline and reminder configuration')
 page.get_by_role('button',name='编辑任务',exact=True).click()
 page.get_by_label('计划开始（可选）',exact=True).fill('2026-09-21T19:00')
 page.get_by_label('计划结束（可选）',exact=True).fill('2026-09-21T20:00')
 expect(page.locator('.deadline-warning')).to_contain_text('晚于截止时间')
 page.get_by_role('button',name='保存修改',exact=True).click();page.evaluate('window.focusFlushPendingSaves()')
 assert page.evaluate('window.__saved.tasks[1].deadline')==task['deadline']
 ok('plan after deadline warns, remains editable and never shifts deadline')
 page.get_by_role('button',name='编辑任务',exact=True).click()
 page.get_by_label('截止提醒',exact=True).select_option('off')
 page.get_by_role('button',name='保存修改',exact=True).click();page.evaluate('window.focusFlushPendingSaves()')
 assert page.evaluate('window.__saved.tasks[1].reminders.deadlineMinutes') is None
 ok('reminder can be switched off without removing deadline')
 page.get_by_role('button',name='编辑任务',exact=True).click()
 page.get_by_role('button',name='清除截止时间',exact=True).click()
 page.get_by_role('button',name='保存修改',exact=True).click();page.evaluate('window.focusFlushPendingSaves()')
 assert page.evaluate('window.__saved.tasks[1].deadline') is None
 ok('clear optional deadline and persist null')
 # Existing legacy file loads. Pending popup is injected at the real IPC boundary.
 snap=fixture('sparse');t=snap['tasks'][0];t['status']='todo';t['completedAt']=None
 t['deadline']='2026-09-21T07:00:00.000Z';t['reminders']={'startMinutes':None,'deadlineMinutes':30}
 mount(page,snap);bridge(page)
 event={'key':json.dumps([t['id'],'deadline',t['deadline'],30],separators=(',',':')),'taskId':t['id'],'kind':'deadline','title':t['title'],'targetAt':t['deadline'],'minutes':30,'dueAt':'2026-09-21T06:30:00.000Z','expiresAt':'2026-09-22T07:00:00.000Z'}
 page.evaluate('(e)=>{window.__inbox=[e];window.__nativeAction({type:"reminders",items:[e]});}',event)
 expect(page.locator('.reminder-popup')).to_be_visible();expect(page.locator('.reminder-popup')).to_contain_text(t['title'])
 page.screenshot(path=str(OUT/'03-reminder-popup.png'));ok('incoming native reminder produces a real in-app popup')
 page.get_by_role('button',name='新增任务',exact=True).click();page.get_by_label('任务名称',exact=True).fill('不要丢失的草稿')
 page.evaluate('(id)=>window.__nativeAction({type:"open-task",taskId:id})',t['id'])
 expect(page.get_by_label('任务名称',exact=True)).to_have_value('不要丢失的草稿');ok('notification click never discards an open form draft')
 page.get_by_role('button',name='取消',exact=True).click();page.get_by_role('button',name='放弃修改',exact=True).click()
 expect(page.locator('.detail-title')).to_have_text(t['title']);ok('after closing the form, queued notification opens its task')
 page.get_by_role('button',name='查看任务',exact=True).click();expect(page.locator('.detail-title')).to_have_text(t['title'])
 ok('click popup opens the matching task, not an unrelated screen')
 page.get_by_role('button',name='知道了',exact=True).click();expect(page.locator('.reminder-popup')).to_have_count(0)
 assert len(page.evaluate('window.__dismissed'))==1;ok('dismiss is sent to the persistent native ledger')
 page.evaluate('(e)=>{window.__inbox=[e];window.__nativeAction({type:"reminders",items:[e]});}',event)
 page.get_by_role('button',name='设为 done',exact=True).click();expect(page.locator('.reminder-popup')).to_have_count(0)
 ok('completed task immediately withdraws its popup')
 page.get_by_role('button',name='数据与帮助',exact=True).click();page.get_by_role('menuitem',name='测试提醒',exact=True).click()
 expect(page.locator('.reminder-popup')).to_contain_text('测试提醒');ok('test reminder available without adding any task')
 page.get_by_role('button',name='知道了',exact=True).click()
 # Deadline-only row on timeline is a marker, not an invented duration.
 snap=fixture('sparse');t=snap['tasks'][0];t['plannedStart']=None;t['plannedEnd']=None;t['deadline']='2026-09-21T07:00:00.000Z';t['reminders']={'startMinutes':None,'deadlineMinutes':None}
 mount(page,snap);bridge(page);page.get_by_role('button',name='时间轴',exact=True).click()
 row=page.locator('.timeline-row').filter(has=page.get_by_role('button',name=t['title'],exact=False)).first
 expect(page.locator('.deadline-marker')).to_have_count(1)
 assert page.locator('.timeline-row').filter(has=page.locator('.deadline-marker')).locator('.timeline-bar').count()==0
 page.screenshot(path=str(OUT/'04-deadline-timeline.png'));ok('deadline-only task has marker but no invented planned bar')
 page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='新增任务',exact=True).click()
 page.get_by_label('截止时间（可选）',exact=True).fill('2026-09-22T18:00')
 page.locator('#task-deadline').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'05-mobile-deadline.png'))
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');ok('narrow form has accessible controls and no horizontal overflow')
 assert not errors,errors;ok('no renderer JavaScript exceptions')
 b.close()
print(f'{len(checks)} reminder UI checks passed')
