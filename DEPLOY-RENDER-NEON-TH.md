# ทาง B: Render (ฟรี) + Neon (ฐานข้อมูลฟรี)

ใช้งานนอกวง LAN ได้ฟรี ไม่ต้องล็อกอิน และข้อมูลไม่หายเมื่อ Render หลับหรือรีสตาร์ต เพราะข้อมูลเก็บใน Neon
ระบบยังลบข้อมูลสแกนที่บันทึกเกิน 30 วันอัตโนมัติ (`RETENTION_DAYS=30`)

> ⚠️ ไม่มีล็อกอิน: ใครได้ลิงก์ก็ดู / Export / ลบรายการได้ ส่งลิงก์เฉพาะคนในทีม
> Server ในออฟฟิศไม่ได้รับผลกระทบ: ถ้าไม่ตั้ง `DATABASE_URL` ระบบเก็บเป็นไฟล์ในโฟลเดอร์ data เหมือนเดิม และไม่ต้องติดตั้งอะไรเพิ่ม

## สิ่งที่ต้องรู้ก่อน
- Render ฟรีจะ**หลับเมื่อไม่มีคนใช้ 15 นาที** คนแรกที่เปิดลิงก์ต้องรอประมาณ 1 นาที (ขึ้นหน้าโหลดของ Render) แล้วจึงใช้ได้ตามปกติ — ข้อมูลไม่หาย
- ฐานข้อมูล Neon ฟรีก็หลับเมื่อว่าง 5 นาที การบันทึกครั้งแรกหลังหลับอาจช้ากว่าปกติ 1–2 วินาที
- ส่งงานไปเครื่องพิมพ์ในออฟฟิศไม่ได้ → ใช้ “ดาวน์โหลด PDF” / “แชร์ PDF”
- ข้อมูลคนละชุดกับ Server ในออฟฟิศ และคนละชุดกับ Railway

## ขั้นที่ 1: อัปเดตโค้ดบน GitHub
1. แตกไฟล์ ZIP → เปิดโฟลเดอร์ `label-scan-batch`
2. repo `label-scan` → **Add file → Upload files** → Ctrl+A ลากทุกไฟล์ลงไป → **Commit changes**
3. ตรวจว่าใน repo มี `db-store.cjs`, `package.json`, `package-lock.json` (ต้องมีครบ ไม่งั้น Render ติดตั้งไม่ได้)

## ขั้นที่ 2: สร้างฐานข้อมูลบน Neon
1. ไปที่ **neon.com** → **Sign up** (ใช้บัญชี GitHub ได้)
2. สร้าง Project: ตั้งชื่อ `label-scan` • Region เลือก **AWS Asia Pacific (Singapore)** (ใกล้ไทยที่สุด) • Postgres version ใช้ค่าเริ่มต้น → **Create**
3. ในหน้า Project กด **Connect** (หรือ Connection Details) → คัดลอก **Connection string** ที่หน้าตาประมาณนี้
   `postgresql://neondb_owner:xxxxx@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
4. เก็บข้อความนี้ไว้เป็นความลับ (มีรหัสผ่านอยู่ข้างใน) ไม่ต้องสร้างตารางเอง ระบบสร้างให้ตอนเริ่ม

## ขั้นที่ 3: สร้างบริการบน Render
1. ไปที่ **render.com** → **Get Started** → สมัครด้วย **GitHub**
2. **New +** → **Web Service** → เลือก repo `label-scan` (ถ้าไม่เห็น กด Configure account ให้ Render เห็น repo นี้)
3. ตั้งค่า
   - Name: `label-scan`
   - Region: **Singapore**
   - Branch: `main`
   - Runtime / Language: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: **Free**
4. หัวข้อ **Environment Variables** → **Add Environment Variable**

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Connection string จาก Neon (ขั้นที่ 2) |
   | `RETENTION_DAYS` | `30` |

   ไม่ต้องตั้ง `PORT` และไม่ต้องตั้ง `DATA_DIR`
5. กด **Deploy Web Service** รอประมาณ 2–5 นาที

## ขั้นที่ 4: ตรวจว่าใช้ได้
1. หน้า Logs ของบริการควรเห็น
   ```
   Database: ใช้ PostgreSQL เก็บข้อมูล • โหลด 0 ไฟล์ (ยังว่าง)
   Retention: เก็บข้อมูลสแกน 30 วัน ตรวจลบทุก 1 ชั่วโมง
   ```
   ถ้าไม่เห็นบรรทัด `Database:` แปลว่ายังไม่ได้ตั้ง `DATABASE_URL` — ข้อมูลจะหายเมื่อ Render หลับ
2. ลิงก์อยู่ใต้ชื่อบริการด้านบน เช่น `https://label-scan-xxxx.onrender.com`
   - หน้าสแกน `/` • ข้อมูลดิบ `/admin` • ป้าย Tag `/tags` • แจกแจงรายการ `/silicon-tags`
3. เข้า `/tags` → **นำเข้า / อัปเดต Master Data** → นำเข้าไฟล์ Excel Master (ฐานข้อมูลเริ่มว่าง)
4. ทดสอบ: สแกน 1–2 รายการ → บันทึก → ใน Render กด **Manual Deploy → Restart service** (หรือรอให้หลับ) → เปิดหน้าข้อมูลดิบ รายการต้องยังอยู่

## อัปเดตโปรแกรมครั้งถัดไป
อัปโหลดไฟล์ใหม่ขึ้น GitHub → Render deploy ใหม่อัตโนมัติ → ข้อมูลใน Neon ยังอยู่

## ปัญหาที่อาจเจอ
- **บันทึกแล้วขึ้น “ยังยืนยันผลไม่ได้ … กด ส่งซ้ำ”**: ฐานข้อมูลติดต่อไม่ได้ชั่วคราว รายการยังอยู่ในเครื่อง กด “ส่งซ้ำ” ภายหลัง ระบบไม่บันทึกซ้ำ
- **Log ขึ้น `ไม่พบแพ็กเกจ pg`**: Build Command ต้องเป็น `npm install`
- **Log ขึ้น error เกี่ยวกับ password / connection**: คัดลอก Connection string จาก Neon ใหม่ทั้งบรรทัด แล้ววางทับใน `DATABASE_URL`
- **เลิกใช้ Railway**: ลบโปรเจกต์บน Railway ได้ (Export Excel เก็บข้อมูลไว้ก่อนถ้าต้องการ)

## ขีดจำกัดแพลนฟรี (ตรวจเมื่อ พ.ย. 2026 อาจเปลี่ยน)
- Neon Free: ไม่มีวันหมดอายุ • พื้นที่ 1 GB ต่อโปรเจกต์ • compute 100 CU-hours/เดือน • รับส่งข้อมูล 5 GB/เดือน — ระบบบีบอัดข้อมูลก่อนเก็บ (1,256 รายการ ≈ 0.12 MB ต่อการบันทึก 1 ครั้ง) จึงใช้น้อยมาก
- Render Free: 750 ชั่วโมงต่อเดือน (พอสำหรับ 1 บริการเปิดทั้งเดือน) • หลับเมื่อว่าง 15 นาที
