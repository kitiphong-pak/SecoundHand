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
  if (id === admin.id) {
    return NextResponse.json({ error: "ไม่สามารถระงับบัญชีตัวเองได้" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const suspended = Boolean(body?.suspended);

  const { data: targetRow } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (!targetRow) return NextResponse.json({ error: "ไม่พบผู้ใช้นี้" }, { status: 404 });
  const target = mapUser(targetRow);
  if (target.role === "admin") {
    return NextResponse.json({ error: "ไม่สามารถระงับบัญชีแอดมินด้วยกันได้" }, { status: 403 });
  }

  const { error } = await supabase.from("users").update({ is_suspended: suspended }).eq("id", id);
  if (error) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });

  // ระงับแล้วเลิก session ทั้งหมดของ user คนนี้ทันที ไม่ต้องรอให้ getCurrentUser() ครั้งถัดไป
  // ของเขามาเช็คเจอเอง (เผื่อเขากำลังใช้งานหน้าที่ไม่ยิง request ใหม่ไปอีกพักใหญ่)
  if (suspended) {
    await supabase.from("sessions").delete().eq("user_id", id);
  }

  await logAction({
    actorId: admin.id,
    actorRole: admin.role,
    actorName: admin.name,
    action: suspended ? "user.suspended" : "user.unsuspended",
    targetType: "user",
    targetId: id,
    metadata: { name: target.name },
  });

  return NextResponse.json({ ok: true, isSuspended: suspended });
}
