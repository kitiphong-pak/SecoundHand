-- Migration 018: เตรียมย้ายการยืนยันตัวตนไปใช้ Supabase Auth
--
-- รหัสผ่านย้ายไปเก็บที่ auth.users ของ Supabase แล้ว public.users.id ใช้ค่าเดียวกับ auth.users.id
-- ผู้ใช้ที่สมัครใหม่จึงไม่มี password_hash ในตารางนี้อีก ต้องปลด not null ออก
--
-- ยังไม่ลบคอลัมน์นี้กับตาราง sessions ทิ้งตอนนี้ — scripts/migrate-users-to-auth.ts ต้องอ่าน hash
-- เดิมไปนำเข้า Supabase Auth ก่อน ลบทิ้งใน migration ถัดไปหลังย้ายครบและลองล็อกอินแล้วเท่านั้น
--
-- ไม่ใส่ foreign key ไป auth.users ตรงๆ: บัญชีระบบ (migration 007) ตั้งใจให้ไม่มีตัวตนใน
-- Supabase Auth เลย จะได้ไม่มีทางล็อกอินได้ และฐานข้อมูลที่ใช้เทสใน Testcontainers ไม่มี schema auth

alter table users alter column password_hash drop not null;
