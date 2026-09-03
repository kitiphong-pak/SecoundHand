import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// state machine ของออเดอร์ — pending_payment → paid → awaiting_buyer_confirmation
//                            → awaiting_otp_entry → completed (แยกไป cancelled/disputed ได้)
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

// verify-otp ปิดออเดอร์ผ่าน completeOrder ซึ่งมีเทสของตัวเองอยู่แล้วใน orderCompletion.test.ts
// ตรงนี้สนใจแค่ว่า route เรียกมันเมื่อไหร่ และแปลง error ที่โยนออกมาเป็น status อะไร
vi.mock("@/lib/orderCompletion", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orderCompletion")>("@/lib/orderCompletion");
  return {
    OrderStateConflictError: actual.OrderStateConflictError,
    completeOrder: (...args: unknown[]) => completeOrderMock.current(...args),
  };
});

const { POST: pay } = await import("./pay/route");
const { POST: cancel } = await import("./cancel/route");
const { POST: markDelivered } = await import("./mark-delivered/route");
const { POST: confirmReceipt } = await import("./confirm-receipt/route");
const { POST: verifyOtp } = await import("./verify-otp/route");
const { POST: openDispute } = await import("./dispute/route");
const { OrderStateConflictError } = await import("@/lib/orderCompletion");

const BUYER = { id: "buyer-1", role: "user", name: "ผู้ซื้อ" };
const SELLER = { id: "seller-1", role: "user", name: "ผู้ขาย" };
const OUTSIDER = { id: "stranger-1", role: "user", name: "คนนอก" };

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

