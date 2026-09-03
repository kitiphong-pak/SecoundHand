import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// รีวิว, งานตามเวลาอัตโนมัติ และ endpoint เบาๆ ที่เหลือ
// สองเรื่องที่สำคัญที่สุดในไฟล์นี้: รีวิวซ้ำต้องไม่ได้ (ไม่งั้นปั่นคะแนนตัวเองได้) และ endpoint
// ของ cron ต้องไม่มีใครยิงได้ถ้าไม่มี secret (ไม่งั้นใครก็สั่งปิดออเดอร์ทั้งระบบได้)
const { mock, mockUser, sweepMock } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  mockUser: { current: null as { id: string; role: string; name: string } | null },
  sweepMock: { current: (async () => ({ completedOrderIds: [] })) as () => Promise<unknown> },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockUser.current,
  destroySession: async () => {},
}));
vi.mock("@/lib/auditLog", () => ({ logAction: async () => {} }));
vi.mock("@/lib/orderTimeoutSweep", () => ({ processOrderTimeouts: () => sweepMock.current() }));

const { POST: review } = await import("@/app/api/orders/[id]/review/route");
const { GET: cronGet, POST: cronPost } = await import("@/app/api/cron/order-timeouts/route");
const { GET: me } = await import("@/app/api/auth/me/route");
const { POST: logout } = await import("@/app/api/auth/logout/route");

const BUYER = { id: "buyer-1", role: "user", name: "ผู้ซื้อ" };
const SELLER = { id: "seller-1", role: "user", name: "ผู้ขาย" };
const OUTSIDER = { id: "stranger-1", role: "user", name: "คนนอก" };

const order = (status = "completed") => ({
  id: "order-1",
  product_id: "product-1",
  buyer_id: BUYER.id,
  seller_id: SELLER.id,
  status,
  amount: 3500,
  created_at: "2026-01-01T00:00:00Z",
});

const reviewRow = {
  id: "review-1",
  order_id: "order-1",
  from_user_id: BUYER.id,
  to_user_id: SELLER.id,
  rating: 5,
  comment: "ดีมาก",
  created_at: "2026-01-01T00:00:00Z",
};

const post = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const params = { params: Promise.resolve({ id: "order-1" }) };
const insertOf = (call: { ops: Array<[string, ...unknown[]]> }) =>
  call.ops.find(([m]) => m === "insert")?.[1] as Record<string, unknown>;

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = BUYER;
});

