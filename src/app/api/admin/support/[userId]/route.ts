import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapSupportMessage, UUID_RE } from "@/lib/mappers";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 }) };
  if (user.role !== "admin") {
    return { error: NextResponse.json({ error: "เฉพาะแอดมินเท่านั้น" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { userId } = await params;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
  }

  const { data: rows, error } = await supabase
    .from("support_messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "โหลดข้อความไม่สำเร็จ" }, { status: 500 });

  const messages = (rows ?? []).map(mapSupportMessage);

  // แอดมินเปิดอ่านแล้ว = ข้อความจากผู้ใช้ถือว่าอ่านแล้ว
  if (messages.some((m) => !m.fromAdmin && !m.read)) {
    await supabase
      .from("support_messages")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("from_admin", false)
      .eq("read", false);
    for (const m of messages) if (!m.fromAdmin) m.read = true;
  }

  return NextResponse.json({ messages });
}

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { userId } = await params;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "กรุณากรอกข้อความ" }, { status: 400 });

  const { data: targetUser } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();
  if (!targetUser) return NextResponse.json({ error: "ไม่พบผู้ใช้นี้" }, { status: 404 });

  const { data: row, error } = await supabase
    .from("support_messages")
    .insert({ user_id: userId, sender_id: auth.user!.id, from_admin: true, text })
    .select()
    .single();
  if (error || !row) return NextResponse.json({ error: "ส่งข้อความไม่สำเร็จ" }, { status: 500 });

  return NextResponse.json({ message: mapSupportMessage(row) }, { status: 201 });
}
