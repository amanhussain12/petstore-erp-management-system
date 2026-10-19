import crypto from 'node:crypto';
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export const fail=(code,message)=>{throw new HttpError(code,message)};
export const safe=(fn)=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
export const id=(v)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<=0)fail(400,'Invalid ID');return n;};
export const positive=(v,max=100000)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1||n>max)fail(400,'Quantity must be a positive integer');return n;};
export const paisa=(v)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>999999999999)fail(400,'Invalid amount');return n;};
export const str=(v,max=240)=>String(v??'').trim().slice(0,max);
export const token=()=>crypto.randomBytes(32).toString('hex');
export const tokenHash=t=>crypto.createHash('sha256').update(t).digest('hex');
export const isAdmin=u=>u?.role==='admin';
export const inRole=(...roles)=>(req,res,next)=>{if(!req.user) return next(new HttpError(401,'Sign in required'));if(!roles.includes(req.user.role))return next(new HttpError(403,'Not permitted'));next();};
export const shopAccess=inRole('admin','shop_manager','cashier');
export const warehouseAccess=inRole('admin','warehouse_manager','warehouse_staff');
export const warehouseManager=inRole('admin','warehouse_manager');
export const shopManager=inRole('admin','shop_manager');
export const adminOnly=inRole('admin');
export function targetLocation(req,kind){const loc=id(req.user.role==='admin' ? (req.query.location_id||req.body?.location_id|| (kind==='shop'?1:2)) : req.user.location_id);
 if(req.user.role!=='admin' && ((kind==='shop'&&!['shop_manager','cashier'].includes(req.user.role))||(kind==='warehouse'&&!['warehouse_manager','warehouse_staff'].includes(req.user.role))))fail(403,'Forbidden location');return loc;}
export function canPortal(user,portal){return user.role==='admin' || (portal==='shop'&&['shop_manager','cashier'].includes(user.role))||(portal==='warehouse'&&['warehouse_manager','warehouse_staff'].includes(user.role));}
export function moneyString(p){return (p/100).toFixed(2)}
export function normalizeMoney(val){const x=Number(val);if(!Number.isFinite(x)||x<0)fail(400,'Invalid price');return Math.round(x*100)}
export function isValidIdempotency(key){return typeof key==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(key)}
export function recalc(items,discount,delivery){const subtotal=items.reduce((s,i)=>s+i.price*i.quantity,0);if(discount>subtotal)fail(400,'Discount exceeds subtotal');return {subtotal,total:subtotal-discount+delivery};}
