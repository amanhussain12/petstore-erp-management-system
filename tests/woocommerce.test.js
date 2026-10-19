import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {parseWooOrder,verifyWebhook,configured} from '../src/woocommerce.js';
test('Woo order totals parse into paisa and retain original line items',()=>{
 const order={id:1258,number:'1258',status:'processing',billing:{first_name:'Ahmed',last_name:'Khan',phone:'03000000000'},total:'6600.00',currency:'PKR',payment_method_title:'Cash on delivery',date_created_gmt:'2026-10-17T12:00:00',line_items:[{name:'Cat food',quantity:2,total:'6600.00'}]};
 const o=parseWooOrder(order);assert.equal(o.customer_name,'Ahmed Khan');assert.equal(o.total_paisa,660000);assert.equal(o.status,'processing');assert.equal(o.payload.line_items[0].quantity,2);assert.match(o.created_at,/Z$/);
});
test('Woo webhook signature verification rejects forged messages',()=>{const body=Buffer.from('{"id":123}'),secret='example-shared-secret',sig=crypto.createHmac('sha256',secret).update(body).digest('base64');assert.equal(verifyWebhook(body,sig,secret),true);assert.equal(verifyWebhook(body,sig,'incorrect'),false);assert.equal(verifyWebhook(body,'!',secret),false)});
