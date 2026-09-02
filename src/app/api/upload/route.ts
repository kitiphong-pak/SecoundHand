import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveImage, type ImageKind } from "@/lib/storage";

const MAX_DATA_URL_CHARS = 3_000_000; // ~2.2MB หลัง decode — กันไฟล์ที่ client ไม่ได้บีบอัดมา

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const dataUrl = String(body?.image ?? "");
  const kind: ImageKind = body?.kind === "avatar" ? "avatar" : "product";
  if (!dataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "ไฟล์รูปภาพไม่ถูกต้อง" }, { status: 400 });
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    return NextResponse.json({ error: "ไฟล์รูปภาพมีขนาดใหญ่เกินไป" }, { status: 400 });
  }

  try {
    const url = await saveImage(dataUrl, kind);
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "อัปโหลดรูปภาพไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
