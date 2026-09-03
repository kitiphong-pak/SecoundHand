-- Migration 015: บันทึกค่าธรรมเนียมแพลตฟอร์มและยอดที่ผู้ขายจะได้รับ ลงในทุกออเดอร์
--
-- เหตุผล: ตอนนี้ออเดอร์เก็บแค่ amount ซึ่งเป็นยอดที่ผู้ซื้อจ่าย ไม่มีที่ไหนบอกว่าแพลตฟอร์ม
-- หักเท่าไหร่และผู้ขายได้เท่าไหร่ พอจะเริ่มต่อระบบชำระเงินจริง ตัวเลขสองอันนี้ต้องมีอยู่แล้ว
-- ตั้งแต่ตอนสร้างออเดอร์ ไม่ใช่ไปคำนวณเอาทีหลัง
--
-- ทำไมต้องเก็บ fee_rate ไว้ด้วย: อัตราค่าธรรมเนียมเปลี่ยนได้ในอนาคต ถ้าคำนวณสดทุกครั้งตอน
-- แสดงผล ออเดอร์เก่าที่ปิดไปแล้วจะโชว์ตัวเลขตามอัตราใหม่ ซึ่งผิด — ออเดอร์ต้องจำอัตราที่ใช้
-- ณ ตอนนั้นไว้ตลอดไป

alter table orders add column if not exists fee_rate numeric not null default 0;
alter table orders add column if not exists platform_fee numeric not null default 0;

-- seller_payout เป็นคอลัมน์คำนวณ (generated) ไม่ใช่คอลัมน์ที่ใครเขียนค่าเข้ามาเองได้
--
-- ทางเลือกอีกแบบคือให้แอปคำนวณแล้วส่งค่ามาเอง แล้วใส่ CHECK ว่า platform_fee + seller_payout
-- ต้องเท่ากับ amount — แต่แบบนั้นยังเปิดช่องให้ "สองแหล่งความจริง" คือแอปกับฐานข้อมูลต่างคน
-- ต่างคำนวณ แล้วเถียงกันได้เวลาปัดเศษไม่ตรงกัน
--
-- แบบนี้ยอดผู้ขายมีนิยามเดียวคือ amount - platform_fee เสมอ ไม่มีทางไม่ตรงกัน เพราะไม่มีใคร
-- เขียนมันได้เลย ฐานข้อมูลคำนวณให้เอง (stored = คำนวณครั้งเดียวตอนเขียน ไม่ใช่ทุกครั้งที่อ่าน)
-- ออเดอร์เก่าได้ค่าถูกต้องอัตโนมัติ เพราะ platform_fee ของแถวเดิมเป็น 0 ตาม default
alter table orders add column if not exists seller_payout numeric
  generated always as (amount - platform_fee) stored;

-- เหลือแค่ต้องกันค่าที่เป็นไปไม่ได้: ค่าธรรมเนียมติดลบ, ค่าธรรมเนียมเกินยอดที่ผู้ซื้อจ่าย
-- (ซึ่งจะทำให้ผู้ขายได้ยอดติดลบ) และอัตรานอกช่วง 0-100%
alter table orders add constraint orders_fee_within_amount
  check (platform_fee >= 0 and platform_fee <= amount);

alter table orders add constraint orders_fee_rate_is_a_rate
  check (fee_rate >= 0 and fee_rate <= 1);
