-- Migration 004: เก็บชื่อผู้ทำรายการไว้ตรงๆ ใน audit_logs
-- เหตุผล: audit log ควรโชว์ว่า "ตอนนั้นชื่ออะไร" ไม่ใช่ join สดไปเอาชื่อปัจจุบันของ user
-- (ถ้า user เปลี่ยนชื่อทีหลัง ประวัติเก่าจะเพี้ยนไม่ตรงกับตอนที่เกิดเหตุการณ์จริง) แถมยังทำให้
-- ค้นหา/กรองตามชื่อผู้ทำรายการได้แบบไม่ต้อง join ตาราง users ทุกครั้งด้วย
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

alter table audit_logs add column actor_name text;

update audit_logs
set actor_name = users.name
from users
where audit_logs.actor_id = users.id;

alter table audit_logs alter column actor_name set not null;
