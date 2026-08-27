import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, nextId } from "@/lib/db";
import { notifyMessage } from "@/lib/notify";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const { productId } = await params;
  const url = new URL(req.url);
  const withUserId = url.searchParams.get("with");
  if (!withUserId) return NextResponse.json({ error: "ระบุคู่สนทนา" }, { status: 400 });

  const db = getDb();
  const messages = db.messages
    .filter(
      (m) =>
        m.productId === productId &&
        ((m.fromUserId === user.id && m.toUserId === withUserId) ||
          (m.fromUserId === withUserId && m.toUserId === user.id))
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // ทำเครื่องหมายว่าอ่านแล้วเมื่อเปิดดู
  messages.forEach((m) => {
    if (m.toUserId === user.id) m.read = true;
  });

  // เข้ามาดูแชทนี้ตรงๆ (ไม่ได้กดผ่านกระดิ่งแจ้งเตือน) ก็ต้องเคลียร์แจ้งเตือนของเธรดนี้ด้วย
  // เหมือนกัน กันมันค้างเป็นยังไม่อ่านทั้งที่จริงเห็นข้อความแล้ว
  const threadLink = `/chat/${productId}?with=${withUserId}`;
  db.notifications
    .filter((n) => n.userId === user.id && n.type === "message" && n.link === threadLink)
    .forEach((n) => { n.read = true; });

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
  if (!toUserId || !text) {
    return NextResponse.json({ error: "กรุณากรอกข้อความ" }, { status: 400 });
  }

  const db = getDb();
  const product = db.products.find((p) => p.id === productId);
  if (!product) return NextResponse.json({ error: "ไม่พบสินค้านี้" }, { status: 404 });

  const message = {
    id: nextId("m"),
    productId,
    fromUserId: user.id,
    toUserId,
    text,
    createdAt: new Date().toISOString(),
    read: false,
  };
  db.messages.push(message);

  notifyMessage(
    toUserId,
    `ข้อความใหม่จาก ${user.name}`,
    text.length > 60 ? `${text.slice(0, 60)}...` : text,
    `/chat/${productId}?with=${user.id}`
  );

  return NextResponse.json({ message }, { status: 201 });
}
