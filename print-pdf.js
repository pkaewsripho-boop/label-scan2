'use strict';
// สร้าง PDF A4 จากข้อมูลป้ายบนเครื่องนี้ (วาดด้วย canvas ของเบราว์เซอร์ ภาษาไทยจึงแสดงถูกต้อง)
// ใช้ส่งให้ Server พิมพ์ต่อ หรือดาวน์โหลด/แชร์ไปแอปเครื่องพิมพ์ได้ — ไม่ต้องพึ่งการค้นหาเครื่องพิมพ์ของ Android
(()=>{
const DPI=200,MM=DPI/25.4,PT=DPI/72,W=Math.round(210*MM),H=Math.round(297*MM),PAGE_W=595.28,PAGE_H=841.89;
const FAMILY='"LabelPrintThai","Noto Sans Thai",Arial,sans-serif';
let fonts=null;
function loadFonts(){return fonts??=(async()=>{try{if(typeof FontFace!=='function')return;const faces=[new FontFace('LabelPrintThai','url(/fonts/NotoSansThai-Regular.ttf)',{weight:'400'}),new FontFace('LabelPrintThai','url(/fonts/NotoSansThai-Bold.ttf)',{weight:'700'})];await Promise.all(faces.map(f=>f.load()));faces.forEach(f=>document.fonts.add(f))}catch{/* ใช้ฟอนต์ไทยของเครื่องแทน */}})()}
const words=typeof Intl!=='undefined'&&Intl.Segmenter?new Intl.Segmenter('th',{granularity:'word'}):null,graphemes=typeof Intl!=='undefined'&&Intl.Segmenter?new Intl.Segmenter('th',{granularity:'grapheme'}):null;
const split=(s,mode)=>{const seg=mode==='word'?words:graphemes;return seg?[...seg.segment(s)].map(x=>x.segment):mode==='word'?s.split(/(\s+)/).filter(Boolean):Array.from(s)};
function font(ctx,size,bold){ctx.font=`${bold?700:400} ${size}px ${FAMILY}`}
function wrap(ctx,text,max){const lines=[];let line='';const push=()=>{if(line.trim()||!lines.length)lines.push(line.trim());line=''};
  for(const paragraph of String(text??'').split('\n')){line='';for(const token of split(paragraph,'word')){const next=line+token;if(ctx.measureText(next).width<=max){line=next;continue}
      if(line.trim())push();const t=token.trimStart();if(ctx.measureText(t).width<=max){line=t;continue}
      for(const g of split(t,'char')){if(line&&ctx.measureText(line+g).width>max)push();line+=g}}
    push()}
  return lines.length?lines:['']}
function fit(ctx,text,{size,min=size*.5,bold=false,w,h,lh=1.3}){for(let s=size;s>=min;s-=Math.max(1,size*.04)){font(ctx,s,bold);const lines=wrap(ctx,text,w);if(lines.length*s*lh<=h)return {size:s,lines,lh}}font(ctx,min,bold);let lines=wrap(ctx,text,w);const max=Math.max(1,Math.floor(h/(min*lh)));if(lines.length>max){lines=lines.slice(0,max);lines[max-1]=lines[max-1].replace(/.{0,2}$/u,'…')}return {size:min,lines,lh}}
// วาดข้อความในกล่อง: align left/center/right, จัดกลางแนวตั้ง
function box(ctx,x,y,w,h,text,o={}){const pad=o.pad??1.5*MM,padY=o.padY??pad,f=fit(ctx,text,{size:o.size,min:o.min,bold:o.bold,w:w-pad*2,h:h-padY*2,lh:o.lh??1.3});font(ctx,f.size,o.bold);ctx.fillStyle='#000';ctx.textBaseline='middle';ctx.textAlign=o.align||'center';const lh=f.size*f.lh,total=f.lines.length*lh,tx=o.align==='left'?x+pad:o.align==='right'?x+w-pad:x+w/2;let ty=(o.top?y+padY+lh/2:y+h/2-total/2+lh/2);for(const line of f.lines){ctx.fillText(line,tx,ty);ty+=lh}}
function cell(ctx,x,y,w,h,fill){if(fill){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h)}ctx.strokeRect(x,y,w,h)}
function line(ctx,x,y,w,left,right,size,bold=false){font(ctx,size,bold);ctx.fillStyle='#000';ctx.textBaseline='top';if(left){ctx.textAlign='left';ctx.fillText(left,x,y)}if(right){ctx.textAlign='right';ctx.fillText(right,x+w,y)}}
function blank(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#000';ctx.lineWidth=.3*MM;ctx.lineJoin='miter'}

// ---------- ป้าย Tag: 36 ลาเบลต่อหน้า (เหมือนหน้าพิมพ์เดิม) ----------
function tagPages(data){const pages=[];for(const g of data.groups)for(let p=0;p<g.pages;p++)pages.push({g,p});return pages}
function drawTag(ctx,data,{g,p},printedAt){blank(ctx);const x0=8*MM,cw=194*MM,widths=[7.5,25.83,7.5,25.83,9,24.34].map(v=>v/100*cw),xs=[x0];for(const w of widths)xs.push(xs[xs.length-1]+w);
  const count=Math.min(36,g.count-p*36);let y=8*MM;line(ctx,x0,y,cw,`SLoc: ${data.sloc} • วันที่งาน: ${data.date}`,`หน้า ${p+1}/${g.pages} • ${count} ลาเบลในหน้านี้`,10*PT);y+=10*PT*1.5+3*MM;
  const span=(a,b)=>[xs[a],xs[b+1]-xs[a]],r1=18*MM,r2=18*MM,r3=16*MM,rw=15*MM,label={size:11*PT,bold:true,align:'left',pad:1*MM};
  // แถว ITEM / Descr / Batch และยอดรวม
  cell(ctx,xs[0],y,widths[0],r1);box(ctx,xs[0],y,widths[0],r1,'ITEM',label);let [sx,sw]=span(1,3);cell(ctx,sx,y,sw,r1);box(ctx,sx,y,sw,r1,g.material,{size:30*PT,bold:true,lh:1.1});
  [sx,sw]=span(4,5);cell(ctx,sx,y,sw,r1+r2);box(ctx,sx,y,sw,r1+r2,'ยอดรวมทั้งกลุ่ม\n'+(g.unit||'ไม่ระบุหน่วย'),{size:14*PT,bold:true});y+=r1;
  cell(ctx,xs[0],y,widths[0],r2);box(ctx,xs[0],y,widths[0],r2,'Descr',label);[sx,sw]=span(1,3);cell(ctx,sx,y,sw,r2);box(ctx,sx,y,sw,r2,g.description||'— ไม่พบคำอธิบายใน Master Data —',{size:13*PT,min:7*PT,bold:true,align:'left',lh:1.35});y+=r2;
  cell(ctx,xs[0],y,widths[0],r3);box(ctx,xs[0],y,widths[0],r3,'Batch',label);[sx,sw]=span(1,3);cell(ctx,sx,y,sw,r3);box(ctx,sx,y,sw,r3,g.batch||'—',{size:26*PT,bold:true,lh:1.15});[sx,sw]=span(4,5);cell(ctx,sx,y,sw,r3);box(ctx,sx,y,sw,r3,g.total,{size:26*PT,bold:true,lh:1.15});y+=r3;
  // น้ำหนัก 12 แถว × 3 คอลัมน์ เรียงลงคอลัมน์ก่อน
  for(let row=0;row<12;row++){for(let col=0;col<3;col++){const index=p*36+col*12+row,e=g.entries[index],c=col*2;cell(ctx,xs[c],y,widths[c],rw);cell(ctx,xs[c+1],y,widths[c+1],rw);if(e){box(ctx,xs[c],y,widths[c],rw,String(index+1),{size:15*PT});box(ctx,xs[c+1],y,widths[c+1],rw,e.weight,{size:22*PT,bold:true,lh:1.1})}}y+=rw}
  y+=3*MM;line(ctx,x0,y,cw,`รวม ${g.count} ลาเบล • ยอดรวมทั้งกลุ่ม ${g.total}${g.unit?' '+g.unit:''}`,`${p?'หน้าต่อ • ':''}พิมพ์เมื่อ (ไทย): ${printedAt}`,9*PT)}

// ---------- แจกแจงรายการ: ทุกลาเบลแยกแถว หัวตารางซ้ำทุกหน้า ----------
const SIL={x:10*MM,w:190*MM,top:10*MM,bottom:(297-10)*MM,cols:[5,17,32,11,17,18],size:10*PT,lh:1.35,padX:1.5*MM,padY:2*MM};
function siliconLayout(ctx,data){const ws=SIL.cols.map(v=>v/100*SIL.w);font(ctx,SIL.size,false);
  const rows=data.rows.map(x=>{const values=[String(x.no),x.material,x.description||'— ไม่พบใน Master Data —',x.unit,x.batch,x.qty],lines=values.map((v,i)=>wrap(ctx,v,ws[i]-SIL.padX*2));return {values,lines,h:Math.max(...lines.map(l=>l.length))*SIL.size*SIL.lh+SIL.padY*2}});
  const headH=19*PT*1.4+10*PT*1.5+6*MM,colH=2*SIL.size*SIL.lh+SIL.padY*2,footH=8*PT*1.6+3*MM,avail=SIL.bottom-SIL.top-headH-colH-footH,pages=[];let cur=[],used=0;
  for(const r of rows){if(cur.length&&used+r.h>avail){pages.push(cur);cur=[];used=0}cur.push(r);used+=r.h}if(cur.length)pages.push(cur);return {ws,pages,headH,colH}}
function drawSilicon(ctx,data,layout,index,printedAt){blank(ctx);const {ws,pages,headH,colH}=layout,rows=pages[index],xs=[SIL.x];for(const w of ws)xs.push(xs[xs.length-1]+w);let y=SIL.top+3*MM;
  font(ctx,19*PT,true);ctx.fillStyle='#000';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText('แจกแจงรายการ',SIL.x,y);y+=19*PT*1.4;
  const meta=[`SLoc / พาเลท: ${data.sloc}`,`วันที่งาน: ${data.date}`,`จำนวน: ${data.count.toLocaleString()} รายการ`];font(ctx,10*PT,false);ctx.textAlign='left';ctx.fillText(meta[0],SIL.x,y);ctx.textAlign='center';ctx.fillText(meta[1],SIL.x+SIL.w/2,y);ctx.textAlign='right';ctx.fillText(meta[2],SIL.x+SIL.w,y);
  y=SIL.top+headH;const heads=['No','Material','Material Description','Base Unit of\nMeasure','Batch','Qty'];
  for(let i=0;i<6;i++){cell(ctx,xs[i],y,ws[i],colH,'#e6e6e6');ctx.strokeStyle='#000';box(ctx,xs[i],y,ws[i],colH,heads[i],{size:SIL.size,bold:true,align:i===5?'right':'left',pad:SIL.padX,padY:SIL.padY,lh:SIL.lh})}y+=colH;
  for(const r of rows){for(let i=0;i<6;i++){cell(ctx,xs[i],y,ws[i],r.h);font(ctx,SIL.size,false);ctx.fillStyle='#000';ctx.textBaseline='middle';ctx.textAlign=i===5?'right':'left';const tx=i===5?xs[i]+ws[i]-SIL.padX:xs[i]+SIL.padX;let ty=y+SIL.padY+SIL.size*SIL.lh/2;for(const l of r.lines[i]){ctx.fillText(l,tx,ty);ty+=SIL.size*SIL.lh}}y+=r.h}
  line(ctx,SIL.x,SIL.bottom-8*PT*1.6,SIL.w,`เวลาจัดทำ (ไทย): ${printedAt} • ข้อมูลที่บันทึกแล้วบน Server เท่านั้น`,`หน้า ${index+1}/${pages.length}`,8*PT)}

// ---------- ใบส่งมอบ: หัวกลุ่ม 3 แถว + แจกแจงจำนวน 10 ช่องต่อแถว • ขึ้นหน้าใหม่แล้วต่อกลุ่มเดิมพร้อมป้าย (ต่อ) ----------
const HO={x:10*MM,w:190*MM,top:10*MM,bottom:(297-10)*MM,head:14*MM,foot:7*MM,c1:13*MM,c3:46*MM,r1:8.5*MM,r2:7*MM,r3:8.5*MM,row:7.6*MM,cols:8,gap:3.5*MM,sign:20*MM};
function microSum(groups){const u=new Map(),m=v=>{const [a,b='']=String(v).split('.');return /^\d+$/.test(a)&&/^\d{0,6}$/.test(b)?BigInt(a)*1000000n+BigInt(b.padEnd(6,'0')||'0'):0n};for(const g of groups)u.set(g.unit||'',(u.get(g.unit||'')||0n)+m(g.total));return [...u].map(([k,v])=>{const i=(v/1000000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,','),f=(v%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return (f?i+'.'+f:i)+' '+(k||'ไม่ระบุหน่วย')}).join(' • ')}
function handoverPlan(data){const pages=[[]],top=HO.top+HO.head,bottom=HO.bottom-HO.foot,groupH=HO.r1+HO.r2+HO.r3;let y=top;const add=f=>pages[pages.length-1].push(f),next=()=>{pages.push([]);y=top};
  for(const g of data.groups){const rows=Math.ceil(g.entries.length/HO.cols);if(y+groupH+HO.row>bottom&&y>top)next();const gy=y;add(ctx=>drawGroupHead(ctx,g,gy));y+=groupH;
    for(let r=0;r<rows;r++){if(y+HO.row>bottom){next();const cy=y;add(ctx=>{font(ctx,8.5*PT,true);ctx.fillStyle='#000';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(`ITEM ${g.material} • Batch ${g.batch||'—'} (ต่อ)`,HO.x,cy+0.5*MM)});y+=5*MM}const ry=y,start=r*HO.cols;add(ctx=>drawWeights(ctx,g,start,ry));y+=HO.row}y+=HO.gap}
  if(y+HO.sign>bottom)next();const sy=y+4*MM;add(ctx=>drawSign(ctx,sy));return pages}
function drawGroupHead(ctx,g,y){const x=HO.x,w=HO.w,mid=w-HO.c1-HO.c3,label={size:8.5*PT,bold:true,align:'left',pad:1.8*MM},xs=[x,x+HO.c1,x+HO.c1+mid];
  cell(ctx,xs[0],y,HO.c1,HO.r1);box(ctx,xs[0],y,HO.c1,HO.r1,'ITEM',label);cell(ctx,xs[1],y,mid,HO.r1);box(ctx,xs[1],y,mid,HO.r1,g.material,{size:13*PT,bold:true,align:'left',pad:1.8*MM});cell(ctx,xs[2],y,HO.c3,HO.r1);box(ctx,xs[2],y,HO.c3,HO.r1,'ยอดรวมทั้งกลุ่ม',{size:8.5*PT,bold:true});y+=HO.r1;
  cell(ctx,xs[0],y,HO.c1,HO.r2);box(ctx,xs[0],y,HO.c1,HO.r2,'Descr',label);cell(ctx,xs[1],y,mid,HO.r2);box(ctx,xs[1],y,mid,HO.r2,g.description||'— ไม่พบใน Master Data —',{size:9*PT,min:6.5*PT,bold:true,align:'left',pad:1.8*MM,padY:0.6*MM,lh:1.2});cell(ctx,xs[2],y,HO.c3,HO.r2);box(ctx,xs[2],y,HO.c3,HO.r2,`${g.unit||'ไม่ระบุหน่วย'} • ${g.count.toLocaleString()} ลาเบล`,{size:9*PT,bold:true});y+=HO.r2;
  cell(ctx,xs[0],y,HO.c1,HO.r3);box(ctx,xs[0],y,HO.c1,HO.r3,'Batch',label);cell(ctx,xs[1],y,mid,HO.r3);box(ctx,xs[1],y,mid,HO.r3,g.batch||'—',{size:12*PT,bold:true,align:'left',pad:1.8*MM});cell(ctx,xs[2],y,HO.c3,HO.r3);box(ctx,xs[2],y,HO.c3,HO.r3,g.total,{size:13*PT,bold:true,align:'right',pad:1.8*MM})}
function drawWeights(ctx,g,start,y){const cw=HO.w/HO.cols,bs=4.2*MM;for(let c=0;c<HO.cols;c++){const e=g.entries[start+c],x=HO.x+c*cw;cell(ctx,x,y,cw,HO.row);if(!e)continue;font(ctx,7*PT,false);ctx.fillStyle='#555';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(String(start+c+1),x+0.8*MM,y+HO.row/2);
    // ช่องตรวจเช็ค [ ]
    const bx=x+5.6*MM,by=y+(HO.row-bs)/2;ctx.save();ctx.lineWidth=0.3*MM;ctx.strokeStyle='#000';ctx.strokeRect(bx,by,bs,bs);ctx.restore();
    let size=12.5*PT;const room=cw-(5.6*MM+bs+1*MM)-1.5*MM;font(ctx,size,false);while(ctx.measureText(e.weight).width>room&&size>5.5*PT){size-=0.25*PT;font(ctx,size,false)}ctx.fillStyle='#000';ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillText(e.weight,x+cw-1.5*MM,y+HO.row/2+0.3*MM)}}
function drawSign(ctx,y){font(ctx,10*PT,false);ctx.fillStyle='#000';ctx.textBaseline='alphabetic';ctx.textAlign='left';const half=HO.w/2;for(const [i,t] of ['ผู้ส่งมอบ','ผู้รับมอบ'].entries()){const x=HO.x+i*half;ctx.fillText(t,x,y+8*MM);ctx.fillText('วันที่',x+half*0.62,y+8*MM);ctx.setLineDash([0.6*MM,0.8*MM]);ctx.lineWidth=0.2*MM;ctx.beginPath();ctx.moveTo(x+17*MM,y+8.5*MM);ctx.lineTo(x+half*0.6,y+8.5*MM);ctx.moveTo(x+half*0.62+11*MM,y+8.5*MM);ctx.lineTo(x+half-6*MM,y+8.5*MM);ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=0.3*MM}}
function drawHandoverPage(ctx,data,pages,i,printedAt){blank(ctx);const labels=data.groups.reduce((n,g)=>n+g.count,0);font(ctx,16*PT,true);ctx.fillStyle='#000';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText('ใบส่งมอบ',HO.x,HO.top);
  font(ctx,9*PT,false);ctx.textAlign='right';ctx.fillText(`SLoc ${data.sloc} • วันที่งาน ${data.date} • ${data.groups.length} กลุ่ม • ${labels.toLocaleString()} ลาเบล`,HO.x+HO.w,HO.top+0.5*MM);ctx.fillText(`รวม ${microSum(data.groups)}`,HO.x+HO.w,HO.top+5*MM);
  ctx.lineWidth=0.5*MM;ctx.beginPath();ctx.moveTo(HO.x,HO.top+10.5*MM);ctx.lineTo(HO.x+HO.w,HO.top+10.5*MM);ctx.stroke();ctx.lineWidth=0.3*MM;
  for(const f of pages[i])f(ctx);line(ctx,HO.x,HO.bottom-8*PT*1.4,HO.w,`พิมพ์เมื่อ (ไทย): ${printedAt} • ข้อมูลที่บันทึกแล้วบน Server`,`หน้า ${i+1}/${pages.length}`,7.5*PT)}

// ---------- PDF ที่ห่อภาพ JPEG หน้าละ 1 ภาพ ----------
function utf16(s){let h='FEFF';s=String(s);for(let i=0;i<s.length;i++)h+=s.charCodeAt(i).toString(16).padStart(4,'0').toUpperCase();return '<'+h+'>'}
function buildPDF(images,title){const enc=new TextEncoder(),chunks=[],offsets=[];let size=0;const add=x=>{const b=typeof x==='string'?enc.encode(x):x;chunks.push(b);size+=b.length};
  const n=images.length,obj=(id,body)=>{offsets[id]=size;add(`${id} 0 obj\n`);for(const part of [].concat(body))add(part);add('\nendobj\n')};
  add('%PDF-1.4\n');add(new Uint8Array([37,226,227,207,211,10]));
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,`<< /Type /Pages /Count ${n} /Kids [${images.map((_,i)=>`${4+i*3} 0 R`).join(' ')}] >>`);obj(3,`<< /Title ${utf16(title)} /Producer (Label Scan 3003) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g,'').slice(0,14)}Z) >>`);
  images.forEach((img,i)=>{const p=4+i*3,content=`q ${PAGE_W} 0 0 ${PAGE_H} 0 0 cm /Im0 Do Q`;obj(p,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 ${p+2} 0 R >> >> /Contents ${p+1} 0 R >>`);obj(p+1,[`<< /Length ${content.length} >>\nstream\n`,content,'\nendstream']);obj(p+2,[`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`,img.data,'\nendstream'])});
  const xref=size,total=4+n*3;add(`xref\n0 ${total}\n0000000000 65535 f \n`);for(let i=1;i<total;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');add(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'})}
const jpeg=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?b.arrayBuffer().then(a=>resolve(new Uint8Array(a)),reject):reject(Error('สร้างภาพหน้าพิมพ์ไม่ได้ (หน่วยความจำเครื่องไม่พอ?)')),'image/jpeg',.9));
async function render(count,draw,title,onProgress){await loadFonts();const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d',{alpha:false}),images=[];
  for(let i=0;i<count;i++){onProgress?.(i+1,count);draw(ctx,i);images.push({w:W,h:H,data:await jpeg(canvas)});await new Promise(r=>setTimeout(r,0))}
  canvas.width=canvas.height=1;return {blob:buildPDF(images,title),pages:count}}
window.PrintPDF={
  async tags(data,{printedAt,onProgress}={}){const pages=tagPages(data);if(!pages.length)throw Error('ไม่มีหน้าที่จะพิมพ์');return render(pages.length,(ctx,i)=>drawTag(ctx,data,pages[i],printedAt),`Tag ${data.sloc} ${data.date}`,onProgress)},
  async silicon(data,{printedAt,onProgress}={}){if(!data.rows.length)throw Error('ไม่มีรายการที่จะพิมพ์');await loadFonts();const probe=document.createElement('canvas').getContext('2d'),layout=siliconLayout(probe,data);return render(layout.pages.length,(ctx,i)=>drawSilicon(ctx,data,layout,i,printedAt),`แจกแจงรายการ ${data.sloc} ${data.date}`,onProgress)},
  async handover(data,{printedAt,onProgress}={}){if(!data.groups.length)throw Error('ไม่มีรายการที่จะพิมพ์');await loadFonts();const pages=handoverPlan(data);return render(pages.length,(ctx,i)=>drawHandoverPage(ctx,data,pages,i,printedAt),`ใบส่งมอบ ${data.sloc} ${data.date}`,onProgress)},
  buildPDF,wrap
};
})();
