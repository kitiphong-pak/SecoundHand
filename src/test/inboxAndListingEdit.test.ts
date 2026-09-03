import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// สี่ route ที่เหลือ: กล่องแชท, ตัวเลขแจ้งเตือน, แก้ไขประกาศ และปุ่มจำลอง timeout ของเดโม
// จุดร่วมคือทุกตัวต้องผูกกับ id ของคนที่ล็อกอินอยู่ ไม่ใช่รับ id มาจากคำขอ
const { mock, mockUser, completeOrderMock } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  mockUser: { current: null as { id: string; role: string; name: string } | null },
  completeOrderMock: { current: (async () => ({})) as (...a: unknown[]) => Promise<unknown> },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mockUser.current }));
vi.mock("@/lib/auditLog", () => ({ logAction: async () => {} }));
vi.mock("@/lib/orderCompletion", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orderCompletion")>("@/lib/orderCompletion");
  return {
    OrderStateConflictError: actual.OrderStateConflictError,
    completeOrder: (...a: unknown[]) => completeOrderMock.current(...a),
  };
});

const { GET: chatInbox } = await import("@/app/api/chat/route");
const { GET: badges } = await import("@/app/api/badges/route");
const { PATCH: editListing } = await import("@/app/api/products/[id]/route");
const { POST: simulateTimeout } = await import("@/app/api/orders/[id]/simulate-timeout/route");
const { OrderStateConflictError } = await import("@/lib/orderCompletion");

const USER = { id: "user-1", role: "user", name: "ผู้ใช้" };
const ADMIN = { id: "admin-1", role: "admin", name: "แอดมิน" };
const OTHER = { id: "other-1", role: "user", name: "คนอื่น" };

const product = (status = "listed", sellerId = USER.id) => ({
  id: "product-1",
  seller_id: sellerId,
  title: "จักรยาน",
  description: "สภาพดี",
  price: 3500,
  category: "กีฬา",
  condition: "good",
  province: "เชียงใหม่",
  images: [],
  status,
  created_at: "2026-01-01T00:00:00Z",
});

const order = (status = "awaiting_buyer_confirmation") => ({
  id: "order-1",
  product_id: "product-1",
  buyer_id: USER.id,
  seller_id: "seller-9",
  status,
  amount: 3500,
  created_at: "2026-01-01T00:00:00Z",
});

const goodEdit = {
  title: "จักรยานพับได้",
  description: "สภาพดีมาก",
  price: 4200,
  category: "กีฬา",
  condition: "like_new",
};

const patch = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const productParams = { params: Promise.resolve({ id: "product-1" }) };
const orderParams = { params: Promise.resolve({ id: "order-1" }) };

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = USER;
  completeOrderMock.current = async () => ({ id: "order-1", status: "completed" });
});

