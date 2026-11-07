'use strict';
(function(root){
 function dateOK(s){return typeof s==='string'&&s>='1900-03-01'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s}
 function context(x){const sloc=String(x.sloc??'').trim().toUpperCase(),scanner=String(x.scanner??'').trim(),date=String(x.date??'').trim();if(!sloc)throw Error('กรุณาระบุ SLoc');if(!scanner)throw Error('กรุณาระบุผู้สแกน');if(sloc.length>80||scanner.length>80)throw Error('SLoc และผู้สแกนต้องไม่เกิน 80 ตัวอักษร');if(!dateOK(date))throw Error('กรุณาระบุวันที่ให้ถูกต้อง');return {sloc,scanner,date}}
 // SLoc ที่รับได้สำหรับการบันทึกใหม่: A–Z 0–9 และ - / . _ เว้นวรรค (กันสแกน QR เข้าช่อง SLoc ผิด) • ข้อมูลเดิมที่บันทึกแล้วไม่ถูกตรวจย้อนหลัง
 function slocOK(s){return typeof s==='string'&&s.length>=1&&s.length<=40&&/^[A-Z0-9][A-Z0-9 ._\/-]*$/.test(s)}
 function parse(value){if(typeof value!=='string'||value.length>4096)throw Error('ข้อมูล QR ไม่ถูกต้องหรือยาวเกินกำหนด');const raw=value.trim(),p=raw.split('|');if(p.length!==7)throw Error('QR ต้องมี 7 ช่องคั่นด้วย | (ช่องหน่วยเว้นว่างได้)');if(!p[0].trim()||!p[6].trim())throw Error('QR ต้องมี Material และ Label ID');if(!/^\d+(\.\d{1,6})?$/.test(p[3]))throw Error('จำนวนใน QR ต้องเป็นตัวเลข ทศนิยมไม่เกิน 6 ตำแหน่ง');const qty=Number(p[3]);if(!Number.isFinite(qty)||qty<=0||qty>1e12)throw Error('จำนวนใน QR ต้องมากกว่า 0 และไม่เกิน 1,000,000,000,000');return {material:p[0].trim(),batch:p[1].trim(),qty,unit:p[4].trim().toUpperCase(),labelId:p[6].trim(),raw}}
 const api={parse,context,dateOK,slocOK};if(typeof module==='object'&&module.exports)module.exports=api;else root.LabelQR=api;
})(globalThis);
