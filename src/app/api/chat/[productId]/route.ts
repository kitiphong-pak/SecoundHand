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

  // ทำเครื่องหมายว่าอ่านแล้วเมื่อเปิดดู
  const unreadIds = messages.filter((m) => m.toUserId === user.id && !m.read).map((m) => m.id);
  if (unreadIds.length > 0) {
    await supabase.from("chat_messages").update({ read: true }).in("id", unreadIds);
    for (const m of messages) {
      if (unreadIds.includes(m.id)) m.read = true;
    }
  }

  return NextResponse.json({ messages });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

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

  const { data: row, error } = await supabase
    .from("chat_messages")
    .insert({ product_id: productId, from_user_id: user.id, to_user_id: toUserId, text })
    .select()
    .single();
  if (error || !row) return NextResponse.json({ error: "ส่งข้อความไม่สำเร็จ" }, { status: 500 });

  return NextResponse.json({ message: mapMessage(row) }, { status: 201 });
}
