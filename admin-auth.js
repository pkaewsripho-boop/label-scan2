'use strict';
// PIN หน้าข้อมูลดิบ: ถามครั้งเดียวต่อเครื่อง (จำไว้ในเบราว์เซอร์) • ใช้เมื่อ Server ตั้ง ADMIN_PIN
(()=>{const {request}=LabelCommon,KEY='labelscan-admin-token';
try{window.LabelAuthToken=localStorage.getItem(KEY)||''}catch{window.LabelAuthToken=''}
const d=document.createElement('dialog');d.id='pinDialog';d.setAttribute('aria-labelledby','pinTitle');
d.innerHTML='<form id="pinForm"><h2 id="pinTitle">ใส่ PIN หน้าข้อมูลดิบ</h2><p>หน้านี้มีข้อมูลทั้งหมด การ Export นำเข้า และลบรายการ จึงต้องใส่ PIN ก่อน (ใส่ครั้งเดียวต่อเครื่อง)</p><label for="pinInput">PIN</label><input id="pinInput" type="password" inputmode="numeric" autocomplete="current-password" maxlength="64" required><p id="pinStatus" class="error" role="alert"></p><div class="pin-buttons"><button id="pinOk" class="primary" type="submit">เข้าใช้งาน</button><a class="button" href="/">← หน้าสแกน</a></div></form>';
document.body.append(d);d.addEventListener('cancel',e=>e.preventDefault());
let waiting=null;
function ask(message){if(message)document.getElementById('pinStatus').textContent=message;return waiting??=new Promise(resolve=>{const form=document.getElementById('pinForm'),input=document.getElementById('pinInput');if(!d.open)d.showModal();input.value='';input.focus();
  form.onsubmit=async e=>{e.preventDefault();const ok=document.getElementById('pinOk');ok.disabled=true;try{const r=await request('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:input.value})});window.LabelAuthToken=r.token||'';try{localStorage.setItem(KEY,window.LabelAuthToken)}catch{}document.getElementById('pinStatus').textContent='';d.close();waiting=null;showLogout(true);resolve()}catch(err){document.getElementById('pinStatus').textContent=err.message;input.select()}finally{ok.disabled=false}}})}
function showLogout(on){let b=document.getElementById('logout');if(!on){b?.remove();return}if(b)return;const nav=document.querySelector('header .page-nav');if(!nav)return;b=document.createElement('button');b.id='logout';b.type='button';b.className='logout-button';b.textContent='ออกจากระบบ';b.onclick=()=>{try{localStorage.removeItem(KEY)}catch{}location.reload()};nav.after(b)}
window.LabelAuth={ask,ready:(async()=>{try{const s=await request('/api/auth');if(s.required){if(!s.ok)await ask(window.LabelAuthToken?'PIN เปลี่ยนแล้ว กรุณาใส่ใหม่':'');else showLogout(true)}}catch{/* ให้หน้าเว็บแจ้งเชื่อมต่อไม่ได้ตามปกติ */}})()};
})();
