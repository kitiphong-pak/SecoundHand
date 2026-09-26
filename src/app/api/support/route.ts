import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapSupportMessage } from "@/lib/mappers";

// ห้องสนทนากับทีมผู้ดูแลของ "ฉัน" — ผู้ใช้หนึ่งคนมีได้ห้องเดียว (ระบุด้วย user_id ตัวเอง)
// ต่างจากแชทซื้อขายที่ผูกกับสินค้าและคู่สนทนา ดู supabase/migrations/013_support_messages.sql
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("support_messages")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "โหลดข้อความไม่สำเร็จ" }, { status: 500 });

  const messages = (rows ?? []).map(mapSupportMessage);

  // เปิดอ่านแล้ว = ข้อความจากแอดมินถือว่าอ่านแล้ว
  if (messages.some((m) => m.fromAdmin && !m.read)) {
    await supabase
      .from("support_messages")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("from_admin", true)
      .eq("read", false);
    for (const m of messages) if (m.fromAdmin) m.read = true;
  }

  return NextResponse.json({ messages });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  if (user.role === "admin") {
    // แอดมินตอบผ่าน /api/admin/support/[userId] แทน ไม่ใช่ช่องทางนี้
    return NextResponse.json({ error: "แอดมินตอบผ่านหน้าผู้ดูแลระบบ" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "กรุณากรอกข้อความ" }, { status: 400 });

  const { data: row, error } = await supabase
    .from("support_messages")
    .insert({ user_id: user.id, sender_id: user.id, from_admin: false, text })
    .select()
    .single();
  if (error || !row) return NextResponse.json({ error: "ส่งข้อความไม่สำเร็จ" }, { status: 500 });

  return NextResponse.json({ message: mapSupportMessage(row) }, { status: 201 });
}
