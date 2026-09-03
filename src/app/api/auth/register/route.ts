import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { mapUser } from "@/lib/mappers";
import { createSession, toPublicUser } from "@/lib/auth";
import { PROVINCES, type Province } from "@/lib/provinces";
import { logAction } from "@/lib/auditLog";

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

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "อีเมลนี้ถูกใช้งานแล้ว" }, { status: 409 });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const { data: row, error } = await supabase
    .from("users")
    .insert({
      name,
      email,
      password_hash: passwordHash,
      province,
      role: "user",
      is_verified: false,
    })
    .select()
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "สมัครสมาชิกไม่สำเร็จ" }, { status: 500 });
  }

  const user = mapUser(row);
  await createSession(user.id);
  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "user.registered",
    targetType: "user",
    targetId: user.id,
    metadata: { name: user.name, province: user.province },
  });
  return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
}
