/** Import products from UTF-8 CSV into the existing ERP products table.
 * Usage: npm run products:import -- data/products.csv [--apply]
 * Preview is the default. Stock is intentionally never modified.
 */
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function parseCSV(source){
 const rows=[];let row=[],cell='',quoted=false;
 source=source.replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quoted){if(c==='"'&&source[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c;continue}
  if(c==='"'){if(cell!=='')throw Error('Invalid quote in CSV');quoted=true}
  else if(c===','){row.push(cell);cell=''}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell=''}
  else cell+=c;
 }
 if(quoted)throw Error('Unclosed quoted CSV field');
 if(row.length||cell){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row)}
 return rows;
}
export function validateProducts(content){
 const rows=parseCSV(content);if(!rows.length)throw Error('CSV file is empty');
 const header=rows.shift().map(v=>v.trim().toLowerCase());
 const required=['sku','name','category','price'];
 if(header.length!==new Set(header).size||required.some(k=>!header.includes(k)))throw Error('Expected unique CSV headers: sku,name,category,price');
 const used=new Set();
 return rows.map((fields,i)=>{
  if(fields.length!==header.length)throw Error(`Row ${i+2}: incorrect column count`);
  const r=Object.fromEntries(header.map((h,j)=>[h,fields[j].trim()]));
  if(!r.sku||r.sku.length>80||!r.name||r.name.length>255||r.category.length>120)throw Error(`Row ${i+2}: invalid SKU, name, or category`);
  if(used.has(r.sku))throw Error(`Row ${i+2}: duplicate SKU ${r.sku}`);used.add(r.sku);
  if(!/^\d+(\.\d{1,2})?$/.test(r.price))throw Error(`Row ${i+2}: price must be PKR with at most 2 decimals`);
  const [whole,fraction='']=r.price.split('.');const paisa=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(paisa)||paisa<0)throw Error(`Row ${i+2}: invalid amount`);
  return {sku:r.sku,name:r.name,category:r.category,price_paisa:paisa};
 });
}
export async function importProducts(products, db, apply=false){
 let created=0,updated=0; const preview=[];
 const work=async client=>{
  for(const p of products){
   const match=await client.query('SELECT id,name,category,price_paisa,wc_id FROM products WHERE sku=$1',[p.sku]);
   const before=match.rows[0];
   if(before){updated++;preview.push({sku:p.sku,action:'update'});
    if(apply)await client.query('UPDATE products SET name=$1,category=$2,price_paisa=$3,updated_at=NOW() WHERE id=$4',[p.name,p.category,p.price_paisa,before.id]);
   }else{created++;preview.push({sku:p.sku,action:'create'});
    if(apply)await client.query('INSERT INTO products(sku,name,category,price_paisa) VALUES($1,$2,$3,$4)',[p.sku,p.name,p.category,p.price_paisa]);
   }
  }
 };
 if(apply){const {transaction}=await import('../src/db.js');await transaction(work)}else await work(db);
 return {created,updated,preview};
}
async function main(){
 const args=process.argv.slice(2);const file=args.find(x=>!x.startsWith('--'));
 if(!file||args.some(x=>x.startsWith('--')&&x!=='--apply'))throw Error('Usage: npm run products:import -- data/products.csv [--apply]');
 const products=validateProducts(await readFile(path.resolve(file),'utf8'));
 if(!products.length)throw Error('No products found in file');
 const {query,pool}=await import('../src/db.js');
 try{
  const result=await importProducts(products,{query},args.includes('--apply'));
  console.table(result.preview);
  console.log(`${args.includes('--apply')?'SAVED':'PREVIEW ONLY'}: ${result.created} new, ${result.updated} existing; ${products.length} products. Stock unchanged.`);
  if(!args.includes('--apply'))console.log('Review above. Add --apply to write to the configured database.');
 }finally{await pool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('Product import failed:',e.message);process.exitCode=1});
