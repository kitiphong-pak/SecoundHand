import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import { SYSTEM_USER_ID } from "@/lib/systemUser";

// บัญชี "ระบบอัตโนมัติ" มี role = admin และมีตัวตนจริงในตาราง users (จำเป็นเพราะ audit_logs
// ต้องมี actor เสมอ) การกันไม่ให้ใครล็อกอินเข้าไปจึงห้ามพึ่งแค่ว่า "ไม่มีใครรู้รหัสผ่าน" —
// password_hash ของบัญชีนี้อยู่ใน migration 007 ที่เปิดเผยบน GitHub สาธารณะ
//
// เทสสำคัญที่สุดในไฟล์นี้จึงบังคับให้ bcrypt ตอบว่า "รหัสผ่านถูกต้อง" แล้วยืนยันว่ายังล็อกอิน
// ไม่ได้อยู่ดี = จำลองสถานการณ์ที่มีคนแครก hash สำเร็จแล้ว
const { mock, bcryptResult } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  bcryptResult: { current: true },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("bcryptjs", () => ({
  default: { compareSync: () => bcryptResult.current },
}));
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { toPublicUser: actual.toPublicUser, createSession: async () => {} };
});

const { POST } = await import("./route");

const userRow = (over: Record<string, unknown> = {}) => ({
  id: "user-1",
  name: "ผู้ใช้ทั่วไป",
  email: "user@example.com",
  password_hash: "$2b$10$hash",
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
  bcryptResult.current = true;
});

describe("บัญชีระบบต้องล็อกอินไม่ได้", () => {
  it("ปฏิเสธแม้ bcrypt จะบอกว่ารหัสผ่านถูกต้อง (จำลองว่ามีคนแครก hash ได้แล้ว)", async () => {
    mock.current!.queueResult({
      data: userRow({ id: SYSTEM_USER_ID, email: "system@secoundhand.internal", role: "admin", is_verified: true }),
      error: null,
    });

    const res = await login("system@secoundhand.internal");
    expect(res.status).toBe(401);
    // ต้องไม่มี session ถูกสร้าง = ไม่มี cookie ล็อกอินหลุดออกไป
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("ตอบข้อความเดียวกับรหัสผ่านผิด ไม่บอกใบ้ว่าอีเมลนี้พิเศษ", async () => {
    mock.current!.queueResult({ data: userRow({ id: SYSTEM_USER_ID }), error: null });
    const systemMsg = (await (await login("system@secoundhand.internal")).json()).error;

    mock.current = createSupabaseMock();
    bcryptResult.current = false;
    mock.current.queueResult({ data: userRow(), error: null });
    const wrongPwMsg = (await (await login("user@example.com")).json()).error;

    expect(systemMsg).toBe(wrongPwMsg);
  });
});

describe("ผู้ใช้ทั่วไปยังล็อกอินได้ตามปกติ", () => {
  it("รหัสผ่านถูกต้อง → 200", async () => {
    mock.current!.queueResult({ data: userRow(), error: null });
    const res = await login("user@example.com");
    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe("user@example.com");
  });

  it("ไม่คืน passwordHash กลับไปกับ response", async () => {
    mock.current!.queueResult({ data: userRow(), error: null });
    const body = await (await login("user@example.com")).json();
    expect(JSON.stringify(body)).not.toContain("$2b$10$");
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("รหัสผ่านผิด → 401", async () => {
    bcryptResult.current = false;
    mock.current!.queueResult({ data: userRow(), error: null });
    expect((await login("user@example.com")).status).toBe(401);
  });

  it("ไม่มีอีเมลนี้ในระบบ → 401", async () => {
    mock.current!.queueResult({ data: null, error: null });
    expect((await login("ไม่มีจริง@example.com")).status).toBe(401);
  });

  it("บัญชีถูกระงับ → 403", async () => {
    mock.current!.queueResult({ data: userRow({ is_suspended: true }), error: null });
    expect((await login("user@example.com")).status).toBe(403);
  });

  it("ไม่กรอกอีเมลหรือรหัสผ่าน → 400 และไม่แตะฐานข้อมูล", async () => {
    expect((await login("", "")).status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });
});
