import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, hasOp } from "@/test/supabaseMock";
import { MEETUP_MAX_AHEAD_MS } from "@/lib/orderFlowConfig";

// การนัดเจอคือเหตุการณ์เดียวที่ระบบรู้จักใน flow ใหม่ (ไม่มีเงินไหลผ่านระบบแล้ว) สิ่งที่ต้องกันคือ
// คนนอกเข้ามายุ่งกับนัดของคนอื่น และการนัดกับออเดอร์ที่จบไปแล้ว — ส่วนตรรกะการตกลงนัดจริงอยู่ใน
// RPC ระดับฐานข้อมูล (ดู src/test/schema.itest.ts) ที่นี่ตรวจเฉพาะด่านของฝั่งแอป
const { mock, mockUser, auditCalls } = vi.hoisted(() => ({
  mock: { current: null as ReturnType<typeof import("@/test/supabaseMock").createSupabaseMock> | null },
  mockUser: { current: null as { id: string; role: string; name: string } | null },
  auditCalls: { list: [] as Array<Record<string, unknown>> },
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mock.current!.supabase;
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mockUser.current }));
vi.mock("@/lib/auditLog", () => ({
  logAction: async (entry: Record<string, unknown>) => {
    auditCalls.list.push(entry);
  },
}));

const { POST: propose } = await import("@/app/api/orders/[id]/meetup/route");
const { POST: respond } = await import("@/app/api/meetups/[id]/respond/route");
const { GET: places } = await import("@/app/api/meetups/places/route");

const BUYER = { id: "buyer-1", role: "user", name: "ผู้ซื้อ" };
const SELLER = { id: "seller-1", role: "user", name: "ผู้ขาย" };
const OUTSIDER = { id: "stranger-1", role: "user", name: "คนนอก" };

