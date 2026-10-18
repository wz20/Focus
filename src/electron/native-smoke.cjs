'use strict';
/** Invoked only by explicit --focus-smoke-test using an isolated temp profile. */
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForRenderer(win){
 for(let i=0;i<100;i++){
  if(await win.webContents.executeJavaScript("Boolean(document.querySelector('.brand'))"))return;
  await sleep(100);
 }
 throw new Error('Renderer did not initialize within 10 seconds');
}
module.exports=async function smoke(win,screenshot){
 await waitForRenderer(win);
 const info=await win.webContents.executeJavaScript("({title:document.title,bridge:!!window.focusNative,axes:document.querySelectorAll('.axis-label').length,node:typeof require})");
 assert.equal(info.bridge,true);assert.equal(info.axes,4);assert.equal(info.node,'undefined');
 const snapshot=await win.webContents.executeJavaScript("window.focusNative.load().then(x=>x.snapshot)");
 assert.equal(snapshot.tasks.length,0);
 // Real renderer UI -> store -> sandbox preload -> main process -> atomic JSON save.
 await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='先用示例体验').click()");
 let tasks=[];
 for(let i=0;i<100;i++){
  tasks=await win.webContents.executeJavaScript("window.focusNative.load().then(x=>x.snapshot.tasks)");
  if(tasks.length===11)break;
  await sleep(100);
 }
 assert.equal(tasks.length,11);
 const loaded=new Promise((resolve,reject)=>{win.webContents.once('did-finish-load',resolve);win.webContents.once('did-fail-load',(_e,c,d)=>reject(new Error(`${c}: ${d}`)));});
 win.webContents.reload();await loaded;await waitForRenderer(win);await sleep(300);
 const reloaded=await win.webContents.executeJavaScript("({cards:document.querySelectorAll('.task-card').length,text:document.body.textContent})");
 assert.ok(reloaded.cards>0);assert.ok(reloaded.text.includes('完成培训方案'));
 await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('时间轴')).click()");
 await sleep(300);
 assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('.timeline-view')"),true);
 if(screenshot){const image=await win.webContents.capturePage();await fs.writeFile(screenshot,image.toPNG());}
 console.log('FOCUS_NATIVE_SMOKE_OK: renderer, sandbox bridge, atomic save, reload, timeline');
};
