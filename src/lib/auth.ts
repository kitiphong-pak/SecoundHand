import { supabase } from "@/lib/supabase";
import { mapUser } from "@/lib/mappers";
import { getSessionUserId, signOut } from "@/lib/supabaseAuth";
import { SYSTEM_USER_ID } from "@/lib/systemUser";
import type { User } from "@/types";

// รหัสผ่านและ session ย้ายไปอยู่ใน Supabase Auth แล้ว (ดู src/lib/supabaseAuth.ts) — ไฟล์นี้เหลือแค่
// หน้าที่เดียว: แปลง "session ที่ Supabase ยืนยันแล้ว" ให้เป็นผู้ใช้ของแอปจาก public.users
//
// User ไม่มีรหัสผ่านติดมาแล้ว ส่งเข้า client component ได้ทั้งก้อน ชื่อ PublicUser เก็บไว้เพื่อให้
// ไฟล์อื่นที่ import อยู่ไม่ต้องแก้
export type PublicUser = User;

export async function getCurrentUser(): Promise<PublicUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  // บัญชีระบบไม่มีตัวตนใน Supabase Auth อยู่แล้ว ทางปกติไม่มีทางได้ id นี้มา — กันไว้อีกชั้น
  // เผื่อวันหนึ่งมีคนสร้างบัญชีใน Auth ด้วย id นี้ผิดพลาด แล้วได้สิทธิ์แอดมินของระบบไปทั้งชุด
  if (userId === SYSTEM_USER_ID) return null;

  const { data: userRow } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  // มีบัญชีใน Auth แต่ไม่มีโปรไฟล์ในแอป — เช่นสมัครแล้วบันทึกโปรไฟล์ไม่สำเร็จ ถือว่ายังไม่ได้ล็อกอิน
  if (!userRow) return null;

  // เช็คทุก request ไม่ใช่แค่ตอนล็อกอิน — แอดมินกดระงับแล้วต้องมีผลทันที ไม่ใช่รอ token หมดอายุ
  // signOut ล้าง cookie ได้เฉพาะตอนถูกเรียกจาก Route Handler ถ้าเป็นหน้าเว็บจะล้างไม่ได้ (ดู
  // supabaseAuth.ts) แต่ไม่เป็นไร เพราะทุก request ถัดไปก็จะมาตกที่บรรทัดนี้และได้ null อยู่ดี
  if (userRow.is_suspended) {
    await signOut();
    return null;
  }

  return mapUser(userRow);
}
