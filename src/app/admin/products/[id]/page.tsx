import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { mapProduct, mapOrder } from "@/lib/mappers";
import { Badge } from "@/components/ui/Badge";
import { ProductGallery } from "@/components/ProductGallery";
import { LocationPinIcon } from "@/components/ui/LocationPinIcon";
import { CONDITION_LABEL } from "@/lib/categories";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";

const PRODUCT_STATUS_BADGE: Record<
  string,
  { label: string; status: "pending" | "success" | "neutral" | "error" | "info" }
> = {
  listed: { label: "กำลังขาย", status: "info" },
  reserved: { label: "จองแล้ว", status: "pending" },
  sold: { label: "ขายแล้ว", status: "success" },
  removed: { label: "ลบแล้ว", status: "neutral" },
};

// มุมมองสินค้าแบบอ่านอย่างเดียวสำหรับแอดมิน — เหมือนหน้า /products/[id] ของผู้ใช้ทั่วไป
// แต่ตัดปุ่มซื้อ/แชทออก เพราะแอดมินไม่ใช่คู่ค้าในตลาด (หน้าเดิมก็เด้งแอดมินกลับอยู่แล้ว)
export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: row } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const product = mapProduct(row);

  const [{ data: seller }, { data: orderRows }] = await Promise.all([
    supabase.from("users").select("id, name, email, province, is_verified").eq("id", product.sellerId).maybeSingle(),
    supabase.from("orders").select("*").eq("product_id", id).order("created_at", { ascending: false }),
  ]);
  const orders = (orderRows ?? []).map(mapOrder);
  const badge = PRODUCT_STATUS_BADGE[product.status];

  return (
    <div>
      <Link href="/admin/products" className="text-sm text-neutral-500 hover:text-primary-600">
        ← สินค้าทั้งหมด
      </Link>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
          <ProductGallery images={product.images} title={product.title} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
                {product.title}
              </h1>
              {badge && <Badge status={badge.status}>{badge.label}</Badge>}
            </div>
            <p className="mt-2 font-[var(--font-display)] text-2xl font-semibold text-primary-600">
              ฿{product.price.toLocaleString("th-TH")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-500">
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1">
                <LocationPinIcon /> {product.province}
              </span>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1">
                {CONDITION_LABEL[product.condition]}
              </span>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1">{product.category}</span>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm text-neutral-700">{product.description}</p>
            <p className="mt-3 text-xs text-neutral-400">
              ลงขายเมื่อ {new Date(product.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
            <h2 className="text-sm font-medium text-neutral-900">ผู้ขาย</h2>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-neutral-900">{seller?.name ?? "ไม่พบ"}</p>
                <p className="text-xs text-neutral-500">
                  {seller?.email} · {seller?.province}
                </p>
              </div>
              {seller?.is_verified ? (
                <Badge status="success">ยืนยันตัวตนแล้ว</Badge>
              ) : (
                <Badge status="neutral">ยังไม่ยืนยัน</Badge>
              )}
            </div>
            {seller && (
              <Link
                href={`/admin/users?q=${encodeURIComponent(seller.email)}`}
                className="mt-3 inline-block text-xs text-primary-600 hover:underline"
              >
                ดูข้อมูลผู้ใช้ →
              </Link>
            )}
          </div>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-neutral-700">
          ออเดอร์ของสินค้าชิ้นนี้ ({orders.length.toLocaleString("th-TH")})
        </h2>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">ยังไม่มีออเดอร์</p>
        ) : (
          <div className="mt-3 divide-y divide-neutral-100 rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0">
            {orders.map((order) => {
              const orderBadge = ORDER_STATUS_LABEL[order.status];
              return (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50"
                >
                  <span className="text-neutral-500">
                    {new Date(order.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <div className="flex items-center gap-3">
                    {orderBadge && <Badge status={orderBadge.status}>{orderBadge.label}</Badge>}
                    <span className="font-medium tabular-nums text-neutral-900">
                      ฿{order.amount.toLocaleString("th-TH")}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
