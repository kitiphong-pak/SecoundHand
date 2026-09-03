import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { mapUser } from "@/lib/mappers";
import { createSession, toPublicUser } from "@/lib/auth";
import { SYSTEM_USER_ID } from "@/lib/systemUser";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "กรุณากรอกอีเมลและรหัสผ่าน" }, { status: 400 });
  }

  const { data: row } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  // บัญชีระบบไม่ใช่คน จึงไม่ควรมีใครล็อกอินเข้ามาได้เลย — ปฏิเสธที่ชั้นนี้ตรงๆ ไม่ฝากความ
  // ปลอดภัยไว้กับการที่ไม่มีใครรู้รหัสผ่านของมัน เพราะ password_hash ตัวนั้นอยู่ในไฟล์
  // migration ที่เปิดเผยบน GitHub ถ้าวันหนึ่งมีคนแครกได้ก็จะได้สิทธิ์แอดมินบนระบบจริงทันที
  // ใช้ข้อความ error เดียวกับกรณีรหัสผ่านผิด จะได้ไม่บอกใบ้ว่าอีเมลนี้มีอยู่จริงและพิเศษ
  if (!row || row.id === SYSTEM_USER_ID || !bcrypt.compareSync(password, row.password_hash)) {
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
