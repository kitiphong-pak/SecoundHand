import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb, nextId } from "@/lib/db";
import { createSession, toPublicUser } from "@/lib/auth";
import { PROVINCES, type Province } from "@/lib/provinces";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const province = String(body?.province ?? "") as Province;

  if (!name || !email || !password || !province) {
    return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบทุกช่อง" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "รูปแบบอีเมลไม่ถูกต้อง" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, { status: 400 });
  }
  if (!PROVINCES.includes(province)) {
    return NextResponse.json({ error: "กรุณาเลือกจังหวัดให้ถูกต้อง" }, { status: 400 });
  }

  const db = getDb();
  if (db.users.some((u) => u.email === email)) {
    return NextResponse.json({ error: "อีเมลนี้ถูกใช้งานแล้ว" }, { status: 409 });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = {
    id: nextId("u"),
    name,
    email,
    passwordHash,
    province,
    role: "user" as const,
    isVerified: false,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  await createSession(user.id);

  return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
}
