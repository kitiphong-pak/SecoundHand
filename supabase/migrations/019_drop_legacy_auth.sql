-- Migration 019: ลบของที่เหลือจากระบบล็อกอินแบบเขียนเอง
--
-- หลัง migration 018 ล็อกอินย้ายไปใช้ Supabase Auth หมดแล้ว ตาราง sessions กับคอลัมน์
-- users.password_hash ไม่มีโค้ดส่วนไหนอ่านหรือเขียนอีก ปล่อยค้างไว้ก็มีแต่ความเสี่ยง:
-- - sessions เก็บ token เดิมแบบข้อความตรงๆ ถ้าฐานข้อมูลหลุด token พวกนี้ยังสวมรอยใครไม่ได้แล้วก็จริง
--   แต่ไม่มีเหตุผลอะไรต้องเก็บไว้
-- - password_hash ของบัญชีระบบ (migration 007) ยังค้างอยู่ในคอลัมน์นี้
--
-- ด่านกันพลาด: ถ้ายังมีผู้ใช้จริง (ไม่นับบัญชีระบบ) ที่มี hash เหลืออยู่ แปลว่ายังไม่ได้รันสคริปต์ย้ายผู้ใช้
-- เข้า Supabase Auth ให้ครบ ลบคอลัมน์ตอนนี้คือทำ hash ของคนพวกนั้นหายถาวร จะล็อกอินไม่ได้อีกเลย
-- เลยให้ migration ล้มทั้งไฟล์แทน (migration runner รันแต่ละไฟล์ใน transaction จึงไม่มีอะไรถูกลบไปครึ่งๆ)

do $$
declare
  v_unmigrated int;
begin
  select count(*) into v_unmigrated
  from users
  where password_hash is not null
    and id <> '00000000-0000-0000-0000-000000000001';

  if v_unmigrated > 0 then
    -- สคริปต์ย้ายถูกลบออกจาก repo ไปพร้อม migration นี้ ถ้าต้องใช้อีกให้เอาคืนจาก git ที่ commit d6504af
    raise exception 'ยังมีผู้ใช้ % คนที่ยังไม่ได้ย้ายเข้า Supabase Auth — รัน scripts/migrate-users-to-auth.ts (อยู่ใน git ที่ commit d6504af) ให้ครบก่อน', v_unmigrated;
  end if;
end $$;

drop table sessions;

alter table users drop column password_hash;
