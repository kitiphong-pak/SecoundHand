import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// route ที่แตะบัญชีและรหัสผ่าน — สมัคร เปลี่ยนรหัสผ่าน แก้โปรไฟล์
// รหัสผ่านย้ายไปอยู่ที่ Supabase Auth แล้ว (mock ทั้งชั้น supabaseAuth ไว้) สิ่งที่ต้องกันยังเหมือนเดิม:
// รหัสผ่านต้องไม่ตกมาอยู่ในตารางของเรา, แก้บัญชีคนอื่นไม่ได้, ไม่รับค่าที่ไม่ควรรับ — และข้อใหม่:
// สมัครพังกลางทางต้องไม่ทิ้งบัญชีค้างไว้ใน Supabase Auth
const { mock, mockUser, auth } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  mockUser: { current: null as { id: string; role: string; name: string; email: string } | null },
  auth: {
    createResult: { userId: "new-user-1" } as
      | { userId: string }
      | { error: "exists" | "weak_password" | "failed" },
    created: [] as Array<{ email: string; password: string }>,
    deleted: [] as string[],
    signedIn: [] as string[],
    verifyOk: true,
    verified: [] as Array<{ email: string; password: string }>,
    setOk: true,
    setCalls: [] as Array<{ id: string; password: string }>,
  },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/supabaseAuth", () => ({
  createAuthUser: async (email: string, password: string) => {
    auth.created.push({ email, password });
    return auth.createResult;
  },
  deleteAuthUser: async (id: string) => {
    auth.deleted.push(id);
  },
  signIn: async (email: string) => {
    auth.signedIn.push(email);
    return { userId: "new-user-1" };
  },
  verifyPassword: async (email: string, password: string) => {
    auth.verified.push({ email, password });
    return auth.verifyOk;
  },
  setPassword: async (id: string, password: string) => {
    auth.setCalls.push({ id, password });
    return auth.setOk;
  },
}));
vi.mock("@/lib/auditLog", () => ({ logAction: async () => {} }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mockUser.current }));

const { POST: register } = await import("@/app/api/auth/register/route");
const { POST: changePassword } = await import("@/app/api/auth/change-password/route");
const { PATCH: updateProfile } = await import("@/app/api/auth/profile/route");

const USER = { id: "user-1", role: "user", name: "ผู้ใช้", email: "user@example.com" };

const userRow = (over: Record<string, unknown> = {}) => ({
  id: "user-1",
  name: "ผู้ใช้",
  email: "user@example.com",
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

const insertOf = (call: { ops: Array<[string, ...unknown[]]> }) =>
  call.ops.find(([m]) => m === "insert")?.[1] as Record<string, unknown>;

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = USER;
  auth.createResult = { userId: "new-user-1" };
  auth.created = [];
  auth.deleted = [];
  auth.signedIn = [];
  auth.verifyOk = true;
  auth.verified = [];
  auth.setOk = true;
  auth.setCalls = [];
});

