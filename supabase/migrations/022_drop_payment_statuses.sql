-- Migration 022: เลิกใช้การชำระเงินจำลองและข้อพิพาท (Phase 1c)
--
-- flow ใหม่: ผู้ซื้อกดจอง → เจอกัน จ่ายเงินสด/PromptPay กันเอง → กดยืนยันว่าซื้อขายจบ
-- ระบบไม่ได้ถือเงินของใคร สถานะ pending_payment/paid จึงไม่มีความหมายอีกต่อไป
--
-- ส่วน disputed ถูกออกแบบมาเพื่อให้แอดมินตัดสินว่าจะ "คืนเงิน" หรือ "ปล่อยเงิน" ให้ใคร พอไม่มีเงิน
-- อยู่ในระบบก็ไม่มีอะไรให้ตัดสิน เรื่องร้องเรียนย้ายไปหน้าติดต่อผู้ดูแลแทน (support_messages)
--
-- ย้ายข้อมูลเดิม:
-- - pending_payment / paid → reserved  (ยังไม่เคยมีเงินไหลผ่านระบบจริงอยู่แล้ว จองไว้เฉยๆ)
-- - disputed → cancelled + เหตุผล 'admin' (ปิดเคสค้างทิ้ง ผู้ใช้เปิดเรื่องใหม่ผ่านหน้าติดต่อได้)
-- awaiting_buyer_confirmation ยังอยู่ต่อ = ผู้ขายกดส่งมอบแล้ว รอผู้ซื้อกดยืนยันปิดดีล

update orders set status = 'reserved' where status in ('pending_payment', 'paid');

update orders
set status = 'cancelled',
    cancel_reason = 'admin',
    cancelled_at = coalesce(cancelled_at, now())
where status = 'disputed';

-- ตัดสถานะเก่าออกให้หมด เหลือเฉพาะของ flow ใหม่ — ฐานข้อมูลจะเป็นด่านสุดท้ายที่กันไม่ให้โค้ด
-- ที่หลงเหลือ (หรือที่เขียนใหม่ผิด) เขียนสถานะที่ไม่มีอยู่จริงลงไปได้อีก
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (
  status in ('reserved', 'meetup_scheduled', 'awaiting_buyer_confirmation', 'completed', 'cancelled')
);
