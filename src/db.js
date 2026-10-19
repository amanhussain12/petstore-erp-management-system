import pg from 'pg';
import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Default: PGlite, a real PostgreSQL engine embedded in the Node process.
// It saves data under .local-db without installing PostgreSQL Server.
// For a hosted/multi-process deployment, set DB_DRIVER=postgres and DATABASE_URL.
const embedded = (process.env.DB_DRIVER || 'pglite').toLowerCase() === 'pglite';
const { Pool } = pg;
let embeddedInstance;
let embeddedReady;
const initEmbedded = () => {
  if (!embeddedReady) embeddedReady = (async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const dataDir = path.resolve(process.cwd(), process.env.PGLITE_DATA_DIR || './.local-db');
    await mkdir(dataDir, {recursive:true});
    embeddedInstance = new PGlite(dataDir);
    await embeddedInstance.waitReady;
    return embeddedInstance;
  })();
  return embeddedReady;
};
const pgPool = embedded ? null : new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: true} : false,
  max: 10
});
if (!embedded && !process.env.DATABASE_URL) console.warn('DATABASE_URL is missing.');

// Normalize PGlite result metadata to the node-postgres shape used throughout the app.
const normalizeResult = result => ({...result, rowCount: Array.isArray(result.rows) && (result.fields?.length || /^SELECT$/i.test(result.command || '')) ? result.rows.length : (result.rowCount ?? result.affectedRows ?? (result.rows?.length || 0))});
// API compatibility with the original project's pool.query and pool.end.
export const pool = embedded ? {
  async query(sql, params = []) {
    const db = await initEmbedded();
    // PGlite.exec handles multi-statement schema SQL, query handles parameters.
    if (!params.length && /^\s*BEGIN\s*;/i.test(sql)) {
      const statements = sql.replace(/^\s*BEGIN\s*;/i,'').replace(/COMMIT\s*;\s*$/i,'');
      return db.exec(statements);
    }
    return normalizeResult(await db.query(sql, params));
  },
  async end() { if (embeddedInstance) await embeddedInstance.close(); }
} : pgPool;
export const query = (sql, params = []) => pool.query(sql, params);
export async function transaction(callback) {
  if (embedded) {
    const db = await initEmbedded();
    return db.transaction(async tx => callback({query: async (sql, params = []) => normalizeResult(await tx.query(sql,params))}));
  }
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {client.release();}
}
export async function audit(db,actor,action,entity,id,details={}){await db.query('INSERT INTO audit_logs(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[actor,action,entity,String(id),JSON.stringify(details)]);}
export async function moveStock(db,location,product,delta,type,ref,actor,note=''){
  if(!Number.isSafeInteger(delta)||delta===0)throw Object.assign(new Error('Invalid stock quantity'),{status:400});
  await db.query('INSERT INTO stock_balances(location_id,product_id,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[location,product]);
  const row=await db.query('SELECT quantity FROM stock_balances WHERE location_id=$1 AND product_id=$2 FOR UPDATE',[location,product]);
  if(!row.rowCount)throw Object.assign(new Error('Stock location/product missing'),{status:404});
  if(row.rows[0].quantity+delta<0)throw Object.assign(new Error('Insufficient stock at this location'),{status:409});
  await db.query('UPDATE stock_balances SET quantity=quantity+$3 WHERE location_id=$1 AND product_id=$2',[location,product,delta]);
  await db.query('INSERT INTO inventory_movements(location_id,product_id,delta,type,reference,actor_id,note) VALUES($1,$2,$3,$4,$5,$6,$7)',[location,product,delta,type,ref,actor,note]);
}
