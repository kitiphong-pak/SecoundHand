import { createClient } from "@supabase/supabase-js";

// เซิร์ฟเวอร์ของเราเป็นคนคุยกับ Supabase เองทั้งหมด (API routes / Server Components)
// ไม่มีโค้ดฝั่ง browser ไปคิวรีตรงๆ เลย เลยใช้ secret key (สิทธิ์แอดมิน ข้าม Row Level
// Security) ได้อย่างปลอดภัย — ตัวแอปเองเป็นคนเช็คสิทธิ์ user ในแต่ละ route อยู่แล้ว
// ห้าม import ไฟล์นี้จากไฟล์ที่มี "use client" เด็ดขาด เพราะ secret key จะหลุดไปกับ bundle
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!;

export const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false },
});
