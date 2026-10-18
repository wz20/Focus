"""Production renderer contract: one quadrant click selects both priority axes."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from browser_harness import mount,ROOT
OUT=Path(os.environ.get('FOCUS_QA_DIR','/mnt/data/focus-quadrant-qa'));OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def ok(label):
 checks.append(label);print('PASS',label,flush=True)
def save_state(page):
 page.evaluate('window.focusFlushPendingSaves()')
 return page.evaluate('window.__saved')
quadrants=[('q2','重要 · 不紧急',True,False),('q1','重要 · 紧急',True,True),('q4','不重要 · 不紧急',False,False),('q3','不重要 · 紧急',False,True)]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000},timezone_id='Asia/Shanghai');errors=[]
 page.on('pageerror',lambda err:errors.append(str(err)))
 mount(page)
 page.get_by_role('button',name='新增任务',exact=True).click()
 picker=page.get_by_role('radiogroup',name='所在象限',exact=True)
 expect(picker).to_be_visible(timeout=1500)
 expect(picker.get_by_role('radio')).to_have_count(4)
 assert page.get_by_role('group',name='重要性',exact=True).count()==0
 assert page.get_by_role('group',name='紧急性',exact=True).count()==0
 expect(picker.get_by_role('radio',name='重要 · 不紧急',exact=True)).to_have_attribute('aria-checked','true')
 ok('four single-choice quadrants replace both independent toggle groups; default q2 preserved')
 boxes=[picker.get_by_role('radio',name=q[1],exact=True).bounding_box() for q in quadrants]
 assert boxes[0]['x']<boxes[1]['x'] and boxes[2]['x']<boxes[3]['x']
 assert boxes[0]['y']==boxes[1]['y']<boxes[2]['y']==boxes[3]['y']
 ok('quadrant positions match the main board, not a reordered list')
 for qid,name,important,urgent in quadrants:
  r=picker.get_by_role('radio',name=name,exact=True);r.click()
  expect(r).to_have_attribute('aria-checked','true')
  expect(picker.locator('[aria-checked="true"]')).to_have_count(1)
  expect(page.get_by_role('dialog',name='新增任务',exact=True)).to_be_visible()
  ok(f'{qid}: whole quadrant selects without submitting or extra confirmation')
 # Physical arrow navigation respects the two-dimensional arrangement.
 picker.get_by_role('radio',name='重要 · 不紧急',exact=True).click()
 for key,name in [('ArrowRight','重要 · 紧急'),('ArrowDown','不重要 · 紧急'),('ArrowLeft','不重要 · 不紧急'),('ArrowUp','重要 · 不紧急')]:
  page.keyboard.press(key);r=picker.get_by_role('radio',name=name,exact=True)
  expect(r).to_be_focused();expect(r).to_have_attribute('aria-checked','true')
 ok('arrow keys move by physical row and column and keep focus')
 page.keyboard.press('End');expect(picker.get_by_role('radio',name='不重要 · 紧急',exact=True)).to_be_focused()
 page.keyboard.press('Home');expect(picker.get_by_role('radio',name='重要 · 不紧急',exact=True)).to_be_focused()
 page.keyboard.press('Space');expect(picker.locator('[aria-checked="true"]')).to_have_count(1)
 page.keyboard.press('Tab');assert page.locator(':focus').get_attribute('role')!='radio'
 ok('Home, End, Space and roving Tab work without duplicate selections')
 # A quadrant-only edit is dirty, so cancel must not silently discard it.
 page.get_by_role('button',name='取消',exact=True).click()
 expect(page.get_by_role('dialog',name='放弃未保存的修改？')).to_be_visible()
 page.get_by_role('button',name='放弃修改',exact=True).click()
 ok('quadrant-only changes participate in the existing unsaved-change protection')
 for i,(qid,name,important,urgent) in enumerate(quadrants):
  page.get_by_role('button',name='新增任务',exact=True).click()
  page.get_by_label('任务名称',exact=True).fill('象限验证-'+qid)
  page.get_by_label('备注',exact=True).fill('只改变象限，不丢失其他字段')
  picker=page.get_by_role('radiogroup',name='所在象限',exact=True)
  picker.get_by_role('radio',name=name,exact=True).click()
  if i==0:
   page.get_by_label('计划开始（可选）',exact=True).fill('2026-09-22T09:00')
   page.get_by_label('计划结束（可选）',exact=True).fill('2026-09-22T11:00')
   page.get_by_label('截止时间（可选）',exact=True).fill('2026-09-23T18:00')
   page.get_by_label('预计用时',exact=True).fill('120')
   page.locator('#task-start-reminder').select_option('10')
   page.locator('#task-deadline-reminder').select_option('30')
   picker.get_by_role('radio',name='重要 · 紧急',exact=True).click()
   picker.get_by_role('radio',name=name,exact=True).click()
   page.wait_for_timeout(180);page.screenshot(path=str(OUT/'01-new-quadrant.png'))
  page.get_by_role('button',name='创建任务',exact=True).click()
  expect(page.get_by_role('dialog',name='新增任务',exact=True)).to_have_count(0)
  state=save_state(page)
  t=next(t for t in state['tasks'] if t['title']=='象限验证-'+qid)
  assert (t['important'],t['urgent'])==(important,urgent)
  assert t['notes']=='只改变象限，不丢失其他字段'
  expect(page.locator(f'[data-quadrant="{qid}"]').get_by_role('button',name='查看任务：象限验证-'+qid,exact=True)).to_have_count(1)
  if i==0:
   assert t['estimateMinutes']==120 and t['deadline']=='2026-09-23T10:00:00.000Z'
   assert t['reminders']=={'startMinutes':10,'deadlineMinutes':30}
   assert t['plannedStart']=='2026-09-22T01:00:00.000Z'
  else: assert t['deadline'] is None
  ok(f'{qid}: create persists correct boolean pair and board placement; optional fields unchanged')
 # Edit/reopen verifies same-ID persistence and round trips for every quadrant.
 page.get_by_role('button',name='查看任务：象限验证-q2',exact=True).click()
 original=next(t for t in save_state(page)['tasks'] if t['title']=='象限验证-q2')
 for qid,name,important,urgent in quadrants:
  page.get_by_role('button',name='编辑任务',exact=True).click()
  group=page.get_by_role('radiogroup',name='所在象限',exact=True)
  current=next(q for q in quadrants if (q[2],q[3])==(original['important'],original['urgent']))
  expect(group.get_by_role('radio',name=current[1],exact=True)).to_have_attribute('aria-checked','true')
  group.get_by_role('radio',name=name,exact=True).click()
  page.get_by_role('button',name='保存修改',exact=True).click()
  edited=next(t for t in save_state(page)['tasks'] if t['id']==original['id'])
  assert (edited['important'],edited['urgent'])==(important,urgent)
  for field in ['title','notes','id','status','plannedStart','plannedEnd','estimateMinutes','deadline','reminders']:
   assert edited[field]==original[field],field
  original=edited
  ok(f'{qid}: edit returns current selection and saves same task without losing deadline/reminders')
 # Hydrate again from actual bridge snapshot, then edit.
 state=save_state(page);mount(page,state)
 page.get_by_role('button',name='查看任务：象限验证-q2',exact=True).click()
 page.get_by_role('button',name='编辑任务',exact=True).click()
 expect(page.get_by_role('radio',name='不重要 · 紧急',exact=True)).to_have_attribute('aria-checked','true')
 page.wait_for_timeout(180);page.screenshot(path=str(OUT/'02-edit-quadrant.png'))
 ok('selection survives a fresh renderer load')
 # No clipping on small desktop/mobile viewports; tap targets remain usable.
 for w,h in [(1280,800),(900,700),(390,844)]:
  page.set_viewport_size({'width':w,'height':h})
  group=page.get_by_role('radiogroup',name='所在象限',exact=True)
  group.scroll_into_view_if_needed()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  assert page.locator('.task-modal').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
  for qid,name,_,_ in quadrants:
   r=group.get_by_role('radio',name=name,exact=True);box=r.bounding_box()
   assert box['width']>=100 and box['height']>=44
  group.get_by_role('radio',name='重要 · 紧急',exact=True).click()
  page.wait_for_timeout(180);page.screenshot(path=str(OUT/f'03-picker-{w}.png'))
  ok(f'{w}x{h}: readable 2x2 control, no horizontal clipping, tappable cells')
 assert not errors,errors;ok('no renderer JavaScript exceptions')
 b.close()
print(f'{len(checks)} quadrant UI checks passed')
