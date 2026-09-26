import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ทุกอย่างที่คุยกับ Supabase Auth รวมอยู่ในไฟล์นี้ไฟล์เดียว — route ต่างๆ เรียกผ่านฟังก์ชันพวกนี้
// แทนการเรียก supabase.auth.* ตรงๆ เทสจะได้ mock ที่จุดเดียว และถ้าวันหนึ่งเปลี่ยนผู้ให้บริการ
// auth อีก ก็แก้แค่ไฟล์นี้
//
// มี client สองแบบ:
// - client ผูก cookie (publishable key): ถือ session ของผู้ใช้คนที่ส่ง request มา ใช้ล็อกอิน/
//   ล็อกเอาต์/อ่านว่าใครล็อกอินอยู่ — ต้องสร้างใหม่ทุก request ห้ามแชร์ข้าม request เด็ดขาด
//   ไม่งั้น session ของคนหนึ่งอาจหลุดไปอยู่ใน response ของอีกคน
// - supabase จาก @/lib/supabase (secret key): ใช้ admin API สร้าง/ลบผู้ใช้ และตั้งรหัสผ่าน
//   ฝั่งเซิร์ฟเวอร์เท่านั้น

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createAuthClient() {
  const store = await cookies();
  return createServerClient(url(), publishableKey(), {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        // Server Component เขียน cookie ไม่ได้ (Next อนุญาตแค่ใน Route Handler / Server Function)
        // จะ error ตรงนี้เวลา token ใกล้หมดอายุแล้ว getCurrentUser() ถูกเรียกจากหน้าเว็บ — ไม่เป็นไร
        // เพราะ src/proxy.ts รีเฟรช token ให้แล้วตั้งแต่ก่อนหน้าจะเริ่ม render
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options);
        } catch {
          // เงียบไว้ ดูเหตุผลด้านบน
        }
      },
    },
  });
}

/**
 * id ของผู้ใช้ที่ล็อกอินอยู่ใน request นี้ หรือ null
 *
 * ใช้ getClaims() ไม่ใช่ getSession(): getSession() แค่อ่าน cookie มาเชื่อตรงๆ ซึ่งใครจะแก้ cookie
 * เองก็ได้ ส่วน getClaims() ตรวจลายเซ็นของ JWT ก่อน (โปรเจกต์นี้ใช้คีย์ ES256 เลยตรวจในเครื่อง
 * ได้เลย ไม่ต้องยิงไปถาม Supabase ทุก request)
 */
export async function getSessionUserId(): Promise<string | null> {
  const client = await createAuthClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

export type SignInResult = { userId: string } | { error: "invalid" | "rate_limited" };

/** ล็อกอินแล้วเขียน session ลง cookie ของ response — เรียกได้จาก Route Handler เท่านั้น */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const client = await createAuthClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error?.code === "over_request_rate_limit" || error?.status === 429) return { error: "rate_limited" };
  if (error || !data.user) return { error: "invalid" };
  return { userId: data.user.id };
}

/**
 * ล็อกเอาต์เฉพาะเครื่องนี้ (scope: "local") — ค่าเริ่มต้นของ Supabase คือ "global" ซึ่งเตะออก
 * ทุกเครื่องที่ล็อกอินไว้ ไม่ใช่สิ่งที่คนกดปุ่มออกจากระบบบนมือถือตัวเองคาดหวัง
 */
export async function signOut(): Promise<void> {
  const client = await createAuthClient();
  await client.auth.signOut({ scope: "local" });
}

export type CreateAuthUserResult =
  | { userId: string }
  | { error: "exists" | "weak_password" | "failed" };

/**
 * สร้างบัญชีใน Supabase Auth ผ่าน admin API และถือว่ายืนยันอีเมลแล้ว
 *
 * ไม่ใช้ signUp() ของฝั่งผู้ใช้ เพราะถ้าโปรเจกต์เปิด "Confirm email" ไว้ (ค่าเริ่มต้นของ Supabase)
 * สมัครเสร็จจะล็อกอินไม่ได้จนกว่าจะกดลิงก์ในอีเมล — และ SMTP ตั้งต้นของ Supabase ส่งได้เฉพาะอีเมล
 * ของสมาชิกทีมโปรเจกต์เท่านั้น ผู้ใช้จริงจะไม่ได้รับอีเมลเลย การยืนยันอีเมลค่อยเปิดทีหลังตอนมี
 * SMTP ของตัวเอง (อยู่ใน docs/backlog.md)
 */
export async function createAuthUser(email: string, password: string): Promise<CreateAuthUserResult> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  // แยกจาก error.code ไม่ใช่ status — weak_password ก็ตอบ 422 เหมือนอีเมลซ้ำ ถ้าดูแค่ status
  // จะบอกผู้ใช้ว่า "อีเมลถูกใช้แล้ว" ทั้งที่จริงรหัสผ่านไม่ผ่านเกณฑ์ของ Supabase
  if (error?.code === "email_exists" || error?.code === "user_already_exists") return { error: "exists" };
  if (error?.code === "weak_password") return { error: "weak_password" };
  if (error || !data.user) return { error: "failed" };
  return { userId: data.user.id };
}

export async function deleteAuthUser(userId: string): Promise<void> {
  await supabase.auth.admin.deleteUser(userId);
}

/**
 * เช็คว่ารหัสผ่านถูกไหม โดยไม่แตะ session ของผู้ใช้คนนี้
 *
 * ใช้ client ชั่วคราวที่ไม่ผูก cookie — ถ้าใช้ client ปกติ การล็อกอินเพื่อเช็ครหัสจะเขียน session
 * ใหม่ทับของเดิมใน cookie ไปด้วย เสร็จแล้วล็อกเอาต์ session ชั่วคราวนั้นทิ้งทันที ไม่ปล่อยค้างไว้
 * ที่ฝั่ง Supabase
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const client = createClient(url(), publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) return false;
  await client.auth.signOut({ scope: "local" });
  return true;
}

export async function setPassword(userId: string, password: string): Promise<boolean> {
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  return !error;
}
