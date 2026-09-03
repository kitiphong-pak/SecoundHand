import { NextResponse } from "next/server";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapUser } from "@/lib/mappers";
import { isOwnedImageUrl } from "@/lib/storage";
import { PROVINCES, type Province } from "@/lib/provinces";
import { logAction } from "@/lib/auditLog";

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const province = String(body?.province ?? "") as Province;
  const avatarUrl = body?.avatarUrl != null ? String(body.avatarUrl) : undefined;

  if (!name) return NextResponse.json({ error: "กรุณากรอกชื่อ" }, { status: 400 });
  if (!PROVINCES.includes(province)) {
    return NextResponse.json({ error: "กรุณาเลือกจังหวัดให้ถูกต้อง" }, { status: 400 });
  }
  // เช็คว่า URL รูปที่ส่งมาอัปโหลดผ่าน /api/upload ของเราเองจริง ไม่ใช่ URL ภายนอกที่ client ยัดมาเอง
  if (avatarUrl && !isOwnedImageUrl(avatarUrl, "avatar")) {
    return NextResponse.json({ error: "รูปโปรไฟล์ไม่ถูกต้อง" }, { status: 400 });
  }

  const update: Record<string, unknown> = { name, province };
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl;

  const { data: updated, error } = await supabase
    .from("users")
    .update(update)
    .eq("id", user.id)
    .select()
    .single();
  if (error || !updated) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });

  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: name,
    action: "user.profile_updated",
    targetType: "user",
    targetId: user.id,
  });

  return NextResponse.json({ user: toPublicUser(mapUser(updated)) });
}
