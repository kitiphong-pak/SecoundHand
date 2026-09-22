import { describe, it, expect } from "vitest";
import { safeNextPath, loginHref } from "./safeRedirect";

describe("safeNextPath — กัน open redirect หลังล็อกอิน", () => {
  it("path ภายในเว็บผ่าน รวม query string", () => {
    expect(safeNextPath("/products/abc")).toBe("/products/abc");
    expect(safeNextPath("/?province=เชียงใหม่")).toBe("/?province=เชียงใหม่");
    expect(safeNextPath("/chat/abc")).toBe("/chat/abc");
  });

  it("URL เต็มไปเว็บอื่น → หน้าแรก", () => {
    expect(safeNextPath("https://evil.example/login")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });

  // สองแบบนี้คือเหตุผลที่แค่เช็ค startsWith("/") ไม่พอ — เบราว์เซอร์ถือเป็น URL ข้ามโดเมน
  it("protocol-relative (//evil, /\\evil) → หน้าแรก", () => {
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });

  it("มีอักขระควบคุมแฝง → หน้าแรก", () => {
    expect(safeNextPath("/\t/evil.example")).toBe("/");
    expect(safeNextPath("/\n/evil.example")).toBe("/");
  });

  it("ไม่มีค่า/ค่าผิดชนิด → หน้าแรก และถ้าส่งมาหลายค่าใช้ค่าแรก", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(123)).toBe("/");
    expect(safeNextPath(["/products/a", "https://evil.example"])).toBe("/products/a");
    expect(safeNextPath(["https://evil.example", "/products/a"])).toBe("/");
  });

  it("loginHref encode ปลายทางให้ปลอดภัยใน query string", () => {
    expect(loginHref("/?province=a&page=2")).toBe("/login?next=%2F%3Fprovince%3Da%26page%3D2");
  });
});