describe("ชำระเงิน (pending_payment → paid)", () => {
  it("ผู้ซื้อชำระเงินได้ และ UPDATE ต้องมีเงื่อนไขสถานะเดิมกำกับ", async () => {
    mock.current!.queueResult({ data: order("pending_payment"), error: null });
    mock.current!.queueResult({ data: order("paid"), error: null });

    const res = await pay(req(), params);
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("orders")[1];
    const payload = update.ops.find(([m]) => m === "update")?.[1] as Record<string, unknown>;
    expect(payload.status).toBe("paid");
    // ต้องบันทึกเวลาชำระเงินไปพร้อมกันใน UPDATE เดียว ไม่ใช่เขียนตามทีหลังคนละคำสั่ง
    expect(Number.isFinite(Date.parse(String(payload.paid_at)))).toBe(true);
    expect(hasOp(update, "eq", "status", "pending_payment")).toBe(true);
  });

  it("กดชำระซ้ำสองครั้งพร้อมกัน ครั้งที่แพ้ต้องได้ 409 ไม่ใช่สำเร็จเงียบๆ", async () => {
    mock.current!.queueResult({ data: order("pending_payment"), error: null }); // อ่านตอนยังไม่จ่าย
    mock.current!.queueResult({ data: null, error: null }); // แต่ UPDATE ไม่โดนแถว มีคนจ่ายตัดหน้าไปแล้ว

    const res = await pay(req(), params);
    expect(res.status).toBe(409);
  });

  it("คนอื่นที่ไม่ใช่ผู้ซื้อ จ่ายเงินแทนไม่ได้ → 403 และต้องไม่มีการเขียนใดๆ", async () => {
    mockUser.current = OUTSIDER;
    mock.current!.queueResult({ data: order("pending_payment"), error: null });

    const res = await pay(req(), params);
    expect(res.status).toBe(403);
    expect(mock.current!.callsTo("orders")).toHaveLength(1); // อ่านอย่างเดียว
  });

  it("ออเดอร์ที่จ่ายแล้ว จ่ายซ้ำไม่ได้ → 409", async () => {
    mock.current!.queueResult({ data: order("paid"), error: null });
    const res = await pay(req(), params);
    expect(res.status).toBe(409);
    expect(mock.current!.callsTo("orders")).toHaveLength(1);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401", async () => {
    mockUser.current = null;
    expect((await pay(req(), params)).status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("ยกเลิกออเดอร์", () => {
  it("ยกเลิกได้เฉพาะก่อนผู้ขายเริ่มส่งมอบ และต้องล็อกสถานะที่ยอมรับไว้ใน UPDATE", async () => {
    mock.current!.queueResult({ data: order("paid"), error: null });
    mock.current!.queueResult({ data: order("cancelled"), error: null });
    mock.current!.queueResult({ data: null, error: null }); // คืนสินค้ากลับเป็น listed

    const res = await cancel(req(), params);
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("orders")[1];
    expect(hasOp(update, "in", "status", ["pending_payment", "paid"])).toBe(true);
  });

  it("ยกเลิกสำเร็จต้องปล่อยสินค้ากลับมาขายต่อได้ ไม่ค้างสถานะ reserved", async () => {
    mock.current!.queueResult({ data: order("paid"), error: null });
    mock.current!.queueResult({ data: order("cancelled"), error: null });
    mock.current!.queueResult({ data: null, error: null });

    await cancel(req(), params);

    const productUpdate = mock.current!.callsTo("products")[0];
    expect(productUpdate).toBeDefined();
    expect(hasOp(productUpdate, "update", { status: "listed" })).toBe(true);
    expect(hasOp(productUpdate, "eq", "id", "product-1")).toBe(true);
  });

  it("ผู้ขายกดแจ้งส่งมอบตัดหน้าพอดี ผู้ซื้อยกเลิกไม่ได้ → 409 และสินค้าต้องไม่ถูกปล่อยคืน", async () => {
    mock.current!.queueResult({ data: order("paid"), error: null }); // ตอนอ่านยังยกเลิกได้อยู่
    mock.current!.queueResult({ data: null, error: null }); // แต่ UPDATE ไม่โดนแถว สถานะเปลี่ยนไปแล้ว

    const res = await cancel(req(), params);
    expect(res.status).toBe(409);

    // ข้อนี้สำคัญ: ถ้าปล่อยสินค้าคืนทั้งที่ยกเลิกไม่สำเร็จ สินค้าจะถูกขายซ้ำได้ทั้งที่มีออเดอร์ค้างอยู่
    expect(mock.current!.callsTo("products")).toHaveLength(0);
  });

  it("ผู้ขายยกเลิกออเดอร์ของผู้ซื้อไม่ได้ → 403", async () => {
    mockUser.current = SELLER;
    mock.current!.queueResult({ data: order("paid"), error: null });

    const res = await cancel(req(), params);
    expect(res.status).toBe(403);
    expect(mock.current!.callsTo("orders")).toHaveLength(1);
  });

  it("เลยขั้นส่งมอบไปแล้วยกเลิกไม่ได้ ต้องไปใช้ระบบข้อพิพาทแทน → 409", async () => {
    for (const status of ["awaiting_buyer_confirmation", "awaiting_otp_entry", "completed"]) {
      mock.current = createSupabaseMock();
      mock.current.queueResult({ data: order(status), error: null });

      const res = await cancel(req(), params);
      expect(res.status).toBe(409);
      expect(mock.current.callsTo("products")).toHaveLength(0);
    }
  });
});

const reqJson = (body: unknown) =>
  new Request("http://localhost/api/orders/order-1/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const updateOf = (call: ReturnType<typeof createSupabaseMock>["calls"][number]) =>
  call.ops.find(([m]) => m === "update")?.[1] as Record<string, unknown>;

describe("ผู้ขายแจ้งส่งมอบ (paid → awaiting_buyer_confirmation)", () => {
  beforeEach(() => {
    mockUser.current = SELLER;
  });

  it("ผู้ขายแจ้งได้ บันทึกเวลา และล็อกสถานะเดิมไว้ใน UPDATE", async () => {
    mock.current!.queueResult({ data: order("paid"), error: null });
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });

    const res = await markDelivered(req(), params);
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("orders")[1];
    expect(updateOf(update).status).toBe("awaiting_buyer_confirmation");
    expect(Number.isFinite(Date.parse(String(updateOf(update).seller_marked_delivered_at)))).toBe(true);
    expect(hasOp(update, "eq", "status", "paid")).toBe(true);
  });

  it("ผู้ซื้อแจ้งส่งมอบแทนผู้ขายไม่ได้ → 403", async () => {
    mockUser.current = BUYER;
    mock.current!.queueResult({ data: order("paid"), error: null });
    expect((await markDelivered(req(), params)).status).toBe(403);
    expect(mock.current!.callsTo("orders")).toHaveLength(1);
  });

  it("ยังไม่ชำระเงินก็แจ้งส่งมอบไม่ได้ → 409", async () => {
    mock.current!.queueResult({ data: order("pending_payment"), error: null });
    expect((await markDelivered(req(), params)).status).toBe(409);
    expect(mock.current!.callsTo("orders")).toHaveLength(1);
  });

  it("ผู้ซื้อยกเลิกตัดหน้าพอดี → 409 ไม่ใช่สำเร็จเงียบๆ", async () => {
    mock.current!.queueResult({ data: order("paid"), error: null });
    mock.current!.queueResult({ data: null, error: null });
    expect((await markDelivered(req(), params)).status).toBe(409);
  });
});

describe("ผู้ซื้อยืนยันรับของ (awaiting_buyer_confirmation → awaiting_otp_entry)", () => {
  it("ยืนยันแล้วต้องออก OTP พร้อมวันหมดอายุในอนาคต", async () => {
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });
    mock.current!.queueResult({ data: order("awaiting_otp_entry"), error: null });

    const res = await confirmReceipt(req(), params);
    expect(res.status).toBe(200);

    const update = mock.current!.callsTo("orders")[1];
    const payload = updateOf(update);
    expect(payload.status).toBe("awaiting_otp_entry");
    expect(String(payload.otp_code)).toMatch(/^\d{4,8}$/);
    expect(Date.parse(String(payload.otp_expires_at))).toBeGreaterThan(Date.now());
    expect(hasOp(update, "eq", "status", "awaiting_buyer_confirmation")).toBe(true);
  });

  it("ผู้ขายกดยืนยันรับของแทนผู้ซื้อไม่ได้ → 403", async () => {
    mockUser.current = SELLER;
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });
    expect((await confirmReceipt(req(), params)).status).toBe(403);
  });

  it("สถานะเปลี่ยนไปแล้วระหว่างทาง → 409", async () => {
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });
    mock.current!.queueResult({ data: null, error: null });
    expect((await confirmReceipt(req(), params)).status).toBe(409);
  });
});

