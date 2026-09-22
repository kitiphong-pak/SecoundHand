import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { mapUser } from "@/lib/mappers";
import { createAuthUser, deleteAuthUser, signIn } from "@/lib/supabaseAuth";
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

  // สร้างสองที่: บัญชี + รหัสผ่านใน Supabase Auth แล้วโปรไฟล์ใน public.users ด้วย id เดียวกัน
  const created = await createAuthUser(email, password);
  if ("error" in created) {
    if (created.error === "exists") {
      return NextResponse.json({ error: "อีเมลนี้ถูกใช้งานแล้ว" }, { status: 409 });
    }
    if (created.error === "weak_password") {
      return NextResponse.json({ error: "รหัสผ่านนี้คาดเดาง่ายเกินไป กรุณาตั้งใหม่" }, { status: 400 });
    }
    return NextResponse.json({ error: "สมัครสมาชิกไม่สำเร็จ" }, { status: 500 });
  }

  const { data: row, error } = await supabase
    .from("users")
    .insert({
      id: created.userId,
      name,
      email,
      province,
      role: "user",
      is_verified: false,
    })
    .select()
    .single();
  if (error || !row) {
    // สองขั้นนี้ไม่ได้อยู่ใน transaction เดียวกัน ถ้าบันทึกโปรไฟล์พังต้องลบบัญชีใน Auth ทิ้งด้วย
    // ไม่งั้นอีเมลนี้จะติดอยู่ใน Auth ตลอดไป สมัครใหม่ก็ไม่ได้ (อีเมลซ้ำ) ล็อกอินก็ไม่ได้ (ไม่มีโปรไฟล์)
    await deleteAuthUser(created.userId);
    return NextResponse.json({ error: "สมัครสมาชิกไม่สำเร็จ" }, { status: 500 });
  }

  // สมัครเสร็จแล้วล็อกอินให้เลยเหมือนเดิม — ถ้าล็อกอินพลาด บัญชียังใช้ได้ ให้ไปล็อกอินเองทีหลัง
  await signIn(email, password);

  const user = mapUser(row);
  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "user.registered",
    targetType: "user",
    targetId: user.id,
    metadata: { name: user.name, province: user.province },
  });
  return NextResponse.json({ user }, { status: 201 });
}
