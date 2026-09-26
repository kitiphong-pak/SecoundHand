-- Migration 002: admin dispute resolution + reviews
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run
-- (รันแยกจาก schema.sql เดิม เพราะตารางมีอยู่แล้วในโปรเจกต์จริง)

-- เพิ่มสถานะ "cancelled" — ใช้ตอนแอดมินตัดสินข้อพิพาทให้ฝั่งผู้ซื้อ (ถือว่ายกเลิก/คืนเงิน)
-- ต่างจาก "disputed" ตรงที่ปิดเคสแล้ว ไม่ใช่แค่รอตรวจสอบ
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (
  status in (
    'pending_payment', 'paid', 'awaiting_buyer_confirmation',
    'awaiting_otp_entry', 'completed', 'disputed', 'cancelled'
  )
);

alter table orders add column if not exists cancelled_at timestamptz;

-- กันรีวิวซ้ำ: 1 คนรีวิวได้แค่ 1 ครั้งต่อออเดอร์ (ฝั่งตรงข้ามของออเดอร์เดียวกัน)
create unique index if not exists idx_reviews_order_from_user on reviews(order_id, from_user_id);
-- ใช้ตอนคำนวณคะแนนเฉลี่ยของผู้ขาย/ผู้ซื้อคนหนึ่งๆ
create index if not exists idx_reviews_to_user on reviews(to_user_id);
