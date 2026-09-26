-- Migration 009: ฟังก์ชัน aggregate ฝั่ง Postgres ให้หน้า /admin แทนการดึงทุกแถวมาบวก/นับ
-- เองใน JS
-- เหตุผล: เดิมหน้า admin dashboard (1) นับออเดอร์แยกตามสถานะด้วย 7 query แยกกัน (2) ดึง
-- ออเดอร์ที่ completed "ทุกแถวที่เคยมีในระบบ" มาบวกยอดขายรวมใน JS (3) ดึงรีวิว "ทุกแถวที่เคย
-- มีในระบบ" มาเฉลี่ยคะแนนใน JS — ตอนข้อมูลน้อยแบบตอนนี้ไม่มีปัญหา แต่พอออเดอร์/รีวิวสะสมเยอะขึ้น
-- จะดึงข้อมูลก้อนใหญ่ขึ้นเรื่อยๆ ทุกครั้งที่แอดมินเปิดหน้านี้ ทั้งที่ต้องการแค่ตัวเลขสรุปไม่กี่ตัว
-- ย้ายการรวม/นับ/เฉลี่ยไปทำที่ Postgres แทน ส่งกลับมาแค่ผลลัพธ์สั้นๆ
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

-- จำนวนออเดอร์แยกตามสถานะ (แทนการยิง count query แยกทีละสถานะ 7 รอบ)
create or replace function admin_order_status_counts()
returns table (status text, cnt bigint)
language sql
stable
as $$
  select status, count(*) as cnt
  from orders
  group by status;
$$;

-- ยอดขายรวมทั้งหมด (เฉพาะออเดอร์ completed) — ใช้แสดง "ยอดขายรวมทั้งหมด" แบบ lifetime
create or replace function admin_gmv_total()
returns numeric
language sql
stable
as $$
  select coalesce(sum(amount), 0)
  from orders
  where status = 'completed';
$$;

-- ยอดขายรายวัน นับตั้งแต่ since เป็นต้นมา — ใช้ทำกราฟ sparkline 14 วันล่าสุด แทนการดึงออเดอร์
-- completed ทุกแถวที่เคยมีมาบัคเก็ตเองใน JS (bucket เป็นวันแบบ UTC ให้ตรงกับที่ src/lib/sparkline.ts
-- ใช้อยู่แล้ว เพราะ timestamptz ในระบบนี้เก็บเป็น UTC ล้วน)
create or replace function admin_gmv_daily(since timestamptz)
returns table (day date, total numeric)
language sql
stable
as $$
  select (completed_at at time zone 'utc')::date as day, sum(amount) as total
  from orders
  where status = 'completed' and completed_at >= since
  group by day
  order by day;
$$;

-- จำนวนรีวิวทั้งหมด + คะแนนเฉลี่ยทั้งระบบ — แทนการดึง rating ทุกแถวมาเฉลี่ยเองใน JS
create or replace function admin_review_stats()
returns table (cnt bigint, avg_rating numeric)
language sql
stable
as $$
  select count(*) as cnt, avg(rating) as avg_rating
  from reviews;
$$;
