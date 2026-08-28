import { supabase } from "@/lib/supabase";

// ใช้ร่วมกันระหว่างหน้าสินค้า (โชว์คะแนนผู้ขายสั้นๆ) กับหน้าโปรไฟล์ผู้ขาย (โชว์เต็ม)
export async function getUserRating(userId: string): Promise<{ avg: number | null; count: number }> {
  const { data } = await supabase.from("reviews").select("rating").eq("to_user_id", userId);
  const count = data?.length ?? 0;
  const avg = count > 0 ? data!.reduce((sum, r) => sum + r.rating, 0) / count : null;
  return { avg, count };
}
