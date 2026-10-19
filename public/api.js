export async function api(url,opts={}){const response=await fetch('/api'+url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...opts.headers},...opts});let data;try{data=await response.json()}catch{data={error:'Invalid server response'}}if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);return data}
export const get=(url)=>api(url);
export const post=(url,obj)=>api(url,{method:'POST',body:JSON.stringify(obj)});
export const patch=(url,obj)=>api(url,{method:'PATCH',body:JSON.stringify(obj)});
export const esc=(s)=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export const rupees=p=>new Intl.NumberFormat('en-PK',{maximumFractionDigits:2,minimumFractionDigits:0}).format(Number(p||0)/100);
export const dateTime=d=>d?new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Karachi'}).format(new Date(d)):'—';
export const paisaFromInput=v=>Math.round(Number(v||0)*100);
export const uuid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
