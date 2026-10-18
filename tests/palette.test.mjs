import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {QUADRANTS} from '../src/domain/model.mjs';
const css=fs.readFileSync(new URL('../src/ui/style.css',import.meta.url),'utf8');
const root=css.match(/:root\{([^}]+)\}/)[1];
const token=name=>{const value=root.match(new RegExp(`--${name}:([^;]+)`))?.[1];assert.ok(value,`missing token ${name}`);return value.trim()};
function lum(hex){const c=hex.replace('#','');const f=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return f[0]*.2126+f[1]*.7152+f[2]*.0722}
function contrast(a,b){const l=[lum(a),lum(b)].sort((x,y)=>x-y);return(l[1]+.05)/(l[0]+.05)}
const original={q2:'#fff4ca',q1:'#ffe5e5',q4:'#f0f0f4',q3:'#e5f0ff'};
for(const q of QUADRANTS){
 test(`${q.id}: richer fill retains legibility, without dark mode`,()=>{
  assert.ok(lum(q.fill)<=lum(original[q.id])-.09,`${q.id} still washed out`);
  assert.ok(lum(q.fill)>.48,`${q.id} must stay a light paper card`);
  for(const text of [q.color,token('ink'),token('muted'),token('status-todo'),token('status-ing'),token('status-done')])
   assert.ok(contrast(text,q.fill)>=4.5,`${q.id}: ${text} on ${q.fill} = ${contrast(text,q.fill).toFixed(2)}`);
 });
}
test('canvas stays white and primary button white text remains distinct',()=>{
 assert.equal(token('canvas'),'#fff');assert.ok(contrast(token('blue'),'#ffffff')>=4.5);
});
test('completed cards and bars do not fade their readable labels',()=>{
 for(const selector of ['.task-card.done','.timeline-bar.done']){
  const rule=css.split('}').find(r=>r.startsWith(`${selector}{`));
  assert.match(rule,/opacity:1(?:;|$)/,`${selector} needs full-opacity text`);
 }
});
test('release metadata agrees across Electron and Mac builder',()=>{
 const version=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
 const builder=fs.readFileSync(new URL('../scripts/build-mac.sh',import.meta.url),'utf8');
 const main=fs.readFileSync(new URL('../src/electron/main.cjs',import.meta.url),'utf8');
 assert.ok(builder.includes(`VERSION="${version}"`));
 assert.ok(main.includes(`applicationVersion:'${version}'`));
});
