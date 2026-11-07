'use strict';
// ที่เก็บข้อมูลสแกน 2 แบบ ใช้คำสั่งชุดเดียวกัน
//  - FileStore: ไฟล์ data/label-scans.json (Server ในออฟฟิศ — เหมือนเดิม)
//  - PgStore:   PostgreSQL 1 ลาเบล = 1 แถว (เมื่อตั้ง DATABASE_URL เช่น Neon) — ไม่โหลดทั้งหมดเข้าหน่วยความจำ จึงเก็บถาวรได้
// ทุกคำสั่งเขียนถูกเรียกผ่าน mutate() ของ server (ทีละงาน) และฝั่ง PostgreSQL มี UNIQUE กันซ้ำอีกชั้น
const fs=require('node:fs/promises'),zlib=require('node:zlib');
const key=l=>JSON.stringify([l.sloc,l.date,l.labelId]);
const match=(f,l)=>(!f.sloc||l.sloc===f.sloc)&&(!f.from||l.date>=f.from)&&(!f.to||l.date<=f.to)&&f.terms.every(t=>[l.material,l.batch].some(v=>String(v).toLowerCase().includes(t)));
const page=(arr,limit,offset)=>limit?arr.slice(offset,offset+limit):arr.slice(offset);

class FileStore{
  constructor({file,validSaved}){this.file=file;this.validSaved=validSaved;this.records=[];this.batches=[];this.kind='file'}
  async init(){try{const saved=JSON.parse(await fs.readFile(this.file,'utf8'));if(saved.version!==1||!Array.isArray(saved.records)||saved.batches!==undefined&&!Array.isArray(saved.batches))throw Error('Unsupported data');saved.records.forEach(this.validSaved);if(new Set(saved.records.map(l=>l.id)).size!==saved.records.length)throw Error('Duplicate stored IDs');const batches=saved.batches||[];for(const b of batches)if(!b||typeof b.batchId!=='string'||typeof b.signature!=='string'||!Array.isArray(b.recordIds)||!Number.isFinite(Date.parse(b.createdAt)))throw Error('Invalid batch receipt');if(new Set(batches.map(b=>b.batchId)).size!==batches.length)throw Error('Duplicate batch receipt');this.records=saved.records;this.batches=batches}catch(e){if(e.code==='ENOENT')await this.write([],[]);else throw Error('Cannot load stored data; existing data was NOT erased: '+e.message)}}
  async write(records,batches){const tmp=this.file+'.tmp';await fs.writeFile(tmp,JSON.stringify({version:1,records,batches},null,2),'utf8');await fs.rename(tmp,this.file);this.records=records;this.batches=batches}
  async count(){return this.records.length}
  async catalog({from,to}){const counts={};for(const l of this.records)if((!from||l.date>=from)&&(!to||l.date<=to))counts[l.sloc]=(counts[l.sloc]||0)+1;return counts}
  async query(f,{limit=0,offset=0}={}){const all=this.records.filter(l=>match(f,l));return {rows:page(all,limit,offset),total:all.length}}
  async bySlocDate(sloc,date){return this.records.filter(x=>x.sloc===sloc&&x.date===date)}
  async findBatch(id){return this.batches.find(b=>b.batchId===id)||null}
  async existingKeys(items){const have=new Set(this.records.map(key));return new Set(items.map(key).filter(k=>have.has(k)))}
  async existingIds(ids){const have=new Set(this.records.map(l=>l.id));return new Set(ids.filter(id=>have.has(id)))}
  async insert(rows,receipt){await this.write([...this.records,...rows],receipt?[...this.batches,receipt]:this.batches)}
  async purge(cutoff){const keep=this.records.filter(l=>!(Date.parse(l.createdAt)<cutoff));if(keep.length===this.records.length)return 0;const ids=new Set(keep.map(l=>l.id)),n=this.records.length-keep.length;await this.write(keep,this.batches.filter(b=>!(Date.parse(b.createdAt)<cutoff)&&b.recordIds.every(id=>ids.has(id))));return n}
}

