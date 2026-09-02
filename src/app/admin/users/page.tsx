import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { mapUser } from "@/lib/mappers";
import { Badge } from "@/components/ui/Badge";
import { UserAdminActions } from "@/components/UserAdminActions";

const PAGE_SIZE = 20;

// escape ตัวอักษรที่มีความหมายพิเศษใน filter DSL ของ PostgREST (comma/parenthesis คั่น
// เงื่อนไขใน .or()) ก่อนเอาคำค้นของแอดมินไปต่อสตริง แล้วครอบด้วย "..." ให้ค่าทั้งก้อนถูกอ่าน
// เป็น literal เดียว — กันแอดมินพิมพ์ชื่อที่มี , หรือ ( แล้ว query พังเฉยๆ ไม่ใช่ช่องโหว่สิทธิ์
// (แอดมินเห็นข้อมูลผู้ใช้ทุกคนอยู่แล้วผ่าน service role คนละเรื่องกับ UUID_RE ที่กันข้าม
// สิทธิ์ผู้ใช้ทั่วไปในหน้าแชท)
function escapeForOrFilter(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const q = params.q?.trim() || undefined;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase.from("users").select("*", { count: "exact" });
  if (q) {
    const escaped = escapeForOrFilter(q);
    query = query.or(`name.ilike."%${escaped}%",email.ilike."%${escaped}%"`);
  }
  const { data: rows, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const users = (rows ?? []).map(mapUser);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const pageHref = (targetPage: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    sp.set("page", String(targetPage));
    return `/admin/users?${sp.toString()}`;
  };

  return (
    <div>
      <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
        ผู้ใช้ทั้งหมด
      </h1>
      <p className="mt-1 text-sm text-neutral-500">พบทั้งหมด {(count ?? 0).toLocaleString("th-TH")} คน</p>

      <form action="/admin/users" method="GET" className="mt-4 flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-neutral-700">
            ค้นหา
          </label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="ค้นหาชื่อหรืออีเมล..."
            className="w-64 rounded-[var(--radius-md)] border border-neutral-300 px-3.5 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-primary-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-[var(--radius-md)] bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          ค้นหา
        </button>
        {q && (
          <Link href="/admin/users" className="px-2 py-2 text-sm text-neutral-500 hover:text-primary-600">
            ล้างการค้นหา
          </Link>
        )}
      </form>

      {users.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
          {q ? "ไม่พบผู้ใช้ที่ตรงกับคำค้น" : "ยังไม่มีผู้ใช้ในระบบ"}
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">ชื่อ</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">อีเมล</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">จังหวัด</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">สถานะ</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">สมัครเมื่อ</th>
                  <th className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 align-top font-medium text-neutral-900">
                      {u.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 align-top text-neutral-500">{u.email}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 align-top text-neutral-500">{u.province}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {u.role === "admin" && <Badge status="info">แอดมิน</Badge>}
                        {u.isVerified && <Badge status="success">ยืนยันตัวตนแล้ว</Badge>}
                        {u.isSuspended && <Badge status="error">ถูกระงับ</Badge>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 align-top text-xs text-neutral-400">
                      {new Date(u.createdAt).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {u.role !== "admin" && (
                        <UserAdminActions
                          userId={u.id}
                          isVerified={u.isVerified}
                          isSuspended={u.isSuspended}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
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
        </>
      )}
    </div>
  );
}
