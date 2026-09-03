import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// การกระทำที่ต้องใช้อำนาจแอดมิน รวมไว้ที่เดียวเพราะสิ่งที่ต้องเฝ้าเหมือนกัน คือ "ประตูต้องปิด"
// ถ้าด่านตรวจ role รั่วเมื่อไหร่ ผู้ใช้ทั่วไปจะตัดสินข้อพิพาทให้ตัวเองชนะ ระงับบัญชีคนอื่น
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

const { POST: resolveDispute } = await import("@/app/api/orders/[id]/resolve-dispute/route");
const { POST: suspend } = await import("@/app/api/admin/users/[id]/suspend/route");
const { POST: verify } = await import("@/app/api/admin/users/[id]/verify/route");

const ADMIN = { id: "admin-1", role: "admin", name: "แอดมิน" };
const OTHER_ADMIN = { id: "admin-2", role: "admin", name: "แอดมินอีกคน" };
const USER = { id: "user-1", role: "user", name: "ผู้ใช้ทั่วไป" };

const disputedOrder = (over: Record<string, unknown> = {}) => ({
  id: "order-1",
  product_id: "product-1",
  buyer_id: "buyer-1",
  seller_id: "seller-1",
  status: "disputed",
  amount: 3500,
  dispute_reason: "ของไม่ตรงปก",
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const targetUser = (over: Record<string, unknown> = {}) => ({
  id: "target-1",
  name: "เป้าหมาย",
  email: "target@example.com",
  password_hash: "$2b$10$hash",
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

const orderParams = { params: Promise.resolve({ id: "order-1" }) };
const userParams = (id = "target-1") => ({ params: Promise.resolve({ id }) });
const updateOf = (call: { ops: Array<[string, ...unknown[]]> }) =>
  call.ops.find(([m]) => m === "update")?.[1] as Record<string, unknown>;

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = ADMIN;
});

describe("ตัดสินข้อพิพาท", () => {
  it("ผู้ใช้ทั่วไปตัดสินข้อพิพาทไม่ได้ → 403 และไม่แตะฐานข้อมูลเลย", async () => {
    mockUser.current = USER;
    const res = await resolveDispute(post({ resolution: "favor_seller" }), orderParams);
    expect(res.status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401", async () => {
    mockUser.current = null;
    expect((await resolveDispute(post({ resolution: "favor_buyer" }), orderParams)).status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ตัดสินให้ผู้ขาย → ปิดออเดอร์และสินค้ากลายเป็นขายแล้ว", async () => {
    mock.current!.queueResult({ data: disputedOrder(), error: null });
    mock.current!.queueResult({ data: disputedOrder({ status: "completed" }), error: null });
    mock.current!.queueResult({ data: null, error: null });

    const res = await resolveDispute(post({ resolution: "favor_seller" }), orderParams);
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("orders")[1];
    expect(updateOf(update).status).toBe("completed");
    expect(hasOp(update, "eq", "status", "disputed")).toBe(true);
    expect(updateOf(mock.current!.callsTo("products")[0]).status).toBe("sold");
  });

  it("ตัดสินให้ผู้ซื้อ → ยกเลิกออเดอร์ พร้อมล็อกสถานะเดิมไว้ใน UPDATE", async () => {
    mock.current!.queueResult({ data: disputedOrder(), error: null });
    mock.current!.queueResult({ data: disputedOrder({ status: "cancelled" }), error: null });
    mock.current!.queueResult({ data: null, error: null });

    const res = await resolveDispute(post({ resolution: "favor_buyer" }), orderParams);
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("orders")[1];
    expect(updateOf(update).status).toBe("cancelled");
    expect(hasOp(update, "eq", "status", "disputed")).toBe(true);
  });

  it("แอดมินสองคนกดตัดสินพร้อมกัน คนที่แพ้ต้องได้ 409", async () => {
    mock.current!.queueResult({ data: disputedOrder(), error: null });
    mock.current!.queueResult({ data: null, error: null }); // UPDATE ไม่โดนแถว มีคนตัดสินไปก่อนแล้ว

    const res = await resolveDispute(post({ resolution: "favor_seller" }), orderParams);
    expect(res.status).toBe(409);
    expect(mock.current!.callsTo("products")).toHaveLength(0);
  });

  it("ออเดอร์ที่ไม่ได้อยู่ระหว่างข้อพิพาท ตัดสินไม่ได้ → 409", async () => {
    mock.current!.queueResult({ data: disputedOrder({ status: "completed" }), error: null });
    expect((await resolveDispute(post({ resolution: "favor_buyer" }), orderParams)).status).toBe(409);
    expect(mock.current!.callsTo("orders")).toHaveLength(1);
  });

  it("ผลการตัดสินที่ไม่รู้จัก → 400 ก่อนแตะฐานข้อมูล", async () => {
    for (const bad of [{ resolution: "favor_me" }, {}, { resolution: "" }]) {
      expect((await resolveDispute(post(bad), orderParams)).status).toBe(400);
    }
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("ระงับบัญชีผู้ใช้", () => {
  it("ผู้ใช้ทั่วไปสั่งระงับบัญชีคนอื่นไม่ได้ → 403", async () => {
    mockUser.current = USER;
    const res = await suspend(post({ suspended: true }), userParams());
    expect(res.status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ระงับแล้วต้องเตะ session ของคนนั้นออกทันที ไม่ใช่รอหมดอายุเอง", async () => {
    mock.current!.queueResult({ data: targetUser(), error: null });
    mock.current!.queueResult({ data: null, error: null });
    mock.current!.queueResult({ data: null, error: null });

    const res = await suspend(post({ suspended: true }), userParams());
    expect(res.status).toBe(200);
    expect(updateOf(mock.current!.callsTo("users")[1]).is_suspended).toBe(true);

    const sessions = mock.current!.callsTo("sessions")[0];
    expect(sessions).toBeDefined();
    expect(hasOp(sessions, "eq", "user_id", "target-1")).toBe(true);
  });

  it("ปลดระงับไม่ต้องไปยุ่งกับ session", async () => {
    mock.current!.queueResult({ data: targetUser({ is_suspended: true }), error: null });
    mock.current!.queueResult({ data: null, error: null });

    const res = await suspend(post({ suspended: false }), userParams());
    expect(res.status).toBe(200);
    expect(mock.current!.callsTo("sessions")).toHaveLength(0);
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

  it("ไม่คืน password hash กลับไปกับ response", async () => {
    mock.current!.queueResult({ data: targetUser(), error: null });
    mock.current!.queueResult({ data: null, error: null });

    const body = await (await verify(post({ verified: true }), userParams())).json();
    expect(JSON.stringify(body)).not.toContain("$2b$10$");
  });

  it("แอดมินแก้บัญชีแอดมินด้วยกันไม่ได้ → 403", async () => {
    mock.current!.queueResult({ data: targetUser({ role: "admin" }), error: null });
    const res = await verify(post({ verified: false }), userParams());
    expect(res.status).toBe(403);
    expect(mock.current!.callsTo("users")).toHaveLength(1);
  });
});
