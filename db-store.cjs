'use strict';
// เก็บไฟล์ข้อมูลใน PostgreSQL (เช่น Neon) เมื่อกำหนด DATABASE_URL — ใช้กับเว็บโฮสต์ที่ดิสก์ไม่ถาวร (Render Free)
// หลักการ: ฐานข้อมูลคือต้นฉบับ ไฟล์ในโฟลเดอร์ data เป็นแค่สำเนาชั่วคราว
//  - ตอนเริ่ม: ดึงทุกไฟล์จากฐานข้อมูลมาวางในโฟลเดอร์ data
//  - ตอนบันทึก: โค้ดเดิมเขียน .tmp แล้ว rename → ก่อน rename จะบันทึกลงฐานข้อมูลก่อน ถ้าฐานข้อมูลล้มเหลว การบันทึกล้มเหลวทั้งหมด (ไม่มีการตอบว่าสำเร็จโดยข้อมูลไม่ถึงฐานข้อมูล)
// Server ในออฟฟิศไม่ได้ตั้ง DATABASE_URL จึงยังเก็บเป็นไฟล์ตามเดิมและไม่ต้องติดตั้ง pg
const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib');
module.exports=async function useDatabase({dir}){const url=(process.env.DATABASE_URL||'').trim();if(!url)return null;
  let pg;try{pg=require('pg')}catch{throw Error('ตั้ง DATABASE_URL แล้วแต่ไม่พบแพ็กเกจ pg — ให้รัน npm install ก่อน (บนเว็บโฮสต์ใช้ Build command: npm install)')}
  const pool=new pg.Pool({connectionString:url,max:2,idleTimeoutMillis:30000,connectionTimeoutMillis:20000,ssl:/sslmode=disable/.test(url)||/@(localhost|127\.0\.0\.1)[:/]/.test(url)?false:{rejectUnauthorized:false}});
  pool.on('error',e=>console.error('Database: การเชื่อมต่อหลุด (จะเชื่อมใหม่อัตโนมัติ):',e.message));
  const query=async(sql,args)=>{let last;for(let i=0;i<3;i++){try{return await pool.query(sql,args)}catch(e){last=e;if(!/ECONNRESET|ETIMEDOUT|terminat|Connection|timeout|57P01/i.test(String(e.code)+e.message))break;await new Promise(r=>setTimeout(r,1500*(i+1)))}}throw last};
  await query('CREATE TABLE IF NOT EXISTS label_scan_files (name text PRIMARY KEY, data bytea NOT NULL, size integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  const {rows}=await query('SELECT name,data FROM label_scan_files');
  for(const r of rows){if(!/^[\w.-]+\.json$/.test(r.name))continue;await fs.writeFile(path.join(dir,r.name),zlib.gunzipSync(r.data))}
  console.log(`Database: ใช้ PostgreSQL เก็บข้อมูล • โหลด ${rows.length} ไฟล์ (${rows.map(r=>r.name).join(', ')||'ยังว่าง'})`);
  const root=path.resolve(dir),rename=fs.rename.bind(fs);
  fs.rename=async function(from,to){const dst=path.resolve(String(to));if(path.dirname(dst)===root&&dst.endsWith('.json')){const name=path.basename(dst),raw=await fs.readFile(from),compact=Buffer.from(JSON.stringify(JSON.parse(raw.toString('utf8'))),'utf8'),gz=zlib.gzipSync(compact,{level:6});
      try{await query('INSERT INTO label_scan_files(name,data,size,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(name) DO UPDATE SET data=EXCLUDED.data,size=EXCLUDED.size,updated_at=now()',[name,gz,compact.length])}catch(e){await fs.unlink(from).catch(()=>{});throw Object.assign(Error('บันทึกลงฐานข้อมูลไม่สำเร็จ: '+e.message),{code:'EDB'})}}
    return rename(from,to)};
  const close=()=>pool.end().catch(()=>{});process.once('SIGTERM',()=>{close().finally(()=>process.exit(0))});
  return {pool,close};
};
