import {Router} from 'express';import {query,transaction,moveStock,audit} from '../db.js';import {safe,fail,id,positive,paisa,str,warehouseManager,inRole} from '../core.js';
export const warehouse=Router();
const warehouseOperator=inRole('admin','warehouse_manager','warehouse_staff');
const whLoc=req=>{const n=Number(req.user.role==='admin'?(req.body.location_id||req.query.location_id||2):req.user.location_id);if(!Number.isSafeInteger(n)||n<1)fail(400,'Invalid warehouse');return n;};
async function ensureWh(db,n){if(!(await db.query("SELECT 1 FROM locations WHERE id=$1 AND kind='warehouse'",[n])).rowCount)fail(403,'Not a warehouse');}
warehouse.get('/overview',safe(async(req,res)=>{
 const loc=whLoc(req);await ensureWh({query},loc);
 const [s,t,p]=await Promise.all([query('SELECT COUNT(*)::int AS products,COALESCE(SUM(quantity),0)::int AS units,COUNT(*) FILTER(WHERE quantity<=5)::int AS low_stock FROM stock_balances WHERE location_id=$1',[loc]),query("SELECT COUNT(*)::int AS pending FROM stock_requests WHERE warehouse_id=$1 AND status='pending'",[loc]),query("SELECT COUNT(*)::int AS count FROM purchase_orders WHERE warehouse_id=$1 AND status='ordered'",[loc])]);res.json({stock:s.rows[0],requests:t.rows[0],purchasing:p.rows[0]});
}));
warehouse.get('/inventory',safe(async(req,res)=>{
 const loc=whLoc(req);await ensureWh({query},loc);res.json((await query('SELECT p.id,p.name,p.sku,p.category,p.price_paisa,COALESCE(b.quantity,0)::int AS quantity FROM products p LEFT JOIN stock_balances b ON b.product_id=p.id AND b.location_id=$1 WHERE p.active=TRUE ORDER BY p.name LIMIT 500',[loc])).rows);
}));
warehouse.post('/stock-in',warehouseOperator,safe(async(req,res)=>{
 const loc=whLoc(req),p=id(req.body.product_id),qty=positive(req.body.quantity),reason=str(req.body.note,500);
 await transaction(async db=>{await ensureWh(db,loc);await moveStock(db,loc,p,qty,'PURCHASE_RECEIVED',str(req.body.reference,100)||'DIRECT-IN',req.user.id,reason);await audit(db,req.user.id,'stock_in','product',p,{qty,loc});});res.status(201).json({ok:true,quantity_added:qty});
}));
warehouse.post('/stock-out',warehouseManager,safe(async(req,res)=>{
 const loc=whLoc(req),p=id(req.body.product_id),qty=positive(req.body.quantity),reason=str(req.body.reason,120);
 if(!reason)fail(400,'Reason required');if(reason==='TRANSFER')fail(400,'Use the transfer workflow for stock transfers');
 await transaction(async db=>{await ensureWh(db,loc);await moveStock(db,loc,p,-qty,'STOCK_OUT',str(req.body.reference,100)||'MANUAL-OUT',req.user.id,reason);await audit(db,req.user.id,'stock_out','product',p,{qty,loc,reason});});res.status(201).json({ok:true,quantity_removed:qty});
}));
warehouse.get('/requests',safe(async(req,res)=>{
 const loc=whLoc(req);res.json((await query('SELECT r.*,p.name AS product_name,p.sku,s.name AS shop_name,COALESCE(b.quantity,0)::int AS warehouse_stock FROM stock_requests r JOIN products p ON p.id=r.product_id JOIN locations s ON s.id=r.shop_id LEFT JOIN stock_balances b ON b.product_id=r.product_id AND b.location_id=r.warehouse_id WHERE r.warehouse_id=$1 ORDER BY r.id DESC LIMIT 200',[loc])).rows);
}));
warehouse.post('/requests/:id/approve',warehouseManager,safe(async(req,res)=>{
 const loc=whLoc(req),rid=id(req.params.id);const result=await transaction(async db=>{
  const x=await db.query('SELECT * FROM stock_requests WHERE id=$1 FOR UPDATE',[rid]);const r=x.rows[0];if(!r||r.warehouse_id!==loc)fail(404,'Request not found');if(r.status!=='pending')fail(409,'Request already handled');
  const qty=positive(req.body.quantity||r.quantity);if(qty>r.quantity)fail(400,'Cannot approve beyond requested quantity');
  await db.query("UPDATE stock_requests SET status='approved',approved_quantity=$1,reviewed_by=$2,updated_at=NOW() WHERE id=$3",[qty,req.user.id,rid]);await audit(db,req.user.id,'approved','stock_request',rid,{qty});return {id:rid,status:'approved',qty};});res.json(result);
}));
warehouse.post('/requests/:id/reject',warehouseManager,safe(async(req,res)=>{
 const loc=whLoc(req),rid=id(req.params.id);const result=await transaction(async db=>{const r=(await db.query('SELECT * FROM stock_requests WHERE id=$1 FOR UPDATE',[rid])).rows[0];if(!r||r.warehouse_id!==loc)fail(404,'Not found');if(r.status!=='pending')fail(409,'Already handled');const reason=str(req.body.reason,500);if(!reason)fail(400,'Rejection reason required');await db.query("UPDATE stock_requests SET status='rejected',reason=$1,reviewed_by=$2,updated_at=NOW() WHERE id=$3",[reason,req.user.id,rid]);await audit(db,req.user.id,'rejected','stock_request',rid,{reason});return {id:rid,status:'rejected'};});res.json(result);
}));
warehouse.post('/requests/:id/dispatch',warehouseOperator,safe(async(req,res)=>{
 const loc=whLoc(req),rid=id(req.params.id);const result=await transaction(async db=>{
  const x=await db.query('SELECT * FROM stock_requests WHERE id=$1 FOR UPDATE',[rid]);const r=x.rows[0];if(!r||r.warehouse_id!==loc)fail(404,'Request not found');if(r.status!=='approved')fail(409,'Approve request before dispatch');
  const qty=positive(req.body.quantity||r.approved_quantity);if(qty>r.approved_quantity)fail(400,'Quantity above approved');
  await moveStock(db,loc,r.product_id,-qty,'WAREHOUSE_DISPATCH',`TR-${rid}`,req.user.id);
  await db.query("UPDATE stock_requests SET status='in_transit',dispatched_quantity=$1,dispatched_by=$2,updated_at=NOW() WHERE id=$3",[qty,req.user.id,rid]);await audit(db,req.user.id,'dispatched','stock_request',rid,{qty});return {id:rid,status:'in_transit',qty};});res.json(result);
}));
warehouse.get('/movements',safe(async(req,res)=>{const loc=whLoc(req);res.json((await query('SELECT m.*,p.name AS product_name,u.name AS actor FROM inventory_movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.actor_id WHERE m.location_id=$1 ORDER BY m.id DESC LIMIT 200',[loc])).rows)}));
warehouse.get('/suppliers',safe(async(req,res)=>res.json((await query('SELECT * FROM suppliers ORDER BY id DESC LIMIT 200')).rows)));
warehouse.post('/suppliers',warehouseManager,safe(async(req,res)=>{const name=str(req.body.name);if(!name)fail(400,'Supplier name required');const x=await query('INSERT INTO suppliers(name,phone,email,address) VALUES($1,$2,$3,$4) RETURNING *',[name,str(req.body.phone,50),str(req.body.email,254),str(req.body.address,500)]);res.status(201).json(x.rows[0])}));
warehouse.get('/purchases',safe(async(req,res)=>{const loc=whLoc(req);res.json((await query('SELECT o.*,s.name AS supplier FROM purchase_orders o LEFT JOIN suppliers s ON o.supplier_id=s.id WHERE o.warehouse_id=$1 ORDER BY o.id DESC LIMIT 150',[loc])).rows)}));
warehouse.post('/purchases',warehouseManager,safe(async(req,res)=>{
 const loc=whLoc(req),supplier=id(req.body.supplier_id),raw=req.body.items;if(!Array.isArray(raw)||!raw.length||raw.length>100)fail(400,'Purchase order requires products');const items=raw.map(x=>({product:id(x.product_id),qty:positive(x.quantity),cost:paisa(x.cost_paisa)}));
 const order=await transaction(async db=>{await ensureWh(db,loc);const total=items.reduce((sum,x)=>sum+x.qty*x.cost,0);const x=await db.query('INSERT INTO purchase_orders(supplier_id,warehouse_id,total_paisa,created_by) VALUES($1,$2,$3,$4) RETURNING id',[supplier,loc,total,req.user.id]);for(const i of items)await db.query('INSERT INTO purchase_items(purchase_id,product_id,quantity,cost_paisa) VALUES($1,$2,$3,$4)',[x.rows[0].id,i.product,i.qty,i.cost]);await audit(db,req.user.id,'created','purchase',x.rows[0].id,{total});return {id:x.rows[0].id,total_paisa:total};});res.status(201).json(order);
}));
warehouse.post('/purchases/:id/receive',warehouseManager,safe(async(req,res)=>{
 const loc=whLoc(req),po=id(req.params.id);const result=await transaction(async db=>{
  const x=await db.query('SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE',[po]);const p=x.rows[0];if(!p||p.warehouse_id!==loc)fail(404,'Purchase order not found');if(p.status!=='ordered')fail(409,'Purchase already received or cancelled');
  const items=await db.query('SELECT * FROM purchase_items WHERE purchase_id=$1',[po]);for(const i of items.rows)await moveStock(db,loc,i.product_id,i.quantity,'PURCHASE_RECEIVED',`PO-${po}`,req.user.id);
  await db.query("UPDATE purchase_orders SET status='received',received_at=NOW() WHERE id=$1",[po]);await audit(db,req.user.id,'received','purchase',po);return {id:po,status:'received'};
 });res.json(result);
}));

warehouse.get('/purchases/:id',safe(async(req,res)=>{
 const loc=whLoc(req),po=id(req.params.id);
 const row=await query('SELECT o.*,s.name AS supplier FROM purchase_orders o LEFT JOIN suppliers s ON o.supplier_id=s.id WHERE o.id=$1 AND o.warehouse_id=$2',[po,loc]);if(!row.rowCount)fail(404,'Purchase order not found');
 const items=(await query('SELECT i.*,p.name AS product_name FROM purchase_items i JOIN products p ON p.id=i.product_id WHERE i.purchase_id=$1',[po])).rows;res.json({...row.rows[0],items});
}));
