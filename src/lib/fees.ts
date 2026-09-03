// ค่าธรรมเนียมที่แพลตฟอร์มหักจากทุกออเดอร์ (take rate)
//
// 5% อยู่ในช่วงมาตรฐานของ marketplace มือสอง — สูงพอจะเป็นรายได้จริง ต่ำพอที่ผู้ขายยังยอมจ่าย
// แทนที่จะไปนัดเจอกันแล้วจ่ายสดนอกระบบ ตัวเลขนี้เปลี่ยนได้ และออเดอร์เก่าจะไม่กระทบ เพราะ
// แต่ละออเดอร์จำอัตราที่ใช้ ณ ตอนสร้างไว้ในคอลัมน์ fee_rate ของตัวเอง
export const PLATFORM_FEE_RATE = 0.05;

export interface FeeBreakdown {
  /** ยอดที่ผู้ซื้อจ่าย */
  amount: number;
  /** อัตราที่ใช้กับออเดอร์นี้ เก็บไว้เพื่อให้ตรวจย้อนหลังได้ว่าตอนนั้นคิดกี่เปอร์เซ็นต์ */
  feeRate: number;
  /** ส่วนที่แพลตฟอร์มหัก */
  platformFee: number;
  /** ส่วนที่ผู้ขายได้รับ */
  sellerPayout: number;
}

/**
 * แบ่งยอดออเดอร์เป็นค่าธรรมเนียมกับยอดที่ผู้ขายได้
 *
 * ปัดค่าธรรมเนียมลงเป็นทศนิยม 2 ตำแหน่ง (หน่วยสตางค์) แล้วให้ผู้ขายได้ "ส่วนที่เหลือ" เสมอ
 * ไม่ใช่ปัดทั้งสองฝั่งแยกกัน — เพราะการปัดสองครั้งทำให้ผลรวมคลาดจากยอดจริงได้เศษสตางค์
 * ซึ่งจะไปชนกับ constraint ในฐานข้อมูลที่บังคับว่า platform_fee + seller_payout = amount
 * และในระบบเงินจริง เศษที่หายไปทีละสตางค์คือบั๊กที่หาสาเหตุยากที่สุดประเภทหนึ่ง
 *
 * ปัดลงเพราะเมื่อต้องเลือกว่าเศษสตางค์จะตกกับใคร ให้ตกกับผู้ขายดีกว่าตกกับแพลตฟอร์ม
 */
export function calculateFees(amount: number, feeRate: number = PLATFORM_FEE_RATE): FeeBreakdown {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("ยอดออเดอร์ต้องเป็นจำนวนที่มากกว่าหรือเท่ากับ 0");
  }
  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate > 1) {
    throw new Error("อัตราค่าธรรมเนียมต้องอยู่ระหว่าง 0 ถึง 1");
  }

  const platformFee = Math.floor(amount * feeRate * 100) / 100;
  const sellerPayout = Math.round((amount - platformFee) * 100) / 100;

  return { amount, feeRate, platformFee, sellerPayout };
}
