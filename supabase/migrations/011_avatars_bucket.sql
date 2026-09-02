-- Migration 011: bucket สำหรับเก็บรูปโปรไฟล์ผู้ใช้ (avatar)
-- เหตุผล: เพิ่มหน้าตั้งค่าโปรไฟล์ให้ผู้ใช้อัปโหลดรูปโปรไฟล์ของตัวเองได้ (users.avatar_url เดิมมี
-- คอลัมน์รองรับอยู่แล้วแต่ไม่เคยมีทางตั้งค่าได้จริงเลย) แยก bucket ต่างหากจาก product-images
-- เพื่อจัดการ/ทำความสะอาดแยกกันได้ในอนาคต — เป็น public bucket เหมือนกัน (โหลดรูปตรงได้โดยไม่ต้อง
-- ผ่าน RLS เหมือน product-images)
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run
-- (bucket นี้ถูกสร้างไปแล้วผ่าน Storage Admin API ตอนพัฒนา — ไฟล์นี้มีไว้บันทึกไว้เผื่อ
-- ต้องตั้งค่าฐานข้อมูลใหม่ตั้งแต่ต้น ใช้ IF NOT EXISTS กันรันซ้ำ error)

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
