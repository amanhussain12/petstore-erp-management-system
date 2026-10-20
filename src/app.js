import express from 'express';import helmet from 'helmet';import cookieParser from 'cookie-parser';import {fileURLToPath} from 'node:url';import path from 'node:path';
import {query} from './db.js';import {tokenHash,HttpError,safe,adminOnly,shopAccess,warehouseAccess,inRole} from './core.js';
import {auth} from './routes/auth.js';import {shared} from './routes/shared.js';import {admin} from './routes/admin.js';import {shop} from './routes/shop.js';import {warehouse} from './routes/warehouse.js';import {woo} from './routes/woo.js';import {verifyWebhook,parseWooOrder} from './woocommerce.js';
export const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],imgSrc:["'self'",'https:','data:'],connectSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],scriptSrc:["'self'"],fontSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"]}}}));
app.post('/api/hooks/woocommerce',express.raw({type:'application/json',limit:'1mb'}),safe(async(req,res)=>{
 const secret=process.env.WC_WEBHOOK_SECRET;
 if(!secret)return res.status(503).json({error:'Webhook is not configured'});
 if(!verifyWebhook(req.body,req.get('x-wc-webhook-signature'),secret))return res.status(401).json({error:'Invalid webhook signature'});
 const data=JSON.parse(req.body.toString('utf8'));
 if(!data?.id || !data?.line_items)return res.status(200).json({ok:true,skipped:true});
 const o=parseWooOrder(data);
 await query(`INSERT INTO woo_orders(id,number,status,customer_name,phone,email,payment_method,currency,total_paisa,payload,created_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET status=$3,customer_name=$4,phone=$5,email=$6,payment_method=$7,currency=$8,total_paisa=$9,payload=$10,synced_at=NOW()`,
 [o.id,o.number,o.status,o.customer_name,o.phone,o.email,o.payment_method,o.currency,o.total_paisa,JSON.stringify(o.payload),o.created_at]);res.json({ok:true});
}));
app.use(express.json({limit:'2mb'}));app.use(cookieParser());
app.use((req,res,next)=>{if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
 const origin=req.headers.origin,expected=process.env.APP_ORIGIN;
 if(origin){try{const current=expected?new URL(expected).origin:new URL(`${req.protocol}://${req.get('host')}`).origin;if(new URL(origin).origin!==current)return next(new HttpError(403,'Origin not allowed'))}catch{return next(new HttpError(403,'Origin not allowed'))}}
 }next();});
app.use(safe(async(req,res,next)=>{
 const raw=req.cookies?.pet_erp_session;if(!raw)return next();
 if(!/^[a-f0-9]{64}$/.test(raw))return next();
 const r=await query('SELECT u.id,u.name,u.email,u.role,u.location_id,u.active,l.kind AS location_kind FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN locations l ON l.id=u.location_id WHERE s.token_hash=$1 AND s.expires_at>NOW()',[tokenHash(raw)]);
 if(r.rowCount&&r.rows[0].active){const {active,...u}=r.rows[0];req.user=u;}next();
}));
const requireLogin=(req,res,next)=>req.user?next():next(new HttpError(401,'Sign in required'));
app.get('/api/health',(req,res)=>res.json({ok:true,app:'Pet Store ERP',now:new Date().toISOString()}));
app.use('/api/auth',auth);
app.use('/api/shared',requireLogin,shared);
app.use('/api/admin',requireLogin,adminOnly,admin);
app.use('/api/shop',requireLogin,shopAccess,shop);
app.use('/api/warehouse',requireLogin,warehouseAccess,warehouse);
app.use('/api/woo',requireLogin,inRole('admin','shop_manager','cashier','warehouse_manager'),woo);
app.all('/api/*',(req,res)=>res.status(404).json({error:'API endpoint not found'}));
const webroot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
app.use(express.static(webroot,{maxAge:'10m'}));
app.get('*',(req,res)=>{if(/\.[a-z0-9]{1,10}$/i.test(req.path))return res.status(404).type('text/plain').send('File not found');res.sendFile(path.join(webroot,'index.html'));});
app.use((err,req,res,next)=>{
 let status=err.status||500;
 if(err.code==='23505'){status=409;err.message='Duplicate record (email, SKU, or unique reference already exists)';}
 else if(err.code==='23503'){status=400;err.message='Referenced item does not exist';}
 else if(err.code==='23514'){status=400;err.message='Database constraint rejected the request';}
 if(status>=500)console.error(`[${new Date().toISOString()}]`,err);
 if(res.headersSent)return next(err);
 res.status(status).json({error:status>=500&&err.status===undefined?'Server error. Check server logs.':err.message});
});

// Vercel Express preset expects a default-exported request handler.
export default app;
