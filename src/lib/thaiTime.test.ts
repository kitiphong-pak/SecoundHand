import { describe, it, expect } from "vitest";
import { parseThaiTime, resolveMeetupAt } from "./thaiTime";

// เทสไฟล์นี้แบ่งเป็นสองฝั่งชัดๆ และฝั่งที่สำคัญกว่าคือฝั่งล่าง:
//
// 1. อ่านออกไหม — อ่านไม่ออกแค่ทำให้ฟีเจอร์ไม่ช่วยอะไร ผู้ใช้กรอกเองได้เหมือนเดิม
// 2. อ่านผิดหรือเปล่า — แชทซื้อขายเต็มไปด้วยตัวเลขราคา ถ้าจับ "ลดเหลือ 1,250.50" เป็นเวลานัด
//    ระบบจะเสนอนัดผิดให้อีกฝ่ายเห็น ซึ่งแย่กว่าไม่มีฟีเจอร์นี้เลย
const at = (text: string) => {
  const p = parseThaiTime(text);
  return p ? `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` : null;
};

describe("อ่านเวลาไทยจากข้อความแชท", () => {
  it("ระบบ 6 ชั่วโมงแบบไทย — โมงเช้า/บ่าย/เย็น/ทุ่ม/ตี", () => {
    expect(at("เจอกันตอน 5 โมงเช้า")).toBe("11:00");
    expect(at("9 โมงเช้าได้มั้ย")).toBe("09:00");
    expect(at("บ่ายโมงนะ")).toBe("13:00");
    expect(at("บ่าย 2")).toBe("14:00");
    expect(at("บ่าย 3 โมงโอเคมั้ย")).toBe("15:00");
    expect(at("4 โมงเย็น")).toBe("16:00");
    expect(at("2 ทุ่ม")).toBe("20:00");
    expect(at("ตี 3")).toBe("03:00");
    expect(at("เที่ยง")).toBe("12:00");
    expect(at("เที่ยงคืน")).toBe("00:00");
  });

  // จุดที่คนไทยเข้าใจตรงกันแต่ regex ไม่รู้เอง: "ห้าโมง" เฉยๆ คือ 17:00 ไม่ใช่ 05:00
  it('"5 โมง" เปล่าๆ = 17:00 แต่ "5 โมงเช้า" = 11:00', () => {
    expect(at("ตอน 5 โมง")).toBe("17:00");
    expect(at("ตอน 5 โมงเช้า")).toBe("11:00");
    expect(at("10 โมง")).toBe("10:00");
  });

  it("พิมพ์เป็นตัวหนังสือก็อ่านได้", () => {
    expect(at("ห้าโมงเย็นนะ")).toBe("17:00");
    expect(at("สองทุ่ม")).toBe("20:00");
    expect(at("ตีสาม")).toBe("03:00");
  });

  it('"ครึ่ง" = เพิ่ม 30 นาที', () => {
    expect(at("5 โมงครึ่ง")).toBe("17:30");
    expect(at("บ่าย 2 ครึ่ง")).toBe("14:30");
  });

  it("รูปแบบตัวเลข 17:00 / 17.30 น.", () => {
    expect(at("17:00")).toBe("17:00");
    expect(at("นัด 17.30 น. ได้มั้ย")).toBe("17:30");
    expect(at("9:05")).toBe("09:05");
  });

  // ถ้าข้อความมีทั้งเวลาแบบไทยและตัวเลข ให้ยึดแบบไทยซึ่งเจาะจงกว่า
  it("ข้อความยาวๆ ที่มีเวลาปนอยู่ ก็หยิบเฉพาะส่วนที่เป็นเวลา", () => {
    const p = parseThaiTime("โอเคครับ งั้นพรุ่งนี้เจอกันตอน 6 โมงเย็น หน้าห้างนะครับ");
    expect(p).not.toBeNull();
    expect(p!.hour).toBe(18);
    expect(p!.matched).toContain("โมงเย็น");
  });

  describe("สิ่งที่ต้องไม่ถูกอ่านเป็นเวลาเด็ดขาด", () => {
    it("ตัวเลขลอยๆ ที่ไม่มีหน่วยเวลากำกับ", () => {
      expect(parseThaiTime("ลดเหลือ 500 ได้มั้ยครับ")).toBeNull();
      expect(parseThaiTime("เอา 2 ตัวเลย")).toBeNull();
      expect(parseThaiTime("โอเคครับ")).toBeNull();
      expect(parseThaiTime("ไซส์ 42 พอดีมั้ย")).toBeNull();
    });

    it("ราคาที่มีจุดหรือจุลภาค", () => {
      expect(parseThaiTime("ลดเหลือ 1,250.50 ได้มั้ย")).toBeNull();
      expect(parseThaiTime("ราคา 15,900 บาท")).toBeNull();
      // เคสนี้คือตัวจับว่าด่าน "ห้ามมีตัวเลขขนาบ" ยังอยู่จริง — ถ้าถอดออก "12.30" กลางราคาจะถูก
      // อ่านเป็น 12:30 ทันที (ต่างจากเคสบน ที่รอดเพราะชั่วโมงเกิน 23 ไปเอง)
      expect(parseThaiTime("โอนไป 1,012.30 บาทแล้วนะ")).toBeNull();
    });

    it("ตัวเลขที่เกินช่วงของหน่วยนั้น", () => {
      expect(parseThaiTime("ตี 9")).toBeNull(); // ไม่มีใครพูดว่าตี 9
      expect(parseThaiTime("9 ทุ่ม")).toBeNull(); // ทุ่มมีถึง 6 ทุ่ม
      expect(parseThaiTime("25:00")).toBeNull();
    });
  });

  it("บอกวันมาด้วยก็เก็บไว้ต่างหากจากเวลา", () => {
    expect(parseThaiTime("พรุ่งนี้ 5 โมง")!.dayOffset).toBe(1);
    expect(parseThaiTime("มะรืนนี้ บ่าย 2")!.dayOffset).toBe(2);
    expect(parseThaiTime("วันนี้ 3 ทุ่ม")!.dayOffset).toBe(0);
    expect(parseThaiTime("เสาร์นี้ 10 โมง")!.weekday).toBe(6);
    expect(parseThaiTime("ตอน 5 โมง")!.dayOffset).toBeNull();
  });
});

