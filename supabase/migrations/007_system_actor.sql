-- Migration 007: บัญชี "ระบบอัตโนมัติ" สำหรับ audit log ของ action ที่ไม่มีคนกดจริง
-- เหตุผล: audit_logs.actor_id เป็น not null + FK ไปที่ users(id) เสมอ (ดู migration 003)
-- แต่การปิดออเดอร์อัตโนมัติเมื่อเลยกำหนดเวลา (ดู src/lib/orderTimeoutSweep.ts) ไม่มีผู้ใช้คนไหน
-- เป็นคนกดจริง ๆ เลยต้องมี "ผู้ใช้ระบบ" ที่มีตัวตนจริงในตาราง users ไว้อ้างอิงเป็น actor แทน
-- ใช้ UUID คงที่ (ไม่ใช่ gen_random_uuid) เพื่อให้โค้ดฝั่งแอปอ้างอิง id ตรง ๆ ได้โดยไม่ต้อง query หา
-- password_hash เป็น hash แบบสุ่มที่ไม่มีทางรู้ password จริง เข้าสู่ระบบด้วยบัญชีนี้ไม่ได้แน่นอน
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

insert into users (id, name, email, password_hash, province, role, is_verified)
values (
  '00000000-0000-0000-0000-000000000001',
  'ระบบอัตโนมัติ',
  'system@secoundhand.internal',
  '$2b$10$KoFVv3Jahi/N3dxueQaTGef2MWzaj.L983YzDWNI1mOy4jY.62Z76',
  'กรุงเทพมหานคร',
  'admin',
  true
)
on conflict (id) do nothing;
