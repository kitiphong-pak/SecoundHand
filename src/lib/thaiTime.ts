// อ่านเวลานัดจากข้อความที่คนพิมพ์ในแชท (เช่น "เจอกันตอน 5 โมงเย็นนะ" → 17:00)
//
// ทำไมต้องมี: ก่อนหน้านี้การนัดต้องกดปุ่มแล้วกรอกฟอร์ม ทั้งที่คนคุยกันในแชทก็พิมพ์เวลาอยู่แล้ว
// ฟีเจอร์นี้อ่านสิ่งที่พิมพ์ไปแล้วมาเสนอให้ ไม่ใช่บังคับให้พิมพ์ซ้ำในฟอร์ม
//
// หลักสำคัญสองข้อของไฟล์นี้:
//
// 1. ต้องมี "หน่วย" กำกับเสมอ (โมง/ทุ่ม/ตี/นาฬิกา/เที่ยง/บ่าย หรือรูปแบบ 17:00) — ตัวเลขลอยๆ
//    อย่าง "500" หรือ "ลด 2 ได้มั้ย" ต้องไม่ถูกอ่านเป็นเวลาเด็ดขาด เพราะในแชทซื้อขายเต็มไปด้วย
//    ตัวเลขราคาและจำนวน การจับผิดแปลว่าเสนอนัดผิดเวลาให้อีกฝ่ายเห็น
//
// 2. ผลลัพธ์เป็นแค่ "ชั่วโมง/นาที/วัน" ล้วนๆ ไม่ผูกกับ timezone — คนเรียกเป็นคนแปลงเป็นเวลาจริง
//    ด้วย resolveMeetupAt() โดยอิงเวลาปัจจุบันของเครื่องผู้ใช้ (ผู้ใช้ทั้งหมดอยู่ในไทย)
//
// ภาษาไทยบอกเวลาหลายระบบปนกัน จุดที่ต้องระวังที่สุดคือ "ห้าโมง" = 17:00 แต่ "ห้าโมงเช้า" = 11:00
// เวลาที่อ่านได้จึงต้องไปโผล่บนการ์ดให้อีกฝ่ายกดยืนยันเสมอ ไม่ใช่บันทึกเงียบๆ

export interface ParsedThaiTime {
  hour: number; // 0-23
  minute: number; // 0 หรือ 30 (รองรับ "ครึ่ง")
  /** 0 = วันนี้, 1 = พรุ่งนี้, 2 = มะรืนนี้, null = ไม่ได้บอกวัน */
  dayOffset: number | null;
  /** 0 = อาทิตย์ ... 6 = เสาร์ ถ้าบอกเป็นชื่อวัน */
  weekday: number | null;
  /** ส่วนของข้อความที่อ่านมา ไว้โชว์ให้ผู้ใช้เห็นว่าระบบอ่านมาจากตรงไหน */
  matched: string;
  /**
   * true = ผู้ใช้บอกแค่ช่วงกว้างๆ ("บ่าย", "เย็น") ระบบเดาเวลากลางๆ ของช่วงนั้นให้
   *
   * ฝั่งหน้าจอต้องบอกให้เห็นว่าเป็นการเดา ไม่ใช่เวลาที่ผู้ใช้ระบุ ไม่งั้นคนจะกดยืนยันผ่านๆ
   * แล้วได้นัดบ่ายสองทั้งที่ตั้งใจจะบอกแค่ว่า "ช่วงบ่ายก็ได้"
   */
  approximate: boolean;
}

// ตัวเลขที่คนพิมพ์เป็นตัวหนังสือ ใช้บ่อยพอๆ กับตัวเลขอารบิกในแชทไทย
const THAI_NUMBER: Record<string, number> = {
  สิบสอง: 12,
  สิบเอ็ด: 11,
  หนึ่ง: 1,
  สอง: 2,
  สาม: 3,
  สี่: 4,
  ห้า: 5,
  หก: 6,
  เจ็ด: 7,
  แปด: 8,
  เก้า: 9,
  สิบ: 10,
};

// เรียงคำยาวไว้ก่อนใน alternation เสมอ ไม่งั้น "สิบสอง" จะถูก "สิบ" กินไปก่อนแล้วเหลือ "สอง" ค้าง
const NUM = String.raw`(\d{1,2}|` + Object.keys(THAI_NUMBER).join("|") + ")";

