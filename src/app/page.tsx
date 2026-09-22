import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import { Header } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { ProvinceFilter } from "@/components/ProvinceFilter";
import { PROVINCES } from "@/lib/provinces";

const PAGE_SIZE = 24;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // หน้านี้เปิดให้คนที่ยังไม่ได้เข้าสู่ระบบดูได้ — คนที่กดลิงก์มาจากกลุ่ม Facebook ต้องเห็นของก่อน
  // ถ้าเจอหน้าล็อกอินตั้งแต่แรก ส่วนใหญ่ปิดหน้าไปเลย ไม่มีใครสมัครสมาชิกเพื่อไปดูว่ามีอะไรขายบ้าง
  const user = await getCurrentUser();
  if (user?.role === "admin") redirect("/admin");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // สมาชิกเห็นสินค้าในจังหวัดตัวเองอัตโนมัติเหมือนเดิม ส่วนคนนอกเลือกจังหวัดเองจาก ?province=
  // ต้องเทียบกับรายชื่อจังหวัดจริงก่อนเอาไปใช้ ไม่งั้นใครใส่ค่าอะไรมาก็ถูกยิงเข้า query ตรงๆ
  const requested = Array.isArray(params.province) ? params.province[0] : params.province;
  const guestProvince =
    requested && (PROVINCES as readonly string[]).includes(requested) ? requested : null;
  const province = user ? user.province : guestProvince;

  // ฟีเจอร์หลัก: กรองสินค้าตามจังหวัด — ใส่ .range() แบ่งหน้าไว้ด้วย ไม่งั้นจังหวัดที่มีสินค้า
  // ลงขายเยอะๆ จะโหลดทุกชิ้นมาในคำขอเดียวโดยไม่มีขีดจำกัดเลย
  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("status", "listed")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (province) query = query.eq("province", province);
  const { data: rows, count } = await query;
  const products = (rows ?? []).map(mapProduct);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // แนะนำให้ผู้ใช้ใหม่ที่ยังไม่เคยลงขายอะไรเลยไปลองลงขายชิ้นแรก — เช็คแบบ count เฉยๆ
  // ไม่ต้องดึงข้อมูลสินค้าจริงมาทั้งก้อน เร็วกว่าและเบากว่า
  let isFirstTimeSeller = false;
  if (user) {
    const { count: listingCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", user.id);
    isFirstTimeSeller = (listingCount ?? 0) === 0;
  }

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (!user && guestProvince) qs.set("province", guestProvince);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/?${s}` : "/";
  };

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

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
              {province ? `สินค้าใน${province}` : "สินค้ามือสองทุกจังหวัด"}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {user
                ? "แสดงเฉพาะสินค้าในจังหวัดของคุณ เพื่อความสะดวกในการนัดรับ-ส่ง"
                : "เลือกจังหวัดของคุณเพื่อดูของที่นัดรับได้ใกล้บ้าน"}
            </p>
          </div>
          {!user && <ProvinceFilter value={guestProvince} />}
        </div>

        {products.length === 0 ? (
          <div className="mt-10 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
            {page > 1
              ? "ไม่มีสินค้าในหน้านี้แล้ว"
              : province
                ? `ยังไม่มีสินค้าประกาศขายใน${province}ตอนนี้`
                : "ยังไม่มีสินค้าประกาศขายตอนนี้"}
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
              <Link href={pageHref(page - 1)} className="text-primary-600 hover:underline">
                ← ก่อนหน้า
              </Link>
            ) : (
              <span className="text-neutral-300">← ก่อนหน้า</span>
            )}
            <span className="text-neutral-500">
              หน้า {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="text-primary-600 hover:underline">
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
