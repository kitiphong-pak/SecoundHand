import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import { SYSTEM_USER_ID } from "@/lib/systemUser";

// การตรวจรหัสผ่านย้ายไปอยู่ที่ Supabase Auth แล้ว — เทสนี้ mock ชั้น supabaseAuth ทั้งชั้น แล้วเทส
// สิ่งที่ route ยังตัดสินใจเองอยู่: ใครที่ Supabase ยอมให้ผ่านแล้ว แต่แอปเราต้องปฏิเสธต่อ
// (บัญชีระบบ, บัญชีถูกระงับ, บัญชีที่ไม่มีโปรไฟล์) และทุกกรณีที่ปฏิเสธต้องล็อกเอาต์ทิ้งด้วย
// ไม่งั้น cookie ของ session ที่เพิ่งได้มาจาก Supabase จะค้างอยู่ในเบราว์เซอร์
const { mock, auth } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  auth: {
    signInResult: { userId: "user-1" } as { userId: string } | { error: "invalid" | "rate_limited" },
    signInCalls: 0,
    signOutCalls: 0,
  },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/supabaseAuth", () => ({
  signIn: async () => {
    auth.signInCalls++;
    return auth.signInResult;
  },
  signOut: async () => {
    auth.signOutCalls++;
  },
}));

const { POST } = await import("./route");

const userRow = (over: Record<string, unknown> = {}) => ({
  id: "user-1",
  name: "ผู้ใช้ทั่วไป",
  email: "user@example.com",
  password_hash: null,
  province: "เชียงใหม่",
  role: "user",
  avatar_url: null,
  is_verified: false,
  is_suspended: false,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const login = (email: string, password = "password123") =>
  POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );

beforeEach(() => {
  mock.current = createSupabaseMock();
  auth.signInResult = { userId: "user-1" };
  auth.signInCalls = 0;
  auth.signOutCalls = 0;
});

describe("บัญชีระบบต้องล็อกอินไม่ได้", () => {
  // ทางปกติบัญชีระบบไม่มีตัวตนใน Supabase Auth จึงล็อกอินไม่ได้ตั้งแต่ต้น เทสนี้จำลองกรณีที่
  // Supabase ดันยอมให้ผ่านมา (เช่นมีคนสร้างบัญชีใน Auth ด้วย id นี้ผิดพลาด) แล้วยืนยันว่า route
  // ยังปฏิเสธอยู่ดี — บัญชีนี้มี role เป็น admin หลุดเข้าไปได้เท่ากับได้สิทธิ์ทั้งระบบ
  it("ปฏิเสธแม้ Supabase จะยอมให้ผ่าน และล็อกเอาต์ session ที่เพิ่งได้มาทิ้ง", async () => {
    auth.signInResult = { userId: SYSTEM_USER_ID };

    const res = await login("system@secoundhand.internal");
    expect(res.status).toBe(401);
    expect(auth.signOutCalls).toBe(1);
  });

  it("ตอบข้อความเดียวกับรหัสผ่านผิด ไม่บอกใบ้ว่าอีเมลนี้พิเศษ", async () => {
    auth.signInResult = { userId: SYSTEM_USER_ID };
    const systemMsg = (await (await login("system@secoundhand.internal")).json()).error;

    auth.signInResult = { error: "invalid" };
    const wrongPwMsg = (await (await login("user@example.com")).json()).error;

    expect(systemMsg).toBe(wrongPwMsg);
  });
});

describe("ผู้ใช้ทั่วไปยังล็อกอินได้ตามปกติ", () => {
  it("รหัสผ่านถูกต้อง → 200 และไม่ล็อกเอาต์", async () => {
    mock.current!.queueResult({ data: userRow(), error: null });
    const res = await login("user@example.com");
    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe("user@example.com");
    expect(auth.signOutCalls).toBe(0);
  });

  // ผู้ใช้ที่ย้ายมาจากระบบเดิมยังมี hash ค้างในตารางจนกว่าสคริปต์ย้ายจะล้างให้
  it("ไม่คืน password hash กลับไปกับ response แม้ในตารางจะยังมีค้างอยู่", async () => {
    mock.current!.queueResult({ data: userRow({ password_hash: "$2b$10$leftover" }), error: null });
    const body = await (await login("user@example.com")).json();
    expect(JSON.stringify(body)).not.toContain("$2b$10$");
  });

  it("รหัสผ่านผิด → 401 และไม่ไปอ่านโปรไฟล์ต่อ", async () => {
    auth.signInResult = { error: "invalid" };
    expect((await login("user@example.com")).status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ลองผิดบ่อยจน Supabase จำกัดไว้ → 429 พร้อมบอกให้รอ", async () => {
    auth.signInResult = { error: "rate_limited" };
    const res = await login("user@example.com");
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("รอ");
  });

  it("มีบัญชีใน Auth แต่ไม่มีโปรไฟล์ในแอป → 401 และล็อกเอาต์ทิ้ง", async () => {
    mock.current!.queueResult({ data: null, error: null });
    expect((await login("user@example.com")).status).toBe(401);
    expect(auth.signOutCalls).toBe(1);
  });

  it("บัญชีถูกระงับ → 403 และล็อกเอาต์ทิ้ง ไม่ปล่อย session ค้าง", async () => {
    mock.current!.queueResult({ data: userRow({ is_suspended: true }), error: null });
    expect((await login("user@example.com")).status).toBe(403);
    expect(auth.signOutCalls).toBe(1);
  });

  it("ไม่กรอกอีเมลหรือรหัสผ่าน → 400 และไม่ส่งไป Supabase เลย", async () => {
    expect((await login("", "")).status).toBe(400);
    expect(auth.signInCalls).toBe(0);
    expect(mock.current!.calls).toHaveLength(0);
  });
});
