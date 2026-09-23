import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapOrder, mapMeetupProposal } from "@/lib/mappers";
import { MEETUP_MAX_AHEAD_MS, MEETUP_PLACE_MAX_LENGTH } from "@/lib/orderFlowConfig";

// เสนอนัดเจอ — เสนอได้ทั้งสองฝ่ายและเสนอทับของเดิมได้เรื่อยๆ จนกว่าอีกฝ่ายจะกดตกลง (ต่อรองเวลา
// กันเหมือนต่อรองราคา) การ์ดจะไปโผล่ในห้องแชทของสินค้านี้ ไม่ใช่ในหน้าออเดอร์ เพราะการนัดคือ
// บทสนทนา ไม่ใช่ปุ่มเปลี่ยนสถานะ — ดู propose_meetup ใน migration 023
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const place = String(body?.place ?? "").trim();
  const meetupAtRaw = String(body?.meetupAt ?? "");
  const meetupAt = new Date(meetupAtRaw);

  if (!place) return NextResponse.json({ error: "กรุณาระบุสถานที่นัด" }, { status: 400 });
  if (place.length > MEETUP_PLACE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `สถานที่นัดยาวได้ไม่เกิน ${MEETUP_PLACE_MAX_LENGTH} ตัวอักษร` },
      { status: 400 }
    );
  }
  // เวลาไม่ใส่มาก็ได้ — คนมักตกลงสถานที่ได้ก่อนแล้วค่อยเคาะเวลาทีหลัง บังคับให้กรอกก่อนมีแต่จะได้
  // เวลามั่วๆ ที่อีกฝ่ายเชื่อ แต่ถ้าใส่มาแล้วอ่านไม่ออกถือว่าผิด ไม่ใช่ปัดทิ้งเงียบๆ กลายเป็นนัดไร้เวลา
  const hasTime = meetupAtRaw !== "";
  if (hasTime) {
    if (Number.isNaN(meetupAt.getTime())) {
      return NextResponse.json({ error: "อ่านวันและเวลานัดไม่ออก" }, { status: 400 });
    }
    if (meetupAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "เวลานัดต้องเป็นเวลาในอนาคต" }, { status: 400 });
    }
    // กันนัดไกลเกินจริง เช่นพิมพ์ปีผิดเป็น 2570 แล้วสินค้าถูกจองค้างไว้ข้ามปีโดยไม่มีใครรู้ตัว
    if (meetupAt.getTime() - Date.now() > MEETUP_MAX_AHEAD_MS) {
      return NextResponse.json({ error: "นัดล่วงหน้าได้ไม่เกิน 30 วัน" }, { status: 400 });
    }
  }

  // เช็คที่ฝั่งแอปก่อนเพื่อให้ได้ข้อความบอกเหตุผลที่ตรงจุด ส่วน propose_meetup เช็คซ้ำอีกชั้นใน
  // ธุรกรรมเดียวกับที่เขียนจริง — ด่านนี้กันคนเข้าใจผิด ด่านนั้นกันสองคำขอที่ยิงมาชนกันพอดี
  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!orderRow) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const order = mapOrder(orderRow);
  if (order.buyerId !== user.id && order.sellerId !== user.id) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์นัดในออเดอร์นี้" }, { status: 403 });
  }
  if (order.status !== "reserved" && order.status !== "meetup_scheduled") {
    return NextResponse.json({ error: "ออเดอร์นี้ไม่ได้อยู่ในขั้นตอนนัดเจอแล้ว" }, { status: 409 });
  }

  const { data, error } = await supabase.rpc("propose_meetup", {
    p_order_id: id,
    p_from_user_id: user.id,
    p_meetup_at: hasTime ? meetupAt.toISOString() : null,
    p_place: place,
  });
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !row) return NextResponse.json({ error: "เสนอนัดไม่สำเร็จ" }, { status: 500 });

  return NextResponse.json({ meetup: mapMeetupProposal(row) }, { status: 201 });
}
