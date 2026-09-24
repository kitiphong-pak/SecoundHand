import { describe, it, expect } from "vitest";
import { config } from "./proxy";

// proxy.ts รันก่อนทุกคำขอที่ตรงกับ matcher ซึ่งแปลว่ามันแทรกตัวเองเข้าไปในเส้นทางที่ไม่ได้ตั้งใจได้ง่ายมาก
// และตอนพังจะไม่มี error ให้เห็น มีแต่ "หน้าเว็บค้าง" — เคสจริงที่เจอมาแล้วคือ /_next/hmr (WebSocket
// ของ Fast Refresh) ถูก matcher กินเข้าไปด้วย ทำให้ upgrade ไม่สำเร็จแล้วเบราว์เซอร์วนเชื่อมใหม่ไม่จบ
//
// ข้อจำกัดที่ต้องรู้: Next เป็นคนคอมไพล์ matcher เอง เทสนี้เอา pattern มาสร้าง RegExp ตรงๆ จึงเป็นการ
// ตรวจ "เจตนาของ pattern" ไม่ใช่พฤติกรรมจริงของ Next — แต่ pattern นี้เป็น regex ล้วนอยู่แล้ว
const matcher = new RegExp(`^${config.matcher[0]}$`);
const matches = (path: string) => matcher.test(path);

describe("proxy matcher", () => {
  it("ทำงานกับหน้าเว็บและ API ที่มี session จริง", () => {
    for (const path of ["/", "/login", "/orders/abc", "/chat/123", "/api/badges", "/api/orders"]) {
      expect(matches(path)).toBe(true);
    }
  });

  // ทุกอย่างใต้ /_next เป็นเรื่องภายในของ Next ไม่มี session ให้รีเฟรช และ /_next/hmr เป็น WebSocket
  // ที่พังทันทีถ้ามีอะไรไปคั่น
  it("ไม่แตะอะไรที่อยู่ใต้ /_next เลย รวมถึง WebSocket ของ Fast Refresh", () => {
    for (const path of [
      "/_next/hmr",
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/_next/webpack-hmr",
      "/__nextjs_original-stack-frames",
    ]) {
      expect(matches(path)).toBe(false);
    }
  });

  it("ไม่แตะไฟล์รูปและ favicon — ไม่มี session ให้รีเฟรช และมีเยอะที่สุดในหน้าหนึ่ง", () => {
    for (const path of ["/favicon.ico", "/logo-light.png", "/uploads/a.jpg", "/icon.svg"]) {
      expect(matches(path)).toBe(false);
    }
  });
});
