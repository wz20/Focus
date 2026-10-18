from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
def mount(page,snapshot=None):
    # Fixtures use the week of 2026-09-21; freeze wall-clock date, not timers.
    page.clock.set_fixed_time('2026-09-21T14:30:00+08:00')
    snapshot=snapshot or {'version':1,'tasks':[]}
    page.set_content('<meta charset="utf-8"><style>'+(ROOT/'src/ui/style.css').read_text()+'</style><div id="app"></div><div id="overlay-root"></div><div id="toast-root" aria-live="polite"></div>')
    page.add_script_tag(content='window.__saved='+json.dumps(snapshot,ensure_ascii=False)+';'+"""
window.focusNative={platform:'linux',load:async()=>({snapshot:structuredClone(window.__saved),warning:null}),save:async s=>{window.__saved=structuredClone(s);return{savedAt:new Date().toISOString()}},onAction:fn=>{window.__nativeAction=fn;return()=>{}},exportData:async()=>({canceled:false}),importData:async()=>({canceled:true}),revealData:async()=>{}};
""")
    page.add_script_tag(content=(ROOT/'qa/renderer.bundle.js').read_text())
    page.locator('.brand').wait_for()
    page.wait_for_timeout(100)
def fixture(name):return json.loads((ROOT/f'tests/fixtures/{name}.json').read_text())
