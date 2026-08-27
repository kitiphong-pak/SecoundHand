import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { supabase } from "@/lib/supabase";
import { mapUser } from "@/lib/mappers";
import type { User } from "@/types";

const SESSION_COOKIE = "session_token";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 วัน

export async function createSession(userId: string) {
  const token = randomBytes(24).toString("hex");
  const { error } = await supabase.from("sessions").insert({ token, user_id: userId });
  if (error) throw error;

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await supabase.from("sessions").delete().eq("token", token);
  store.delete(SESSION_COOKIE);
}

export function toPublicUser(user: User) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

export type PublicUser = ReturnType<typeof toPublicUser>;

// คืนค่าแบบไม่มี passwordHash เสมอ — เกือบทุกที่ที่เรียก getCurrentUser() เอาไปใช้แสดงผล/เช็คสิทธิ์
// เท่านั้น ไม่มีที่ไหนต้องใช้ hash จริงๆ เลย (login/register เทียบรหัสผ่านตรงจาก Supabase เอง
// ไม่ผ่านฟังก์ชันนี้) ถ้าคืน full User ออกไปมีความเสี่ยงสูงมากที่ hash จะหลุดไปกับ props ของ
// client component (เคยเกิดขึ้นจริงตอนส่ง user ทั้งก้อนเข้า Header ที่เป็น "use client")
export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("user_id")
    .eq("token", token)
    .maybeSingle();
  if (!session) return null;

  const { data: userRow } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.user_id)
    .maybeSingle();
  if (!userRow) return null;

  return toPublicUser(mapUser(userRow));
}
