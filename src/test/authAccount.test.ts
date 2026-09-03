import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// route ที่แตะบัญชีและรหัสผ่าน — สมัคร เปลี่ยนรหัสผ่าน แก้โปรไฟล์
// สิ่งที่ต้องกันคือ: hash หลุดออกไปกับ response, แก้บัญชีคนอื่นได้, และรับค่าที่ไม่ควรรับ
// (จังหวัดที่ไม่มีจริง, รูปโปรไฟล์ที่ชี้ไปโดเมนอื่น, รหัสผ่านสั้นเกินไป)
const { mock, mockUser, bcryptOk } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  mockUser: { current: null as { id: string; role: string; name: string } | null },
  bcryptOk: { current: true },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("bcryptjs", () => ({
  default: {
    compareSync: () => bcryptOk.current,
    hashSync: (pw: string) => `hashed:${pw}`,
  },
}));
vi.mock("@/lib/auditLog", () => ({ logAction: async () => {} }));
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    toPublicUser: actual.toPublicUser,
    getCurrentUser: async () => mockUser.current,
    createSession: async () => {},
  };
});

const { POST: register } = await import("@/app/api/auth/register/route");
const { POST: changePassword } = await import("@/app/api/auth/change-password/route");
const { PATCH: updateProfile } = await import("@/app/api/auth/profile/route");

const USER = { id: "user-1", role: "user", name: "ผู้ใช้" };

