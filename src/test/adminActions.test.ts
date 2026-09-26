import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// การกระทำที่ต้องใช้อำนาจแอดมิน รวมไว้ที่เดียวเพราะสิ่งที่ต้องเฝ้าเหมือนกัน คือ "ประตูต้องปิด"
// ถ้าด่านตรวจ role รั่วเมื่อไหร่ ผู้ใช้ทั่วไปจะระงับบัญชีคนอื่น
// หรือกดยืนยันตัวตนให้ตัวเองได้ทันที
//
// เทสอยู่ใน src/test แทนที่จะวางข้าง route เพราะครอบคลุมหลาย route ที่อยู่คนละโฟลเดอร์
const { mock, mockUser } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  mockUser: { current: null as { id: string; role: string; name: string } | null },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mockUser.current }));
vi.mock("@/lib/auditLog", () => ({ logAction: async () => {} }));

const { POST: suspend } = await import("@/app/api/admin/users/[id]/suspend/route");
const { POST: verify } = await import("@/app/api/admin/users/[id]/verify/route");

const ADMIN = { id: "admin-1", role: "admin", name: "แอดมิน" };
const OTHER_ADMIN = { id: "admin-2", role: "admin", name: "แอดมินอีกคน" };
const USER = { id: "user-1", role: "user", name: "ผู้ใช้ทั่วไป" };

const targetUser = (over: Record<string, unknown> = {}) => ({
  id: "target-1",
  name: "เป้าหมาย",
  email: "target@example.com",
  province: "เชียงใหม่",
  role: "user",
  is_verified: false,
  is_suspended: false,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const post = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const userParams = (id = "target-1") => ({ params: Promise.resolve({ id }) });
const updateOf = (call: { ops: Array<[string, ...unknown[]]> }) =>
  call.ops.find(([m]) => m === "update")?.[1] as Record<string, unknown>;

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = ADMIN;
});

describe("ระงับบัญชีผู้ใช้", () => {
  it("ผู้ใช้ทั่วไปสั่งระงับบัญชีคนอื่นไม่ได้ → 403", async () => {
    mockUser.current = USER;
    const res = await suspend(post({ suspended: true }), userParams());
    expect(res.status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  // การเตะออกทันทีย้ายไปอยู่ที่ getCurrentUser() ซึ่งเช็ค is_suspended ทุก request แล้ว (ดู
  // src/lib/auth.test.ts) — ที่นี่เหลือแค่ต้องตั้ง flag ให้ถูกคน ถูกค่า
  it("ระงับ → ตั้ง is_suspended = true ให้บัญชีเป้าหมาย", async () => {
    mock.current!.queueResult({ data: targetUser(), error: null });
    mock.current!.queueResult({ data: null, error: null });

    const res = await suspend(post({ suspended: true }), userParams());
    expect(res.status).toBe(200);
    const update = mock.current!.callsTo("users")[1];
    expect(updateOf(update).is_suspended).toBe(true);
    expect(hasOp(update, "eq", "id", "target-1")).toBe(true);
  });

  it("ปลดระงับ → ตั้ง is_suspended = false", async () => {
    mock.current!.queueResult({ data: targetUser({ is_suspended: true }), error: null });
    mock.current!.queueResult({ data: null, error: null });

    const res = await suspend(post({ suspended: false }), userParams());
    expect(res.status).toBe(200);
    expect(updateOf(mock.current!.callsTo("users")[1]).is_suspended).toBe(false);
  });

  it("แอดมินระงับบัญชีตัวเองไม่ได้ → 400 (กันล็อกตัวเองออกจากระบบ)", async () => {
    const res = await suspend(post({ suspended: true }), userParams(ADMIN.id));
    expect(res.status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("แอดมินระงับบัญชีแอดมินด้วยกันไม่ได้ → 403", async () => {
    mock.current!.queueResult({ data: targetUser({ id: OTHER_ADMIN.id, role: "admin" }), error: null });
    const res = await suspend(post({ suspended: true }), userParams(OTHER_ADMIN.id));
    expect(res.status).toBe(403);
    expect(mock.current!.callsTo("users")).toHaveLength(1); // อ่านอย่างเดียว ไม่ได้เขียน
  });

  it("ไม่พบผู้ใช้ → 404", async () => {
    mock.current!.queueResult({ data: null, error: null });
    expect((await suspend(post({ suspended: true }), userParams())).status).toBe(404);
  });
});

describe("ยืนยันตัวตนผู้ใช้", () => {
  it("ผู้ใช้ทั่วไปกดยืนยันตัวตนให้ตัวเองไม่ได้ → 403", async () => {
    mockUser.current = USER;
    const res = await verify(post({ verified: true }), userParams(USER.id));
    expect(res.status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("แอดมินยืนยันตัวตนให้ผู้ใช้ได้", async () => {
    mock.current!.queueResult({ data: targetUser(), error: null });
    mock.current!.queueResult({ data: null, error: null });

    const res = await verify(post({ verified: true }), userParams());
    expect(res.status).toBe(200);
    expect(updateOf(mock.current!.callsTo("users")[1]).is_verified).toBe(true);
  });

  it("ไม่คืน row ผู้ใช้ทั้งแถวกลับไปกับ response (เช่นอีเมลของเป้าหมาย)", async () => {
    mock.current!.queueResult({ data: targetUser(), error: null });
    mock.current!.queueResult({ data: null, error: null });

    const body = await (await verify(post({ verified: true }), userParams())).json();
    expect(JSON.stringify(body)).not.toContain("target@example.com");
  });

  it("แอดมินแก้บัญชีแอดมินด้วยกันไม่ได้ → 403", async () => {
    mock.current!.queueResult({ data: targetUser({ role: "admin" }), error: null });
    const res = await verify(post({ verified: false }), userParams());
    expect(res.status).toBe(403);
    expect(mock.current!.callsTo("users")).toHaveLength(1);
  });
});