const toNumber = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : THAI_NUMBER[raw]);

const WEEKDAY: Record<string, number> = {
  อาทิตย์: 0,
  จันทร์: 1,
  อังคาร: 2,
  พุธ: 3,
  พฤหัสบดี: 4,
  พฤหัส: 4,
  ศุกร์: 5,
  เสาร์: 6,
};

// "ครึ่ง" ต่อท้ายเวลาไหนก็ได้ = +30 นาที ("บ่าย 2 ครึ่ง", "5 โมงครึ่ง")
const HALF = String.raw`(\s*ครึ่ง)?`;
const SP = String.raw`\s*`;

// เรียงจากรูปแบบที่เจาะจงที่สุดไปกว้างที่สุด — "5 โมงเช้า" ต้องถูกจับก่อน "5 โมง" เสมอ ไม่งั้น
// จะได้ 17:00 แทนที่จะเป็น 11:00
const PATTERNS: Array<{ re: RegExp; hour: (n: number) => number | null }> = [
  { re: new RegExp(`เที่ยงคืน${HALF}`), hour: () => 0 },
  { re: new RegExp(`เที่ยง(วัน)?${HALF}`), hour: () => 12 },
  // ตี 1-5 = 01:00-05:00 (ตี 6 ไม่มีใครพูด ถือว่าอ่านไม่ออกดีกว่าเดาผิด)
  { re: new RegExp(`ตี${SP}${NUM}${HALF}`), hour: (n) => (n >= 1 && n <= 5 ? n : null) },
  // 1 โมงเช้า = 07:00 ... 5 โมงเช้า = 11:00 แต่ 6-11 โมงเช้า = ตามตัวเลขตรงๆ
  {
    re: new RegExp(`${NUM}${SP}โมงเช้า${HALF}`),
    hour: (n) => (n >= 1 && n <= 5 ? n + 6 : n >= 6 && n <= 11 ? n : null),
  },
  { re: new RegExp(`${NUM}${SP}โมงเย็น${HALF}`), hour: (n) => (n >= 1 && n <= 6 ? n + 12 : null) },
  // "บ่ายโมง" = 13:00 (ไม่มีตัวเลข), "บ่าย 2 โมง" = 14:00
  { re: new RegExp(`บ่าย${SP}โมง${HALF}`), hour: () => 13 },
  {
    re: new RegExp(`บ่าย${SP}${NUM}(${SP}โมง)?${HALF}`),
    hour: (n) => (n >= 1 && n <= 4 ? n + 12 : null),
  },
  { re: new RegExp(`${NUM}${SP}ทุ่ม${HALF}`), hour: (n) => (n >= 1 && n <= 6 ? n + 18 : null) },
  { re: new RegExp(`${NUM}${SP}นาฬิกา${HALF}`), hour: (n) => (n >= 0 && n <= 23 ? n : null) },
  // "5 โมง" เปล่าๆ คนไทยหมายถึง 17:00 (ห้าโมงเย็น) ส่วน 6-12 โมง หมายถึงตอนกลางวัน
  {
    re: new RegExp(`${NUM}${SP}โมง${HALF}`),
    hour: (n) => (n >= 1 && n <= 5 ? n + 12 : n >= 6 && n <= 12 ? n : null),
  },
];

// รูปแบบตัวเลขล้วน 17:00 / 17.30 น. — ต้องมีนาทีสองหลักกำกับเสมอ ไม่งั้น "ลด 5 ได้มั้ย" จะกลาย
// เป็นเวลา และต้องไม่มีตัวเลข/จุลภาคขนาบอยู่ ไม่งั้นราคาอย่าง "1,250.50" จะถูกอ่านเป็นเวลา
const CLOCK_RE = /(?<![\d,.])(\d{1,2})[:.](\d{2})(?![\d])/;

