import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { mapOrder, mapProduct } from "@/lib/mappers";
import { Badge } from "@/components/ui/Badge";
import { ProductGallery } from "@/components/ProductGallery";
import { DisputeResolutionButtons } from "@/components/DisputeResolutionButtons";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";
import { CONDITION_LABEL } from "@/lib/categories";
import { LocationPinIcon } from "@/components/ui/LocationPinIcon";

// มุมมองแบบ read-only ให้แอดมินเห็นบริบทเต็มของออเดอร์ (รูปสินค้า ไทม์ไลน์ ข้อมูลคู่ซื้อขาย)
// ก่อนตัดสินข้อพิพาท — ต่างจากหน้า /orders/[id] ของผู้ใช้ทั่วไปตรงที่ไม่มีปุ่มทำธุรกรรมใดๆ
// (จ่ายเงิน/ยืนยันรับของ/แชท) เพราะแอดมินไม่ใช่คู่ค้าในออเดอร์ มีแค่ปุ่มตัดสินข้อพิพาทเท่านั้น
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: orderRow } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!orderRow) notFound();
  const order = mapOrder(orderRow);

  const [{ data: productRow }, { data: buyer }, { data: seller }] = await Promise.all([
    supabase.from("products").select("*").eq("id", order.productId).maybeSingle(),
    supabase.from("users").select("name, email, province, is_verified").eq("id", order.buyerId).maybeSingle(),
    supabase.from("users").select("name, email, province, is_verified").eq("id", order.sellerId).maybeSingle(),
  ]);
  const product = productRow ? mapProduct(productRow) : null;

  const badge = ORDER_STATUS_LABEL[order.status];

  const timelineRaw: Array<{ label: string; at: string | undefined }> = [
    { label: "สร้างออเดอร์", at: order.createdAt },
    { label: "ผู้ขายแจ้งส่งมอบ", at: order.sellerMarkedDeliveredAt },
    { label: "ผู้ซื้อยืนยันรับสินค้า", at: order.buyerConfirmedAt },
    { label: "เปิดข้อพิพาท", at: order.disputeOpenedAt },
    { label: "ปิดการขาย", at: order.completedAt },
    { label: "ยกเลิก/คืนเงิน", at: order.cancelledAt },
  ];
  const timeline = timelineRaw.filter((t): t is { label: string; at: string } => Boolean(t.at));
  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div>
      <Link href="/admin/disputes" className="text-sm text-neutral-500 hover:text-primary-600">
        ← ข้อพิพาททั้งหมด
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-neutral-400">ออเดอร์ #{order.id}</p>
          <h1 className="mt-1 font-[var(--font-display)] text-xl font-semibold text-neutral-900">
            {product?.title ?? "สินค้าไม่พบ"}
          </h1>
        </div>
        {badge && <Badge status={badge.status}>{badge.label}</Badge>}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
          <h2 className="text-sm font-medium text-neutral-900">สินค้า</h2>
          {product ? (
            <div className="mt-3">
              <ProductGallery images={product.images} title={product.title} />
              <p className="mt-3 whitespace-pre-line text-sm text-neutral-700">{product.description}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1">
                  <LocationPinIcon /> {product.province}
                </span>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1">
                  {CONDITION_LABEL[product.condition]}
                </span>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1">{product.category}</span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-400">ไม่พบข้อมูลสินค้า (อาจถูกลบ)</p>
          )}
          <p className="mt-3 font-[var(--font-display)] text-lg font-semibold text-primary-600">
            ฿{order.amount.toLocaleString("th-TH")}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
            <h2 className="text-sm font-medium text-neutral-900">คู่ซื้อขาย</h2>
            <div className="mt-3 flex flex-col gap-3 text-sm">
              <div>
                <p className="text-xs text-neutral-400">ผู้ซื้อ</p>
                <p className="text-neutral-900">{buyer?.name ?? "ไม่พบ"}</p>
                <p className="text-xs text-neutral-500">{buyer?.email} · {buyer?.province}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-400">ผู้ขาย</p>
                <p className="text-neutral-900">{seller?.name ?? "ไม่พบ"}</p>
                <p className="text-xs text-neutral-500">{seller?.email} · {seller?.province}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
            <h2 className="text-sm font-medium text-neutral-900">ไทม์ไลน์</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {timeline.map((t) => (
                <li key={t.label} className="flex items-center justify-between">
                  <span className="text-neutral-700">{t.label}</span>
                  <span className="text-xs text-neutral-400">
                    {new Date(t.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {order.disputeReason && (
            <div className="rounded-[var(--radius-lg)] border border-error-500/30 bg-error-50 p-4">
              <p className="text-sm font-medium text-error-500">เหตุผลที่เปิดข้อพิพาท</p>
              <p className="mt-1 text-sm text-neutral-700">{order.disputeReason}</p>
            </div>
          )}

          {order.status === "disputed" && (
            <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
              <h2 className="text-sm font-medium text-neutral-900">ตัดสินข้อพิพาท</h2>
              <div className="mt-3">
                <DisputeResolutionButtons orderId={order.id} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
