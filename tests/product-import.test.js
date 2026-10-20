import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,validateProducts,importProducts} from '../scripts/import-products.js';
test('CSV supports quoted names and commas',()=>{assert.deepEqual(parseCSV('sku,name,category,price\nA,"Fish, Treats",Food,12.50\n')[1],['A','Fish, Treats','Food','12.50'])});
test('import validates headers, prices and duplicate SKUs',()=>{
 assert.deepEqual(validateProducts('sku,name,category,price\nA,Test,Food,12.50\n')[0],{sku:'A',name:'Test',category:'Food',price_paisa:1250});
 assert.throws(()=>validateProducts('sku,name,category,price\nA,X,F,1.234\n'),/price/);
 assert.throws(()=>validateProducts('sku,name,category,price\nA,X,F,1\nA,Y,F,2\n'),/duplicate/);
});
test('preview checks existing SKUs without writing',async()=>{
 const seen=[];const db={query:async(sql,params)=>{seen.push(sql);return {rows:params[0]==='A'?[{id:1,sku:'A'}]:[]}}};
 const r=await importProducts([{sku:'A',name:'X',category:'F',price_paisa:100},{sku:'B',name:'Y',category:'F',price_paisa:200}],db,false);
 assert.deepEqual([r.created,r.updated],[1,1]);assert.equal(seen.length,2);assert.ok(seen.every(x=>x.startsWith('SELECT')));
});
