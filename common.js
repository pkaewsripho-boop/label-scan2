'use strict';
(()=>{
const ZONE='Asia/Bangkok',DAY=86400000,EXCEL_EPOCH=Date.UTC(1899,11,30),formatter=new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function parts(value){if(value===null||value===undefined||value==='')return null;const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))return null;const p=Object.fromEntries(formatter.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {...p,millisecond:date.getUTCMilliseconds()}}
function thaiTime(value){const p=parts(value);return p?`${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`:'—'}
function excelTime(value){const p=parts(value);return p?(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second,p.millisecond)-EXCEL_EPOCH)/DAY:''}
function excelDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';const t=Date.parse(value+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===value?(t-EXCEL_EPOCH)/DAY:''}
window.LabelCommon={
 timeZone:ZONE,thaiTime,excelTime,excelDate,
 $(id){return document.getElementById(id)},
 esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))},
 fmt(n){return Number(n).toLocaleString('en-US',{maximumFractionDigits:6})},
 today(){const p=parts(new Date());return `${p.year}-${p.month}-${p.day}`},
 id(){const x=new Uint32Array(4);crypto.getRandomValues(x);return Date.now().toString(36)+'_'+[...x].map(n=>n.toString(16).padStart(8,'0')).join('')},
 async request(url,options={}){const a=new AbortController(),timer=setTimeout(()=>a.abort(),15000);let r,j;try{const headers={...(options.headers||{})};if(window.LabelAuthToken)headers['X-Admin-Token']=window.LabelAuthToken;r=await fetch(url,{...options,headers,signal:a.signal,cache:'no-store'});j=await r.json()}finally{clearTimeout(timer)}
  // หน้าข้อมูลดิบ: ถ้า Server ขอ PIN ให้ถาม PIN แล้วส่งคำขอเดิมอีกครั้ง
  if(r.status===401&&j.authRequired&&window.LabelAuth&&!options.authRetried&&!String(url).startsWith('/api/auth')){await window.LabelAuth.ask('');return LabelCommon.request(url,{...options,authRetried:true})}
  if(!r.ok)throw Object.assign(Error(j.error||'Server ไม่ตอบรับ'),{status:r.status,...j});return j},
 // เติม SLoc เฉพาะที่มีการสแกนในวันที่เลือก (หน้าพิมพ์ป้าย)
 slocToken:0,
 async slocsByDate(select,date){const token=++this.slocToken,esc=this.esc;select.disabled=true;if(!date){select.innerHTML='<option value="">เลือกวันที่ก่อน</option>';return {count:0,slocs:[]}}select.innerHTML='<option value="">กำลังโหลด SLoc…</option>';const data=await this.request('/api/catalog?'+new URLSearchParams({date}));if(token!==this.slocToken)return null;select.innerHTML=data.slocs.length?'<option value="">เลือก SLoc</option>'+data.slocs.map(x=>`<option value="${esc(x)}">${esc(x)} (${data.counts[x].toLocaleString()})</option>`).join(''):'<option value="">ไม่มีข้อมูลสแกนในวันนี้</option>';select.disabled=!data.slocs.length;return data},
 download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000)}
};
})();
