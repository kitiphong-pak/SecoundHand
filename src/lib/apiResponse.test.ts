import { describe, it, expect } from "vitest";
import { readJson, errorMessage, SERVER_ERROR, GENERIC_ERROR, NETWORK_ERROR } from "./apiResponse";

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