describe("รีวิวหลังปิดการซื้อขาย", () => {
  it("ผู้ซื้อรีวิวผู้ขายได้ และผู้รับถูกเลือกให้เป็นอีกฝ่ายเสมอ", async () => {
    mock.current!.queueResult({ data: order(), error: null });
    mock.current!.queueResult({ data: null, error: null }); // ยังไม่เคยรีวิว
    mock.current!.queueResult({ data: reviewRow, error: null });

    const res = await review(post({ rating: 5, comment: "ดีมาก" }), params);
    expect(res.status).toBe(201);

    const payload = insertOf(mock.current!.callsTo("reviews")[1]);
    expect(payload.from_user_id).toBe(BUYER.id);
    expect(payload.to_user_id).toBe(SELLER.id);
  });

  it("รีวิวซ้ำออเดอร์เดิมไม่ได้ → 409 (กันปั่นคะแนน)", async () => {
    mock.current!.queueResult({ data: order(), error: null });
    mock.current!.queueResult({ data: { id: "review-1" }, error: null }); // เคยรีวิวแล้ว

    const res = await review(post({ rating: 5, comment: "ดีมาก" }), params);
    expect(res.status).toBe(409);
    expect(mock.current!.callsTo("reviews")).toHaveLength(1); // อ่านอย่างเดียว ไม่ได้เขียน
  });

  it("เช็คว่าเคยรีวิวหรือยัง ต้องผูกกับทั้งออเดอร์และผู้รีวิว", async () => {
    mock.current!.queueResult({ data: order(), error: null });
    mock.current!.queueResult({ data: null, error: null });
    mock.current!.queueResult({ data: reviewRow, error: null });

    await review(post({ rating: 4, comment: "โอเค" }), params);

    const check = mock.current!.callsTo("reviews")[0];
    expect(hasOp(check, "eq", "order_id", "order-1")).toBe(true);
    expect(hasOp(check, "eq", "from_user_id", BUYER.id)).toBe(true);
  });

  it("คนนอกที่ไม่ใช่คู่ซื้อขายรีวิวไม่ได้ → 403", async () => {
    mockUser.current = OUTSIDER;
    mock.current!.queueResult({ data: order(), error: null });

    expect((await review(post({ rating: 5, comment: "ดี" }), params)).status).toBe(403);
    expect(mock.current!.callsTo("reviews")).toHaveLength(0);
  });

  it("ออเดอร์ที่ยังไม่ปิดการขาย รีวิวไม่ได้ → 409", async () => {
    mock.current!.queueResult({ data: order("paid"), error: null });
    expect((await review(post({ rating: 5, comment: "ดี" }), params)).status).toBe(409);
  });

  it("คะแนนนอกช่วง 1-5 หรือไม่ใช่จำนวนเต็ม → 400 ก่อนแตะฐานข้อมูล", async () => {
    for (const rating of [0, 6, -1, 4.5, NaN, "ห้าดาว"]) {
      expect((await review(post({ rating, comment: "ดี" }), params)).status).toBe(400);
    }
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("ไม่เขียนความคิดเห็น → 400", async () => {
    expect((await review(post({ rating: 5, comment: "   " }), params)).status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("endpoint ของ cron ปิดออเดอร์อัตโนมัติ", () => {
  const OLD = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    sweepMock.current = async () => ({ completedOrderIds: ["order-1"] });
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD;
  });

  const withAuth = (value?: string) =>
    new Request("http://localhost/api/cron/order-timeouts", {
      method: "POST",
      headers: value ? { authorization: value } : {},
    });

  it("มี secret ถูกต้อง → ทำงานและคืนรายการออเดอร์ที่ปิดไป", async () => {
    const res = await cronPost(withAuth("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect((await res.json()).completedOrderIds).toEqual(["order-1"]);
  });

  it("ไม่มี header เลย หรือ secret ผิด → 401 และต้องไม่รันงานกวาด", async () => {
    let ran = false;
    sweepMock.current = async () => {
      ran = true;
      return { completedOrderIds: [] };
    };
    for (const h of [undefined, "Bearer wrong", "test-secret", "Basic test-secret", ""]) {
      expect((await cronPost(withAuth(h))).status).toBe(401);
    }
    expect(ran).toBe(false);
  });

  it("ถ้าเซิร์ฟเวอร์ไม่ได้ตั้ง CRON_SECRET ไว้ ต้องปฏิเสธทุกคำขอ ไม่ใช่เปิดให้ทุกคน", async () => {
    delete process.env.CRON_SECRET;
    expect((await cronPost(withAuth("Bearer test-secret"))).status).toBe(401);
    expect((await cronPost(withAuth())).status).toBe(401);
  });

  it("GET ก็ต้องผ่านด่านเดียวกันกับ POST", async () => {
    expect((await cronGet(withAuth("Bearer wrong"))).status).toBe(401);
    expect((await cronGet(withAuth("Bearer test-secret"))).status).toBe(200);
  });
});

describe("endpoint บัญชีที่เหลือ", () => {
  it("me คืนผู้ใช้ปัจจุบัน และเป็น null เมื่อยังไม่ล็อกอิน", async () => {
    expect((await (await me()).json()).user).toEqual(BUYER);
    mockUser.current = null;
    expect((await (await me()).json()).user).toBeNull();
  });

  it("logout ตอบ ok ได้แม้ยังไม่ได้ล็อกอิน (กดซ้ำแล้วไม่พัง)", async () => {
    mockUser.current = null;
    const res = await logout();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
