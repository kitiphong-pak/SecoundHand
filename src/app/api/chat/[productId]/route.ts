import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapMessage, UUID_RE } from "@/lib/mappers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { productId } = await params;
  const url = new URL(req.url);
  const withUserId = url.searchParams.get("with");
  // เช็ครูปแบบ UUID ก่อนเอาไปต่อสตริงใน .or() — ค่านี้มาจาก query param ที่ client ควบคุมได้เอง
  if (!withUserId || !UUID_RE.test(withUserId)) {
    return NextResponse.json({ error: "ระบุคู่สนทนา" }, { status: 400 });
  }

  const { data: rows, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("product_id", productId)
    .or(
      `and(from_user_id.eq.${user.id},to_user_id.eq.${withUserId}),and(from_user_id.eq.${withUserId},to_user_id.eq.${user.id})`
    )
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "โหลดข้อความไม่สำเร็จ" }, { status: 500 });

  const messages = (rows ?? []).map(mapMessage);

  // ทำเครื่องหมายว่าอ่านแล้วเมื่อเปิดดู — ผ่าน RPC เดียวที่อัปเดตทั้งข้อความและตัวนับ unread
  // ของห้องแชทแบบ atomic ในธุรกรรมเดียว (ดู mark_thread_read ใน
  // supabase/migrations/010_chat_threads.sql) แทนการ update ทีละ query แยกจาก client แบบเดิม
  const threadId = (rows?.[0] as { thread_id?: string } | undefined)?.thread_id;
  const hasUnread = messages.some((m) => m.toUserId === user.id && !m.read);
  if (threadId && hasUnread) {
    await supabase.rpc("mark_thread_read", { p_thread_id: threadId, p_reader_id: user.id });
    for (const m of messages) if (m.toUserId === user.id) m.read = true;
  }

  return NextResponse.json({ messages });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  if (user.role === "admin") {
    return NextResponse.json({ error: "แอดมินไม่สามารถแชทซื้อขายได้" }, { status: 403 });
  }

  const { productId } = await params;
  const body = await req.json().catch(() => null);
  const toUserId = String(body?.toUserId ?? "");
  const text = String(body?.text ?? "").trim();
  if (!toUserId || !UUID_RE.test(toUserId) || !text) {
    return NextResponse.json({ error: "กรุณากรอกข้อความ" }, { status: 400 });
  }

  const { data: productRow } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (!productRow) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });

  // ส่งผ่าน RPC เดียว — หา/สร้างห้องแชทกับ insert ข้อความจริงเกิดขึ้นในธุรกรรมเดียวกันแบบ
  // atomic กันสองข้อความที่ส่งไล่เลี่ยกันมากแข่งกันอัปเดตตัวนับ unread ของห้องจนนับพลาด (ดู
  // send_chat_message ใน supabase/migrations/010_chat_threads.sql)
  const { data, error } = await supabase.rpc("send_chat_message", {
    p_product_id: productId,
    p_from_user_id: user.id,
    p_to_user_id: toUserId,
    p_text: text,
  });
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !row) return NextResponse.json({ error: "ส่งข้อความไม่สำเร็จ" }, { status: 500 });

  return NextResponse.json({ message: mapMessage(row) }, { status: 201 });
}
