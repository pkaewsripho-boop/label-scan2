'use strict';
// ใบส่งมอบ: หัวกลุ่ม (ITEM / Descr / Batch + ยอดรวมทั้งกลุ่ม) และแจกแจงจำนวนทุกลาเบล 10 ช่องต่อแถว
(()=>{const {$,esc,request,today,thaiTime}=LabelCommon;let busy=false,version=0;
function status(text,bad=false){$('status').textContent=text;$('status').className=bad?'error':''}
function clear(){version++;PrintUI.set(null);$('output').innerHTML='';$('output').hidden=true;$('empty').hidden=false;$('empty').textContent='เลือกวันที่สแกนและ SLoc แล้วกดแสดงใบส่งมอบ'}
// รวมยอดแบบทศนิยมตรงตัว (สูงสุด 6 ตำแหน่ง) แยกตามหน่วย
const micro=v=>{const [a,b='']=String(v).split('.');return /^\d+$/.test(a)&&/^\d{0,6}$/.test(b)?BigInt(a)*1000000n+BigInt(b.padEnd(6,'0')||'0'):0n};
const show=m=>{const i=(m/1000000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,','),f=(m%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return f?i+'.'+f:i};
function grand(groups){const u=new Map();for(const g of groups)u.set(g.unit||'',(u.get(g.unit||'')||0n)+micro(g.total));return [...u].map(([k,m])=>show(m)+' '+(k||'ไม่ระบุหน่วย')).join(' • ')}
function html(data,printedAt){const labels=data.groups.reduce((n,g)=>n+g.count,0);
  return `<div class="doc-head"><div class="doc-title">ใบส่งมอบ</div><div class="doc-meta"><span>SLoc <b>${esc(data.sloc)}</b></span><span>วันที่งาน <b>${esc(data.date)}</b></span><span>${data.groups.length} กลุ่ม • ${labels.toLocaleString()} ลาเบล</span><span>รวม <b>${esc(grand(data.groups))}</b></span></div></div>`+
  data.groups.map(g=>`<section class="hg"><table class="hg-head"><colgroup><col class="c1"><col><col class="c3"></colgroup><tr><th>ITEM</th><td class="mat">${esc(g.material)}</td><th class="tot-label">ยอดรวมทั้งกลุ่ม</th></tr><tr><th>Descr</th><td class="desc">${esc(g.description||'— ไม่พบใน Master Data —')}</td><td class="unit">${esc(g.unit||'ไม่ระบุหน่วย')} • ${g.count.toLocaleString()} ลาเบล</td></tr><tr><th>Batch</th><td class="bat">${esc(g.batch||'—')}</td><td class="tot">${esc(g.total)}</td></tr></table><ol class="hg-list">${g.entries.map(e=>`<li><span class="ck" aria-hidden="true"></span><span class="w">${esc(e.weight)}</span></li>`).join('')}</ol></section>`).join('')+
  `<div class="sign"><div>ผู้ส่งมอบ <span></span> วันที่ <span class="d"></span></div><div>ผู้รับมอบ <span></span> วันที่ <span class="d"></span></div></div><p class="print-note">พิมพ์เมื่อ (ไทย): <span id="printedAt">${esc(printedAt)}</span> • ข้อมูลที่บันทึกแล้วบน Server</p>`}
async function generate(){if(busy)return;clear();const sloc=$('sloc').value,date=$('workDate').value,current=version;if(!sloc||!date){status('กรุณาเลือกวันที่สแกนและ SLoc',true);return}busy=true;$('generate').disabled=true;
  try{status('กำลังเรียกข้อมูลจาก Server…');const data=await request('/api/tags?'+new URLSearchParams({sloc,date}));if(current!==version)return;const ready=data.groups.length>0;
    if(ready){$('output').innerHTML=html(data,thaiTime(new Date()));$('output').hidden=false;$('empty').hidden=true}else $('empty').textContent='ไม่พบรายการที่บันทึกแล้วใน SLoc และวันที่นี้';
    PrintUI.set(ready?{title:`ใบส่งมอบ ${data.sloc} ${data.date}`,filename:`Handover_${data.sloc}_${data.date}.pdf`.replace(/[^\w.\-]+/g,'_'),build:onProgress=>PrintPDF.handover(data,{printedAt:thaiTime(new Date()),onProgress}),browserPrint:()=>{const t=$('printedAt');if(t)t.textContent=thaiTime(new Date());window.print()}}:null);
    status(ready?`${data.groups.length} กลุ่ม • ${data.count.toLocaleString()} ลาเบล${data.missingMaster?` • ${data.missingMaster} กลุ่มยังไม่มี Descr กรุณาอัปเดต Master`:''}`:'ไม่พบรายการ',!!data.missingMaster||!ready)}
  catch(e){if(current===version)status(e.message,true)}finally{busy=false;$('generate').disabled=false}}
async function slocs(){try{const d=await LabelCommon.slocsByDate($('sloc'),$('workDate').value);if(d)status(!$('workDate').value?'เลือกวันที่สแกนก่อน':d.slocs.length?`วันที่ ${d.date} มีการสแกน ${d.slocs.length} SLoc • ${d.count.toLocaleString()} ลาเบล — เลือก SLoc แล้วกดแสดงใบส่งมอบ`:'ไม่มีข้อมูลที่บันทึกแล้วในวันที่นี้',d.slocs.length===0&&!!$('workDate').value)}catch(e){status(e.message,true)}}
$('workDate').onchange=()=>{clear();slocs()};$('sloc').onchange=()=>{clear();status('กดแสดงใบส่งมอบ')};$('generate').onclick=generate;
(async()=>{try{$('workDate').value=today();await slocs()}catch(e){status(e.message,true)}})();window.HandoverApp={generate};})();
