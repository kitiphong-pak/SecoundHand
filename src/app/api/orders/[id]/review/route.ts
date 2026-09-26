import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder, mapReview } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const rating = Number(body?.rating);
  const comment = String(body?.comment ?? "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "กรุณาให้คะแนน 1-5 ดาว" }, { status: 400 });
  }
  if (!comment) {
    return NextResponse.json({ error: "กรุณาเขียนความคิดเห็น" }, { status: 400 });
  }

  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!orderRow) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = mapOrder(orderRow);
  if (order.buyerId !== user.id && order.sellerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
  }
  // รีวิวได้เฉพาะออเดอร์ที่ปิดการซื้อขายสำเร็จแล้วเท่านั้น (ไม่ใช่ที่ยกเลิก/มีข้อพิพาทค้าง)
  if (order.status !== "completed") {
    return NextResponse.json({ error: "รีวิวได้เฉพาะออเดอร์ที่ปิดการซื้อขายแล้ว" }, { status: 409 });
  }

  const toUserId = order.buyerId === user.id ? order.sellerId : order.buyerId;

  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("order_id", id)
    .eq("from_user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "คุณรีวิวออเดอร์นี้ไปแล้ว" }, { status: 409 });
  }

  const { data: row, error } = await supabase
    .from("reviews")
    .insert({ order_id: id, from_user_id: user.id, to_user_id: toUserId, rating, comment })
    .select()
    .single();
  if (error || !row) return NextResponse.json({ error: "ส่งรีวิวไม่สำเร็จ" }, { status: 500 });

  await logAction({
    actorId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: "review.created",
    targetType: "order",
    targetId: order.id,
    metadata: { rating },
  });

  return NextResponse.json({ review: mapReview(row) }, { status: 201 });
}
