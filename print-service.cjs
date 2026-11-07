'use strict';
// ส่งงานพิมพ์จาก Server ไปเครื่องพิมพ์ A4 โดยตรง (IPP / RAW 9100)
// handheld ไม่ต้องค้นหาเครื่องพิมพ์เอง: เครื่องสร้าง PDF แล้วส่งให้ Server นี้ส่งต่อ
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),https=require('node:https'),net=require('node:net');
const fail=(m,status=400)=>Object.assign(Error(m),{status});
const MAX_PDF=80*1024*1024;

// ---------- ที่อยู่เครื่องพิมพ์ ----------
function normalize(input){
  let s=String(input??'').trim();
  if(!s)throw fail('กรุณาระบุ IP หรือ URL ของเครื่องพิมพ์');
  if(s.length>300)throw fail('ที่อยู่เครื่องพิมพ์ยาวเกินไป');
  if(!/^[a-z]+:\/\//i.test(s))s='ipp://'+s; // พิมพ์แค่ IP → ใช้ IPP
  let u;try{u=new URL(s)}catch{throw fail('รูปแบบที่อยู่เครื่องพิมพ์ไม่ถูกต้อง')}
  const scheme=u.protocol.slice(0,-1).toLowerCase();
  if(!['ipp','ipps','http','https','socket'].includes(scheme))throw fail('รองรับ ipp://, ipps://, http(s):// หรือ socket:// เท่านั้น');
  if(!u.hostname||u.username||u.password)throw fail('ที่อยู่เครื่องพิมพ์ไม่ถูกต้อง');
  if(scheme==='socket'){const port=Number(u.port||9100);return {kind:'raw',host:u.hostname,port,url:`socket://${u.host.includes(':')?u.host:u.hostname+':'+port}`}}
  const secure=scheme==='ipps'||scheme==='https',port=Number(u.port||(scheme==='http'?80:scheme==='https'?443:631)),p=u.pathname&&u.pathname!=='/'?u.pathname:'/ipp/print';
  const host=u.hostname.includes(':')?`[${u.hostname}]`:u.hostname;
  return {kind:'ipp',secure,host:u.hostname,port,path:p+u.search,url:`${secure?'ipps':'ipp'}://${host}:${port}${p}${u.search}`};
}

// ---------- IPP (RFC 8010/8011) ----------
const TAG={operation:0x01,job:0x02,end:0x03,integer:0x21,boolean:0x22,enum:0x23,text:0x41,name:0x42,keyword:0x44,uri:0x45,charset:0x47,language:0x48,mime:0x49};
function attr(tag,name,value){const n=Buffer.from(name,'utf8');let v;if(tag===TAG.integer||tag===TAG.enum){v=Buffer.alloc(4);v.writeInt32BE(value)}else if(tag===TAG.boolean)v=Buffer.from([value?1:0]);else v=Buffer.from(String(value),'utf8');const h=Buffer.alloc(3);h.writeUInt8(tag);h.writeUInt16BE(n.length,1);const l=Buffer.alloc(2);l.writeUInt16BE(v.length);return Buffer.concat([h,n,l,v])}
function multi(tag,name,values){return Buffer.concat(values.map((v,i)=>attr(tag,i?'':name,v)))}
let requestId=1;
function encode(op,printer,opAttrs=[],jobAttrs=[]){const head=Buffer.alloc(8);head.writeUInt16BE(0x0101);head.writeUInt16BE(op,2);head.writeUInt32BE(requestId=requestId%2147483646+1,4);
  const parts=[head,Buffer.from([TAG.operation]),attr(TAG.charset,'attributes-charset','utf-8'),attr(TAG.language,'attributes-natural-language','th'),attr(TAG.uri,'printer-uri',printer.url),...opAttrs];
  if(jobAttrs.length)parts.push(Buffer.from([TAG.job]),...jobAttrs);parts.push(Buffer.from([TAG.end]));return Buffer.concat(parts)}
function decode(buf){if(buf.length<9)throw Error('คำตอบ IPP สั้นเกินไป');const status=buf.readUInt16BE(2),groups=[];let i=8,group=null,last=null;
  while(i<buf.length){const tag=buf[i++];if(tag===TAG.end)break;if(tag<0x10){group={tag,attrs:{}};groups.push(group);continue}
    const nl=buf.readUInt16BE(i);i+=2;const name=buf.toString('utf8',i,i+nl);i+=nl;const vl=buf.readUInt16BE(i);i+=2;const raw=buf.subarray(i,i+vl);i+=vl;
    let value;if(tag===TAG.integer||tag===TAG.enum)value=vl===4?raw.readInt32BE():null;else if(tag===TAG.boolean)value=!!raw[0];else if(tag>=0x40&&tag<0x50)value=raw.toString('utf8');else value=null;
    if(!group){group={tag:0,attrs:{}};groups.push(group)}
    if(name){last=name;(group.attrs[name]??=[]).push(value)}else if(last)(group.attrs[last]??=[]).push(value)}
  const all={};for(const g of groups)for(const [k,v] of Object.entries(g.attrs))all[k]??=v;return {status,attrs:all,groups}}
function post(printer,body,timeout=60000){return new Promise((resolve,reject)=>{const lib=printer.secure?https:http;
  const req=lib.request({host:printer.host,port:printer.port,path:printer.path,method:'POST',headers:{'Content-Type':'application/ipp','Content-Length':body.length},timeout,...(printer.secure?{rejectUnauthorized:false}:{})},res=>{const parts=[];let n=0;res.on('data',c=>{n+=c.length;if(n<4*1024*1024)parts.push(c)});res.on('end',()=>{if(res.statusCode!==200)return reject(fail(`เครื่องพิมพ์ตอบ HTTP ${res.statusCode} — ตรวจ path ของ IPP (เช่น /ipp/print)`,502));try{resolve(decode(Buffer.concat(parts)))}catch(e){reject(fail('อ่านคำตอบเครื่องพิมพ์ไม่ได้: '+e.message,502))}})});
  req.on('timeout',()=>req.destroy(Object.assign(Error('timeout'),{code:'ETIMEDOUT'})));req.on('error',e=>reject(netError(e,printer)));req.end(body)})}
function netError(e,printer){const where=`${printer.host}:${printer.port}`;const m={ECONNREFUSED:`เครื่องพิมพ์ ${where} ปฏิเสธการเชื่อมต่อ — พอร์ตนี้อาจไม่ได้เปิด (ลอง IPP 631 หรือ RAW 9100)`,ETIMEDOUT:`ติดต่อเครื่องพิมพ์ ${where} ไม่ทันเวลา — ตรวจ IP, เครื่องพิมพ์เปิดอยู่ และ Server เข้าถึงวงเครือข่ายนี้ได้`,EHOSTUNREACH:`Server เข้าถึง ${where} ไม่ได้ — ตรวจเครือข่าย/Firewall`,ENETUNREACH:`Server เข้าถึง ${where} ไม่ได้ — ตรวจเครือข่าย/Firewall`,ENOTFOUND:`ไม่พบชื่อเครื่องพิมพ์ ${printer.host} — ใช้ IP แทน`,ECONNRESET:`เครื่องพิมพ์ ${where} ตัดการเชื่อมต่อ`};return fail(m[e.code]||`ส่งงานไปเครื่องพิมพ์ไม่สำเร็จ: ${e.message}`,502)}
const STATUS={0x0400:'คำขอไม่ถูกต้อง',0x0401:'เครื่องพิมพ์ไม่อนุญาต',0x0402:'เครื่องพิมพ์ต้องการการยืนยันตัวตน',0x0403:'ไม่มีสิทธิ์พิมพ์',0x0406:'ไม่พบคิวเครื่องพิมพ์นี้ — ตรวจ path เช่น /ipp/print',0x040A:'เครื่องพิมพ์ไม่รับรูปแบบไฟล์นี้',0x0500:'เครื่องพิมพ์ขัดข้องภายใน',0x0501:'เครื่องพิมพ์ไม่รองรับคำสั่งนี้',0x0506:'เครื่องพิมพ์ยังไม่พร้อมรับงาน',0x0507:'เครื่องพิมพ์ไม่ว่าง ลองใหม่ภายหลัง'};
function ok(res,what){if(res.status>=0x0100){const msg=res.attrs['status-message']?.[0];throw fail(`${what}: ${STATUS[res.status]||'IPP 0x'+res.status.toString(16).padStart(4,'0')}${msg?' ('+msg+')':''}`,502)}return res}
const STATE={3:'พร้อม (idle)',4:'กำลังพิมพ์',5:'หยุด (stopped)'};
async function inspect(printer){if(printer.kind==='raw')return new Promise((resolve,reject)=>{const s=net.connect({host:printer.host,port:printer.port,timeout:8000},()=>{s.destroy();resolve({kind:'raw',url:printer.url,reachable:true,formats:[],note:'เชื่อมต่อพอร์ต RAW ได้ เครื่องพิมพ์ต้องรองรับ PDF direct print'})});s.on('timeout',()=>s.destroy(Object.assign(Error('timeout'),{code:'ETIMEDOUT'})));s.on('error',e=>reject(netError(e,printer)))});
  const res=ok(await post(printer,encode(0x000B,printer,[multi(TAG.keyword,'requested-attributes',['printer-name','printer-make-and-model','printer-state','printer-state-reasons','printer-state-message','document-format-supported','media-supported','copies-supported','printer-is-accepting-jobs'])]),12000),'ตรวจเครื่องพิมพ์');
  const a=res.attrs,formats=(a['document-format-supported']||[]).filter(Boolean);
  return {kind:'ipp',url:printer.url,reachable:true,name:a['printer-name']?.[0]||'',model:a['printer-make-and-model']?.[0]||'',state:STATE[a['printer-state']?.[0]]||'',reasons:(a['printer-state-reasons']||[]).filter(x=>x&&x!=='none'),accepting:a['printer-is-accepting-jobs']?.[0]!==false,formats,pdf:formats.includes('application/pdf'),jpeg:formats.includes('image/jpeg')}}

// ดึงภาพ JPEG ของแต่ละหน้าจาก PDF ที่หน้าเว็บสร้าง (ใช้เมื่อเครื่องพิมพ์ไม่รับ PDF แต่รับ JPEG)
function jpegPages(pdf){const out=[],marker=Buffer.from('/Filter /DCTDecode /Length ');let i=0;while((i=pdf.indexOf(marker,i))>=0){i+=marker.length;const end=pdf.indexOf('>>',i),len=Number(pdf.toString('latin1',i,end).trim());let s=pdf.indexOf('stream',end)+6;if(pdf[s]===0x0d)s++;if(pdf[s]===0x0a)s++;if(!Number.isInteger(len)||len<=0||s+len>pdf.length)throw fail('ไฟล์ PDF สำหรับพิมพ์ไม่ถูกต้อง');out.push(pdf.subarray(s,s+len));i=s+len}return out}

async function printIPP(printer,pdf,{title,copies,user}){let info=null;try{info=await inspect(printer)}catch(e){if(e.status!==502||/ปฏิเสธ|ไม่ทันเวลา|เข้าถึง|ไม่พบชื่อ/.test(e.message))throw e}
  if(info&&!info.accepting)throw fail('เครื่องพิมพ์ไม่รับงานขณะนี้ (not accepting jobs)',502);
  const formats=info?.formats||[],job=(format,doc,name)=>{const jobAttrs=[attr(TAG.integer,'copies',copies),attr(TAG.keyword,'media','iso_a4_210x297mm'),attr(TAG.keyword,'sides','one-sided')];if(format==='image/jpeg')jobAttrs.push(attr(TAG.keyword,'print-scaling','fit'));return post(printer,Buffer.concat([encode(0x0002,printer,[attr(TAG.name,'requesting-user-name',user),attr(TAG.name,'job-name',name),attr(TAG.mime,'document-format',format)],jobAttrs),doc]),120000).then(r=>ok(r,'ส่งงานพิมพ์')).then(r=>r.attrs['job-id']?.[0]??null)};
  if(!formats.length||formats.includes('application/pdf'))return {method:'ipp',format:'application/pdf',jobs:[await job('application/pdf',pdf,title)],printer:info};
  if(formats.includes('image/jpeg')){const pages=jpegPages(pdf),jobs=[];for(let n=0;n<pages.length;n++)jobs.push(await job('image/jpeg',pages[n],`${title} (${n+1}/${pages.length})`));return {method:'ipp',format:'image/jpeg',jobs,printer:info}}
  if(formats.includes('application/octet-stream'))return {method:'ipp',format:'application/octet-stream',jobs:[await job('application/octet-stream',pdf,title)],printer:info};
  throw fail('เครื่องพิมพ์ไม่รับ PDF หรือ JPEG ผ่าน IPP — ลองตั้งเป็น socket://IP:9100 ถ้าเครื่องรองรับ PDF direct print',502)}
function printRaw(printer,pdf,{title,copies}){const uel='\x1b%-12345X',head=Buffer.from(`${uel}@PJL\r\n@PJL JOB NAME="${title.replace(/[^\x20-\x7e]/g,'_').replace(/"/g,"'").slice(0,60)}"\r\n@PJL SET COPIES=${copies}\r\n@PJL ENTER LANGUAGE=PDF\r\n`,'latin1'),tail=Buffer.from(`${uel}@PJL\r\n@PJL EOJ\r\n${uel}`,'latin1');
  return new Promise((resolve,reject)=>{const s=net.connect({host:printer.host,port:printer.port,timeout:30000},()=>{s.end(Buffer.concat([head,pdf,tail]))});s.on('timeout',()=>s.destroy(Object.assign(Error('timeout'),{code:'ETIMEDOUT'})));s.on('error',e=>reject(netError(e,printer)));s.on('close',err=>{if(!err)resolve({method:'raw',format:'application/pdf',jobs:[null],printer:null})});s.on('data',()=>{})})}

module.exports=async function init({dir,mutate,json,parseBody}){const file=path.join(dir,'printer-settings.json'),envUrl=(process.env.PRINTER_URL||'').trim();let saved={url:'',updatedAt:null};
  try{const x=JSON.parse(await fs.readFile(file,'utf8'));if(x&&x.version===1&&typeof x.url==='string')saved={url:x.url,updatedAt:x.updatedAt||null}}catch(e){if(e.code!=='ENOENT')console.error('printer-settings.json อ่านไม่ได้ — ยังไม่ได้ตั้งเครื่องพิมพ์ (ไฟล์เดิมไม่ถูกลบ)')}
  if(envUrl)normalize(envUrl);
  const current=()=>{const url=envUrl||saved.url;return url?normalize(url):null};
  let queue=Promise.resolve();const serial=fn=>{const t=queue.then(fn);queue=t.catch(()=>{});return t};
  async function readPdf(req){const n=Number(req.headers['content-length']);if(n>MAX_PDF)throw fail('ไฟล์พิมพ์เกิน 80 MB กรุณาพิมพ์ทีละ SLoc/วัน',413);let size=0;const parts=[];for await(const c of req){size+=c.length;if(size>MAX_PDF)throw fail('ไฟล์พิมพ์เกิน 80 MB',413);parts.push(c)}const pdf=Buffer.concat(parts);if(pdf.length<64||pdf.toString('latin1',0,5)!=='%PDF-')throw fail('ข้อมูลที่ส่งมาไม่ใช่ไฟล์ PDF');return pdf}
  return async function handle(req,res,url){const route=url.pathname;
    if(req.method==='GET'&&route==='/api/printer'){const p=current();json(res,200,{configured:!!p,url:p?.url||'',kind:p?.kind||'',locked:!!envUrl,updatedAt:envUrl?null:saved.updatedAt});return true}
    if(req.method==='POST'&&route==='/api/printer'){if(envUrl)throw fail('ตั้งเครื่องพิมพ์ด้วย PRINTER_URL บน Server แล้ว แก้จากหน้าเว็บไม่ได้',409);const x=await parseBody(req),p=x?.url===''?null:normalize(x?.url);const updatedAt=new Date().toISOString();await mutate(async()=>{await fs.writeFile(file+'.tmp',JSON.stringify({version:1,url:p?p.url:'',updatedAt},null,2),'utf8');await fs.rename(file+'.tmp',file);saved={url:p?p.url:'',updatedAt}});json(res,200,{configured:!!p,url:p?.url||'',kind:p?.kind||'',locked:false,updatedAt});return true}
    if(req.method==='POST'&&route==='/api/printer/check'){const x=await parseBody(req),p=x?.url?normalize(x.url):current();if(!p)throw fail('ยังไม่ได้ตั้งเครื่องพิมพ์');json(res,200,await inspect(p));return true}
    if(req.method==='POST'&&route==='/api/print'){const p=current();if(!p)throw fail('ยังไม่ได้ตั้งเครื่องพิมพ์บน Server — เปิด “ตั้งค่าเครื่องพิมพ์” แล้วใส่ IP เครื่องพิมพ์ A4',409);
      const copies=Number(url.searchParams.get('copies')||1);if(!Number.isInteger(copies)||copies<1||copies>20)throw fail('จำนวนชุดต้องเป็น 1–20');
      const title=(url.searchParams.get('title')||'Label Scan').replace(/[\u0000-\u001f]/g,' ').slice(0,120),user=(url.searchParams.get('user')||'label-scan').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,60)||'label-scan';
      const pdf=await readPdf(req),started=Date.now();
      const result=await serial(()=>p.kind==='raw'?printRaw(p,pdf,{title,copies}):printIPP(p,pdf,{title,copies,user}));
      console.log(`Print: ${title} • ${copies} ชุด • ${(pdf.length/1048576).toFixed(1)} MB • ${result.method}/${result.format} → ${p.url} (${Date.now()-started} ms)`);
      json(res,200,{ok:true,printer:p.url,method:result.method,format:result.format,jobs:result.jobs,copies,bytes:pdf.length,printerName:result.printer?.name||result.printer?.model||''});return true}
    if(req.method==='GET'&&/^\/fonts\/NotoSansThai-(Regular|Bold)\.ttf$/.test(route)){const data=await fs.readFile(path.join(__dirname,route));res.writeHead(200,{'Content-Type':'font/ttf','Cache-Control':'max-age=86400'});res.end(data);return true}
    return false};
};
module.exports.normalize=normalize;module.exports.decode=decode;module.exports.encode=encode;module.exports.jpegPages=jpegPages;
