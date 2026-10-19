import crypto from 'node:crypto';import {normalizeMoney,fail} from './core.js';
export function configured(){return Boolean(process.env.WC_URL&&process.env.WC_CONSUMER_KEY&&process.env.WC_CONSUMER_SECRET&&!process.env.WC_URL.includes('your-shop.example.com'));}
export function wcBase(){if(!configured())fail(503,'WooCommerce is not configured. Set WC_URL and WooCommerce keys in .env.');const base=process.env.WC_URL.replace(/\/+$/,'');const u=new URL(base);if(u.protocol!=='https:' && !(process.env.NODE_ENV!=='production'&&u.hostname==='localhost'))fail(400,'WooCommerce URL must use HTTPS');return base+'/wp-json/wc/v3';}
export async function wcFetch(route,options={}){
 const url=new URL(wcBase()+route);const credentials=Buffer.from(process.env.WC_CONSUMER_KEY+':'+process.env.WC_CONSUMER_SECRET).toString('base64');
 const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),15000);
 try{const resp=await fetch(url,{...options,headers:{Authorization:'Basic '+credentials,Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:ctrl.signal,redirect:'error'});
  const data=await resp.json().catch(()=>null);
  if(!resp.ok)throw Object.assign(new Error('WooCommerce '+resp.status+': '+(data?.message||'API request failed')),{status:502});
  return {data,pages:Number(resp.headers.get('x-wp-totalpages')||1)};
 }catch(err){if(err.name==='AbortError')throw Object.assign(new Error('WooCommerce request timed out'),{status:504});throw err;}finally{clearTimeout(timeout)}
}
export function parseWooOrder(order){return {id:Number(order.id),number:String(order.number||order.id),status:String(order.status||'unknown'),customer_name:[order.billing?.first_name,order.billing?.last_name].filter(Boolean).join(' ')||'Guest',phone:String(order.billing?.phone||''),email:String(order.billing?.email||''),payment_method:String(order.payment_method_title||order.payment_method||''),currency:String(order.currency||'PKR'),total_paisa:normalizeMoney(order.total||0),created_at:order.date_created_gmt?order.date_created_gmt+'Z':null,payload:order}}
export function verifyWebhook(body,header,secret){if(!secret||!header)return false;const h=crypto.createHmac('sha256',secret).update(body).digest('base64');const a=Buffer.from(h),b=Buffer.from(String(header));return a.length===b.length && crypto.timingSafeEqual(a,b)}
