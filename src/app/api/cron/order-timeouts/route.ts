import { NextResponse } from "next/server";
import { processOrderTimeouts } from "@/lib/orderTimeoutSweep";

// เรียกโดย scheduler ภายนอกเท่านั้น (Vercel Cron, GitHub Actions, cron-job.org ฯลฯ) ไม่ใช่
// route ที่ผู้ใช้เรียกเอง เลยยืนยันตัวตนด้วย secret แทน session cookie — Vercel Cron ส่ง GET
// request มาเอง (แนบ Authorization: Bearer $CRON_SECRET ให้อัตโนมัติถ้าตั้ง env นี้ไว้) ส่วน
// scheduler อื่นจะยิงมาด้วย method ไหนก็ได้ ตัว handler เลยรองรับทั้ง GET และ POST เหมือนกัน
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await processOrderTimeouts();
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
