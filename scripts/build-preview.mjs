import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modules=['domain/model.mjs','domain/store.mjs','domain/demo.mjs','domain/time.mjs','ui/dom.mjs','ui/home.mjs','ui/panels.mjs','ui/modal.mjs','ui/timeline.mjs','app.mjs'];
let script='';for(const name of modules){let text=await fs.readFile(path.join(root,'src',name),'utf8');text=text.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'');script+=`\n// ${name}\n${text}\n`;}
script=`(()=>{\n'use strict';\n${script}\n})();`;
const css=await fs.readFile(path.join(root,'src/ui/style.css'),'utf8');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none';"><title>Focus · 离线体验</title><style>${css}</style></head><body><div id="app"></div><div id="overlay-root"></div><div id="toast-root" aria-live="polite"></div><script>${script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
await fs.mkdir(path.join(root,'dist'),{recursive:true});await fs.mkdir(path.join(root,'qa'),{recursive:true});await fs.writeFile(path.join(root,'dist/Focus-preview.html'),html);await fs.writeFile(path.join(root,'qa/renderer.bundle.js'),script);console.log('Built standalone offline preview (same renderer; browser-local storage).');
