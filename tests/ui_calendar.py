"""Calendar view regression checks; real renderer, controlled bridge/date (not native macOS)."""
from pathlib import Path
from copy import deepcopy
import sys, json, os
from playwright.sync_api import sync_playwright, expect
from browser_harness import mount, fixture, ROOT
QA=Path(os.environ.get('FOCUS_QA_DIR',str(ROOT/'qa/calendar')));QA.mkdir(parents=True,exist_ok=True)
checks=[]
def ok(message): checks.append(message);print('PASS',message,flush=True)
def getdata(page): return page.evaluate('structuredClone(window.__saved)')
def item(page,title): return next(t for t in getdata(page)['tasks'] if t['title']==title)
def calendar(page):
    page.get_by_role('button',name='时间轴',exact=True).click()
    page.get_by_role('button',name='月历',exact=True).click()
def month(page,value): page.get_by_label('选择月份',exact=True).fill(value)
def dataset():
    base=fixture('sparse')['tasks'][0]
    tasks=[]
    examples=[(8,'绩效审核','09:00','10:00'),(8,'销售简历处理','10:00','11:00'),(8,'双选会报名','13:00','14:00'),(8,'校招资料发邮箱','15:00','16:00'),(9,'项目经理画像同步','09:00','10:00'),(9,'校招约面','10:00','11:00'),(9,'北京石油化工学院','14:00','16:00'),(10,'绩效汇报','09:00','10:00'),(13,'北信科双选会','14:00','17:00'),(14,'北大双选会','09:00','12:00'),(17,'燕山大学双选会','09:00','16:00'),(21,'华电双选会（保定）','09:00','16:00')]
    for i,(day,title,a,b) in enumerate(examples):
        t=deepcopy(base);t.update(id=f'calendar-{i}',title=title,status='todo',completedAt=None,archivedAt=None,plannedStart=f'2026-10-{day:02d}T{a}:00+08:00',plannedEnd=f'2026-10-{day:02d}T{b}:00+08:00',deadline=None,reminders={'startMinutes':None,'deadlineMinutes':None},important=True,urgent=i<4)
        tasks.append(t)
    return {'version':1,'tasks':tasks}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100},timezone_id='Asia/Shanghai')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    mount(page,dataset())
    page.get_by_role('button',name='时间轴',exact=True).click()
    expect(page.get_by_role('button',name='月历',exact=True)).to_be_visible(timeout=1800)
    if '--red' in sys.argv: browser.close();sys.exit(0)
    page.evaluate("() => {window.__saveCalls=0;window.__saveTraces=[];const original=window.focusNative.save;window.focusNative.save=async s=>{window.__saveCalls++;window.__saveTraces.push(new Error().stack);return original(s)};}")
    original=getdata(page)
    page.get_by_role('button',name='月历',exact=True).click();month(page,'2026-10')
    expect(page.locator('.calendar-cell')).to_have_count(35)
    expect(page.locator('[data-date="2026-10-10"]')).to_have_class('calendar-cell makeup')
    expect(page.locator('[data-date="2026-10-01"] .calendar-day-note')).to_have_text('国庆节 · 休')
    ok('month mode renders Monday-first October, holiday and makeup styling')
    page.screenshot(path=str(QA/'01-calendar.png'))
    assert getdata(page)==original and page.evaluate('window.__saveCalls')==0, (getdata(page)==original,page.evaluate('window.__saveCalls'),page.evaluate('window.__saveTraces'))
    ok('switching views and selecting a month performs zero task writes')
    page.get_by_role('button',name='下一个月',exact=True).click();expect(page.get_by_label('选择月份')).to_have_value('2026-11')
    page.get_by_role('button',name='上一个月',exact=True).click();expect(page.get_by_label('选择月份')).to_have_value('2026-10')
    month(page,'2026-12');page.get_by_role('button',name='下一个月',exact=True).click();expect(page.get_by_label('选择月份')).to_have_value('2027-01')
    expect(page.locator('.calendar-month-note')).to_contain_text('仅标注周末')
    month(page,'2026-10');ok('previous/next month and year boundary navigation work')
    page.get_by_role('button',name='甘特图',exact=True).click();expect(page.locator('.timeline-scroll')).to_be_visible()
    page.get_by_role('button',name='月历',exact=True).click();expect(page.get_by_label('选择月份')).to_have_value('2026-10')
    assert page.evaluate('window.__saveCalls')==0 and getdata(page)==original
    ok('Gantt stays available and shares date context without rewriting data')
    # Date-click defaults are drafts, not automatically-created tasks.
    page.get_by_role('button',name='在2026-10-12新增任务',exact=True).click()
    expect(page.get_by_label('计划开始（可选）',exact=True)).to_have_value('2026-10-12T09:00')
    expect(page.get_by_label('计划结束（可选）',exact=True)).to_have_value('2026-10-12T10:00')
    expect(page.get_by_label('截止时间（可选）',exact=True)).to_have_value('')
    assert getdata(page)==original
    page.get_by_role('button',name='取消',exact=True).click();assert getdata(page)==original
    ok('date click prefills an unsaved optional plan; cancel never creates data')
    page.get_by_role('button',name='在2026-10-12新增任务',exact=True).click()
    page.get_by_label('任务名称',exact=True).fill('月历新增测试')
    page.get_by_label('截止时间（可选）',exact=True).fill('2026-10-15T18:00')
    page.get_by_role('button',name='创建任务',exact=True).click()
    t=item(page,'月历新增测试');tid=t['id'];due=t['deadline'];rem=deepcopy(t['reminders'])
    expect(page.locator('[data-date="2026-10-12"] .calendar-event-title')).to_contain_text('月历新增测试')
    expect(page.locator('[data-date="2026-10-15"] .calendar-event-meta')).to_contain_text('截止')
    ok('date-created task appears on plan day and independent deadline day')
    page.get_by_role('button',name='查看2026-10-12的任务：月历新增测试',exact=True).click()
    expect(page.get_by_role('complementary',name='任务详情')).to_be_visible()
    page.get_by_role('button',name='编辑任务',exact=True).click()
    page.get_by_label('备注',exact=True).fill('月历与其他视图共享这条任务')
    page.get_by_role('button',name='保存修改',exact=True).click()
    assert item(page,'月历新增测试')['id']==tid and item(page,'月历新增测试')['deadline']==due
    page.get_by_role('button',name='关闭任务详情',exact=True).click()
    ok('calendar opens existing detail/edit flow without changing deadline or ID')
    # Search/status/quadrant controls remain presentation-only.
    saved_before=getdata(page);calls=page.evaluate('window.__saveCalls')
    page.get_by_role('searchbox',name='搜索任务',exact=True).fill('月历新增测试')
    assert page.locator('.calendar-event').count()==2
    page.get_by_label('月历状态筛选',exact=True).select_option('done');expect(page.locator('.calendar-event')).to_have_count(0)
    page.get_by_label('月历状态筛选',exact=True).select_option('all')
    page.get_by_label('月历象限筛选',exact=True).select_option('q4');expect(page.locator('.calendar-event')).to_have_count(0)
    page.get_by_label('月历象限筛选',exact=True).select_option('all');page.get_by_role('searchbox',name='搜索任务',exact=True).fill('')
    assert getdata(page)==saved_before and page.evaluate('window.__saveCalls')==calls
    ok('search and filters do not mutate tasks or auto-save')
    page.locator('[data-date="2026-10-12"]').get_by_role('button',name='月历新增测试：开始任务',exact=True).click()
    assert item(page,'月历新增测试')['status']=='ing'
    page.locator('[data-date="2026-10-12"]').get_by_role('button',name='月历新增测试：标记为已完成',exact=True).click()
    assert item(page,'月历新增测试')['status']=='done' and item(page,'月历新增测试')['archivedAt'] is None
    expect(page.locator('[data-date="2026-10-12"] .calendar-event.done')).to_have_count(1)
    page.locator('[data-date="2026-10-12"]').get_by_role('button',name='月历新增测试：归档',exact=True).click()
    assert item(page,'月历新增测试')['archivedAt']
    assert page.locator(f'.calendar-event[data-task-id="{tid}"]').count()==0
    page.keyboard.press('Control+z');assert item(page,'月历新增测试')['archivedAt'] is None
    assert item(page,'月历新增测试')['deadline']==due and item(page,'月历新增测试')['reminders']==rem
    ok('todo → ing → done → second-click archive, with undo, preserves scheduling fields')
    # Stress fixture on one day; disclosure has every task and virtual scrolling.
    dense=dataset();template=deepcopy(dense['tasks'][0])
    for i in range(64):
        t=deepcopy(template);t.update(id=f'daily-dense-{i:03d}',title=f'高密度测试 {i:03d}',plannedStart='2026-10-12T09:00:00+08:00',plannedEnd='2026-10-12T10:00:00+08:00');dense['tasks'].append(t)
    mount(page,dense);calendar(page);month(page,'2026-10')
    cell=page.locator('[data-date="2026-10-12"]');assert cell.locator('.calendar-event').count()<64
    cell.get_by_role('button',name='查看2026-10-12全部64项任务',exact=True).click()
    expect(page.get_by_role('complementary',name='当日任务')).to_be_visible()
    expect(page.locator('.calendar-day-count')).to_contain_text('64')
    assert page.locator('.calendar-agenda-row').count()<64
    page.locator('.calendar-agenda-scroll').evaluate('(e)=>e.scrollTop=e.scrollHeight');page.wait_for_timeout(120)
    expect(page.get_by_role('button',name='查看当日任务：高密度测试 063',exact=True)).to_be_visible()
    page.screenshot(path=str(QA/'02-daily-overflow.png'))
    ok('64 tasks on one day have capped previews and a complete virtualized list')
    page.get_by_role('button',name='查看当日任务：高密度测试 063',exact=True).click()
    expect(page.get_by_role('complementary',name='任务详情')).to_be_visible()
    page.get_by_role('button',name='关闭任务详情',exact=True).click()
    expect(page.get_by_role('complementary',name='当日任务')).to_be_visible()
    ok('detail returns to selected daily list rather than losing date context')
    page.get_by_role('button',name='关闭当日任务',exact=True).click()
    # No schedule dates: explicit tray, never assigned to now.
    unscheduled=deepcopy(template);unscheduled.update(id='no-date-task',title='完全未排期的工作',plannedStart=None,plannedEnd=None,deadline=None)
    dense['tasks'].append(unscheduled);mount(page,dense);calendar(page);month(page,'2026-10')
    page.get_by_role('button',name='未安排日期 1 项',exact=True).click()
    expect(page.get_by_role('button',name='查看当日任务：完全未排期的工作',exact=True)).to_be_visible()
    assert item(page,'完全未排期的工作')['plannedStart'] is None
    page.get_by_role('button',name='关闭当日任务',exact=True).click()
    ok('undated tasks remain unscheduled and accessible')
    snapshot=getdata(page);mount(page,snapshot);calendar(page);month(page,'2026-10');assert getdata(page)==snapshot
    ok('fresh renderer rehydrates every existing task without schema migration')
    # Keyboard date selection and responsive calendar.
    page.get_by_role('button',name='查看2026-10-13的工作',exact=True).focus();page.keyboard.press('ArrowRight')
    expect(page.get_by_role('button',name='查看2026-10-14的工作',exact=True)).to_be_focused()
    page.keyboard.press('Enter');expect(page.get_by_role('complementary',name='当日任务')).to_be_visible()
    page.get_by_role('button',name='关闭当日任务',exact=True).click();ok('calendar day navigation works with arrow keys and Enter')
    for width,height in [(1440,1000),(1280,800),(900,700),(390,844)]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(180)
        assert page.evaluate('document.body.scrollWidth<=innerWidth'),width
        assert page.evaluate('document.body.scrollHeight<=innerHeight'),height
    page.screenshot(path=str(QA/'03-calendar-mobile.png'))
    page.get_by_role('button',name='查看2026-10-12的工作',exact=True).click();expect(page.get_by_role('complementary',name='当日任务')).to_be_visible()
    page.screenshot(path=str(QA/'04-mobile-day.png'))
    ok('desktop/narrow layouts fit and phone date selection opens readable daily tasks')
    assert not errors,errors;ok('no JavaScript errors during the full calendar workflow')
    (QA/'calendar-browser-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},ensure_ascii=False,indent=2))
    browser.close()