// ช่วงเวลากว้างๆ ที่คนพูดกันโดยไม่ระบุตัวเลข ("เจอกันบ่ายได้มั้ย") — เดาเวลากลางๆ ของช่วงนั้นให้
// แล้วติดธง approximate ไว้ ฝั่งหน้าจอจะได้บอกว่าเป็นการเดา ไม่ใช่เวลาที่ผู้ใช้ระบุเอง
//
// ตรวจทีหลังรูปแบบที่มีตัวเลขเสมอ — "บ่าย 3 โมง" ต้องได้ 15:00 ไม่ใช่ 14:00 ที่เดาจากคำว่า "บ่าย"
//
// คำพวกนี้เสี่ยงชนกับชื่อสินค้าในเว็บขายของมือสอง จึงต้องกันไว้ด้วย:
// - "ตู้เย็น" / "น้ำเย็น" ไม่ใช่การนัดตอนเย็น
// - "สาย" ตัดทิ้งไปเลย เพราะ "สายชาร์จ" "สายไฟ" เจอบ่อยกว่าคำว่าสาย(ตอนเช้า)มาก
const PERIODS: Array<{ re: RegExp; hour: number }> = [
  { re: /เช้า/, hour: 9 },
  { re: /บ่าย/, hour: 14 },
  { re: /(?<!ตู้|น้ำ)เย็น/, hour: 17 },
  { re: /ค่ำ/, hour: 19 },
  { re: /คืนนี้|กลางคืน/, hour: 20 },
  { re: /ดึก/, hour: 22 },
];

const findDay = (text: string): { dayOffset: number | null; weekday: number | null } => {
  if (/มะรืน/.test(text)) return { dayOffset: 2, weekday: null };
  if (/พรุ่งนี้|พรุ้งนี้/.test(text)) return { dayOffset: 1, weekday: null };
  if (/วันนี้|คืนนี้|เย็นนี้|เช้านี้/.test(text)) return { dayOffset: 0, weekday: null };
  for (const [name, index] of Object.entries(WEEKDAY)) {
    if (text.includes(name)) return { dayOffset: null, weekday: index };
  }
  return { dayOffset: null, weekday: null };
};

/** อ่านเวลานัดจากข้อความ คืน null ถ้าไม่เจอเวลาที่มั่นใจพอ */
export function parseThaiTime(text: string): ParsedThaiTime | null {
  const day = findDay(text);

  for (const { re, hour } of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    // กลุ่มแรกของบางรูปแบบไม่ใช่ตัวเลข (เช่น "เที่ยงวัน") — ฟังก์ชัน hour ของรูปแบบนั้นไม่ได้ใช้ค่านี้อยู่แล้ว
    const h = hour(m[1] ? toNumber(m[1]) : NaN);
    if (h === null || h === undefined || Number.isNaN(h)) continue;
    return {
      hour: h % 24,
      minute: /ครึ่ง/.test(m[0]) ? 30 : 0,
      matched: m[0].trim(),
      approximate: false,
      ...day,
    };
  }

  const clock = CLOCK_RE.exec(text);
  if (clock) {
    const h = Number(clock[1]);
    const min = Number(clock[2]);
    if (h <= 23 && min <= 59) {
      return { hour: h, minute: min, matched: clock[0].trim(), approximate: false, ...day };
    }
  }

  for (const { re, hour } of PERIODS) {
    const m = re.exec(text);
    if (!m) continue;
    return { hour, minute: 0, matched: m[0], approximate: true, ...day };
  }

  return null;
}

/**
 * แปลงเวลาที่อ่านได้เป็นวันเวลาจริง โดยอิงเวลาปัจจุบันของเครื่องผู้ใช้
 *
 * ถ้าไม่ได้บอกวันไว้ ("5 โมง" เฉยๆ) และเวลานั้นของวันนี้ผ่านไปแล้ว ให้หมายถึงพรุ่งนี้ — คนนัดกัน
 * ในแชทย่อมหมายถึงรอบถัดไปที่ยังมาไม่ถึง ไม่ใช่เมื่อเช้าที่ผ่านมา
 */
export function resolveMeetupAt(parsed: ParsedThaiTime, now: Date): Date {
  const at = new Date(now);
  at.setHours(parsed.hour, parsed.minute, 0, 0);

  if (parsed.weekday !== null) {
    const ahead = (parsed.weekday - at.getDay() + 7) % 7;
    at.setDate(at.getDate() + (ahead === 0 && at.getTime() <= now.getTime() ? 7 : ahead));
    return at;
  }

  if (parsed.dayOffset !== null) {
    at.setDate(at.getDate() + parsed.dayOffset);
    return at;
  }

  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}
