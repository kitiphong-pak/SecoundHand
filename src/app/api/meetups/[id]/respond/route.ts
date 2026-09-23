import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapMeetupProposal } from "@/lib/mappers";
import { logAction } from "@/lib/auditLog";

// ตอบรับ/ปฏิเสธข้อเสนอนัด — ตอบได้เฉพาะ "อีกฝ่าย" ของออเดอร์ และตอบได้ครั้งเดียว (compare-and-swap
// บน status="pending" อยู่ใน respond_meetup) คนเสนอกดยืนยันนัดให้ตัวเองไม่ได้ ไม่งั้นคำว่า
// "ตกลงนัดแล้ว" จะไม่มีความหมาย และคะแนนมาตามนัดใน Phase 2 จะปั่นได้ฟรีๆ
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const accept = Boolean(body?.accept);

  const { data, error } = await supabase.rpc("respond_meetup", {
    p_proposal_id: id,
    p_responder_id: user.id,
    p_accept: accept,
  });
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (error) return NextResponse.json({ error: "ทำรายการไม่สำเร็จ" }, { status: 500 });
  if (!row) {
    return NextResponse.json(
      { error: "ข้อเสนอนัดนี้ถูกตอบไปแล้ว หรือไม่มีสิทธิ์ตอบ" },
      { status: 409 }
    );
  }

  const meetup = mapMeetupProposal(row);
  if (accept) {
    await logAction({
      actorId: user.id,
      actorRole: user.role,
      actorName: user.name,
      action: "order.meetup_scheduled",
      targetType: "order",
      targetId: meetup.orderId,
      metadata: { meetupAt: meetup.meetupAt, place: meetup.place },
    });
  }

  return NextResponse.json({ meetup });
}
