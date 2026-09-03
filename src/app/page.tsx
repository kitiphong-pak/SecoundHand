import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import { Header } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";

const PAGE_SIZE = 24;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // ฟีเจอร์หลัก: กรองสินค้าตามจังหวัดของผู้ใช้งานโดยอัตโนมัติ — ใส่ .range() แบ่งหน้าไว้ด้วย
  // ไม่งั้นจังหวัดที่มีสินค้าลงขายเยอะๆ จะโหลดทุกชิ้นมาในคำขอเดียวโดยไม่มีขีดจำกัดเลย
  const { data: rows, count } = await supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("province", user.province)
    .eq("status", "listed")
    .order("created_at", { ascending: false })
    .range(from, to);
  const products = (rows ?? []).map(mapProduct);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // แนะนำให้ผู้ใช้ใหม่ที่ยังไม่เคยลงขายอะไรเลยไปลองลงขายชิ้นแรก — เช็คแบบ count เฉยๆ
  // ไม่ต้องดึงข้อมูลสินค้าจริงมาทั้งก้อน เร็วกว่าและเบากว่า
  const { count: listingCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id);
  const isFirstTimeSeller = (listingCount ?? 0) === 0;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50">
      <Header user={user} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        {isFirstTimeSeller && (
          <Link
            href="/sell"
            className="mb-5 flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-primary-200 bg-primary-50 p-4 hover:bg-primary-100"
          >
            <div>
              <p className="text-sm font-medium text-primary-700">
                มีของไม่ใช้แล้วอยู่ในบ้านไหม? ลองลงขายชิ้นแรกของคุณเลย
              </p>
              <p className="mt-0.5 text-xs text-primary-600">
                ถ่ายรูป ตั้งราคา ใช้เวลาไม่ถึง 2 นาที
              </p>
            </div>
            <span className="flex-none rounded-[var(--radius-md)] bg-primary-500 px-4 py-2 text-sm font-medium text-white">
              + ลงขายสินค้า
            </span>
          </Link>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
              สินค้าใน{user.province}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              แสดงเฉพาะสินค้าในจังหวัดของคุณ เพื่อความสะดวกในการนัดรับ-ส่ง
            </p>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
            {page === 1 ? `ยังไม่มีสินค้าประกาศขายใน${user.province}ตอนนี้` : "ไม่มีสินค้าในหน้านี้แล้ว"}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={`/?page=${page - 1}`} className="text-primary-600 hover:underline">
                ← ก่อนหน้า
              </Link>
            ) : (
              <span className="text-neutral-300">← ก่อนหน้า</span>
            )}
            <span className="text-neutral-500">
              หน้า {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={`/?page=${page + 1}`} className="text-primary-600 hover:underline">
                ถัดไป →
              </Link>
            ) : (
              <span className="text-neutral-300">ถัดไป →</span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
