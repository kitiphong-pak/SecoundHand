import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// ช่องทางติดต่อผู้ดูแลของผู้ใช้ — สิ่งที่ต้องกันคือคนหนึ่งอ่านหรือเขียนห้องของคนอื่นได้
// ทุก query ต้องถูกล็อกด้วย user.id จาก session เสมอ ห้ามรับ id จาก body/query string
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

const { GET, POST } = await import("./route");

const USER = { id: "user-1", role: "user", name: "ผู้ใช้" };
const ADMIN = { id: "admin-1", role: "admin", name: "แอดมิน" };

const messageRow = {
  id: "msg-1",
  user_id: USER.id,
  sender_id: USER.id,
  from_admin: false,
  text: "สวัสดีครับ",
  read: false,
  created_at: "2026-01-01T00:00:00Z",
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/support", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = USER;
});

describe("GET /api/support", () => {
  it("ดึงเฉพาะข้อความของตัวเอง ล็อกด้วย user id จาก session", async () => {
    mock.current!.queueResult({ data: [messageRow], error: null });

    const res = await GET();
    expect(res.status).toBe(200);

    // ถ้าเงื่อนไขนี้หายไป ผู้ใช้จะเห็นบทสนทนาของทุกคนในระบบ
    const read = mock.current!.callsTo("support_messages")[0];
    expect(hasOp(read, "eq", "user_id", USER.id)).toBe(true);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401 และไม่แตะฐานข้อมูลเลย", async () => {
    mockUser.current = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("เปิดอ่านแล้วต้อง mark ข้อความจากแอดมินว่าอ่านแล้ว เฉพาะห้องของตัวเอง", async () => {
    mock.current!.queueResult({
      data: [{ ...messageRow, from_admin: true, read: false }],
      error: null,
    });
    mock.current!.queueResult({ data: null, error: null });

    await GET();

    const update = mock.current!.callsTo("support_messages")[1];
    expect(hasOp(update, "update", { read: true })).toBe(true);
    expect(hasOp(update, "eq", "user_id", USER.id)).toBe(true);
    expect(hasOp(update, "eq", "from_admin", true)).toBe(true);
  });

  it("ไม่มีข้อความใหม่ก็ไม่ต้องสั่ง update ให้เปลืองการเขียน", async () => {
    mock.current!.queueResult({ data: [{ ...messageRow, from_admin: true, read: true }], error: null });
    await GET();
    expect(mock.current!.callsTo("support_messages")).toHaveLength(1);
  });
});

describe("POST /api/support", () => {
  it("ผู้ใช้ส่งข้อความได้ และผูกกับ id ของตัวเองเสมอ", async () => {
    mock.current!.queueResult({ data: messageRow, error: null });

    const res = await POST(postRequest({ text: "ช่วยตรวจสอบออเดอร์ให้หน่อยครับ" }));
    expect(res.status).toBe(201);

    const insert = mock.current!.callsTo("support_messages")[0];
    expect(
      hasOp(insert, "insert", {
        user_id: USER.id,
        sender_id: USER.id,
        from_admin: false,
        text: "ช่วยตรวจสอบออเดอร์ให้หน่อยครับ",
      })
    ).toBe(true);
  });

  it("ส่งข้อความในนามคนอื่นไม่ได้ แม้จะยัด user_id มาใน body", async () => {
    mock.current!.queueResult({ data: messageRow, error: null });

    await POST(postRequest({ text: "แอบอ้าง", userId: "victim-9", user_id: "victim-9" }));

    // route ต้องใช้ id จาก session เท่านั้น ค่าใน body ต้องถูกมองข้ามทั้งหมด
    const insert = mock.current!.callsTo("support_messages")[0];
    const insertOp = insert.ops.find(([m]) => m === "insert");
    expect(JSON.stringify(insertOp)).not.toContain("victim-9");
  });

  it("แอดมินใช้ช่องทางนี้ไม่ได้ → 403 (ต้องตอบผ่านหน้าผู้ดูแล)", async () => {
    mockUser.current = ADMIN;
    const res = await POST(postRequest({ text: "ทดสอบ" }));
    expect(res.status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401", async () => {
    mockUser.current = null;
    const res = await POST(postRequest({ text: "ทดสอบ" }));
    expect(res.status).toBe(401);
  });

  it("ข้อความว่างหรือมีแต่ช่องว่าง → 400", async () => {
    expect((await POST(postRequest({ text: "   " }))).status).toBe(400);
    expect((await POST(postRequest({}))).status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });
});
