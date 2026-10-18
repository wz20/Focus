from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.set_content('<style>'+ (ROOT/'src/ui/style.css').read_text() +'</style><div id="app"></div><div id="overlay-root"></div><div id="toast-root"></div>')
    page.add_script_tag(content="""window.__saved={version:1,tasks:[]};window.focusNative={platform:'linux',load:async()=>({snapshot:window.__saved,warning:null}),save:async s=>{window.__saved=structuredClone(s);return{savedAt:new Date().toISOString()}},onAction:()=>()=>{}};""")
    page.add_script_tag(content=(ROOT/'qa/renderer.bundle.js').read_text())
    page.get_by_role('button',name='新增任务',exact=True).click()
    page.get_by_label('任务名称',exact=True).fill('完整流程测试')
    page.get_by_role('button',name='创建任务',exact=True).click()
    expect(page.get_by_role('button',name='查看任务：完整流程测试')).to_be_visible(timeout=2000)
    browser.close()
