import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapUser } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  if (admin.role !== "admin") return NextResponse.json({ error: "เฉพาะแอดมินเท่านั้น" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const verified = Boolean(body?.verified);

  const { data: targetRow } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (!targetRow) return NextResponse.json({ error: "ไม่พบผู้ใช้นี้" }, { status: 404 });
  const target = mapUser(targetRow);
  if (target.role === "admin") {
    return NextResponse.json({ error: "ไม่สามารถแก้ไขบัญชีแอดมินด้วยกันได้" }, { status: 403 });
  }

  const { error } = await supabase.from("users").update({ is_verified: verified }).eq("id", id);
  if (error) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });

  await logAction({
    actorId: admin.id,
    actorRole: admin.role,
    actorName: admin.name,
    action: verified ? "user.verified" : "user.unverified",
    targetType: "user",
    targetId: id,
    metadata: { name: target.name },
  });

  // ไม่ส่ง user row เต็มกลับไป (มี password_hash ติดมาด้วย) — client แค่ต้องรู้ว่าสำเร็จหรือไม่
  return NextResponse.json({ ok: true, isVerified: verified });
}