const orderRow = (over: Record<string, unknown> = {}) => ({
  id: "order-1",
  product_id: "product-1",
  buyer_id: BUYER.id,
  seller_id: SELLER.id,
  status: "reserved",
  amount: 3500,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const proposalRow = (over: Record<string, unknown> = {}) => ({
  id: "meetup-1",
  order_id: "order-1",
  proposed_by: BUYER.id,
  meetup_at: "2026-10-01T07:00:00Z",
  place: "หน้า BTS อโศก ทางออก 3",
  status: "pending",
  created_at: "2026-09-23T00:00:00Z",
  responded_at: null,
  ...over,
});

const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

const post = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const orderParams = { params: Promise.resolve({ id: "order-1" }) };
const meetupParams = { params: Promise.resolve({ id: "meetup-1" }) };

// จุดนัดมาจากการปักหมุดบนแผนที่เสมอ (migration 025) ชื่อสถานที่จึงมาคู่กับพิกัดทุกครั้ง
const proposeBody = (over: Record<string, unknown> = {}) => ({
  meetupAt: inDays(2),
  place: "หน้า BTS อโศก ทางออก 3",
  lat: 13.7373,
  lng: 100.5602,
  ...over,
});

beforeEach(() => {
  mock.current = createSupabaseMock();
  mockUser.current = BUYER;
  auditCalls.list = [];
});

describe("เสนอนัดเจอ", () => {
  it("ยังไม่ล็อกอิน → 401 และไม่แตะฐานข้อมูลเลย", async () => {
    mockUser.current = null;
    const res = await propose(post(proposeBody()), orderParams);
    expect(res.status).toBe(401);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("คนนอกที่ไม่ใช่คู่ซื้อขาย เสนอนัดในออเดอร์ของคนอื่นไม่ได้ → 403 และต้องไม่เรียก RPC", async () => {
    mockUser.current = OUTSIDER;
    mock.current!.queueResult({ data: orderRow(), error: null });

    const res = await propose(post(proposeBody()), orderParams);
    expect(res.status).toBe(403);
    expect(mock.current!.rpcCalls).toHaveLength(0);
  });

  it("ไม่พบออเดอร์ → 404", async () => {
    mock.current!.queueResult({ data: null, error: null });
    expect((await propose(post(proposeBody()), orderParams)).status).toBe(404);
  });

  // ออเดอร์ที่ผู้ขายกดส่งมอบแล้ว/ยกเลิกแล้ว ไม่มีอะไรให้นัดอีก การเปิดช่องไว้แปลว่าออเดอร์ที่จบ
  // ไปแล้วจะมีการ์ดนัดโผล่ในแชทได้ตลอดกาล
  it("ออเดอร์ที่ไม่ได้อยู่ในขั้นนัดเจอแล้ว → 409 และต้องไม่เรียก RPC", async () => {
    for (const status of ["awaiting_buyer_confirmation", "completed", "cancelled"]) {
      mock.current = createSupabaseMock();
      mock.current.queueResult({ data: orderRow({ status }), error: null });

      const res = await propose(post(proposeBody()), orderParams);
      expect(res.status).toBe(409);
      expect(mock.current.rpcCalls).toHaveLength(0);
    }
  });

  it("เวลานัดที่เป็นอดีต หรือไกลเกิน 30 วัน → 400 ตั้งแต่ยังไม่แตะฐานข้อมูล", async () => {
    for (const meetupAt of [inDays(-1), new Date(Date.now() + MEETUP_MAX_AHEAD_MS + 60_000).toISOString()]) {
      mock.current = createSupabaseMock();
      const res = await propose(post(proposeBody({ meetupAt })), orderParams);
      expect(res.status).toBe(400);
      expect(mock.current.calls).toHaveLength(0);
    }
  });

  it("ไม่ระบุทั้งเวลาและสถานที่ หรือวันเวลาที่อ่านไม่ออก → 400", async () => {
    for (const body of [
      proposeBody({ place: "   ", lat: null, lng: null, meetupAt: "" }),
      proposeBody({ meetupAt: "เสาร์นี้" }),
    ]) {
      mock.current = createSupabaseMock();
      expect((await propose(post(body), orderParams)).status).toBe(400);
    }
  });

  // ถ้าชื่อสถานที่หลุดมาได้โดยไม่มีพิกัด แปลว่ามาจากทางอื่นที่ไม่ใช่การปักหมุด ซึ่งไม่ใช่สิ่งที่ตั้งใจให้มี
  it("ส่งชื่อสถานที่มาโดยไม่มีพิกัด → 400 ไม่แตะฐานข้อมูล", async () => {
    const res = await propose(post(proposeBody({ lat: null, lng: null })), orderParams);
    expect(res.status).toBe(400);
    expect(mock.current!.calls).toHaveLength(0);
  });

  it("พิกัดนอกช่วงที่เป็นไปได้ → 400", async () => {
    for (const bad of [{ lat: 95, lng: 100 }, { lat: 13, lng: 200 }]) {
      mock.current = createSupabaseMock();
      expect((await propose(post(proposeBody(bad)), orderParams)).status).toBe(400);
    }
  });

  // หน้าจอแยกปุ่ม "ปักหมุด" กับ "เลือกเวลา" ออกจากกันแล้ว เสนอทีละอย่างต้องได้
  it("เสนอเฉพาะเวลา (ไม่ส่งสถานที่) → 201 และส่ง place เป็น null", async () => {
    mock.current!.queueResult({ data: orderRow(), error: null });
    mock.current!.queueResult({ data: [proposalRow({ place: null })], error: null });

    const res = await propose(
      post({ meetupAt: inDays(1), place: "", lat: null, lng: null }),
      orderParams
    );
    expect(res.status).toBe(201);
    const args = mock.current!.rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_place).toBeNull();
    expect(args.p_meetup_at).not.toBeNull();
  });

  it("นัดสำเร็จ → 201 และส่งเวลา/สถานที่ที่ตัดช่องว่างแล้วเข้า RPC", async () => {
    const meetupAt = inDays(2);
    mock.current!.queueResult({ data: orderRow(), error: null });
    mock.current!.queueResult({ data: [proposalRow()], error: null });

    const res = await propose(post(proposeBody({ meetupAt, place: "  ร้านกาแฟหน้าปากซอย  " })), orderParams);
    expect(res.status).toBe(201);
    expect(mock.current!.rpcCalls[0].fn).toBe("propose_meetup");
    expect(mock.current!.rpcCalls[0].args).toEqual({
      p_order_id: "order-1",
      p_from_user_id: BUYER.id,
      p_meetup_at: meetupAt,
      p_place: "ร้านกาแฟหน้าปากซอย",
      p_lat: 13.7373,
      p_lng: 100.5602,
      p_place_note: null,
    });
  });

  // ต่อรองเวลาได้ทั้งสองทางเหมือนต่อรองราคา ไม่ใช่ผู้ซื้อฝ่ายเดียวที่เสนอได้
  it("ผู้ขายก็เสนอนัดได้เหมือนกัน", async () => {
    mockUser.current = SELLER;
    mock.current!.queueResult({ data: orderRow(), error: null });
    mock.current!.queueResult({ data: [proposalRow({ proposed_by: SELLER.id })], error: null });

    expect((await propose(post(proposeBody()), orderParams)).status).toBe(201);
  });
});

describe("ตอบรับ/ปฏิเสธนัด", () => {
  it("ยังไม่ล็อกอิน → 401", async () => {
    mockUser.current = null;
    expect((await respond(post({ accept: true }), meetupParams)).status).toBe(401);
  });

  // RPC คืนแถวว่างเมื่อ "ตอบไปแล้ว / ไม่มีสิทธิ์ตอบ / คนเสนอกดตอบเอง" — ฝั่งแอปต้องแปลเป็น 409
  // ไม่ใช่ 200 เงียบๆ ซึ่งจะทำให้ UI ขึ้นว่าตกลงนัดแล้วทั้งที่ฐานข้อมูลไม่ได้เปลี่ยนอะไรเลย
  it("RPC ไม่โดนแถวไหนเลย → 409 และไม่บันทึก log ว่านัดสำเร็จ", async () => {
    mock.current!.queueResult({ data: [], error: null });

    const res = await respond(post({ accept: true }), meetupParams);
    expect(res.status).toBe(409);
    expect(auditCalls.list).toHaveLength(0);
  });

  it("ตอบรับสำเร็จ → 200 และบันทึก log ผูกกับออเดอร์", async () => {
    mock.current!.queueResult({ data: [proposalRow({ status: "accepted" })], error: null });
    mockUser.current = SELLER;

    const res = await respond(post({ accept: true }), meetupParams);
    expect(res.status).toBe(200);
    expect(mock.current!.rpcCalls[0]).toEqual({
      fn: "respond_meetup",
      args: { p_proposal_id: "meetup-1", p_responder_id: SELLER.id, p_accept: true },
    });
    expect(auditCalls.list[0]).toMatchObject({ action: "order.meetup_scheduled", targetId: "order-1" });
  });

  it("ปฏิเสธเพื่อขอเวลาอื่น → 200 แต่ไม่บันทึกว่าตกลงนัดกันแล้ว", async () => {
    mock.current!.queueResult({ data: [proposalRow({ status: "declined" })], error: null });
    mockUser.current = SELLER;

    const res = await respond(post({ accept: false }), meetupParams);
    expect(res.status).toBe(200);
    expect(auditCalls.list).toHaveLength(0);
  });
});

// คนมักตกลงสถานที่ได้ก่อนแล้วค่อยเคาะเวลาทีหลัง ("เอาหน้าห้างนะ เดี๋ยวนัดเวลาอีกที") ถ้าบังคับให้
// กรอกเวลาก่อน คนจะกรอกมั่วๆ ไปก่อน ซึ่งแย่กว่าปล่อยว่าง เพราะเวลามั่วกลายเป็นนัดจริงที่อีกฝ่ายเชื่อ
describe("นัดที่ยังไม่ระบุเวลา", () => {
  it("ใส่แค่สถานที่ → 201 และส่งเวลาเป็น null เข้า RPC", async () => {
    mock.current!.queueResult({ data: orderRow(), error: null });
    mock.current!.queueResult({ data: [proposalRow({ meetup_at: null })], error: null });

    const res = await propose(
      post({ place: "หน้าห้าง", lat: 18.8, lng: 98.97 }),
      orderParams
    );
    expect(res.status).toBe(201);
    expect((mock.current!.rpcCalls[0].args as { p_meetup_at: unknown }).p_meetup_at).toBeNull();
  });

  // ต่างจาก "ไม่ใส่เวลา" ตรงที่ใส่มาแล้วแต่อ่านไม่ออก — ต้องบอกว่าผิด ไม่ใช่ปัดทิ้งเงียบๆ
  // แล้วกลายเป็นนัดที่ไม่มีเวลาโดยที่คนส่งคิดว่าตั้งเวลาไปแล้ว
  it("ใส่เวลามาแต่อ่านไม่ออก → 400 ไม่ใช่ปัดเวลาทิ้งแล้วบันทึกต่อ", async () => {
    const res = await propose(
      post({ meetupAt: "เสาร์นี้", place: "หน้าห้าง", lat: 18.8, lng: 98.97 }),
      orderParams
    );
    expect(res.status).toBe(400);
    expect(mock.current!.rpcCalls).toHaveLength(0);
  });
});

describe("ปุ่มลัดสถานที่ที่เคยนัด", () => {
  it("ตัดสถานที่ซ้ำออก เหลือ 3 อันล่าสุด พร้อมพิกัด และดูเฉพาะของตัวเอง", async () => {
    mock.current!.queueResult({
      data: [
        { place: "หน้า BTS อโศก", lat: 13.7, lng: 100.5, created_at: "2026-09-20T00:00:00Z" },
        { place: "หน้า BTS อโศก", lat: 13.7, lng: 100.5, created_at: "2026-09-19T00:00:00Z" },
        { place: "หน้าเซเว่นปากซอย", lat: 18.8, lng: 98.9, created_at: "2026-09-18T00:00:00Z" },
        { place: "Maya ชั้น 1", lat: 18.801, lng: 98.967, created_at: "2026-09-17T00:00:00Z" },
        { place: "หน้ามหาลัย", lat: 18.8, lng: 98.95, created_at: "2026-09-16T00:00:00Z" },
      ],
      error: null,
    });

    const res = await places();
    expect(await res.json()).toEqual({
      places: [
        { place: "หน้า BTS อโศก", lat: 13.7, lng: 100.5 },
        { place: "หน้าเซเว่นปากซอย", lat: 18.8, lng: 98.9 },
        { place: "Maya ชั้น 1", lat: 18.801, lng: 98.967 },
      ],
    });
    const call = mock.current!.callsTo("meetup_proposals")[0];
    expect(hasOp(call, "eq", "proposed_by", BUYER.id)).toBe(true);
    // จุดที่ไม่มีพิกัด (ของก่อน migration 025) เอามาทำปุ่มลัดไม่ได้ กดแล้วไม่รู้จะย้ายหมุดไปไหน
    expect(hasOp(call, "not", "lat", "is", null)).toBe(true);
  });

  it("ยังไม่ล็อกอิน → 401", async () => {
    mockUser.current = null;
    expect((await places()).status).toBe(401);
  });
});
