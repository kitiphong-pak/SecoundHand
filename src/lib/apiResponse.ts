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

/**
 * ข้อความ error ที่จะแสดงบนหน้าจอ จาก status และ body ที่อ่านได้
 *
 * fallback ใช้เฉพาะตอน route ไม่ได้ส่งข้อความมาและไม่ใช่ 5xx — ให้แต่ละปุ่มบอกได้ว่าอะไรไม่สำเร็จ
 * เช่น "สั่งซื้อไม่สำเร็จ" ส่วน 5xx ใช้ SERVER_ERROR เสมอ เพราะปัญหาอยู่ที่เซิร์ฟเวอร์ ไม่ใช่ที่คำขอ
 */
export function errorMessage(status: number, body: unknown, fallback = GENERIC_ERROR): string {
  const fromRoute =
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error.trim() !== ""
      ? body.error
      : null;
  if (fromRoute) return fromRoute;
  return status >= 500 ? SERVER_ERROR : fallback;
}

/** error ที่ callApi โยนออกมา — message อ่านแล้วเอาไปแสดงบนหน้าจอได้เลย */
export class ApiError extends Error {
  /** null = ต่อเซิร์ฟเวอร์ไม่ได้เลย ไม่มี status ให้ดู */
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * เรียก API route ของเรา แล้วคืน body ที่เป็น JSON — ถ้าไม่สำเร็จจะโยน ApiError ที่มีข้อความพร้อมแสดง
 *
 * ใช้แทนแพตเทิร์นเดิม `const data = await res.json(); if (!res.ok) throw new Error(data.error)`
 * ซึ่งพอเซิร์ฟเวอร์ตอบ 500 เป็น HTML ผู้ใช้จะเห็นข้อความดิบของ JavaScript อย่าง "Unexpected token '<'"
 * แทนที่จะเป็นข้อความที่อ่านรู้เรื่อง
 */
export async function callApi<T = Record<string, unknown>>(
  input: string,
  init?: RequestInit,
  fallback?: string
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new ApiError(NETWORK_ERROR, null);
  }
  const data = await readJson<T>(res);
  if (!res.ok) throw new ApiError(errorMessage(res.status, data, fallback), res.status);
  // สำเร็จแต่ body ไม่ใช่ JSON — route ของเราไม่ควรตอบแบบนี้ ถือว่าเซิร์ฟเวอร์ผิดปกติ
  if (data === null) throw new ApiError(SERVER_ERROR, res.status);
  return data;
}

/**
 * ข้อความของ error ใดๆ สำหรับแสดงบนหน้าจอ
 *
 * - ApiError และ Error ธรรมดาที่โค้ดเราโยนเอง (เช่น lib/image.ts "ไม่สามารถประมวลผลรูปภาพได้")
 *   → ใช้ข้อความของมัน เพราะเราเขียนไว้ให้คนอ่านอยู่แล้ว
 * - error จากระบบ/เบราว์เซอร์ (SyntaxError, TypeError, DOMException ...) → fallback
 *   ข้อความพวกนั้นเป็นภาษาโปรแกรมเมอร์ เช่น "Unexpected token '<'" ห้ามโผล่ให้ผู้ใช้เห็น
 */
export function messageOf(err: unknown, fallback = GENERIC_ERROR): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.constructor === Error && err.message) return err.message;
  return fallback;
}
