import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mapUser } from "@/lib/mappers";
import { signIn, signOut } from "@/lib/supabaseAuth";
import { SYSTEM_USER_ID } from "@/lib/systemUser";

const INVALID = { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "กรุณากรอกอีเมลและรหัสผ่าน" }, { status: 400 });
  }

  // Supabase ตรวจรหัสผ่านและจำกัดจำนวนครั้งที่ลองผิดให้เอง — เดิมเราเทียบ bcrypt เองและไม่มีการ
  // จำกัดเลย ใครจะเดารหัสผ่านวนไปเรื่อยๆ ก็ได้
  const result = await signIn(email, password);
  if ("error" in result) {
    if (result.error === "rate_limited") {
      return NextResponse.json(
        { error: "ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" },
        { status: 429 }
      );
    }
    return NextResponse.json(INVALID, { status: 401 });
  }

  // บัญชีระบบไม่ใช่คน ไม่ควรมีใครล็อกอินเข้ามาได้เลย — ตอนนี้บัญชีนี้ไม่มีตัวตนใน Supabase Auth จึง
  // ล็อกอินไม่ได้อยู่แล้ว แต่กันไว้อีกชั้น ใช้ข้อความเดียวกับรหัสผ่านผิดเพื่อไม่บอกใบ้ว่ามีบัญชีพิเศษ
  if (result.userId === SYSTEM_USER_ID) {
    await signOut();
    return NextResponse.json(INVALID, { status: 401 });
  }

  const { data: row } = await supabase.from("users").select("*").eq("id", result.userId).maybeSingle();
  if (!row) {
    await signOut();
    return NextResponse.json(INVALID, { status: 401 });
  }
  // เช็คหลังยืนยันรหัสผ่านถูกแล้วเท่านั้น กันเดารหัสผ่านจากข้อความ error ที่ต่างกัน
  // และต้องล็อกเอาต์ทิ้ง ไม่งั้น cookie ของ session ที่เพิ่งได้มาจะค้างอยู่ในเบราว์เซอร์
  if (row.is_suspended) {
    await signOut();
    return NextResponse.json(
      { error: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" },
      { status: 403 }
    );
  }

  return NextResponse.json({ user: mapUser(row) });
}
