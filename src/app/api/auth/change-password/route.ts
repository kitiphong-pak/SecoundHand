import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setPassword, verifyPassword } from "@/lib/supabaseAuth";
import { logAction } from "@/lib/auditLog";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบ" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร" }, { status: 400 });
  }

  // ต้องยืนยันรหัสเดิมก่อนเสมอ แม้จะล็อกอินอยู่แล้ว — ถ้าใครหยิบเครื่องที่ล็อกอินค้างไว้ไปได้
  // จะได้เปลี่ยนรหัสผ่านยึดบัญชีไปไม่ได้
  if (!(await verifyPassword(user.email, currentPassword))) {
    return NextResponse.json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }, { status: 401 });
  }

  if (!(await setPassword(user.id, newPassword))) {
    return NextResponse.json({ error: "เปลี่ยนรหัสผ่านไม่สำเร็จ" }, { status: 500 });
  }

  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "user.password_changed",
    targetType: "user",
    targetId: user.id,
  });

  return NextResponse.json({ ok: true });
}
