import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// รีเฟรช session ของ Supabase Auth ก่อนทุกหน้าจะเริ่ม render
//
// ทำไมต้องมีไฟล์นี้: access token ของ Supabase อายุสั้น (ค่าเริ่มต้น 1 ชั่วโมง) พอหมดต้องเอา
// refresh token ไปแลกอันใหม่แล้ว "เขียน cookie ใหม่" แต่ Next ไม่ยอมให้ Server Component เขียน
// cookie (ดู node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md) ถ้าไม่มี
// proxy ผู้ใช้จะหลุดออกจากระบบทุกชั่วโมง เพราะไม่มีใครเขียน token ใหม่ลง cookie ให้เลย
//
// Next 16 เปลี่ยนชื่อไฟล์จาก middleware.ts เป็น proxy.ts (ดู docs/.../file-conventions/proxy.md)
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // เขียนสองที่: ลง request ด้วยเพื่อให้หน้าที่กำลังจะ render อ่านเจอ token ใหม่ทันที และลง
          // response เพื่อให้เบราว์เซอร์เก็บไว้ใช้ครั้งถัดไป — ถ้าเขียนแค่ response หน้านี้จะยังเห็น
          // token เก่าที่หมดอายุแล้ว แล้วมองว่าผู้ใช้ไม่ได้ล็อกอิน
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // header กันแคช: response ที่มี session ของคนหนึ่งต้องไม่ถูก CDN แคชไว้แล้วส่งให้อีกคน
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    }
  );

  // ต้องเรียกก่อน return เสมอ — ตรงนี้คือจุดที่ token ถูกตรวจและรีเฟรชถ้าใกล้หมดอายุ
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // ข้ามไฟล์ static และรูป — ไม่มี session ให้รีเฟรช และถ้าไม่ข้าม ทุกรูปบนหน้าจะยิงตรวจ token ซ้ำ
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
