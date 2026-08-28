-- Migration 005: เปิด Row Level Security (RLS) ให้ทุกตาราง
-- เหตุผล: แอปนี้คิวรี Supabase ด้วย SUPABASE_SECRET_KEY (service_role) จาก server เท่านั้น
-- (ดู src/lib/supabase.ts) ซึ่ง role นี้มีสิทธิ์ BYPASSRLS ติดตัวอยู่แล้วโดย default ของ Supabase
-- ดังนั้นการเปิด RLS ตรงนี้จะไม่กระทบการทำงานของแอปเลยแม้แต่น้อย — แต่จะเปลี่ยนพฤติกรรมของ
-- anon/publishable key จาก "อ่าน/เขียนได้ทุกแถวของทุกตาราง" (ค่า default ตอนไม่เปิด RLS) ให้กลายเป็น
-- "อ่าน/เขียนอะไรไม่ได้เลย" (ค่า default ของ RLS ที่เปิดแล้วแต่ยังไม่มี policy) ซึ่งเป็นค่าเริ่มต้นที่
-- ปลอดภัยกว่ามาก เผื่อวันไหนมีโค้ดฝั่ง browser เผลอหลุด/ใช้ publishable key ไปคิวรีตรง หรือ key
-- รั่วออกไป จะได้ไม่เห็นข้อมูลของคนอื่นทั้งระบบทันที
--
-- ถ้าในอนาคตอยากให้ browser คิวรีตรงด้วย publishable key (เช่น realtime subscription) ต้องเขียน
-- policy เฉพาะให้ตารางที่ต้องการตอนนั้น ไม่ใช่เปิดใช้ policy กว้างๆ แบบ "true" ทุกตาราง
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

alter table users enable row level security;
alter table sessions enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table chat_messages enable row level security;
alter table reviews enable row level security;
alter table audit_logs enable row level security;
