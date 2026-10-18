from playwright.sync_api import sync_playwright,expect
from browser_harness import mount,fixture,ROOT
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000})
 snap=fixture('sparse')
 done=next(t for t in snap['tasks'] if t['status']=='done')
 done['archivedAt']=done['completedAt']
 mount(page,snap)
 page.get_by_label('任务状态筛选',exact=True).select_option('todo')
 page.get_by_role('button',name='归档',exact=True).click()
 expect(page.get_by_text(done['title'],exact=True)).to_be_visible()
 print('PASS archive ignores unrelated active-task status filter')
 page.get_by_role('button',name='时间轴',exact=True).click()
 expect(page.get_by_label('时间轴状态筛选',exact=True)).to_have_value('todo')
 page.get_by_label('时间轴状态筛选',exact=True).select_option('ing')
 expect(page.locator('.timeline-row')).to_have_count(3)
 print('PASS timeline displays and applies inherited status filter')
 b.close()
# A pending sequence must be flushable before the Electron window is destroyed.
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000})
 mount(page,fixture('sparse'))
 page.evaluate("window.focusNative.save=s=>new Promise(resolve=>setTimeout(()=>{window.__saved=structuredClone(s);resolve({});},80))")
 page.get_by_role('button',name='确认培训场地：开始任务',exact=True).click()
 page.get_by_role('button',name='确认培训场地：标记为已完成',exact=True).click()
 page.evaluate('window.focusFlushPendingSaves()')
 assert next(t for t in page.evaluate('window.__saved.tasks') if t['title']=='确认培训场地')['status']=='done'
 print('PASS closing handshake waits for all pending renderer saves')
 b.close()
