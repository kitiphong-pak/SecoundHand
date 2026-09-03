import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// endpoint ฝั่งแอดมิน — อ่านและตอบห้องสนทนาของผู้ใช้คนไหนก็ได้ ซึ่งแปลว่าถ้าประตูนี้รั่ว
// ผู้ใช้ทั่วไปจะอ่านบทสนทนาของคนอื่นทั้งระบบได้ทันที เทสชุดนี้จึงเน้นที่ด่านตรวจสิทธิ์เป็นหลัก
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

const ADMIN = { id: "admin-1", role: "admin", name: "แอดมิน" };
const USER = { id: "user-1", role: "user", name: "ผู้ใช้ทั่วไป" };
const TARGET = "3f1a7c2e-9b4d-4a1e-8c55-2d6b7e0f9a13"; // ต้องเป็น UUID จริง ไม่งั้นติดด่าน 400 ก่อน

const messageRow = {
  id: "msg-1",
  user_id: TARGET,
  sender_id: TARGET,
  from_admin: false,
  text: "สอบถามครับ",
  read: false,
  created_at: "2026-01-01T00:00:00Z",
};

const params = (userId: string) => ({ params: Promise.resolve({ userId }) });

function req(body?: unknown) {
  return new Request("http://localhost/api/admin/support/x", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = ADMIN;
});

describe("ด่านตรวจสิทธิ์แอดมิน", () => {
  it("ผู้ใช้ทั่วไปอ่านห้องของคนอื่นไม่ได้ → 403 และไม่แตะฐานข้อมูลเลย", async () => {
    mockUser.current = USER;
    const res = await GET(req(), params(TARGET));
    expect(res.status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ผู้ใช้ทั่วไปตอบในนามผู้ดูแลไม่ได้ → 403", async () => {
    mockUser.current = USER;
    const res = await POST(req({ text: "ผมคือแอดมินนะ" }), params(TARGET));
    expect(res.status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401 ทั้ง GET และ POST", async () => {
    mockUser.current = null;
    expect((await GET(req(), params(TARGET))).status).toBe(401);
    expect((await POST(req({ text: "x" }), params(TARGET))).status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("ตรวจรูปแบบ userId ก่อนยิงฐานข้อมูล", () => {
  it("userId ที่ไม่ใช่ UUID → 400 และไม่ถูกส่งต่อไปยัง query", async () => {
    for (const bad of ["ไม่ใช่-uuid", "1 or 1=1", "../../etc/passwd", ""]) {
      const res = await GET(req(), params(bad));
      expect(res.status).toBe(400);
    }
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("แอดมินใช้งานได้ตามปกติ", () => {
  it("อ่านห้องแล้ว mark ข้อความของผู้ใช้ว่าอ่านแล้ว เฉพาะห้องที่เปิดอยู่", async () => {
    mock.current!.queueResult({ data: [messageRow], error: null });
    mock.current!.queueResult({ data: null, error: null });

    const res = await GET(req(), params(TARGET));
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("support_messages")[1];
    expect(hasOp(update, "update", { read: true })).toBe(true);
    expect(hasOp(update, "eq", "user_id", TARGET)).toBe(true);
    expect(hasOp(update, "eq", "from_admin", false)).toBe(true);
  });

  it("ตอบกลับแล้วบันทึกเป็นข้อความจากแอดมิน โดย sender เป็นแอดมินคนที่ล็อกอินอยู่", async () => {
    mock.current!.queueResult({ data: { id: TARGET }, error: null }); // หาผู้ใช้ปลายทาง
    mock.current!.queueResult({ data: { ...messageRow, from_admin: true }, error: null });

    const res = await POST(req({ text: "รับทราบครับ" }), params(TARGET));
    expect(res.status).toBe(201);

    const insert = mock.current!.callsTo("support_messages")[0];
    expect(
      hasOp(insert, "insert", {
        user_id: TARGET,
        sender_id: ADMIN.id,
        from_admin: true,
        text: "รับทราบครับ",
      })
    ).toBe(true);
  });

  it("ตอบหาผู้ใช้ที่ไม่มีอยู่จริง → 404 และไม่บันทึกข้อความ", async () => {
    mock.current!.queueResult({ data: null, error: null });
    const res = await POST(req({ text: "สวัสดี" }), params(TARGET));
    expect(res.status).toBe(404);
    expect(mock.current!.callsTo("support_messages")).toHaveLength(0);
  });

  it("ข้อความว่าง → 400", async () => {
    const res = await POST(req({ text: "  " }), params(TARGET));
    expect(res.status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });
});
