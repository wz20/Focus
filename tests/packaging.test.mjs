import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

test('native macOS builder rejects unsupported host instead of claiming a DMG',async()=>{
 if(process.platform==='darwin')return;
 const result=spawnSync('bash',['scripts/build-mac.sh'],{encoding:'utf8'});
 assert.equal(result.status,2);
 assert.match(result.stderr,/macOS/);
});
test('Mac builder pins runtime checksums, validates signatures and verifies disk image',async()=>{
 const source=await fs.readFile('scripts/build-mac.sh','utf8');
 assert.match(source,/6b728f5dcfae74f3f936f2bca5b3cd9b9659ffea464f67939f004acb55425a85/);
 assert.match(source,/015b52631d92187b552ff4e047255f596a7af4707e388a5890951f0b2645764e/);
 assert.match(source,/shasum -a 256/);assert.match(source,/codesign --verify/);assert.match(source,/hdiutil verify/);
 assert.doesNotMatch(source,/spctl\s+--master-disable|xattr\s+-[a-z]*d/);
});
test('packaging has a clickable entry and no bundled font resources',async()=>{
 const stat=await fs.stat('双击生成Mac安装包.command');assert.ok(stat.mode&0o111);
 const entries=await fs.readdir('assets');assert.ok(entries.includes('icon.icns'));
 assert.ok(!entries.some(e=>/\.(ttf|otf|woff2?)$/i.test(e)));
});
