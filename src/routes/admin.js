import {Router} from 'express';import bcrypt from 'bcryptjs';import {query,audit} from '../db.js';import {safe,fail,id,str} from '../core.js';
export const admin=Router();
admin.get('/overview',safe(async(req,res)=>{
 const [sales,stock,requests,staff,orders]=await Promise.all([
 query("SELECT COUNT(*)::int AS count,COALESCE(SUM(total_paisa),0)::bigint AS amount FROM sales WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Karachi')::date AT TIME ZONE 'Asia/Karachi'"),
 query("SELECT l.kind,COALESCE(SUM(s.quantity),0)::int AS quantity FROM locations l LEFT JOIN stock_balances s ON s.location_id=l.id GROUP BY l.kind"),
 query("SELECT COUNT(*)::int AS pending FROM stock_requests WHERE status='pending'"),
 query("SELECT COUNT(*)::int AS count FROM users WHERE active=TRUE"),
 query("SELECT COUNT(*)::int AS count FROM woo_orders")]);
 res.json({sales:sales.rows[0],stock:stock.rows,requests:requests.rows[0],staff:staff.rows[0],woocommerce:orders.rows[0]});
}));
admin.get('/users',safe(async(req,res)=>res.json((await query('SELECT u.id,u.name,u.email,u.role,u.location_id,u.active,u.created_at,l.name AS location_name FROM users u LEFT JOIN locations l ON l.id=u.location_id ORDER BY u.id DESC')).rows)));
admin.post('/users',safe(async(req,res)=>{
 const {name,email,role,password}=req.body,location=req.body.location_id? id(req.body.location_id):null;
 const valid=['admin','shop_manager','cashier','warehouse_manager','warehouse_staff'];if(!valid.includes(role))fail(400,'Invalid role');
 const cleanName=str(name),cleanEmail=str(email,254).toLowerCase();if(!cleanName||!cleanEmail.includes('@')||typeof password!=='string'||password.length<12)fail(400,'Name, email and password (12+ characters) required');
 if(role!=='admin'&&!location)fail(400,'Employee requires assigned location');
 if(location){const loc=(await query('SELECT kind FROM locations WHERE id=$1',[location])).rows[0];if(!loc)fail(400,'Invalid location');if(role.startsWith('warehouse')&&loc.kind!=='warehouse'||['shop_manager','cashier'].includes(role)&&loc.kind!=='shop')fail(400,'Role/location mismatch');}
 const hash=await bcrypt.hash(password,12);const r=await query('INSERT INTO users(name,email,password_hash,role,location_id) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role,location_id,active',[cleanName,cleanEmail,hash,role,location]);await audit({query},req.user.id,'created','user',r.rows[0].id,{role});res.status(201).json(r.rows[0]);
}));
admin.patch('/users/:id',safe(async(req,res)=>{
 const uid=id(req.params.id),prev=(await query('SELECT id,name,email,role,location_id,active FROM users WHERE id=$1',[uid])).rows[0];
 if(!prev)fail(404,'User not found');
 const name=req.body.name===undefined?prev.name:str(req.body.name);
 const email=req.body.email===undefined?prev.email:str(req.body.email,254).toLowerCase();
 const role=req.body.role===undefined?prev.role:str(req.body.role,40);
 const location=req.body.location_id===undefined?prev.location_id:(req.body.location_id? id(req.body.location_id):null);
 const active=req.body.active===undefined?prev.active:req.body.active;
 if(!name||!email.includes('@')||typeof active!=='boolean')fail(400,'Invalid employee details');
 if(!['admin','shop_manager','cashier','warehouse_manager','warehouse_staff'].includes(role))fail(400,'Invalid role');
 if(uid===req.user.id&&(active===false||role!=='admin'))fail(400,'Cannot deactivate or demote own administrator account');
 if(role!=='admin'&&!location)fail(400,'Assigned location required');
 if(location){const lr=await query('SELECT kind FROM locations WHERE id=$1',[location]),loc=lr.rows[0];if(!loc)fail(400,'Invalid location');if(role.startsWith('warehouse')&&loc.kind!=='warehouse'||['shop_manager','cashier'].includes(role)&&loc.kind!=='shop')fail(400,'Role and location do not match');}
 const r=await query('UPDATE users SET name=$1,email=$2,role=$3,location_id=$4,active=$5 WHERE id=$6 RETURNING id,name,email,role,location_id,active',[name,email,role,location,active,uid]);
 if(!active||role!==prev.role||location!==prev.location_id)await query('DELETE FROM sessions WHERE user_id=$1',[uid]);
 await audit({query},req.user.id,'employee_updated','user',uid,{role,location_id:location,active});res.json(r.rows[0]);
}));
admin.post('/products',safe(async(req,res)=>{
 const name=str(req.body.name),sku=str(req.body.sku,80),price=Math.round(Number(req.body.price)*100);if(!name||!sku||!Number.isSafeInteger(price)||price<0)fail(400,'Valid name, SKU and price required');
 const r=await query('INSERT INTO products(name,sku,price_paisa,category) VALUES($1,$2,$3,$4) RETURNING *',[name,sku,price,str(req.body.category,120)]);await audit({query},req.user.id,'created','product',r.rows[0].id);res.status(201).json(r.rows[0]);
}));
admin.get('/reports',safe(async(req,res)=>{
 const [sales,byMethod,stock]=await Promise.all([
 query('SELECT DATE(created_at AT TIME ZONE \'Asia/Karachi\') AS day,COUNT(*)::int AS orders,SUM(total_paisa)::bigint AS revenue_paisa FROM sales GROUP BY 1 ORDER BY 1 DESC LIMIT 30'),
 query('SELECT payment_method,COUNT(*)::int AS orders,SUM(total_paisa)::bigint AS revenue_paisa FROM sales GROUP BY 1'),
 query('SELECT l.name AS location,p.name AS product,s.quantity,p.price_paisa FROM stock_balances s JOIN locations l ON s.location_id=l.id JOIN products p ON s.product_id=p.id ORDER BY l.id,p.name LIMIT 300')]);res.json({sales:sales.rows,by_method:byMethod.rows,inventory:stock.rows});
}));

admin.post('/users/:id/reset-password',safe(async(req,res)=>{
 const uid=id(req.params.id),password=String(req.body.new_password||'');if(password.length<12)fail(400,'Password must have at least 12 characters');
 const r=await query('UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id',[await bcrypt.hash(password,12),uid]);if(!r.rowCount)fail(404,'Employee not found');
 await query('DELETE FROM sessions WHERE user_id=$1',[uid]);await audit({query},req.user.id,'admin_password_reset','user',uid);res.json({ok:true});
}));
