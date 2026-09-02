# แยก environment: UAT กับ PRD

เอกสารนี้บอกวิธีแยกระบบเป็นสองชุด ชุดหนึ่งไว้ทดสอบ อีกชุดไว้ใช้จริง

## ทำไมต้องแยก

ตอนนี้มีฐานข้อมูลชุดเดียว ทุกครั้งที่ทดสอบฟีเจอร์ใหม่จะไปยุ่งกับข้อมูลจริง เช่นการทดสอบ
ระบบข้อความต้องสร้างบัญชีปลอม ส่งข้อความ แล้วตามลบทีหลัง ถ้าลบไม่หมดก็ค้างอยู่ในระบบจริง

พอแยกแล้ว: ทดสอบบน UAT ได้เต็มที่ พังก็ไม่มีใครเดือดร้อน ผ่านแล้วค่อยเลื่อนขึ้น PRD

## โครงที่จะได้

| ชั้น | branch | ที่รัน | ฐานข้อมูล |
|---|---|---|---|
| UAT | `develop` | Vercel Preview | Supabase project ตัวใหม่ |
| PRD | `main` | Vercel Production | Supabase project ตัวปัจจุบัน |

โค้ดเป็นชุดเดียวกันทั้งสองชั้น ต่างกันแค่ค่า environment variable ที่ชี้ไปคนละฐานข้อมูล

---

## ส่วนที่ต้องทำเอง (ต้องใช้บัญชีของคุณ)

### 1. สร้าง Supabase project สำหรับ UAT

Supabase Dashboard → New project ตั้งชื่อให้แยกออกชัดๆ เช่น `secoundhand-uat`
เลือก region เดียวกับตัวปัจจุบันเพื่อให้ความเร็วใกล้เคียงกัน

จดค่า 3 ตัวจาก Project Settings ไว้:

- `NEXT_PUBLIC_SUPABASE_URL` — Settings → API → Project URL
- `SUPABASE_SECRET_KEY` — Settings → API → service_role key
- `DATABASE_URL` — Settings → Database → Connection string → URI

### 2. สร้างโครงสร้างฐานข้อมูลให้ UAT

รัน `supabase/schema.sql` ก่อน (ตารางตั้งต้น) แล้วค่อยให้ตัวรัน migration จัดการที่เหลือ:

```bash
DATABASE_URL="<URI ของ UAT>" npm run migrate
```

ตัวรันจะไล่ไฟล์ `002` ถึง `013` ตามลำดับให้เอง แล้วจดไว้ในตาราง `schema_migrations`
ถ้าอยากดูก่อนว่าจะรันอะไรบ้างโดยยังไม่แก้อะไร ใช้ `npm run migrate:status`

### 3. ตั้ง baseline ให้ฐานข้อมูลปัจจุบัน (PRD)

ฐานข้อมูลตัวปัจจุบันรัน migration ด้วยมือมาแล้วทั้ง 12 ไฟล์ แต่ยังไม่มีตาราง `schema_migrations`
ถ้าเผลอสั่ง `npm run migrate` ใส่มันจะพยายามรันซ้ำทั้งหมด ต้องบอกมันก่อนว่ารันไปแล้ว:

```bash
npm run migrate:baseline
```

**สั่งครั้งเดียวเท่านั้น และต้องแน่ใจว่า `DATABASE_URL` ใน `.env` ชี้ไปที่ฐานข้อมูลปัจจุบัน**
หลังจากนี้ไฟล์ใหม่ทุกไฟล์รันผ่าน `npm run migrate` ได้เลย ไม่ต้อง copy-paste อีก

### 4. เชื่อม Vercel

1. vercel.com → Add New Project → เลือก repo `SecoundHand`
2. Settings → Git → Production Branch ตั้งเป็น `main`
3. Settings → Environment Variables ใส่ค่าแยกตาม environment:

| ตัวแปร | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ของ PRD | ของ UAT |
| `SUPABASE_SECRET_KEY` | ของ PRD | ของ UAT |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ของ PRD | ของ UAT |
| `CRON_SECRET` | สุ่มขึ้นมาใหม่ | สุ่มอีกตัว |

ไม่ต้องใส่ `DATABASE_URL` บน Vercel — ตัวแอปไม่ได้ใช้ ใช้เฉพาะตอนรัน migration จากเครื่องเรา

---

## หลังตั้งเสร็จ การทำงานจะเป็นแบบนี้

```
เขียนโค้ด → push ขึ้น develop
   ↓
CI รันอัตโนมัติ (lint / typecheck / test / build)
   ↓
Vercel deploy ขึ้น Preview อัตโนมัติ  ← นี่คือ UAT
   ↓
รัน migration ใส่ UAT ถ้ามีไฟล์ใหม่:  DATABASE_URL="<UAT>" npm run migrate
   ↓
เปิด URL ของ Preview ทดสอบเอง
   ↓
ผ่านแล้ว merge develop → main
   ↓
รัน migration ใส่ PRD ก่อน:  npm run migrate
   ↓
Vercel deploy ขึ้น Production อัตโนมัติ
```

**ลำดับสำคัญ: รัน migration ก่อน deploy เสมอ** ถ้า deploy โค้ดใหม่ที่ต้องใช้ตารางที่ยังไม่มี
เว็บจะพังทันที แต่ถ้ารัน migration ก่อนแล้วโค้ดเก่ายังรันอยู่ ปกติจะไม่มีปัญหา เพราะโค้ดเก่า
แค่ไม่รู้จักตารางใหม่เฉยๆ

---

## ข้อควรรู้

**Vercel Cron ทำงานเฉพาะบน Production** ตัวจับเวลาปิดออเดอร์ใน `vercel.json` จะไม่ทำงาน
บน UAT ถ้าจะทดสอบบน UAT ให้ยิงเองด้วย `curl` พร้อมแนบ header
`Authorization: Bearer <CRON_SECRET ของ UAT>` หรือใช้ปุ่มจำลอง timeout ในหน้าออเดอร์

**ห้ามก๊อปข้อมูลจริงมาใส่ UAT ทั้งดุ้น** ข้อมูลผู้ใช้จริงเป็นข้อมูลส่วนบุคคลตาม PDPA
ถ้าจำเป็นต้องใช้ข้อมูลปริมาณมากเพื่อทดสอบ ต้องสุ่มเปลี่ยนชื่อ อีเมล เบอร์โทรให้หมดก่อน
วิธีที่ง่ายกว่าคือใช้ `npm run seed` สร้างข้อมูลปลอมขึ้นมาใหม่

**Storage bucket แยกกันโดยอัตโนมัติ** เพราะเป็นคนละ Supabase project รูปที่อัปโหลดบน UAT
จะไม่ไปโผล่บน PRD

**ถ้าจะย้อนเวอร์ชัน** Vercel เก็บ deployment เก่าไว้ทุกตัว กด Promote to Production
ตัวเก่าได้ทันที แต่ migration ย้อนไม่ได้ด้วย — นี่คือเหตุผลที่การเปลี่ยนแปลงแบบลบคอลัมน์
ควรแบ่งทำหลายรอบ (เพิ่มของใหม่ → ใช้ทั้งสองที่ → ค่อยลบของเก่ารอบถัดไป) ไม่ทำรวดเดียว
