-- Migration 006: bucket สำหรับเก็บรูปสินค้าใน Supabase Storage
-- เหตุผล: ของเดิมเก็บรูปไว้ที่ public/uploads บน disk ของ server เอง ใช้ได้แค่ตอนรันแบบ
-- persistent server (เช่น next dev หรือ VM) แต่พังทันทีบน serverless hosting (เช่น Vercel)
-- เพราะ filesystem เป็น ephemeral เขียนไฟล์ไปแล้วหายเมื่อ instance ถูก recycle
-- ย้ายมาเก็บใน Supabase Storage แทน — bucket เป็น public เพื่อให้โหลดรูปได้ตรงๆ ผ่าน public URL
-- โดยไม่ต้องผ่าน RLS (อัปโหลดยังทำผ่าน service key จาก server เหมือนเดิม เข้าถึงได้ไม่จำกัดอยู่แล้ว)
-- วิธีใช้: paste ทั้งไฟล์นี้ลงใน Supabase Dashboard > SQL Editor > New query แล้วกด Run

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;
