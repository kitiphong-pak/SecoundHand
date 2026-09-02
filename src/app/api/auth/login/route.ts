import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { mapUser } from "@/lib/mappers";
import { createSession, toPublicUser } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "กรุณากรอกอีเมลและรหัสผ่าน" }, { status: 400 });
  }

  const { data: row } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return NextResponse.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  // เช็คหลังยืนยันรหัสผ่านถูกแล้วเท่านั้น กันเดารหัสผ่านจากข้อความ error ที่ต่างกัน
  if (row.is_suspended) {
    return NextResponse.json({ error: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" }, { status: 403 });
  }

  const user = mapUser(row);
  await createSession(user.id);
  return NextResponse.json({ user: toPublicUser(user) });
}
