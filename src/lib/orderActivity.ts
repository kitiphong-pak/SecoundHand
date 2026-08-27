import type { Order } from "@/types";

// ออเดอร์ไม่มี field "updatedAt" กลาง ๆ ตัวเดียว — timestamp ของแต่ละขั้นตอนแยกเก็บคนละ field
// (sellerMarkedDeliveredAt, buyerConfirmedAt, ...) ฟังก์ชันนี้หาเวลาที่ "เกิดอะไรล่าสุด" กับ
// ออเดอร์นั้นจริงๆ ไม่ว่าจะเป็นขั้นตอนไหน ใช้ทั้งเรียงลำดับ list และเทียบว่ามีอะไรเปลี่ยนใหม่หรือยัง
export function getOrderActivityAt(order: Order): string {
  const timestamps = [
    order.createdAt,
    order.sellerMarkedDeliveredAt,
    order.buyerConfirmedAt,
    order.completedAt,
    order.disputeOpenedAt,
  ].filter((t): t is string => !!t);
  return timestamps.reduce((latest, t) => (t > latest ? t : latest), order.createdAt);
}
