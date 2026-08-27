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

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const userId = db.sessions.get(token);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

export function toPublicUser(user: User) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}
