import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const notification = db.notifications.find((n) => n.id === id && n.userId === user.id);
  if (!notification) return NextResponse.json({ error: "ไม่พบการแจ้งเตือน" }, { status: 404 });

  notification.read = true;
  return NextResponse.json({ ok: true });
}
