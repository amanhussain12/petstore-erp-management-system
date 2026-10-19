import {Router} from 'express';import bcrypt from 'bcryptjs';import {query,audit,transaction} from '../db.js';import {safe,fail,str,token,tokenHash,canPortal} from '../core.js';import {rateLimit} from 'express-rate-limit';
export const auth=Router();
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many attempts. Try again later.'}});
auth.post('/login',loginLimiter,safe(async(req,res)=>{
 const email=str(req.body.email,254).toLowerCase(),password=String(req.body.password||''),portal=str(req.body.portal,20);
 if(!['admin','shop','warehouse'].includes(portal))fail(400,'Select a login portal');
 const r=await query('SELECT u.*,l.kind FROM users u LEFT JOIN locations l ON l.id=u.location_id WHERE u.email=$1',[email]);const u=r.rows[0];
 if(!u||!u.active||!(await bcrypt.compare(password,u.password_hash))||!canPortal(u,portal))fail(401,'Invalid credentials or portal access');
 const t=token();await query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL \'7 days\')',[tokenHash(t),u.id]);
 res.cookie('pet_erp_session',t,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:7*86400000,path:'/'});
 await audit({query},u.id,'login','user',u.id,{portal});res.json({user:{id:u.id,name:u.name,email:u.email,role:u.role,location_id:u.location_id}});
}));
auth.get('/me',safe(async(req,res)=>{if(!req.user)fail(401,'Sign in required');res.json({user:req.user});}));
auth.post('/logout',safe(async(req,res)=>{if(req.cookies?.pet_erp_session)await query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(req.cookies.pet_erp_session)]);res.clearCookie('pet_erp_session',{path:'/'});res.json({ok:true});}));
auth.post('/change-password',safe(async(req,res)=>{
 if(!req.user)fail(401,'Sign in required');const old=String(req.body.current_password||''),pwd=String(req.body.new_password||'');if(pwd.length<12)fail(400,'New password must be at least 12 characters');
 const r=await query('SELECT password_hash FROM users WHERE id=$1',[req.user.id]);if(!await bcrypt.compare(old,r.rows[0].password_hash))fail(400,'Current password incorrect');
 await query('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(pwd,12),req.user.id]);await query('DELETE FROM sessions WHERE user_id=$1',[req.user.id]);res.clearCookie('pet_erp_session',{path:'/'});res.json({ok:true,message:'Password changed. Please log in again.'});
}));

const recoveryLimiter=rateLimit({windowMs:60*60*1000,limit:8,standardHeaders:'draft-7',legacyHeaders:false});
auth.post('/forgot-password',recoveryLimiter,safe(async(req,res)=>{
 const email=str(req.body.email,254).toLowerCase();if(!email.includes('@'))fail(400,'Enter a valid email address');
 if(!process.env.RESEND_API_KEY||!process.env.MAIL_FROM||!process.env.APP_ORIGIN)fail(503,'Password recovery email is not configured. Contact the administrator.');
 const r=await query('SELECT id FROM users WHERE email=$1 AND active=TRUE',[email]);
 if(r.rowCount){const t=token(),hash=tokenHash(t);await query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')",[hash,r.rows[0].id]);
  const link=process.env.APP_ORIGIN.replace(/\/$/,'')+'/reset-password?token='+encodeURIComponent(t);
  try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to:[email],subject:'Reset your Pet Store ERP password',text:'A password reset was requested. This link expires in 30 minutes: '+link+'\nIf you did not request this, ignore the email.'})});
   if(!response.ok)throw Error('Email provider rejected the message');}
  catch(e){await query('DELETE FROM password_resets WHERE token_hash=$1',[hash]);throw Object.assign(new Error('Unable to send recovery email. Contact the administrator.'),{status:502})}
 }
 res.json({ok:true,message:'If an active account exists, a recovery email has been sent.'});
}));
auth.post('/reset-password',recoveryLimiter,safe(async(req,res)=>{
 const tokenValue=String(req.body.token||''),pw=String(req.body.new_password||'');if(!/^[a-f0-9]{64}$/.test(tokenValue)||pw.length<12)fail(400,'Invalid token or password (12+ characters required)');
 await transaction(async db=>{
  const r=await db.query('SELECT * FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE',[tokenHash(tokenValue)]);if(!r.rowCount)fail(400,'Reset link is invalid or has expired');const uid=r.rows[0].user_id;
  await db.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(pw,12),uid]);await db.query('UPDATE password_resets SET used_at=NOW() WHERE token_hash=$1',[tokenHash(tokenValue)]);
  await db.query('DELETE FROM sessions WHERE user_id=$1',[uid]);await audit(db,uid,'password_reset','user',uid);
 });res.json({ok:true});
}));
