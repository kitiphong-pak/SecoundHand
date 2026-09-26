-- Migration 012: เพิ่มคอลัมน์ระงับบัญชีผู้ใช้ ให้แอดมินมีเครื่องมือจัดการ user จริงๆ ได้บ้าง
-- เหตุผล: ก่อนหน้านี้แอดมินไม่มีทางยืนยันตัวตนผู้ใช้ (is_verified ตั้งได้แค่ตอน seed) หรือระงับ
-- บัญชีที่มีปัญหาได้เลย — เพิ่ม is_suspended ให้ระงับได้ ส่วนยืนยันตัวตนใช้คอลัมน์ is_verified
-- เดิมที่มีอยู่แล้ว แค่เพิ่มทางตั้งค่าจากหน้า /admin/users (ดู
-- src/app/api/admin/users/[id]/verify และ .../suspend)
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

alter table users add column is_suspended boolean not null default false;