const userRow = (over: Record<string, unknown> = {}) => ({
  id: "user-1",
  name: "ผู้ใช้",
  email: "user@example.com",
  password_hash: "$2b$10$existinghash",
  province: "เชียงใหม่",
  role: "user",
  avatar_url: null,
  is_verified: false,
  is_suspended: false,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const send = (body: unknown, method = "POST") =>
  new Request("http://localhost/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const updateOf = (call: { ops: Array<[string, ...unknown[]]> }) =>
  call.ops.find(([m]) => m === "update")?.[1] as Record<string, unknown>;

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = USER;
  bcryptOk.current = true;
});

describe("สมัครสมาชิก", () => {
  const good = {
    name: "สมชาย ใจดี",
    email: "Somchai@Example.com",
    password: "password123",
    province: "เชียงใหม่",
  };

  it("สมัครสำเร็จ และไม่คืน password hash กลับไป", async () => {
    mock.current!.queueResult({ data: null, error: null }); // ยังไม่มีอีเมลนี้
    mock.current!.queueResult({ data: userRow(), error: null });

    const res = await register(send(good));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("$2b$10$");
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("เก็บอีเมลเป็นตัวพิมพ์เล็กเสมอ ไม่งั้นจะสมัครซ้ำด้วยตัวพิมพ์ใหญ่ได้", async () => {
    mock.current!.queueResult({ data: null, error: null });
    mock.current!.queueResult({ data: userRow(), error: null });

    await register(send(good));
    const insert = mock.current!.callsTo("users")[1];
    const payload = insert.ops.find(([m]) => m === "insert")?.[1] as Record<string, unknown>;
    expect(payload.email).toBe("somchai@example.com");
  });

  it("ไม่เก็บรหัสผ่านเป็น plain text", async () => {
    mock.current!.queueResult({ data: null, error: null });
    mock.current!.queueResult({ data: userRow(), error: null });

    await register(send(good));
    const insert = mock.current!.callsTo("users")[1];
    const payload = insert.ops.find(([m]) => m === "insert")?.[1] as Record<string, unknown>;
    expect(payload.password_hash).not.toBe("password123");
    expect(String(payload.password_hash)).toContain("hashed:");
  });

  it("สมัครเองเป็นแอดมินไม่ได้ แม้จะยัด role มาใน body", async () => {
    mock.current!.queueResult({ data: null, error: null });
    mock.current!.queueResult({ data: userRow(), error: null });

    await register(send({ ...good, role: "admin", is_verified: true }));
    const insert = mock.current!.callsTo("users")[1];
    const payload = insert.ops.find(([m]) => m === "insert")?.[1] as Record<string, unknown>;
    expect(payload.role).toBe("user");
    expect(payload.is_verified).toBe(false);
  });

  it("อีเมลซ้ำ → 409 และไม่สร้างบัญชี", async () => {
    mock.current!.queueResult({ data: { id: "existing" }, error: null });
    const res = await register(send(good));
    expect(res.status).toBe(409);
    expect(mock.current!.callsTo("users")).toHaveLength(1);
  });

  it("ข้อมูลไม่ผ่านเกณฑ์ → 400 ก่อนแตะฐานข้อมูล", async () => {
    const bad = [
      { ...good, email: "ไม่ใช่อีเมล" },
      { ...good, password: "12345" },
      { ...good, province: "จังหวัดที่ไม่มีจริง" },
      { ...good, name: "   " },
      {},
    ];
    for (const b of bad) expect((await register(send(b))).status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("เปลี่ยนรหัสผ่าน", () => {
  it("รหัสผ่านปัจจุบันถูกต้อง → เปลี่ยนได้ และเขียนเฉพาะบัญชีตัวเอง", async () => {
    mock.current!.queueResult({ data: { password_hash: "$2b$10$existinghash" }, error: null });
    mock.current!.queueResult({ data: null, error: null });

    const res = await changePassword(send({ currentPassword: "old123", newPassword: "newpass123" }));
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("users")[1];
    expect(hasOp(update, "eq", "id", USER.id)).toBe(true);
    expect(String(updateOf(update).password_hash)).toContain("hashed:");
  });

  it("รหัสผ่านปัจจุบันผิด → 401 และต้องไม่เขียนอะไรเลย", async () => {
    bcryptOk.current = false;
    mock.current!.queueResult({ data: { password_hash: "$2b$10$existinghash" }, error: null });

    const res = await changePassword(send({ currentPassword: "wrong", newPassword: "newpass123" }));
    expect(res.status).toBe(401);
    expect(mock.current!.callsTo("users")).toHaveLength(1);
  });

  it("รหัสผ่านใหม่สั้นเกินไป → 400 ก่อนตรวจรหัสเดิมด้วยซ้ำ", async () => {
    const res = await changePassword(send({ currentPassword: "old123", newPassword: "12345" }));
    expect(res.status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401", async () => {
    mockUser.current = null;
    expect((await changePassword(send({ currentPassword: "a", newPassword: "bbbbbb" }))).status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("แก้ไขโปรไฟล์", () => {
  const good = { name: "ชื่อใหม่", province: "ขอนแก่น" };

  it("แก้ได้เฉพาะบัญชีตัวเอง ต่อให้ยัด id คนอื่นมาใน body", async () => {
    mock.current!.queueResult({ data: userRow({ name: "ชื่อใหม่" }), error: null });

    const res = await updateProfile(send({ ...good, id: "victim-9" }, "PATCH"));
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("users")[0];
    expect(hasOp(update, "eq", "id", USER.id)).toBe(true);
    expect(JSON.stringify(update.ops)).not.toContain("victim-9");
  });

  it("ไม่คืน password hash กลับไปกับ response", async () => {
    mock.current!.queueResult({ data: userRow(), error: null });
    const body = await (await updateProfile(send(good, "PATCH"))).json();
    expect(JSON.stringify(body)).not.toContain("$2b$10$");
  });

  it("รูปโปรไฟล์ที่ชี้ไปโดเมนอื่น → 400", async () => {
    const res = await updateProfile(
      send({ ...good, avatarUrl: "https://evil.example.com/x.png" }, "PATCH")
    );
    expect(res.status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("จังหวัดที่ไม่มีในรายการ → 400", async () => {
    const res = await updateProfile(send({ name: "ก", province: "นอกโลก" }, "PATCH"));
    expect(res.status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401", async () => {
    mockUser.current = null;
    expect((await updateProfile(send(good, "PATCH"))).status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });
});
