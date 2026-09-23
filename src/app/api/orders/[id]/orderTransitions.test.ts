import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// state machine ของออเดอร์ (flow นัดเจอ) — reserved → awaiting_buyer_confirmation → completed
//                                          (แยกไป cancelled ได้ระหว่างทาง)
//
// สิ่งที่เทสชุดนี้เฝ้าคือ "compare-and-swap": ทุกคำสั่งเปลี่ยนสถานะต้องแนบเงื่อนไขสถานะเดิม
// ไปกับ UPDATE ด้วยเสมอ ไม่ใช่แค่เช็คใน JS แล้วค่อยเขียน เพราะระหว่างสองบรรทัดนั้นมีช่องให้
// request อื่นแทรกเข้ามาเปลี่ยนสถานะได้ (เช่นผู้ซื้อกดยกเลิกพอดีตอนผู้ขายกดแจ้งส่งมอบ)
// ถ้าไม่มีเงื่อนไขกำกับ ทั้งสองคำสั่งจะสำเร็จทั้งคู่และเขียนทับกันเงียบๆ
const { mock, mockUser, completeOrderMock } = vi.hoisted(() => ({
  completeOrderMock: { current: (async () => ({})) as (...a: unknown[]) => Promise<unknown> },
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

// การปิดออเดอร์ทำผ่าน completeOrder ซึ่งมีเทสของตัวเองอยู่แล้วใน orderCompletion.test.ts
// ตรงนี้สนใจแค่ว่า route เรียกมันเมื่อไหร่ และแปลง error ที่โยนออกมาเป็น status อะไร
vi.mock("@/lib/orderCompletion", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orderCompletion")>("@/lib/orderCompletion");
  return {
    OrderStateConflictError: actual.OrderStateConflictError,
    completeOrder: (...args: unknown[]) => completeOrderMock.current(...args),
  };
});

const { POST: cancel } = await import("./cancel/route");
const { POST: markDelivered } = await import("./mark-delivered/route");
const { POST: confirmReceipt } = await import("./confirm-receipt/route");
const { OrderStateConflictError } = await import("@/lib/orderCompletion");

const BUYER = { id: "buyer-1", role: "user", name: "ผู้ซื้อ" };
const SELLER = { id: "seller-1", role: "user", name: "ผู้ขาย" };

const order = (status: string) => ({
  id: "order-1",
  product_id: "product-1",
  buyer_id: BUYER.id,
  seller_id: SELLER.id,
  status,
  amount: 3500,
  created_at: "2026-01-01T00:00:00Z",
});

const params = { params: Promise.resolve({ id: "order-1" }) };
const req = () => new Request("http://localhost/api/orders/order-1/x", { method: "POST" });

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = BUYER;
});

const updateOf = (call: ReturnType<typeof createSupabaseMock>["calls"][number]) =>
  call.ops.find(([m]) => m === "update")?.[1] as Record<string, unknown>;

describe("ยกเลิกออเดอร์", () => {
  it("ยกเลิกการจองได้ก่อนผู้ขายกดส่งมอบ และต้องล็อกสถานะที่ยอมรับไว้ใน UPDATE", async () => {
    mock.current!.queueResult({ data: order("reserved"), error: null });
    mock.current!.queueResult({ data: order("cancelled"), error: null });
    mock.current!.queueResult({ data: null, error: null }); // คืนสินค้ากลับเป็น listed

    const res = await cancel(req(), params);
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("orders")[1];
    expect(hasOp(update, "in", "status", ["reserved", "meetup_scheduled"])).toBe(true);
  });

  it("ยกเลิกแล้วต้องบันทึกว่าใครยกเลิกและเพราะอะไร (Phase 2 เอาไปคิดคะแนน)", async () => {
    mock.current!.queueResult({ data: order("reserved"), error: null });
    mock.current!.queueResult({ data: order("cancelled"), error: null });
    mock.current!.queueResult({ data: null, error: null });

    await cancel(req(), params);
    const payload = updateOf(mock.current!.callsTo("orders")[1]);
    expect(payload.cancel_reason).toBe("buyer_cancelled");
    expect(payload.cancelled_by).toBe(BUYER.id);
  });

  it("ยกเลิกสำเร็จต้องปล่อยสินค้ากลับมาขายต่อได้ ไม่ค้างสถานะ reserved", async () => {
    mock.current!.queueResult({ data: order("reserved"), error: null });
    mock.current!.queueResult({ data: order("cancelled"), error: null });
    mock.current!.queueResult({ data: null, error: null });

    await cancel(req(), params);

    const productUpdate = mock.current!.callsTo("products")[0];
    expect(productUpdate).toBeDefined();
    expect(hasOp(productUpdate, "update", { status: "listed" })).toBe(true);
    expect(hasOp(productUpdate, "eq", "id", "product-1")).toBe(true);
  });

  it("ผู้ขายกดแจ้งส่งมอบตัดหน้าพอดี ผู้ซื้อยกเลิกไม่ได้ → 409 และสินค้าต้องไม่ถูกปล่อยคืน", async () => {
    mock.current!.queueResult({ data: order("reserved"), error: null }); // ตอนอ่านยังยกเลิกได้อยู่
    mock.current!.queueResult({ data: null, error: null }); // แต่ UPDATE ไม่โดนแถว สถานะเปลี่ยนไปแล้ว

    const res = await cancel(req(), params);
    expect(res.status).toBe(409);

    // ข้อนี้สำคัญ: ถ้าปล่อยสินค้าคืนทั้งที่ยกเลิกไม่สำเร็จ สินค้าจะถูกขายซ้ำได้ทั้งที่มีออเดอร์ค้างอยู่
    expect(mock.current!.callsTo("products")).toHaveLength(0);
  });

  it("ผู้ขายยกเลิกออเดอร์ของผู้ซื้อไม่ได้ → 403", async () => {
    mockUser.current = SELLER;
    mock.current!.queueResult({ data: order("reserved"), error: null });

    const res = await cancel(req(), params);
    expect(res.status).toBe(403);
    expect(mock.current!.callsTo("orders")).toHaveLength(1);
  });

  it("ผู้ขายกดส่งมอบไปแล้วยกเลิกไม่ได้ → 409", async () => {
    for (const status of ["awaiting_buyer_confirmation", "completed"]) {
      mock.current = createSupabaseMock();
      mock.current.queueResult({ data: order(status), error: null });

      const res = await cancel(req(), params);
      expect(res.status).toBe(409);
      expect(mock.current.callsTo("products")).toHaveLength(0);
    }
  });
});

