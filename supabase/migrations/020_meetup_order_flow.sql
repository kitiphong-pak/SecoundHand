-- Migration 020: เตรียมโครงสร้างสำหรับ flow ออเดอร์แบบนัดเจอ (Phase 1a)
--
-- flow ใหม่เลิกใช้การชำระเงินจำลองกับ OTP — ผู้ซื้อจ่ายเงินสด/PromptPay ตอนเจอกัน ออเดอร์จึงเหลือ
-- แค่ "จองแล้ว → (นัดแล้ว) → ซื้อขายสำเร็จ / ยกเลิก" ไฟล์นี้เพิ่มเฉพาะคอลัมน์กับสถานะใหม่เท่านั้น
-- ยังไม่แตะข้อมูลเดิมและยังไม่ตัดสถานะเก่าทิ้ง เพราะโค้ดที่ใช้สถานะเก่ายังรันอยู่จนกว่าจะถึง 1b/1c
-- (แยกเป็นขั้นๆ เพื่อให้ deploy ทีละ commit ได้โดยระบบไม่พังกลางทาง)
--
-- เหตุผลที่เก็บ "เหตุผลการยกเลิก" เป็นคอลัมน์ แทนที่จะเพิ่มสถานะปิดใหม่ๆ เช่น expired/no_show:
-- index กันขายซ้ำใน migration 008 เขียนว่า `where status not in ('cancelled','completed')` ถ้ามี
-- สถานะปิดตัวใหม่ที่ลืมใส่ใน index นั้น ออเดอร์ที่ปิดแล้วจะยังล็อกสินค้าไว้ ขายต่อไม่ได้อีกเลย

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (
  status in (
    -- สถานะใหม่
    'reserved', 'meetup_scheduled',
    -- สถานะเดิม ยังต้องรับไว้จนกว่า 1c จะย้ายข้อมูลเก่าและตัดออก
    'pending_payment', 'paid', 'awaiting_buyer_confirmation', 'awaiting_otp_entry',
    -- สถานะปิด ใช้ร่วมกันทั้งสอง flow
    'completed', 'disputed', 'cancelled'
  )
);

-- นัดเจอ: ฝ่ายหนึ่งเสนอ อีกฝ่ายกดยืนยัน (ไม่บังคับ — ปิดดีลได้โดยไม่ต้องนัดในแอป)
-- meetup_at ที่มีค่า + meetup_confirmed_at ที่มีค่า = นัดที่ตกลงกันแล้ว ใช้เป็นฐานของคะแนน
-- "มาตามนัด" ใน Phase 2 ส่วนออเดอร์ที่ไม่มีการนัดในแอปจะไม่ถูกนับคะแนนเลย
alter table orders add column if not exists meetup_at timestamptz;
alter table orders add column if not exists meetup_place text;
alter table orders add column if not exists meetup_proposed_by uuid references users(id) on delete set null;
alter table orders add column if not exists meetup_confirmed_at timestamptz;

-- ปิดดีลต้องกดทั้งสองฝ่าย (buyer_confirmed_at มีอยู่แล้วจาก flow เดิม ใช้ต่อได้เลย)
alter table orders add column if not exists seller_confirmed_at timestamptz;

-- ใครยกเลิกและเพราะอะไร — ข้อมูลชุดนี้คือวัตถุดิบของคะแนน "มาตามนัด" ใน Phase 2
alter table orders add column if not exists cancelled_by uuid references users(id) on delete set null;
alter table orders add column if not exists cancel_reason text;
alter table orders drop constraint if exists orders_cancel_reason_check;
alter table orders add constraint orders_cancel_reason_check check (
  cancel_reason is null or cancel_reason in (
    'expired',        -- ไม่มีใครขยับจนหมดเวลา ระบบยกเลิกให้
    'buyer_cancelled',
    'seller_cancelled',
    'late_cancel',    -- ยกเลิกกระชั้นชิดก่อนเวลานัด
    'no_show_buyer',  -- (Phase 2)
    'no_show_seller', -- (Phase 2)
    'item_mismatch',  -- ของไม่ตรงกับที่บอกไว้
    'admin'           -- แอดมินตัดสิน (รวมข้อพิพาทเก่าที่ย้ายมา)
  )
);

-- ใช้ตอนกวาดออเดอร์ที่หมดเวลา — คิวรีหลักคือ "ออเดอร์ที่ยังไม่จบ เรียงตามเวลานัด/เวลาสร้าง"
create index if not exists idx_orders_open_meetup on orders(meetup_at)
  where status not in ('completed', 'cancelled', 'disputed');