describe("ผู้ขายกรอก OTP ปิดออเดอร์", () => {
  const withOtp = (over: Record<string, unknown> = {}) => ({
    ...order("awaiting_otp_entry"),
    otp_code: "482913",
    otp_expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...over,
  });

  beforeEach(() => {
    mockUser.current = SELLER;
    completeOrderMock.current = async () => ({ id: "order-1", status: "completed" });
  });

  it("กรอกถูกต้องแล้วปิดออเดอร์", async () => {
    mock.current!.queueResult({ data: withOtp(), error: null });
    expect((await verifyOtp(reqJson({ code: "482913" }), params)).status).toBe(200);
  });

  it("กรอกผิดต้องไม่ปิดออเดอร์เด็ดขาด → 400", async () => {
    let called = false;
    completeOrderMock.current = async () => {
      called = true;
      return {};
    };
    mock.current!.queueResult({ data: withOtp(), error: null });

    expect((await verifyOtp(reqJson({ code: "000000" }), params)).status).toBe(400);
    expect(called).toBe(false);
  });

  it("ไม่ส่งรหัสมาเลยก็ต้องไม่ผ่าน แม้ otp_code ในฐานข้อมูลจะว่าง", async () => {
    mock.current!.queueResult({ data: withOtp({ otp_code: null }), error: null });
    expect((await verifyOtp(reqJson({}), params)).status).toBe(400);
  });

  it("OTP หมดอายุแล้ว → 410 ถึงจะกรอกรหัสถูกก็ตาม", async () => {
    mock.current!.queueResult({
      data: withOtp({ otp_expires_at: new Date(Date.now() - 1000).toISOString() }),
      error: null,
    });
    expect((await verifyOtp(reqJson({ code: "482913" }), params)).status).toBe(410);
  });

  it("ผู้ซื้อกรอก OTP เองไม่ได้ → 403", async () => {
    mockUser.current = BUYER;
    mock.current!.queueResult({ data: withOtp(), error: null });
    expect((await verifyOtp(reqJson({ code: "482913" }), params)).status).toBe(403);
  });

  it("ออเดอร์ถูกปิดไปแล้วโดย cron พอดี → 409 ไม่ใช่ 500", async () => {
    completeOrderMock.current = async () => {
      throw new OrderStateConflictError();
    };
    mock.current!.queueResult({ data: withOtp(), error: null });
    expect((await verifyOtp(reqJson({ code: "482913" }), params)).status).toBe(409);
  });
});

describe("เปิดข้อพิพาท", () => {
  it("ผู้ซื้อเปิดได้ระหว่างรอยืนยัน และล็อกสถานะที่ยอมรับไว้ใน UPDATE", async () => {
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });
    mock.current!.queueResult({ data: order("disputed"), error: null });

    expect((await openDispute(reqJson({ reason: "ของไม่ตรงปก" }), params)).status).toBe(200);

    const update = mock.current!.callsTo("orders")[1];
    expect(updateOf(update).dispute_reason).toBe("ของไม่ตรงปก");
    expect(
      hasOp(update, "in", "status", ["completed", "awaiting_buyer_confirmation", "awaiting_otp_entry"])
    ).toBe(true);
  });

  it("ปิดออเดอร์ไปแล้วแต่ยังไม่เกินระยะผ่อนผัน ก็ยังเปิดได้", async () => {
    mock.current!.queueResult({
      data: { ...order("completed"), completed_at: new Date(Date.now() - 60_000).toISOString() },
      error: null,
    });
    mock.current!.queueResult({ data: order("disputed"), error: null });
    expect((await openDispute(reqJson({ reason: "ของเสีย" }), params)).status).toBe(200);
  });

  it("เกินระยะผ่อนผันหลังปิดออเดอร์ → 410", async () => {
    mock.current!.queueResult({
      data: {
        ...order("completed"),
        completed_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      error: null,
    });
    expect((await openDispute(reqJson({ reason: "ของเสีย" }), params)).status).toBe(410);
    expect(mock.current!.callsTo("orders")).toHaveLength(1);
  });

  it("ยังไม่ถึงขั้นส่งมอบก็เปิดข้อพิพาทไม่ได้ → 409", async () => {
    mock.current!.queueResult({ data: order("pending_payment"), error: null });
    expect((await openDispute(reqJson({ reason: "x" }), params)).status).toBe(409);
  });

  it("ผู้ขายเปิดข้อพิพาทไม่ได้ → 403", async () => {
    mockUser.current = SELLER;
    mock.current!.queueResult({ data: order("awaiting_buyer_confirmation"), error: null });
    expect((await openDispute(reqJson({ reason: "x" }), params)).status).toBe(403);
  });

  it("ไม่กรอกเหตุผล → 400 และไม่แตะฐานข้อมูล", async () => {
    expect((await openDispute(reqJson({ reason: "   " }), params)).status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });
});
