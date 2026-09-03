import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import { ProductCard } from "@/components/ProductCard";
import type { ProductStatus } from "@/types";

const PAGE_SIZE = 24;

const STATUS_FILTERS: Array<{ value: ProductStatus | "all"; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "listed", label: "กำลังขาย" },
  { value: "reserved", label: "จองแล้ว" },
  { value: "sold", label: "ขายแล้ว" },
  { value: "removed", label: "ลบแล้ว" },
];

function isProductStatus(value: string): value is ProductStatus {
  return ["listed", "reserved", "sold", "removed"].includes(value);
}

// escape ตัวอักษรพิเศษของ filter DSL ก่อนต่อสตริงใน .or() — เหตุผลเดียวกับใน /admin/users
function escapeForOrFilter(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = params.q?.trim() || undefined;
  const status = params.status && isProductStatus(params.status) ? params.status : undefined;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from("products").select("*", { count: "exact" });
  if (status) query = query.eq("status", status);
  if (q) {
    const escaped = escapeForOrFilter(q);
    query = query.or(`title.ilike."%${escaped}%",description.ilike."%${escaped}%"`);
  }
  const { data: rows, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const products = (rows ?? []).map(mapProduct);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const buildHref = (overrides: { page?: number; status?: string }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const nextStatus = overrides.status ?? status;
    if (nextStatus && nextStatus !== "all") sp.set("status", nextStatus);
    sp.set("page", String(overrides.page ?? 1));
    return `/admin/products?${sp.toString()}`;
  };

  return (
    <div>
      <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">สินค้า</h1>
      <p className="mt-1 text-sm text-neutral-500">
        ดูสินค้าทั้งหมดในระบบแบบอ่านอย่างเดียว ({(count ?? 0).toLocaleString("th-TH")} ชิ้น) —
        แอดมินซื้อ/แชท/ลงขายไม่ได้
      </p>
      <p className="mt-1 text-xs text-neutral-400">
        มุมมองนี้เห็นครบทุกจังหวัดและทุกสถานะ (รวมที่ขายไปแล้วและถูกลบ) จึงไม่ตรงกับหน้าแรกของ
        ผู้ใช้ ซึ่งเห็นเฉพาะสินค้าที่กำลังขายในจังหวัดของตัวเองเท่านั้น
      </p>

      <form action="/admin/products" method="GET" className="mt-4 flex items-end gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-neutral-700">
            ค้นหา
          </label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="ค้นหาชื่อหรือรายละเอียดสินค้า..."
            className="w-72 rounded-[var(--radius-md)] border border-neutral-300 px-3.5 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-primary-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-[var(--radius-md)] bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          ค้นหา
        </button>
        {(q || status) && (
          <Link href="/admin/products" className="px-2 py-2 text-sm text-neutral-500 hover:text-primary-600">
            ล้างตัวกรอง
          </Link>
        )}
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = f.value === "all" ? !status : status === f.value;
          return (
            <Link
              key={f.value}
              href={buildHref({ status: f.value, page: 1 })}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary-500 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
              ].join(" ")}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {products.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
          {q || status ? "ไม่พบสินค้าที่ตรงกับตัวกรอง" : "ยังไม่มีสินค้าในระบบ"}
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                href={`/admin/products/${product.id}`}
                showStatus
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={buildHref({ page: page - 1 })} className="text-primary-600 hover:underline">
                  ← ก่อนหน้า
                </Link>
              ) : (
                <span className="text-neutral-300">← ก่อนหน้า</span>
              )}
              <span className="text-neutral-500">
                หน้า {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={buildHref({ page: page + 1 })} className="text-primary-600 hover:underline">
                  ถัดไป →
                </Link>
              ) : (
                <span className="text-neutral-300">ถัดไป →</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
