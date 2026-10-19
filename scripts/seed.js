import 'dotenv/config';import bcrypt from 'bcryptjs';import {pool,transaction,moveStock} from '../src/db.js';
const mode=process.argv[2];
try{
 if(mode==='admin'){
  const email=process.env.ADMIN_EMAIL?.toLowerCase(),pw=process.env.ADMIN_PASSWORD;
  if(!email||!pw||pw.length<12)throw Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) in .env');
  const hash=await bcrypt.hash(pw,12);
  await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=$4,active=TRUE',[process.env.ADMIN_NAME||'Administrator',email,hash,'admin']);
  console.log('Admin account created/updated:',email);
 } else if(mode==='demo'){
  if(process.env.NODE_ENV==='production')throw Error('Demo seed forbidden in production');
  await transaction(async db=>{
   const products=[['Royal Canin Adult Cat Food','CAT-001',330000],['Whiskas Kitten Food 2-12 Months','CAT-002',500000],['Wanpy Creamy Cat Treats','TRT-003',60000],['Dog Treat Mix','DOG-004',125000],['Pet Shampoo','PET-005',85000]];
   for(const [name,sku,price] of products){const p=await db.query('INSERT INTO products(name,sku,price_paisa) VALUES($1,$2,$3) ON CONFLICT(sku) DO UPDATE SET name=$1,price_paisa=$3 RETURNING id',[name,sku,price]);for(const loc of [1,2]){const exists=await db.query('SELECT 1 FROM stock_balances WHERE location_id=$1 AND product_id=$2',[loc,p.rows[0].id]);if(!exists.rowCount)await moveStock(db,loc,p.rows[0].id,loc===1?25:150,'DEMO_OPENING','DEMO',null)}}
  }); console.log('Demo product catalog and stocks ready. For development ONLY.');
 } else throw Error('Usage: npm run seed:admin OR npm run seed:demo');
}catch(e){console.error(e.message);process.exitCode=1}finally{await pool.end()}
