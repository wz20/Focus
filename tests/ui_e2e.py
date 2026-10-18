"""Exercise the production renderer in Chromium without network navigation.
Container policy blocks all navigations, so local HTML is rendered using
set_content. The narrow Electron bridge is mocked; file storage is tested
separately in repository.test.mjs. This is not a macOS/Electron runtime test.
"""
from pathlib import Path
import json,sys
from playwright.sync_api import sync_playwright,expect
from browser_harness import mount,fixture,ROOT
passed=[]
def ok(name):passed.append(name);print('PASS',name,flush=True)
def snap(page,name):page.wait_for_timeout(100);page.screenshot(path=str(ROOT/'qa'/name))
def saved(page):return page.evaluate('window.__saved')
def title_task(page,title):return next(t for t in saved(page)['tasks'] if t['title']==title)
def close_drawer(page):
    close=page.get_by_role('button',name='关闭任务详情',exact=True)
    if close.count():close.click()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1,timezone_id='Asia/Shanghai')
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    mount(page)
    expect(page.get_by_role('button',name='创建第一个任务',exact=True)).to_be_visible()
    assert page.locator('.axis-label').count()==4
    ok('empty workspace retains both axes and zero fake tasks')
    page.get_by_role('button',name='先用示例体验',exact=True).click()
    expect(page.locator('.task-card')).to_have_count(11)
    ok('explicit demo insertion shows sparse real interactive cards')
    snap(page,'01_home.png')
    page.get_by_role('button',name='新增任务',exact=True).click()
    page.get_by_role('button',name='创建任务',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('名称')
    assert len(saved(page)['tasks'])==11
    ok('blank task validation prevents save')
    page.get_by_label('任务名称',exact=True).fill('我的测试任务')
    page.get_by_label('备注',exact=True).fill('只在本地存储，无内部资料。')
    page.get_by_role('radiogroup',name='所在象限',exact=True).get_by_role('radio',name='重要 · 紧急',exact=True).click()
    page.get_by_label('计划开始（可选）',exact=True).fill('2026-09-22T09:00')
    page.get_by_label('计划结束（可选）',exact=True).fill('2026-09-21T09:00')
    page.get_by_role('button',name='创建任务',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('晚于')
    ok('invalid date order prevents save')
    page.get_by_label('计划结束（可选）',exact=True).fill('2026-09-23T18:00')
    page.get_by_label('预计用时',exact=True).fill('120')
    snap(page,'03_add.png')
    page.get_by_role('button',name='创建任务',exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    t=title_task(page,'我的测试任务');assert t['status']=='todo' and t['important'] and t['urgent'] and t['estimateMinutes']==120
    ok('new task saves title, notes, classification, dates, estimate')
    page.get_by_role('button',name='我的测试任务：开始任务',exact=True).click()
    assert title_task(page,'我的测试任务')['status']=='ing'
    page.get_by_role('button',name='查看任务：我的测试任务',exact=True).click()
    expect(page.get_by_role('complementary',name='任务详情')).to_be_visible()
    snap(page,'04_detail.png')
    ok('task status indicator changes todo to ing and detail opens')
    page.get_by_role('button',name='编辑任务',exact=True).click()
    page.get_by_label('备注',exact=True).fill('已编辑的备注')
    page.get_by_role('button',name='保存修改',exact=True).click()
    expect(page.locator('.detail-notes')).to_have_text('已编辑的备注')
    ok('editing task updates same id and drawer')
    page.get_by_role('button',name='标记 done · 已完成',exact=True).click()
    t=title_task(page,'我的测试任务');assert t['status']=='done' and t['archivedAt'] is None
    expect(page.get_by_role('button',name='归档任务',exact=True)).to_be_visible()
    snap(page,'05_done.png')
    ok('done does not auto archive and exposes archive action')
    page.get_by_role('button',name='归档任务',exact=True).click()
    assert title_task(page,'我的测试任务')['archivedAt']
    expect(page.get_by_role('button',name='查看任务：我的测试任务')).to_have_count(0)
    page.get_by_role('button',name='归档',exact=True).click()
    expect(page.locator('.archive-task-title')).to_contain_text('我的测试任务')
    snap(page,'06_archive.png')
    ok('explicit archive removes active task and shows archive record')
    page.get_by_role('button',name='恢复',exact=True).click()
    t=title_task(page,'我的测试任务');assert t['status']=='done' and t['archivedAt'] is None
    ok('restore returns task without falsely reopening done')
    page.get_by_role('button',name='四象限',exact=True).click()
    page.get_by_role('button',name='我的测试任务：归档',exact=True).click()
    assert title_task(page,'我的测试任务')['archivedAt']
    ok('clicking a done task status a second time archives it')
    page.keyboard.press('Control+z')
    assert title_task(page,'我的测试任务')['archivedAt'] is None
    ok('keyboard undo restores the archived task')
    # Text search must not mutate underlying tasks.
    count=len(saved(page)['tasks'])
    page.get_by_role('searchbox',name='搜索任务',exact=True).fill('优化培训')
    expect(page.locator('.task-card')).to_have_count(1)
    assert len(saved(page)['tasks'])==count
    page.get_by_role('searchbox',name='搜索任务',exact=True).fill('')
    ok('live search filters without changing stored tasks')
    # Native HTML drag and drop changes only classification.
    page.get_by_role('button',name='查看任务：整理旧文件',exact=True).drag_to(page.locator('[data-quadrant="q1"] .quadrant-header'))
    t=title_task(page,'整理旧文件');assert t['important'] and t['urgent']
    ok('dragging a card across axes changes its quadrant')
    # Text that looks like HTML cannot become executable markup.
    page.get_by_role('button',name='新增任务',exact=True).click()
    payload='<img src=x onerror=alert(1)>'
    page.get_by_label('任务名称',exact=True).fill(payload)
    page.get_by_role('button',name='创建任务',exact=True).click()
    assert page.locator('.task-card img').count()==0
    assert title_task(page,payload)['title']==payload
    ok('HTML-looking task content remains escaped text')
    # Dirty form is kept until user explicitly discards it.
    page.get_by_role('button',name='新增任务',exact=True).click()
    page.get_by_label('任务名称',exact=True).fill('未保存内容')
    page.get_by_role('button',name='关闭新增任务',exact=True).click()
    expect(page.get_by_role('dialog',name='放弃未保存的修改？')).to_be_visible()
    page.get_by_role('dialog',name='放弃未保存的修改？').get_by_role('button',name='取消',exact=True).click()
    expect(page.get_by_label('任务名称',exact=True)).to_have_value('未保存内容')
    page.get_by_role('button',name='关闭新增任务',exact=True).click()
    page.get_by_role('button',name='放弃修改',exact=True).click()
    ok('closing an edited form does not silently discard changes')
    # Mock native re-load runs renderer hydration against saved state.
    snapshot=saved(page);mount(page,snapshot)
    assert title_task(page,'我的测试任务')['notes']=='已编辑的备注'
    ok('saved snapshot rehydrates into a fresh renderer')
    # Dense dataset and viewport virtualization.
    mount(page,fixture('dense'))
    assert page.locator('.task-stack').count()>=3
    page.locator('[data-quadrant="q1"] .task-stack').click()
    expect(page.locator('.virtual-list')).to_be_visible()
    total=len([t for t in saved(page)['tasks'] if t['important'] and t['urgent']])
    assert page.locator('.task-list-row').count()<total
    snap(page,'02_dense.png')
    before=page.locator('.task-list-row').first.get_attribute('data-task-id')
    page.locator('.virtual-list').evaluate('(e)=>e.scrollTop=e.scrollHeight')
    page.wait_for_timeout(100)
    after=page.locator('.task-list-row').first.get_attribute('data-task-id')
    assert before!=after
    ok('dense quadrant groups cards and virtual list scrolls to hidden tasks')
    page.locator('[data-panel-status="done"]').click()
    expect(page.locator('.task-list-row')).to_have_count(1)
    ok('dense drawer filters individual task statuses')
    # Timeline uses same task state; drag preserves duration.
    mount(page,fixture('sparse'))
    page.get_by_role('button',name='时间轴',exact=True).click()
    expect(page.locator('.timeline-bar')).to_have_count(9)
    expect(page.locator('.ing-count')).to_have_text('进行中 3 项')
    expect(page.locator('.pending-label')).to_have_text('待排期 2')
    snap(page,'07_timeline.png')
    ok('timeline reflects ing states and retains unscheduled tasks')
    t=title_task(page,'完成培训方案');old=(t['plannedStart'],t['plannedEnd']);bar=page.locator('.timeline-bar').filter(has_text='完成培训方案');box=bar.bounding_box()
    page.mouse.move(box['x']+box['width']/2,box['y']+15);page.mouse.down();page.mouse.move(box['x']+box['width']/2+80,box['y']+15,steps=10);page.mouse.up();page.wait_for_timeout(100)
    t=title_task(page,'完成培训方案');assert t['plannedStart']!=old[0]
    from datetime import datetime
    dt=lambda s:datetime.fromisoformat(s.replace('Z','+00:00'))
    assert dt(t['plannedEnd'])-dt(t['plannedStart'])==dt(old[1])-dt(old[0])
    ok('timeline bar dragging moves a task without altering planned duration')
    bar=page.locator('.timeline-bar').filter(has_text='完成培训方案');handle=bar.locator('.bar-handle.end');box=handle.bounding_box();start=t['plannedStart'];end=t['plannedEnd']
    page.mouse.move(box['x']+4,box['y']+15);page.mouse.down();page.mouse.move(box['x']+55,box['y']+15,steps=8);page.mouse.up();page.wait_for_timeout(100)
    t=title_task(page,'完成培训方案');assert t['plannedStart']==start and t['plannedEnd']!=end
    ok('resizing timeline endpoint changes only that endpoint')
    page.get_by_role('button',name='日',exact=True).click();assert page.locator('.time-column').count()==24
    page.get_by_role('button',name='月',exact=True).click();assert page.locator('.time-column').count()==30
    page.get_by_role('button',name='周',exact=True).click()
    ok('day, week and month timeline scales have correct calendar columns')
    page.get_by_role('button',name='整理旧文件',exact=True).click()
    expect(page.get_by_role('dialog',name='编辑任务')).to_be_visible()
    page.get_by_label('计划开始（可选）',exact=True).fill('2026-09-22T09:00');page.get_by_label('计划结束（可选）',exact=True).fill('2026-09-22T10:00');page.get_by_role('button',name='保存修改',exact=True).click()
    expect(page.locator('.pending-label')).to_have_text('待排期 1')
    ok('unscheduled task can be scheduled and leaves pending tray')
    # Smaller Mac windows must not cause whole-page overflow.
    for width,height in [(1280,800),(900,700)]:
        page.set_viewport_size({'width':width,'height':height});page.get_by_role('button',name='四象限',exact=True).click();page.wait_for_timeout(100)
        assert page.evaluate('document.body.scrollWidth<=innerWidth')
        assert page.evaluate('document.body.scrollHeight<=innerHeight')
    ok('1280x800 and 900x700 layouts fit without page overflow')
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);snap(page,'08_mobile.png')
    assert page.evaluate('document.body.scrollWidth<=innerWidth')
    ok('narrow fallback preserves quadrants and readable task access')
    assert not errors,errors
    ok('no renderer JavaScript exceptions through all flows')
    (ROOT/'qa/ui-results.json').write_text(json.dumps({'passed':len(passed),'checks':passed,'browser':'installed Chromium','bridge':'mocked Electron IPC; storage unit tested separately','errors':errors},ensure_ascii=False,indent=2))
    browser.close()
print(f'\n{len(passed)} browser checks passed.')
