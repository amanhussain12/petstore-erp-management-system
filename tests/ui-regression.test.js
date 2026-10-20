import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const frontend=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('warehouse approval, dispatch and receiving forms use matching submit IDs',()=>{
 assert.match(frontend, /'transfer-'\+action\.split\('-'\)\[0\]/);
 for(const kind of ['approve','dispatch','receive'])assert.ok(frontend.includes("kind==='transfer-"+kind+"'"),kind);
});
test('print stylesheet exists and receipt printing is isolated',()=>{
 assert.ok(existsSync(new URL('../public/print.css',import.meta.url)));
 assert.match(html, /href="\/print\.css"/);
 assert.match(frontend,/window\.open\('','_blank'/);
});
