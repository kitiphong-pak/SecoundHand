// แปลงผลตอบกลับจาก API route ของเราเป็นข้อความที่ผู้ใช้อ่านเข้าใจ
//
// บั๊กที่ไฟล์นี้แก้: ฟอร์มเดิมเรียก res.json() ตรงๆ แต่ตอนเซิร์ฟเวอร์พังจริง (500) Next ตอบกลับเป็นหน้า
// HTML ไม่ใช่ JSON — res.json() เลยโยน error ตกไปที่ catch ที่เขียนว่า "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ"
// ผู้ใช้เลยไปเช็คเน็ตตัวเอง ทั้งที่เน็ตไม่ได้เป็นอะไร เซิร์ฟเวอร์ต่างหากที่พัง
//
// แยกให้ชัดสามกรณี:
// - ต่อเซิร์ฟเวอร์ไม่ได้เลย (fetch โยน error)  → NETWORK_ERROR
// - เซิร์ฟเวอร์ตอบมาแต่พัง (5xx)             → ข้อความจาก route ถ้ามี ไม่งั้น SERVER_ERROR
// - เซิร์ฟเวอร์ปฏิเสธคำขอ (4xx)              → ข้อความจาก route ถ้ามี ไม่งั้น GENERIC_ERROR

export const NETWORK_ERROR = "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
export const SERVER_ERROR = "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง";
export const GENERIC_ERROR = "เกิดข้อผิดพลาด กรุณาลองใหม่";

/** อ่าน body เป็น JSON ถ้าอ่านไม่ได้ (เช่นเป็นหน้า HTML ของ error 500) คืน null แทนการโยน error */
export async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** ข้อความ error ที่จะแสดงบนหน้าจอ จาก status และ body ที่อ่านได้ */
export function errorMessage(status: number, body: unknown): string {
  const fromRoute =
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error.trim() !== ""
      ? body.error
      : null;
  if (fromRoute) return fromRoute;
  return status >= 500 ? SERVER_ERROR : GENERIC_ERROR;
}
