import {Router} from 'express';import {query,audit} from '../db.js';import {safe,fail,id,str,adminOnly,inRole} from '../core.js';import {configured,wcFetch,parseWooOrder} from '../woocommerce.js';
export const woo=Router();
woo.get('/status',safe(async(req,res)=>res.json({configured:configured(),pos_push_enabled:process.env.WC_PUSH_POS==='true',website:configured()?new URL(process.env.WC_URL).origin:null})));
woo.post('/test',adminOnly,safe(async(req,res)=>{const {data}=await wcFetch('/system_status');res.json({ok:true,environment:data?.environment?.site_url||'WooCommerce API responded'})}));
woo.post('/sync-products',adminOnly,safe(async(req,res)=>{
 let count=0,skipped=0,variations=0;
 for(let page=1;page<=10;page++){
  const {data,pages}=await wcFetch(`/products?per_page=100&page=${page}&status=publish`);
  for(const p of data){
   try{await query(`INSERT INTO products(wc_id,wc_parent_id,name,sku,category,image_url,price_paisa,active) VALUES($1,NULL,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(wc_id) DO UPDATE SET name=$2,sku=$3,category=$4,image_url=$5,price_paisa=$6,active=$7,updated_at=NOW()`,[p.id,p.name,p.sku||null,p.categories?.[0]?.name||'',p.images?.[0]?.src||'',Math.round(Number(p.price||0)*100),p.type!=='variable']);count++;}catch(e){if(e.code==='23505'){skipped++;continue}throw e}
   if(p.type==='variable'){
    try{const {data:vars}=await wcFetch(`/products/${p.id}/variations?per_page=100`);
     for(const v of vars){const attr=v.attributes?.map(a=>a.option).filter(Boolean).join(' / ')||v.sku||String(v.id);
      try{await query(`INSERT INTO products(wc_id,wc_parent_id,wc_variation_id,name,sku,category,image_url,price_paisa,active) VALUES($1,$2,$1,$3,$4,$5,$6,$7,TRUE)
       ON CONFLICT(wc_id) DO UPDATE SET name=$3,sku=$4,price_paisa=$7,updated_at=NOW()`,[v.id,p.id,p.name+' — '+attr,v.sku||null,p.categories?.[0]?.name||'',v.image?.src||p.images?.[0]?.src||'',Math.round(Number(v.price||0)*100)]);variations++;}catch(e){if(e.code==='23505')skipped++;else throw e}
     }
    }catch(err){if(err.status!==404)throw err}
   }
  }
  if(page>=pages)break;
 }
 await audit({query},req.user.id,'sync','woocommerce_products','all',{count,skipped,variations});res.json({ok:true,count,variations,skipped,note:'Up to 1000 base products synchronized; stock balances are managed separately.'});
}));
woo.post('/sync-orders',inRole('admin','shop_manager'),safe(async(req,res)=>{
 let count=0;for(let page=1;page<=10;page++){
  const {data,pages}=await wcFetch(`/orders?per_page=100&page=${page}&orderby=date&order=desc`);
  for(const row of data){const o=parseWooOrder(row);
   await query(`INSERT INTO woo_orders(id,number,status,customer_name,phone,email,payment_method,currency,total_paisa,payload,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET status=$3,customer_name=$4,phone=$5,email=$6,payment_method=$7,currency=$8,total_paisa=$9,payload=$10,synced_at=NOW()`,[o.id,o.number,o.status,o.customer_name,o.phone,o.email,o.payment_method,o.currency,o.total_paisa,JSON.stringify(o.payload),o.created_at]);count++;}
  if(page>=pages)break;
 }
 await audit({query},req.user.id,'sync','woocommerce_orders','all',{count});res.json({ok:true,count,note:'Up to 1000 latest orders synchronized. Run again to refresh recent orders.'});
}));
woo.get('/orders',safe(async(req,res)=>{
 const q=str(req.query.q,100),status=str(req.query.status,30),limit=Math.min(Number(req.query.limit)||100,200);
 const r=await query('SELECT id,number,status,customer_name,phone,email,payment_method,currency,total_paisa,created_at,synced_at FROM woo_orders WHERE ($1=\'\' OR number ILIKE $3 OR customer_name ILIKE $3 OR phone ILIKE $3) AND ($2=\'\' OR status=$2) ORDER BY created_at DESC NULLS LAST,id DESC LIMIT $4',[q,status,`%${q}%`,limit]);res.json(r.rows);
}));
woo.get('/orders/:id',safe(async(req,res)=>{const r=await query('SELECT * FROM woo_orders WHERE id=$1',[id(req.params.id)]);if(!r.rowCount)fail(404,'WooCommerce order not in local cache. Sync first.');res.json(r.rows[0]);}));
woo.post('/push-sale/:id',inRole('admin','shop_manager'),safe(async(req,res)=>{
 if(process.env.WC_PUSH_POS!=='true')fail(403,'POS to WooCommerce posting is disabled in .env');
 const saleId=id(req.params.id),loc=req.user.role==='admin'?null:req.user.location_id;
 const s=await query('SELECT * FROM sales WHERE id=$1 AND ($2::int IS NULL OR location_id=$2)',[saleId,loc]);if(!s.rowCount)fail(404,'Sale not found');const sale=s.rows[0];
 if(sale.wc_order_id)return res.json({already_synced:true,wc_order_id:sale.wc_order_id});
 if(sale.sync_state==='attempting'||sale.sync_state==='needs_reconciliation')fail(409,'Review this sale in WooCommerce before retrying; an earlier attempt may have succeeded');
 const items=(await query('SELECT i.*,p.wc_id,p.wc_parent_id,p.wc_variation_id FROM sale_items i JOIN products p ON p.id=i.product_id WHERE i.sale_id=$1',[saleId])).rows;
 if(items.some(x=>!x.wc_id))fail(400,'All products must be synchronized with WooCommerce before posting');
 const upd=await query("UPDATE sales SET sync_state='attempting' WHERE id=$1 AND sync_state='local' RETURNING id",[saleId]);if(!upd.rowCount)fail(409,'Sale already being synchronized');
 const body={status:sale.payment_verified?'processing':'on-hold',set_paid:sale.payment_verified,payment_method:sale.payment_method==='cash'?'cod':'bacs',payment_method_title:sale.payment_method==='cash'?'POS Cash':'POS Manual '+sale.payment_method,billing:{first_name:sale.customer_name},line_items:items.map(i=>({product_id:Number(i.wc_parent_id||i.wc_id),...(i.wc_variation_id?{variation_id:Number(i.wc_variation_id)}:{}),quantity:i.quantity,subtotal:(i.total_paisa/100).toFixed(2),total:(i.total_paisa/100).toFixed(2)})),shipping_lines:sale.delivery_paisa?[{method_id:'flat_rate',method_title:'POS Delivery',total:(sale.delivery_paisa/100).toFixed(2)}]:[],fee_lines:sale.discount_paisa?[{name:'POS Discount',total:(-sale.discount_paisa/100).toFixed(2)}]:[],meta_data:[{key:'_petstore_pos_sale_id',value:String(sale.id)},{key:'_petstore_pos_source',value:'Pet Store ERP'}]};
 try{const {data}=await wcFetch('/orders',{method:'POST',body:JSON.stringify(body)});const matches=Math.round(Number(data.total)*100)===Number(sale.total_paisa);await query("UPDATE sales SET wc_order_id=$1,sync_state=$3 WHERE id=$2",[data.id,saleId,matches?'synced':'needs_reconciliation']);await audit({query},req.user.id,'push_to_woo','sale',saleId,{wc_order_id:data.id,total_matches:matches});if(!matches)fail(409,'WooCommerce order was created (#'+data.id+') but totals differ. Inspect both orders before proceeding.');res.json({ok:true,wc_order_id:data.id});}
 catch(e){await query("UPDATE sales SET sync_state='needs_reconciliation' WHERE id=$1",[saleId]);throw e}
}));
