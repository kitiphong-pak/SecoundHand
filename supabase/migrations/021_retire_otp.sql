-- Migration 021: เลิกใช้ OTP ตอนส่งมอบ (Phase 1b)
--
-- OTP เกิดมาเพื่อพิสูจน์ว่าคู่ซื้อขายเจอกันจริงก่อนระบบจะปล่อยเงินที่พักไว้ให้ผู้ขาย พอเงินไม่ได้
-- ไหลผ่านระบบ (ผู้ซื้อจ่ายสด/PromptPay ตอนเจอกัน) ขั้นนี้ก็ไม่เหลืออะไรให้ปกป้อง มันซ้ำกับการที่
-- ผู้ซื้อกด "ได้รับของแล้ว" อยู่แล้ว และในมุมผู้ใช้คือขั้นตอนที่ต้องมายืนกดหน้าร้านสะดวกซื้อเพิ่ม
--
-- ออเดอร์ที่ค้างอยู่ในขั้นนี้ตอนนี้ต้องย้ายกลับไปขั้นก่อนหน้า ไม่ใช่ปิดให้เลย เพราะ "ผู้ซื้อกดยืนยัน
-- แล้ว" กับ "ซื้อขายจบแล้ว" ไม่ใช่เรื่องเดียวกัน — ให้ผู้ซื้อเป็นคนกดปิดเองอีกครั้งด้วย flow ใหม่
-- (ถ้าปล่อยไว้เฉยๆ ออเดอร์พวกนี้จะค้างถาวร เพราะ 1b ลบปุ่มกรอก OTP ออกไปแล้ว)

update orders
set status = 'awaiting_buyer_confirmation'
where status = 'awaiting_otp_entry';

alter table orders drop column if exists otp_code;
alter table orders drop column if exists otp_expires_at;

-- ตัด awaiting_otp_entry ออกจากรายการสถานะที่ยอมรับ ส่วนสถานะเก่าตัวอื่นยังอยู่จนกว่า 1c จะย้ายข้อมูล
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (
  status in (
    'reserved', 'meetup_scheduled',
    'pending_payment', 'paid', 'awaiting_buyer_confirmation',
    'completed', 'disputed', 'cancelled'
  )
);
