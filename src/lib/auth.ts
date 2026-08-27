import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import type { User } from "@/types";

const SESSION_COOKIE = "session_token";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 วัน

export async function createSession(userId: string) {
  const token = randomBytes(24).toString("hex");
  getDb().sessions.set(token, userId);
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
  if (token) getDb().sessions.delete(token);
  store.delete(SESSION_COOKIE);
}

export function toPublicUser(user: User) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

export type PublicUser = ReturnType<typeof toPublicUser>;

// คืนค่าแบบไม่มี passwordHash เสมอ — เกือบทุกที่ที่เรียก getCurrentUser() เอาไปใช้แสดงผล/เช็คสิทธิ์
// เท่านั้น ไม่มีที่ไหนต้องใช้ hash จริงๆ เลย (login/register เทียบรหัสผ่านตรงจาก db.users เอง
// ไม่ผ่านฟังก์ชันนี้) ถ้าคืน full User ออกไปมีความเสี่ยงสูงมากที่ hash จะหลุดไปกับ props ของ
// client component (เคยเกิดขึ้นจริงตอนส่ง user ทั้งก้อนเข้า Header ที่เป็น "use client")
export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const userId = db.sessions.get(token);
  if (!userId) return null;
  const user = db.users.find((u) => u.id === userId);
  return user ? toPublicUser(user) : null;
}
