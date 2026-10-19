import {Router} from 'express';import {query,transaction,moveStock,audit} from '../db.js';import {safe,fail,id,positive,paisa,str,recalc,isValidIdempotency,shopManager} from '../core.js';
export const shop=Router();
const localShop=(req)=>{const n=Number(req.user.role==='admin'?(req.body.location_id||req.query.location_id||1):req.user.location_id);if(!Number.isSafeInteger(n)||n<1)fail(400,'Invalid shop');return n;};
async function ensureShop(db,n){const r=await db.query("SELECT id FROM locations WHERE id=$1 AND kind='shop'",[n]);if(!r.rowCount)fail(403,'Not a shop location');}
shop.get('/overview',safe(async(req,res)=>{
 const loc=localShop(req);await ensureShop({query},loc);
 const [sales,stock,pending]=await Promise.all([
 query("SELECT COUNT(*)::int AS count, COALESCE(SUM(total_paisa),0)::bigint AS revenue FROM sales WHERE location_id=$1 AND (created_at AT TIME ZONE 'Asia/Karachi')::date=(NOW() AT TIME ZONE 'Asia/Karachi')::date",[loc]),
 query('SELECT COUNT(*)::int AS products,COUNT(*) FILTER (WHERE quantity<=5)::int AS low_stock FROM stock_balances WHERE location_id=$1',[loc]),
 query("SELECT COUNT(*)::int AS pending FROM stock_requests WHERE shop_id=$1 AND status IN ('pending','approved','in_transit','partially_received')",[loc])]);res.json({sales:sales.rows[0],stock:stock.rows[0],requests:pending.rows[0]});
}));
shop.post('/sales',safe(async(req,res)=>{
 const key=req.body.idempotency_key;if(!isValidIdempotency(key))fail(400,'Valid idempotency key required');
 const existing=await query('SELECT id FROM sales WHERE idempotency_key=$1',[key]);if(existing.rowCount)return res.json({id:existing.rows[0].id,duplicate:true});
 const loc=localShop(req),raw=Array.isArray(req.body.items)?req.body.items:[];
 if(raw.length<1||raw.length>100)fail(400,'Add at least one product (maximum 100)');
 const items=raw.map(v=>({product_id:id(v.product_id),quantity:positive(v.quantity,5000)}));
 if(new Set(items.map(x=>x.product_id)).size!==items.length)fail(400,'Combine duplicate product lines');
 const discount=paisa(req.body.discount_paisa||0),delivery=paisa(req.body.delivery_paisa||0);
 const method=str(req.body.payment_method,30);if(!['cash','wallet','bank'].includes(method))fail(400,'Select cash, wallet or bank');
 const reference=str(req.body.payment_reference,160);if(method!=='cash'&&!reference)fail(400,'Online payment requires transaction reference');
 const saleType=['on_site','delivery'].includes(req.body.sale_type)?req.body.sale_type:'on_site';
 const result=await transaction(async db=>{
  await ensureShop(db,loc);
  const details=[];
  for(const it of items){const r=await db.query('SELECT * FROM products WHERE id=$1 AND active=TRUE',[it.product_id]);if(!r.rowCount)fail(404,'A product is unavailable');details.push({...it,...r.rows[0],price:r.rows[0].price_paisa});}
  const {subtotal,total}=recalc(details,discount,delivery);
  let received=total,change=0;
  if(method==='cash'){received=paisa(req.body.received_paisa);if(received<total)fail(400,'Cash received is below sale total');change=received-total;}
  let customerId=req.body.customer_id? id(req.body.customer_id):null,customerName='Walk-in Customer';
  if(customerId){const c=await db.query('SELECT name FROM customers WHERE id=$1',[customerId]);if(!c.rowCount)fail(404,'Customer not found');customerName=c.rows[0].name;}
  const s=await db.query(`INSERT INTO sales(location_id,cashier_id,customer_id,customer_name,sale_type,subtotal_paisa,discount_paisa,delivery_paisa,total_paisa,payment_method,payment_reference,payment_verified,received_paisa,change_paisa,idempotency_key)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,[loc,req.user.id,customerId,customerName,saleType,subtotal,discount,delivery,total,method,reference,method==='cash',received,change,key]);
  for(const p of details){await moveStock(db,loc,p.product_id,-p.quantity,'SHOP_SALE',`POS-${s.rows[0].id}`,req.user.id);await db.query('INSERT INTO sale_items(sale_id,product_id,product_name,sku,quantity,unit_price_paisa,total_paisa) VALUES($1,$2,$3,$4,$5,$6,$7)',[s.rows[0].id,p.product_id,p.name,p.sku,p.quantity,p.price,p.quantity*p.price]);}
  if(method==='cash'){const open=(await db.query('SELECT id FROM cash_drawer_sessions WHERE location_id=$1 AND closed_at IS NULL FOR UPDATE',[loc])).rows[0];if(open)await db.query("INSERT INTO cash_movements(session_id,type,amount_paisa,sale_id,actor_id) VALUES($1,'cash_sale',$2,$3,$4)",[open.id,total,s.rows[0].id,req.user.id]);}
  await audit(db,req.user.id,'checkout','sale',s.rows[0].id,{total,method});return {id:s.rows[0].id,total_paisa:total,change_paisa:change};
 });res.status(201).json(result);
}));
shop.get('/sales',safe(async(req,res)=>{
 const loc=localShop(req);const rows=await query(`SELECT s.id,s.created_at,s.customer_name,s.sale_type,s.total_paisa,s.payment_method,s.payment_verified,s.wc_order_id,s.sync_state,u.name AS cashier FROM sales s JOIN users u ON u.id=s.cashier_id WHERE s.location_id=$1 ORDER BY s.id DESC LIMIT 150`,[loc]);res.json(rows.rows);
}));
shop.get('/sales/:id',safe(async(req,res)=>{
 const loc=localShop(req),saleId=id(req.params.id),sale=await query('SELECT s.*,u.name AS cashier FROM sales s JOIN users u ON u.id=s.cashier_id WHERE s.id=$1 AND s.location_id=$2',[saleId,loc]);if(!sale.rowCount)fail(404,'Sale not found');const items=await query('SELECT * FROM sale_items WHERE sale_id=$1 ORDER BY id',[saleId]);res.json({...sale.rows[0],items:items.rows});
}));
shop.post('/stock-requests',shopManager,safe(async(req,res)=>{
 const shopId=localShop(req),wh=id(req.body.warehouse_id),p=id(req.body.product_id),qty=positive(req.body.quantity);
 const r=await query(`INSERT INTO stock_requests(shop_id,warehouse_id,product_id,quantity,reason,requested_by)
  SELECT $1,$2,$3,$4,$5,$6 WHERE EXISTS(SELECT 1 FROM locations WHERE id=$1 AND kind='shop') AND EXISTS(SELECT 1 FROM locations WHERE id=$2 AND kind='warehouse') AND EXISTS(SELECT 1 FROM products WHERE id=$3) RETURNING *`,[shopId,wh,p,qty,str(req.body.reason,500),req.user.id]);if(!r.rowCount)fail(400,'Invalid location or product');await audit({query},req.user.id,'created','stock_request',r.rows[0].id);res.status(201).json(r.rows[0]);
}));
shop.get('/stock-requests',safe(async(req,res)=>{const loc=localShop(req);res.json((await query(`SELECT r.*,p.name AS product_name,w.name AS warehouse_name FROM stock_requests r JOIN products p ON p.id=r.product_id JOIN locations w ON w.id=r.warehouse_id WHERE r.shop_id=$1 ORDER BY r.id DESC LIMIT 150`,[loc])).rows)}));
shop.post('/stock-requests/:id/receive',shopManager,safe(async(req,res)=>{
 const sid=id(req.params.id),loc=localShop(req);
 const result=await transaction(async db=>{
  const rr=await db.query('SELECT * FROM stock_requests WHERE id=$1 FOR UPDATE',[sid]);const r=rr.rows[0];if(!r||r.shop_id!==loc)fail(404,'Stock request not found');
  if(!['in_transit','partially_received'].includes(r.status))fail(409,'Transfer not in transit');
  const remaining=r.dispatched_quantity-r.received_quantity,qty=positive(req.body.quantity||remaining);
  if(qty>remaining)fail(400,'Cannot receive more than in transit');
  await moveStock(db,r.shop_id,r.product_id,qty,'SHOP_RECEIPT',`TR-${sid}`,req.user.id);
  const status=qty===remaining?'received':'partially_received';
  await db.query('UPDATE stock_requests SET received_quantity=received_quantity+$1,status=$2,received_by=$3,updated_at=NOW() WHERE id=$4',[qty,status,req.user.id,sid]);
  await audit(db,req.user.id,'received','stock_request',sid,{qty,status});return {id:sid,status,received_now:qty};
 });res.json(result);
}));

shop.get('/drawer',safe(async(req,res)=>{
 const loc=localShop(req);await ensureShop({query},loc);
 const r=await query("SELECT * FROM cash_drawer_sessions WHERE location_id=$1 AND closed_at IS NULL ORDER BY id DESC LIMIT 1",[loc]);
 if(!r.rowCount)return res.json({active:false});
 const session=r.rows[0],m=await query('SELECT type,amount_paisa,actor_id,created_at,note FROM cash_movements WHERE session_id=$1 ORDER BY id DESC',[session.id]);
 const expected=Number(session.opening_paisa)+m.rows.reduce((s,x)=>s+Number(x.amount_paisa),0);
 res.json({active:true,session,expected_paisa:expected,movements:m.rows});
}));
shop.post('/drawer/open',shopManager,safe(async(req,res)=>{
 const loc=localShop(req),amount=paisa(req.body.opening_paisa||0);
 const r=await transaction(async db=>{await ensureShop(db,loc);const x=await db.query('INSERT INTO cash_drawer_sessions(location_id,opened_by,opening_paisa) VALUES($1,$2,$3) RETURNING *',[loc,req.user.id,amount]);await audit(db,req.user.id,'opened','cash_drawer',x.rows[0].id,{amount});return x.rows[0]});res.status(201).json(r);
}));
shop.post('/drawer/movement',shopManager,safe(async(req,res)=>{
 const loc=localShop(req),amt=paisa(req.body.amount_paisa),type=req.body.type;
 if(!['cash_in','cash_out'].includes(type)||amt<=0)fail(400,'Invalid drawer movement');
 await transaction(async db=>{const r=await db.query('SELECT id FROM cash_drawer_sessions WHERE location_id=$1 AND closed_at IS NULL FOR UPDATE',[loc]);if(!r.rowCount)fail(409,'Open cash drawer first');const signed=type==='cash_out'?-amt:amt;await db.query('INSERT INTO cash_movements(session_id,type,amount_paisa,actor_id,note) VALUES($1,$2,$3,$4,$5)',[r.rows[0].id,type,signed,req.user.id,str(req.body.note,500)]);await audit(db,req.user.id,'movement','cash_drawer',r.rows[0].id,{type,amount:signed})});res.status(201).json({ok:true});
}));
shop.post('/drawer/close',shopManager,safe(async(req,res)=>{
 const loc=localShop(req),actual=paisa(req.body.actual_paisa);
 const result=await transaction(async db=>{const r=await db.query('SELECT * FROM cash_drawer_sessions WHERE location_id=$1 AND closed_at IS NULL FOR UPDATE',[loc]);if(!r.rowCount)fail(409,'No open drawer');const s=r.rows[0];const m=await db.query('SELECT COALESCE(SUM(amount_paisa),0)::bigint AS movement FROM cash_movements WHERE session_id=$1',[s.id]);const expected=Number(s.opening_paisa)+Number(m.rows[0].movement);
  await db.query('UPDATE cash_drawer_sessions SET closed_at=NOW(),closed_by=$1,expected_close_paisa=$2,actual_close_paisa=$3 WHERE id=$4',[req.user.id,expected,actual,s.id]);await audit(db,req.user.id,'closed','cash_drawer',s.id,{expected,actual,difference:actual-expected});return {id:s.id,expected_paisa:expected,actual_paisa:actual,difference_paisa:actual-expected}});
 res.json(result);
}));