describe("ผู้ขายกดส่งมอบ (reserved → awaiting_buyer_confirmation)", () => {
  beforeEach(() => {
    mockUser.current = SELLER;
  });

  it("ผู้ขายแจ้งได้ บันทึกเวลา และล็อกสถานะเดิมไว้ใน UPDATE", async () => {
    mock.current!.queueResult({ data: order("reserved"), error: null });
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });

    const res = await markDelivered(req(), params);
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("orders")[1];
    expect(updateOf(update).status).toBe("awaiting_buyer_confirmation");
    expect(Number.isFinite(Date.parse(String(updateOf(update).seller_marked_delivered_at)))).toBe(true);
    expect(hasOp(update, "in", "status", ["reserved", "meetup_scheduled"])).toBe(true);
  });

  it("ผู้ซื้อแจ้งส่งมอบแทนผู้ขายไม่ได้ → 403", async () => {
    mockUser.current = BUYER;
    mock.current!.queueResult({ data: order("reserved"), error: null });
    expect((await markDelivered(req(), params)).status).toBe(403);
    expect(mock.current!.callsTo("orders")).toHaveLength(1);
  });

  it("ออเดอร์ที่จบไปแล้ว กดส่งมอบซ้ำไม่ได้ → 409", async () => {
    mock.current!.queueResult({ data: order("completed"), error: null });
    expect((await markDelivered(req(), params)).status).toBe(409);
    expect(mock.current!.callsTo("orders")).toHaveLength(1);
  });

  it("ผู้ซื้อยกเลิกตัดหน้าพอดี → 409 ไม่ใช่สำเร็จเงียบๆ", async () => {
    mock.current!.queueResult({ data: order("reserved"), error: null });
    mock.current!.queueResult({ data: null, error: null });
    expect((await markDelivered(req(), params)).status).toBe(409);
  });
});

describe("ผู้ซื้อยืนยันรับของ (awaiting_buyer_confirmation → completed)", () => {
  // 1b เอาขั้น OTP ออก — ผู้ซื้อกดยืนยันแล้วปิดออเดอร์เลย ไม่มีขั้นให้ผู้ขายกรอกรหัสคั่นอีก
  it("กดยืนยันแล้วปิดออเดอร์ทันที ผ่าน completeOrder ตัวเดียวกับที่ cron ใช้", async () => {
    let via: string | null = null;
    completeOrderMock.current = async (...a: unknown[]) => {
      via = String(a[3]);
      return { id: "order-1", status: "completed" };
    };
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });
    mock.current!.queueResult({ data: null, error: null }); // อัปเดต buyer_confirmed_at

    const res = await confirmReceipt(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).order.status).toBe("completed");
    expect(via).toBe("buyer_confirmed");
  });

  it("บันทึกเวลาที่ผู้ซื้อกดยืนยันไว้ด้วย (Phase 2 ต้องใช้แยกว่าใครกดบ้าง)", async () => {
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });
    mock.current!.queueResult({ data: null, error: null });

    await confirmReceipt(req(), params);
    const update = mock.current!.callsTo("orders")[1];
    expect(Date.parse(String(updateOf(update).buyer_confirmed_at))).toBeLessThanOrEqual(Date.now());
  });

  it("ผู้ขายกดยืนยันรับของแทนผู้ซื้อไม่ได้ → 403", async () => {
    mockUser.current = SELLER;
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });
    expect((await confirmReceipt(req(), params)).status).toBe(403);
  });

  it("ออเดอร์ถูกปิดไปแล้วโดย cron พอดี → 409 ไม่ใช่ 500", async () => {
    completeOrderMock.current = async () => {
      throw new OrderStateConflictError();
    };
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });
    expect((await confirmReceipt(req(), params)).status).toBe(409);
  });
});

