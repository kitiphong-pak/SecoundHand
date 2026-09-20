import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

// การต่อรองราคาในแชท — จุดเสี่ยงคือ (1) ใครเสนอราคาหาใครได้บ้าง กันผู้ซื้อคนหนึ่งยิงข้อเสนอ
// ข้ามไปหาผู้ซื้ออีกคนของสินค้าเดียวกัน (2) เพดานราคาห้ามเกินราคาที่ตั้งไว้ตอนลงขาย และ
// (3) เฉพาะฝั่งที่ถูกเสนอเท่านั้นที่ตอบรับ/ปฏิเสธได้ — ทั้งหมดนี้ถ้าพังคือมีคนซื้อได้ในราคาที่
// ไม่มีใครตกลงจริง
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

const { POST: createOffer } = await import("@/app/api/chat/[productId]/offer/route");
const { POST: respondOffer } = await import("@/app/api/offers/[id]/respond/route");

// toUserId ต้องผ่านเช็ครูปแบบ UUID ในตัว route เอง (กันค่าที่หลุดโครงสร้าง filter DSL) — id
// ของทั้งผู้ซื้อและผู้ขายในเทสนี้เลยต้องเป็น UUID จริง ต่างจากเทสอื่นที่ไม่ได้ผ่านเช็คนี้
const SELLER = { id: "1e2d3c4b-5a69-4f10-8e21-0f9a8b7c6d5e", role: "user", name: "ผู้ขาย" };
const BUYER = { id: "3f1a7c2e-9b4d-4a1e-8c55-2d6b7e0f9a13", role: "user", name: "ผู้ซื้อ" };
const OTHER_BUYER = "9c2b1a44-1111-4a1e-8c55-2d6b7e0f9a99";
const ADMIN = { id: "admin-1", role: "admin", name: "แอดมิน" };

const productRow = {
  id: "product-1",
  seller_id: SELLER.id,
  status: "listed",
  price: 3500,
};

const offerRow = {
  id: "offer-1",
  product_id: "product-1",
  from_user_id: BUYER.id,
  to_user_id: SELLER.id,
  amount: 3000,
  status: "pending",
  created_at: "2026-01-01T00:00:00Z",
  responded_at: null,
};

const post = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const offerParams = { params: Promise.resolve({ productId: "product-1" }) };
const respondParams = { params: Promise.resolve({ id: "offer-1" }) };

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = BUYER;
});

describe("เสนอราคาต่อรอง", () => {
  it("ผู้ซื้อเสนอราคาหาผู้ขายได้ ผ่าน RPC create_offer", async () => {
    mock.current!.queueResult({ data: productRow, error: null });
    mock.current!.queueResult({ data: [offerRow], error: null });

    const res = await createOffer(post({ toUserId: SELLER.id, amount: 3000 }), offerParams);
    expect(res.status).toBe(201);

    const rpc = mock.current!.rpcCalls.find((r) => r.fn === "create_offer");
    expect(rpc).toBeDefined();
    const args = rpc!.args as Record<string, unknown>;
    expect(args.p_from_user_id).toBe(BUYER.id);
    expect(args.p_to_user_id).toBe(SELLER.id);
    expect(args.p_amount).toBe(3000);
  });

  it("เสนอราคาเกินราคาที่ตั้งไว้ → 400 ไม่แตะ RPC", async () => {
    mock.current!.queueResult({ data: productRow, error: null });
    const res = await createOffer(post({ toUserId: SELLER.id, amount: 9999 }), offerParams);
    expect(res.status).toBe(400);
    expect(mock.current!.rpcCalls).toHaveLength(0);
  });

  it("ผู้ซื้อเสนอราคาข้ามไปหาผู้ซื้อคนอื่น (ไม่ใช่ผู้ขาย) → 400", async () => {
    mock.current!.queueResult({ data: productRow, error: null });
    const res = await createOffer(post({ toUserId: OTHER_BUYER, amount: 3000 }), offerParams);
    expect(res.status).toBe(400);
    expect(mock.current!.rpcCalls).toHaveLength(0);
  });

  it("ผู้ขายต่อราคากลับหาผู้ซื้อได้ (ต่อรองสองทาง)", async () => {
    mockUser.current = SELLER;
    mock.current!.queueResult({ data: productRow, error: null });
    mock.current!.queueResult({ data: [{ ...offerRow, from_user_id: SELLER.id, to_user_id: BUYER.id }], error: null });

    const res = await createOffer(post({ toUserId: BUYER.id, amount: 3200 }), offerParams);
    expect(res.status).toBe(201);
  });

  it("เสนอราคาให้ตัวเอง → 400", async () => {
    const res = await createOffer(post({ toUserId: BUYER.id, amount: 3000 }), offerParams);
    expect(res.status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("แอดมินต่อรองราคาไม่ได้ → 403", async () => {
    mockUser.current = ADMIN;
    const res = await createOffer(post({ toUserId: SELLER.id, amount: 3000 }), offerParams);
    expect(res.status).toBe(403);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("สินค้าไม่ได้อยู่ในสถานะ listed แล้ว → 409", async () => {
    mock.current!.queueResult({ data: { ...productRow, status: "sold" }, error: null });
    const res = await createOffer(post({ toUserId: SELLER.id, amount: 3000 }), offerParams);
    expect(res.status).toBe(409);
  });

  it("ราคาที่เสนอไม่ถูกต้อง (0, ลบ, ไม่ใช่ตัวเลข) → 400 ก่อนแตะฐานข้อมูล", async () => {
    for (const amount of [0, -100, NaN, "ฟรี"]) {
      const res = await createOffer(post({ toUserId: SELLER.id, amount }), offerParams);
      expect(res.status).toBe(400);
    }
    expect(mock.current!.calls).toHaveLength(0);
  });
});

describe("ตอบรับ/ปฏิเสธข้อเสนอ", () => {
  it("ฝั่งที่ถูกเสนอกดยอมรับได้ ผ่าน RPC respond_offer", async () => {
    mockUser.current = SELLER;
    mock.current!.queueResult({ data: [{ ...offerRow, status: "accepted" }], error: null });

    const res = await respondOffer(post({ accept: true }), respondParams);
    expect(res.status).toBe(200);

    const rpc = mock.current!.rpcCalls.find((r) => r.fn === "respond_offer");
    const args = rpc!.args as Record<string, unknown>;
    expect(args.p_responder_id).toBe(SELLER.id);
    expect(args.p_accept).toBe(true);
  });

  it("ตอบไปแล้ว/ไม่มีสิทธิ์ตอบ (RPC ไม่คืนแถว) → 409", async () => {
    mockUser.current = SELLER;
    mock.current!.queueResult({ data: [], error: null });

    const res = await respondOffer(post({ accept: true }), respondParams);
    expect(res.status).toBe(409);
  });

  it("ไม่ได้เข้าสู่ระบบ → 401 ไม่แตะฐานข้อมูล", async () => {
    mockUser.current = null;
    const res = await respondOffer(post({ accept: true }), respondParams);
    expect(res.status).toBe(401);
    expect(mock.current!.rpcCalls).toHaveLength(0);
  });
});