describe("สมัครสมาชิก", () => {
  const good = {
    name: "สมชาย ใจดี",
    email: "Somchai@Example.com",
    password: "password123",
    province: "เชียงใหม่",
  };

  it("สมัครสำเร็จ: สร้างบัญชีใน Auth แล้วสร้างโปรไฟล์ด้วย id เดียวกัน และล็อกอินให้เลย", async () => {
    mock.current!.queueResult({ data: null, error: null }); // ยังไม่มีอีเมลนี้
    mock.current!.queueResult({ data: userRow({ id: "new-user-1" }), error: null });

    const res = await register(send(good));
    expect(res.status).toBe(201);
    expect(auth.created).toHaveLength(1);
    expect(insertOf(mock.current!.callsTo("users")[1]).id).toBe("new-user-1");
    expect(auth.signedIn).toEqual(["somchai@example.com"]);
  });

  it("เก็บอีเมลเป็นตัวพิมพ์เล็กเสมอ ทั้งใน Auth และในโปรไฟล์", async () => {
    mock.current!.queueResult({ data: null, error: null });
    mock.current!.queueResult({ data: userRow(), error: null });

    await register(send(good));
    expect(auth.created[0].email).toBe("somchai@example.com");
    expect(insertOf(mock.current!.callsTo("users")[1]).email).toBe("somchai@example.com");
  });

  // รหัสผ่านต้องไปอยู่ที่ Supabase Auth ที่เดียว — ตารางของเราไม่ควรเห็นมันเลยสักรูปแบบ
  it("ไม่ส่งรหัสผ่านลงตาราง users ของเราเลย ทั้งแบบ plain text และแบบ hash", async () => {
    mock.current!.queueResult({ data: null, error: null });
    mock.current!.queueResult({ data: userRow(), error: null });

    await register(send(good));
    const payload = insertOf(mock.current!.callsTo("users")[1]);
    expect(payload).not.toHaveProperty("password");
    expect(payload).not.toHaveProperty("password_hash");
    expect(JSON.stringify(payload)).not.toContain("password123");
  });

  it("สมัครเองเป็นแอดมินไม่ได้ แม้จะยัด role มาใน body", async () => {
    mock.current!.queueResult({ data: null, error: null });
    mock.current!.queueResult({ data: userRow(), error: null });

    await register(send({ ...good, role: "admin", is_verified: true }));
    const payload = insertOf(mock.current!.callsTo("users")[1]);
    expect(payload.role).toBe("user");
    expect(payload.is_verified).toBe(false);
  });

  it("อีเมลซ้ำในโปรไฟล์ → 409 และไม่สร้างบัญชีใน Auth", async () => {
    mock.current!.queueResult({ data: { id: "existing" }, error: null });
    const res = await register(send(good));
    expect(res.status).toBe(409);
    expect(auth.created).toHaveLength(0);
  });

  it("อีเมลซ้ำใน Auth (มีบัญชีแต่ไม่มีโปรไฟล์) → 409 และไม่สร้างโปรไฟล์", async () => {
    mock.current!.queueResult({ data: null, error: null });
    auth.createResult = { error: "exists" };
    const res = await register(send(good));
    expect(res.status).toBe(409);
    expect(mock.current!.callsTo("users")).toHaveLength(1);
  });

  it("Supabase บอกว่ารหัสผ่านอ่อนเกินไป → 400 ไม่ใช่บอกว่าอีเมลซ้ำ", async () => {
    mock.current!.queueResult({ data: null, error: null });
    auth.createResult = { error: "weak_password" };
    const res = await register(send(good));
    expect(res.status).toBe(400);
    expect((await res.json()).error).not.toContain("อีเมล");
  });

  // ถ้าไม่ลบทิ้ง อีเมลนี้จะติดอยู่ใน Auth ถาวร: สมัครใหม่ก็ไม่ได้เพราะซ้ำ ล็อกอินก็ไม่ได้เพราะไม่มีโปรไฟล์
  it("สร้างโปรไฟล์พัง → ลบบัญชีที่เพิ่งสร้างใน Auth ทิ้ง และไม่ล็อกอินให้", async () => {
    mock.current!.queueResult({ data: null, error: null });
    mock.current!.queueResult({ data: null, error: { message: "insert failed" } });

    const res = await register(send(good));
    expect(res.status).toBe(500);
    expect(auth.deleted).toEqual(["new-user-1"]);
    expect(auth.signedIn).toHaveLength(0);
  });

  it("ข้อมูลไม่ผ่านเกณฑ์ → 400 ก่อนแตะฐานข้อมูลหรือ Auth", async () => {
    const bad = [
      { ...good, email: "ไม่ใช่อีเมล" },
      { ...good, password: "12345" },
      { ...good, province: "จังหวัดที่ไม่มีจริง" },
      { ...good, name: "   " },
      {},
    ];
    for (const b of bad) expect((await register(send(b))).status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
    expect(auth.created).toHaveLength(0);
  });
});

describe("เปลี่ยนรหัสผ่าน", () => {
  it("รหัสผ่านปัจจุบันถูกต้อง → ตั้งรหัสใหม่ให้บัญชีตัวเองเท่านั้น", async () => {
    const res = await changePassword(send({ currentPassword: "old123", newPassword: "newpass123" }));
    expect(res.status).toBe(200);
    expect(auth.setCalls).toEqual([{ id: USER.id, password: "newpass123" }]);
  });

  // อีเมลที่ใช้เช็ครหัสเดิมต้องมาจาก session ไม่ใช่จาก body — ไม่งั้นส่งอีเมล+รหัสของบัญชีตัวเองมา
  // เพื่อผ่านด่านนี้ แล้วไปเปลี่ยนรหัสของบัญชีที่ล็อกอินค้างไว้ได้
  it("เช็ครหัสเดิมกับอีเมลของคนที่ล็อกอินอยู่ ไม่ใช่อีเมลที่ส่งมาใน body", async () => {
    await changePassword(
      send({ currentPassword: "old123", newPassword: "newpass123", email: "attacker@example.com" })
    );
    expect(auth.verified).toEqual([{ email: USER.email, password: "old123" }]);
  });

  it("รหัสผ่านปัจจุบันผิด → 401 และไม่ตั้งรหัสใหม่", async () => {
    auth.verifyOk = false;
    const res = await changePassword(send({ currentPassword: "wrong", newPassword: "newpass123" }));
    expect(res.status).toBe(401);
    expect(auth.setCalls).toHaveLength(0);
  });

  it("ตั้งรหัสใหม่ไม่สำเร็จ → 500", async () => {
    auth.setOk = false;
    const res = await changePassword(send({ currentPassword: "old123", newPassword: "newpass123" }));
    expect(res.status).toBe(500);
  });

  it("รหัสผ่านใหม่สั้นเกินไป → 400 ก่อนตรวจรหัสเดิมด้วยซ้ำ", async () => {
    const res = await changePassword(send({ currentPassword: "old123", newPassword: "12345" }));
    expect(res.status).toBe(400);
    expect(auth.verified).toHaveLength(0);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401", async () => {
    mockUser.current = null;
    expect((await changePassword(send({ currentPassword: "a", newPassword: "bbbbbb" }))).status).toBe(401);
    expect(auth.verified).toHaveLength(0);
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
