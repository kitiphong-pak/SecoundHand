-- Migration 008: กันขายสินค้าชิ้นเดียวกันซ้ำ (double-sale) ที่ระดับ DB
-- เหตุผล: เดิม /api/orders (สร้างออเดอร์) เช็ค product.status ใน JS ก่อนค่อยเขียน ซึ่งมีช่อง
-- ให้สองคนกดซื้อพร้อมกันเห็น status="listed" พร้อมกันทั้งคู่แล้วสร้างออเดอร์ซ้ำได้ (ตอนนี้แก้ที่
-- โค้ดแล้วด้วยการ UPDATE products แบบมีเงื่อนไข status="listed" กำกับก่อนสร้างออเดอร์เสมอ —
-- ดู src/app/api/orders/route.ts) แต่ยังเพิ่ม unique index นี้ไว้เป็นเกราะชั้นที่สองระดับ DB
-- เผื่อมี code path อื่นในอนาคตที่เผลอสร้างออเดอร์โดยไม่ผ่านการเช็คแบบ atomic นั้น
-- unique index กันไม่ให้มีมากกว่า 1 ออเดอร์ที่ "ยังไม่จบ" (ไม่ใช่ cancelled/completed) อยู่บน
-- product_id เดียวกันพร้อมกัน — ไม่กระทบ flow ขายซ้ำหลังยกเลิก/ปิดการขายแล้ว เพราะสถานะ
-- เหล่านั้นถูกยกเว้นไว้ในเงื่อนไข where
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

create unique index idx_orders_one_open_per_product
  on orders(product_id)
  where status not in ('cancelled', 'completed');
