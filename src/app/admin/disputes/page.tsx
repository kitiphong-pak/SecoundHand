import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { mapOrder } from "@/lib/mappers";
import { DisputeResolutionButtons } from "@/components/DisputeResolutionButtons";

export default async function AdminDisputesPage() {
  const { data: orderRows } = await supabase
    .from("orders")
    .select("*")
    .eq("status", "disputed")
    .order("dispute_opened_at", { ascending: true });
  const orders = (orderRows ?? []).map(mapOrder);

  const productIds = [...new Set(orders.map((o) => o.productId))];
  const userIds = [...new Set(orders.flatMap((o) => [o.buyerId, o.sellerId]))];

  const [{ data: productRows }, { data: userRows }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, title").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    userIds.length > 0
      ? supabase.from("users").select("id, name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const titleByProduct = new Map((productRows ?? []).map((p) => [p.id, p.title]));
  const nameByUser = new Map((userRows ?? []).map((u) => [u.id, u.name]));

  return (
    <div>
      <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
        ข้อพิพาทที่รอตรวจสอบ
      </h1>

      {orders.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
          ไม่มีข้อพิพาทค้างอยู่ตอนนี้
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-[var(--radius-lg)] border border-error-500/30 bg-neutral-0 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    {titleByProduct.get(order.productId) ?? "สินค้าไม่พบ"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    ผู้ซื้อ: {nameByUser.get(order.buyerId) ?? "ไม่พบ"} · ผู้ขาย:{" "}
                    {nameByUser.get(order.sellerId) ?? "ไม่พบ"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    ยอด ฿{order.amount.toLocaleString("th-TH")}
                  </p>
                </div>
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="flex-none text-xs text-primary-600 hover:underline"
                >
                  ดูรายละเอียด →
                </Link>
              </div>

              {order.disputeReason && (
                <div className="mt-3 rounded-[var(--radius-md)] bg-error-50 p-3 text-sm text-error-500">
                  <p className="font-medium">เหตุผลที่เปิดข้อพิพาท</p>
                  <p className="mt-1">{order.disputeReason}</p>
                </div>
              )}

              <div className="mt-3">
                <DisputeResolutionButtons orderId={order.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