describe("แปลงเป็นวันเวลาจริง", () => {
  // ศุกร์ 25 ก.ย. 2026 เวลา 14:00 (เวลาเครื่องผู้ใช้ = เวลาไทย)
  const now = new Date(2026, 8, 25, 14, 0, 0);

  it("ไม่ได้บอกวัน และเวลายังมาไม่ถึงวันนี้ → วันนี้", () => {
    const d = resolveMeetupAt(parseThaiTime("ตอน 5 โมง")!, now);
    expect(d.getDate()).toBe(25);
    expect(d.getHours()).toBe(17);
  });

  // คนพิมพ์ "10 โมง" ตอนบ่ายสอง ย่อมหมายถึงพรุ่งนี้เช้า ไม่ใช่เมื่อเช้าที่ผ่านมาแล้ว
  it("ไม่ได้บอกวัน และเวลาผ่านไปแล้ววันนี้ → พรุ่งนี้", () => {
    const d = resolveMeetupAt(parseThaiTime("10 โมง")!, now);
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(10);
  });

  it("บอกว่าพรุ่งนี้/มะรืน ก็บวกวันตามนั้น แม้เวลาจะยังไม่ถึงวันนี้", () => {
    expect(resolveMeetupAt(parseThaiTime("พรุ่งนี้ 5 โมง")!, now).getDate()).toBe(26);
    expect(resolveMeetupAt(parseThaiTime("มะรืนนี้ 5 โมง")!, now).getDate()).toBe(27);
  });

  it("บอกเป็นชื่อวัน → วันนั้นที่กำลังจะมาถึง", () => {
    // ศุกร์ที่ 25 → เสาร์ที่กำลังจะมาถึงคือวันที่ 26
    expect(resolveMeetupAt(parseThaiTime("เสาร์นี้ 10 โมง")!, now).getDate()).toBe(26);
    // วันเดียวกับวันนี้ (ศุกร์) แต่เวลาผ่านไปแล้ว → ศุกร์หน้า
    expect(resolveMeetupAt(parseThaiTime("ศุกร์ 10 โมง")!, now).getDate()).toBe(2);
  });
});