class PgStore{
  constructor({pool,validSaved}){this.pool=pool;this.validSaved=validSaved;this.kind='postgres'}
  q(sql,args){return this.pool.query(sql,args)}
  async init(){
    await this.q(`CREATE TABLE IF NOT EXISTS label_scans(seq bigserial UNIQUE, id text PRIMARY KEY, sloc text NOT NULL, work_date text NOT NULL, label_id text NOT NULL, material text NOT NULL, batch text NOT NULL, created_at timestamptz NOT NULL, data jsonb NOT NULL, UNIQUE(sloc,work_date,label_id))`);
    await this.q('CREATE INDEX IF NOT EXISTS label_scans_date_sloc ON label_scans(work_date,sloc)');
    await this.q('CREATE INDEX IF NOT EXISTS label_scans_created ON label_scans(created_at)');
    await this.q('CREATE TABLE IF NOT EXISTS label_scan_batches(batch_id text PRIMARY KEY, signature text NOT NULL, record_ids jsonb NOT NULL, created_at timestamptz NOT NULL)');
    await this.migrateBlob();
  }
  // ย้ายข้อมูลจากรุ่นก่อน (เก็บทั้งก้อนในตาราง label_scan_files) เข้าตารางรายแถว ครั้งเดียว — ก้อนเดิมเก็บไว้เป็นสำรองชื่อ label-scans.json.migrated
  async migrateBlob(){const {rows}=await this.q("SELECT data FROM label_scan_files WHERE name='label-scans.json'").catch(e=>e.code==='42P01'?{rows:[]}:Promise.reject(e));if(!rows.length)return;
    const saved=JSON.parse(zlib.gunzipSync(rows[0].data).toString('utf8')),records=Array.isArray(saved.records)?saved.records:[],batches=Array.isArray(saved.batches)?saved.batches:[];records.forEach(this.validSaved);
    const c=await this.pool.connect();try{await c.query('BEGIN');for(let i=0;i<records.length;i+=500)await this.insertRows(c,records.slice(i,i+500),true);for(const b of batches)await c.query('INSERT INTO label_scan_batches(batch_id,signature,record_ids,created_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[b.batchId,b.signature,JSON.stringify(b.recordIds),b.createdAt]);
      await c.query("DELETE FROM label_scan_files WHERE name='label-scans.json.migrated'");await c.query("UPDATE label_scan_files SET name='label-scans.json.migrated' WHERE name='label-scans.json'");await c.query('COMMIT')}catch(e){await c.query('ROLLBACK').catch(()=>{});throw Error('ย้ายข้อมูลเดิมเข้าตารางรายแถวไม่สำเร็จ (ข้อมูลเดิมไม่ถูกลบ): '+e.message)}finally{c.release()}
    console.log(`Database: ย้ายข้อมูลเดิม ${records.length} รายการเข้าตารางรายแถวแล้ว (สำรองก้อนเดิมไว้ชื่อ label-scans.json.migrated)`)}
  async insertRows(c,rows,skipDuplicates){if(!rows.length)return;const vals=[],args=[];rows.forEach((l,i)=>{const b=i*8;vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`);args.push(l.id,l.sloc,l.date,l.labelId,l.material,l.batch,l.createdAt,JSON.stringify(l))});
    await c.query(`INSERT INTO label_scans(id,sloc,work_date,label_id,material,batch,created_at,data) VALUES ${vals.join(',')}${skipDuplicates?' ON CONFLICT DO NOTHING':''}`,args)}
  async count(){return Number((await this.q('SELECT count(*) n FROM label_scans')).rows[0].n)}
  where(f){const w=[],a=[];if(f.sloc){a.push(f.sloc);w.push(`sloc=$${a.length}`)}if(f.from){a.push(f.from);w.push(`work_date>=$${a.length}`)}if(f.to){a.push(f.to);w.push(`work_date<=$${a.length}`)}for(const t of f.terms){a.push('%'+t.replace(/[\\%_]/g,m=>'\\'+m)+'%');w.push(`(lower(material) LIKE $${a.length} OR lower(batch) LIKE $${a.length})`)}return {sql:w.length?' WHERE '+w.join(' AND '):'',args:a}}
  async catalog({from,to}){const w=this.where({from,to,terms:[]}),{rows}=await this.q(`SELECT sloc,count(*) n FROM label_scans${w.sql} GROUP BY sloc`,w.args),counts={};for(const r of rows)counts[r.sloc]=Number(r.n);return counts}
  async query(f,{limit=0,offset=0}={}){const w=this.where(f),a=[...w.args];let sql=`SELECT data FROM label_scans${w.sql} ORDER BY seq`;if(limit){a.push(limit);sql+=` LIMIT $${a.length}`}if(offset){a.push(offset);sql+=` OFFSET $${a.length}`}
    const [{rows},total]=await Promise.all([this.q(sql,a),this.q(`SELECT count(*) n FROM label_scans${w.sql}`,w.args)]);return {rows:rows.map(r=>r.data),total:Number(total.rows[0].n)}}
  async bySlocDate(sloc,date){return (await this.q('SELECT data FROM label_scans WHERE sloc=$1 AND work_date=$2 ORDER BY seq',[sloc,date])).rows.map(r=>r.data)}
  async findBatch(id){const r=(await this.q('SELECT batch_id,signature,record_ids,created_at FROM label_scan_batches WHERE batch_id=$1',[id])).rows[0];return r?{batchId:r.batch_id,signature:r.signature,recordIds:r.record_ids,createdAt:r.created_at.toISOString()}:null}
  async existingKeys(items){if(!items.length)return new Set();const out=new Set();for(let i=0;i<items.length;i+=1000){const part=items.slice(i,i+1000),{rows}=await this.q('SELECT sloc,work_date,label_id FROM label_scans WHERE (sloc,work_date,label_id) IN (SELECT * FROM unnest($1::text[],$2::text[],$3::text[]))',[part.map(x=>x.sloc),part.map(x=>x.date),part.map(x=>x.labelId)]);for(const r of rows)out.add(JSON.stringify([r.sloc,r.work_date,r.label_id]))}return out}
  async existingIds(ids){if(!ids.length)return new Set();const {rows}=await this.q('SELECT id FROM label_scans WHERE id=ANY($1::text[])',[ids]);return new Set(rows.map(r=>r.id))}
  async insert(rows,receipt){const c=await this.pool.connect();try{await c.query('BEGIN');for(let i=0;i<rows.length;i+=500)await this.insertRows(c,rows.slice(i,i+500),false);if(receipt)await c.query('INSERT INTO label_scan_batches(batch_id,signature,record_ids,created_at) VALUES($1,$2,$3,$4)',[receipt.batchId,receipt.signature,JSON.stringify(receipt.recordIds),receipt.createdAt]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK').catch(()=>{});if(e.code==='23505')throw Object.assign(Error('พบรายการซ้ำในฐานข้อมูล ไม่ได้บันทึกทั้งชุด กรุณาลองใหม่'),{status:409});throw Object.assign(Error('บันทึกลงฐานข้อมูลไม่สำเร็จ: '+e.message),{code:'EDB'})}finally{c.release()}}
  async purge(cutoff){const t=new Date(cutoff).toISOString(),r=await this.q('DELETE FROM label_scans WHERE created_at<$1',[t]);await this.q('DELETE FROM label_scan_batches WHERE created_at<$1',[t]);return r.rowCount}
}
module.exports={FileStore,PgStore};
