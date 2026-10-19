import 'dotenv/config';import {readFileSync} from 'node:fs';import {pool} from '../src/db.js';
try{await pool.query(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));await pool.query("INSERT INTO locations(code,name,kind) VALUES ('SHOP','Main Shop','shop'),('WH','Main Warehouse','warehouse') ON CONFLICT (code) DO NOTHING");console.log('Database schema created. Default locations: SHOP, WH');}
catch(e){console.error(e.message);process.exitCode=1}finally{await pool.end()}
