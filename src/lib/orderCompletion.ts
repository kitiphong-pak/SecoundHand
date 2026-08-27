import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import type { Order } from "@/types";

// ใช้ร่วมกันระหว่าง verify-otp และ simulate-timeout — ทั้งสองจุดปิดออเดอร์แบบเดียวกันทุกอย่าง
// (ปั๊ม completed + completedAt แล้วเปลี่ยนสถานะสินค้าเป็น sold) ต่างกันแค่เงื่อนไขที่นำมาถึงจุดนี้
export async function completeOrder(orderId: string, productId: string): Promise<Order> {
  const { data: updated, error } = await supabase
    .from("orders")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", orderId)
    .select()
    .single();
  if (error || !updated) throw error ?? new Error("ปิดออเดอร์ไม่สำเร็จ");

  await supabase.from("products").update({ status: "sold" }).eq("id", productId);

  return mapOrder(updated);
}