describe("กล่องแชท", () => {
  it("ดึงเฉพาะห้องที่เราเป็นผู้ซื้อหรือผู้ขาย", async () => {
    mock.current!.queueResult({ data: [], error: null });

    const res = await chatInbox();
    expect(res.status).toBe(200);

    const call = mock.current!.callsTo("chat_threads")[0];
    const orFilter = String(call.ops.find(([m]) => m === "or")?.[1] ?? "");
    expect(orFilter).toContain(`seller_id.eq.${USER.id}`);
    expect(orFilter).toContain(`buyer_id.eq.${USER.id}`);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401 และไม่แตะฐานข้อมูล", async () => {
    mockUser.current = null;
    expect((await chatInbox()).status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("ตัวเลขแจ้งเตือน", () => {
  it("นับเฉพาะของผู้ใช้คนที่ล็อกอินอยู่", async () => {
    for (let i = 0; i < 8; i++) mock.current!.queueResult({ data: [], error: null });

    const res = await badges();
    expect(res.status).toBe(200);

    const orderCalls = mock.current!.callsTo("orders");
    expect(orderCalls.some((c) => hasOp(c, "eq", "seller_id", USER.id))).toBe(true);
    expect(orderCalls.some((c) => hasOp(c, "eq", "buyer_id", USER.id))).toBe(true);
  });

  it("ผู้ใช้ทั่วไปไม่ได้ตัวเลขของฝั่งแอดมิน", async () => {
    for (let i = 0; i < 8; i++) mock.current!.queueResult({ data: [], error: null });
    const body = await (await badges()).json();
    expect(body.openDisputes).toBe(0);
    expect(body.openSupport).toBe(0);
  });

  it("แอดมินไม่ถูกนับข้อความ support ของตัวเอง", async () => {
    mockUser.current = ADMIN;
    for (let i = 0; i < 8; i++) mock.current!.queueResult({ data: [], error: null });
    const body = await (await badges()).json();
    expect(body.unreadSupport).toBe(0);
    // แอดมินไม่มีห้อง support ของตัวเอง จึงต้องไม่มี query ไปที่ตารางนั้นด้วย eq user_id
    const supportCalls = mock.current!.callsTo("support_messages");
    expect(supportCalls.every((c) => !hasOp(c, "eq", "user_id", ADMIN.id))).toBe(true);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401", async () => {
    mockUser.current = null;
    expect((await badges()).status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("แก้ไขประกาศขาย", () => {
  it("เจ้าของแก้ได้ และ UPDATE ต้องล็อกสถานะ listed ไว้", async () => {
    mock.current!.queueResult({ data: product(), error: null });
    mock.current!.queueResult({ data: product(), error: null });

    const res = await editListing(patch(goodEdit), productParams);
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("products")[1];
    expect(hasOp(update, "eq", "status", "listed")).toBe(true);
  });

  it("คนอื่นแก้ประกาศของเราไม่ได้ → 403 และไม่มีการเขียน", async () => {
    mockUser.current = OTHER;
    mock.current!.queueResult({ data: product(), error: null });

    expect((await editListing(patch(goodEdit), productParams)).status).toBe(403);
    expect(mock.current!.callsTo("products")).toHaveLength(1);
  });

  it("สินค้าที่มีคนจอง/ซื้อแล้ว แก้ไม่ได้ → 409 (กันเปลี่ยนราคาหลังมีคนซื้อ)", async () => {
    for (const status of ["reserved", "sold", "removed"]) {
      mock.current = createSupabaseMock();
      mock.current.queueResult({ data: product(status), error: null });
      expect((await editListing(patch(goodEdit), productParams)).status).toBe(409);
      expect(mock.current.callsTo("products")).toHaveLength(1);
    }
  });

  it("แก้เป็นราคาที่ใช้ไม่ได้ → 400", async () => {
    mock.current!.queueResult({ data: product(), error: null });
    expect((await editListing(patch({ ...goodEdit, price: -50 }), productParams)).status).toBe(400);
  });

  it("รูปที่ชี้ไปโดเมนอื่นถูกกรองทิ้งตอนแก้ไขด้วย", async () => {
    mock.current!.queueResult({ data: product(), error: null });
    mock.current!.queueResult({ data: product(), error: null });

    await editListing(patch({ ...goodEdit, images: ["https://evil.example.com/x.png"] }), productParams);
    const update = mock.current!.callsTo("products")[1];
    const payload = update.ops.find(([m]) => m === "update")?.[1] as Record<string, unknown>;
    expect(payload.images).toEqual([]);
  });
});

describe("ปุ่มจำลอง timeout (เดโม)", () => {
  it("คู่ซื้อขายกดได้เมื่อออเดอร์อยู่ในสถานะที่รอ timeout", async () => {
    mock.current!.queueResult({ data: order(), error: null });
    expect((await simulateTimeout(new Request("http://localhost/x", { method: "POST" }), orderParams)).status).toBe(200);
  });

  it("คนนอกกดไม่ได้ → 403 และต้องไม่ปิดออเดอร์", async () => {
    mockUser.current = OTHER;
    let called = false;
    completeOrderMock.current = async () => {
      called = true;
      return {};
    };
    mock.current!.queueResult({ data: order(), error: null });

    expect((await simulateTimeout(new Request("http://localhost/x", { method: "POST" }), orderParams)).status).toBe(403);
    expect(called).toBe(false);
  });

  it("ออเดอร์ที่ยังไม่ถึงขั้นรอ timeout → 409", async () => {
    mock.current!.queueResult({ data: order("paid"), error: null });
    expect((await simulateTimeout(new Request("http://localhost/x", { method: "POST" }), orderParams)).status).toBe(409);
  });

  it("cron ปิดออเดอร์ตัดหน้าไปแล้ว → 409 ไม่ใช่ 500", async () => {
    completeOrderMock.current = async () => {
      throw new OrderStateConflictError();
    };
    mock.current!.queueResult({ data: order(), error: null });
    expect((await simulateTimeout(new Request("http://localhost/x", { method: "POST" }), orderParams)).status).toBe(409);
  });
});
