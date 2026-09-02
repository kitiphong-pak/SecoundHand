import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";

// state machine ของออเดอร์ — pending_payment → paid → awaiting_buyer_confirmation
//                            → awaiting_otp_entry → completed (แยกไป cancelled/disputed ได้)
//
// สิ่งที่เทสชุดนี้เฝ้าคือ "compare-and-swap": ทุกคำสั่งเปลี่ยนสถานะต้องแนบเงื่อนไขสถานะเดิม
// ไปกับ UPDATE ด้วยเสมอ ไม่ใช่แค่เช็คใน JS แล้วค่อยเขียน เพราะระหว่างสองบรรทัดนั้นมีช่องให้
// request อื่นแทรกเข้ามาเปลี่ยนสถานะได้ (เช่นผู้ซื้อกดยกเลิกพอดีตอนผู้ขายกดแจ้งส่งมอบ)
// ถ้าไม่มีเงื่อนไขกำกับ ทั้งสองคำสั่งจะสำเร็จทั้งคู่และเขียนทับกันเงียบๆ
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

const { POST: pay } = await import("./pay/route");
const { POST: cancel } = await import("./cancel/route");

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
    expect(hasOp(update, "update", { status: "paid" })).toBe(true);
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
