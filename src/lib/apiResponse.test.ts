import { describe, it, expect, afterEach, vi } from "vitest";
import {
  readJson,
  errorMessage,
  callApi,
  messageOf,
  ApiError,
  SERVER_ERROR,
  GENERIC_ERROR,
  NETWORK_ERROR,
} from "./apiResponse";

const html500 = () =>
  new Response("<!DOCTYPE html><html><body>Internal Server Error</body></html>", {
    status: 500,
    headers: { "Content-Type": "text/html" },
  });

describe("readJson", () => {
  it("อ่าน JSON ปกติได้", async () => {
    const res = new Response(JSON.stringify({ ok: true }), { status: 200 });
    expect(await readJson(res)).toEqual({ ok: true });
  });

  // ต้นเหตุของบั๊ก: res.json() ตรงๆ จะโยน error ตรงนี้ แล้วฟอร์มไปจับเป็น "เชื่อมต่อไม่สำเร็จ"
  it("body เป็นหน้า HTML ของ error 500 → คืน null ไม่โยน error", async () => {
    await expect(readJson(html500())).resolves.toBeNull();
  });

  it("body ว่างเปล่า → คืน null", async () => {
    await expect(readJson(new Response(null, { status: 502 }))).resolves.toBeNull();
  });
});

describe("errorMessage", () => {
  it("route ส่งข้อความมา → ใช้ข้อความนั้นตรงๆ ทั้ง 4xx และ 5xx", () => {
    expect(errorMessage(401, { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" })).toBe("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    expect(errorMessage(500, { error: "สมัครสมาชิกไม่สำเร็จ" })).toBe("สมัครสมาชิกไม่สำเร็จ");
  });

  // กรณีที่เจอจริง: 500 ที่ตอบกลับเป็น HTML ต้องบอกว่าระบบขัดข้อง ไม่ใช่ให้ผู้ใช้ไปเช็คเน็ต
  it("5xx ที่ไม่มีข้อความจาก route → บอกว่าระบบขัดข้อง ไม่ใช่ปัญหาการเชื่อมต่อ", async () => {
    const res = html500();
    const msg = errorMessage(res.status, await readJson(res));
    expect(msg).toBe(SERVER_ERROR);
    expect(msg).not.toBe(NETWORK_ERROR);
  });

  it("4xx ที่ไม่มีข้อความจาก route → ข้อความทั่วไป", () => {
    expect(errorMessage(400, null)).toBe(GENERIC_ERROR);
    expect(errorMessage(404, {})).toBe(GENERIC_ERROR);
  });

  it("error ที่ไม่ใช่ข้อความ หรือเป็นข้อความว่าง → ไม่เอามาแสดง", () => {
    expect(errorMessage(500, { error: { code: 42 } })).toBe(SERVER_ERROR);
    expect(errorMessage(400, { error: "   " })).toBe(GENERIC_ERROR);
  });
});

describe("callApi", () => {
  const stubFetch = (impl: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(impl));
  afterEach(() => vi.unstubAllGlobals());

  it("สำเร็จ → คืน body ที่เป็น JSON", async () => {
    stubFetch(async () => new Response(JSON.stringify({ order: { id: "o1" } }), { status: 201 }));
    await expect(callApi("/api/orders")).resolves.toEqual({ order: { id: "o1" } });
  });

  it("ต่อเซิร์ฟเวอร์ไม่ได้ → ApiError ข้อความเรื่องการเชื่อมต่อ และไม่มี status", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await callApi("/api/orders").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe(NETWORK_ERROR);
    expect(err.status).toBeNull();
  });

  // ตัวที่เจอจริง: เดิมผู้ใช้จะเห็น "Unexpected token '<' ..." ขึ้นบนจอ
  it("500 ที่ตอบเป็น HTML → ข้อความระบบขัดข้อง ไม่ใช่ข้อความดิบของ JavaScript", async () => {
    stubFetch(async () => html500());
    const err = await callApi("/api/orders").catch((e) => e);
    expect(err.message).toBe(SERVER_ERROR);
    expect(err.message).not.toMatch(/Unexpected token|JSON/);
  });

  it("4xx ที่ route ส่งข้อความมา → ใช้ข้อความนั้น", async () => {
    stubFetch(async () => new Response(JSON.stringify({ error: "สินค้านี้ไม่พร้อมขายแล้ว" }), { status: 409 }));
    await expect(callApi("/api/orders")).rejects.toThrow("สินค้านี้ไม่พร้อมขายแล้ว");
  });

  it("4xx ที่ไม่มีข้อความ → ใช้ fallback ของปุ่มนั้น", async () => {
    stubFetch(async () => new Response(null, { status: 400 }));
    await expect(callApi("/api/orders", undefined, "สั่งซื้อไม่สำเร็จ")).rejects.toThrow("สั่งซื้อไม่สำเร็จ");
  });

  it("สำเร็จแต่ body ไม่ใช่ JSON → ถือว่าเซิร์ฟเวอร์ผิดปกติ", async () => {
    stubFetch(async () => new Response("ok", { status: 200 }));
    await expect(callApi("/api/orders")).rejects.toThrow(SERVER_ERROR);
  });
});

describe("messageOf", () => {
  it("ApiError → ข้อความของมัน", () => {
    expect(messageOf(new ApiError("ข้อความ", 400))).toBe("ข้อความ");
  });

  it("Error ธรรมดาที่โค้ดเราโยนเอง → ข้อความของมัน (เช่นบีบอัดรูปไม่ได้)", () => {
    expect(messageOf(new Error("ไม่สามารถประมวลผลรูปภาพได้"), "อัปโหลดไม่สำเร็จ")).toBe("ไม่สามารถประมวลผลรูปภาพได้");
  });

  it("error ดิบจากระบบ/เบราว์เซอร์ หรือไม่ใช่ Error → fallback ไม่เอาข้อความภาษาโปรแกรมเมอร์มาแสดง", () => {
    expect(messageOf(new SyntaxError("Unexpected token '<'"), "ทำรายการไม่สำเร็จ")).toBe("ทำรายการไม่สำเร็จ");
    expect(messageOf(new TypeError("Failed to fetch"), "ทำรายการไม่สำเร็จ")).toBe("ทำรายการไม่สำเร็จ");
    expect(messageOf("string error")).toBe(GENERIC_ERROR);
  });
});
