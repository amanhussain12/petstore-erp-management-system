import {Router} from 'express';import {query} from '../db.js';import {safe,fail,id,str} from '../core.js';
export const shared=Router();
shared.get('/locations',safe(async(req,res)=>res.json((await query('SELECT * FROM locations ORDER BY id')).rows)));
shared.get('/products',safe(async(req,res)=>{
 const q=str(req.query.q,100),limit=Math.min(Math.max(Number(req.query.limit)||30,1),100),loc=Number(req.query.location_id)||req.user.location_id||1;
 if(req.user.role!=='admin'&&loc!==req.user.location_id)fail(403,'Location access denied');
 const r=await query(`SELECT p.*,COALESCE(b.quantity,0) AS quantity FROM products p LEFT JOIN stock_balances b ON b.product_id=p.id AND b.location_id=$1 WHERE p.active=TRUE AND (p.name ILIKE $2 OR p.sku ILIKE $2) ORDER BY p.name LIMIT $3`,[loc,`%${q}%`,limit]);res.json(r.rows);
}));
shared.get('/customers',safe(async(req,res)=>{const q=str(req.query.q,100);res.json((await query('SELECT * FROM customers WHERE name ILIKE $1 OR phone ILIKE $1 OR pet_name ILIKE $1 ORDER BY id DESC LIMIT 60',[`%${q}%`])).rows)}));
shared.post('/customers',safe(async(req,res)=>{
 const name=str(req.body.name),phone=str(req.body.phone,60),pet=str(req.body.pet_name,100),email=str(req.body.email,254),address=str(req.body.address,1000);
 if(!name)fail(400,'Customer name required');const r=await query('INSERT INTO customers(name,phone,pet_name,email,address) VALUES($1,$2,$3,$4,$5) RETURNING *',[name,phone,pet,email,address]);res.status(201).json(r.rows[0]);
}));
shared.get('/audit',safe(async(req,res)=>{if(req.user.role!=='admin')fail(403,'Admin only');res.json((await query('SELECT a.*,u.name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100')).rows)}));
