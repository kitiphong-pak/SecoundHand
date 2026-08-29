import Link from "next/link";
import { fetchDisplayLogs } from "@/lib/auditLogDisplay";
import { AUDIT_ACTION_LABEL, type AuditAction } from "@/lib/auditLog";

const PAGE_SIZE = 20;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isAuditAction(value: string): value is AuditAction {
  return value in AUDIT_ACTION_LABEL;
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; q?: string; product?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const action = params.action && isAuditAction(params.action) ? params.action : undefined;
  const q = params.q?.trim() || undefined;
  const product = params.product?.trim() || undefined;
  const dateFrom = params.from && DATE_RE.test(params.from) ? params.from : undefined;
  const dateTo = params.to && DATE_RE.test(params.to) ? params.to : undefined;

  const { entries, totalCount } = await fetchDisplayLogs({
    action,
    actorQuery: q,
    productQuery: product,
    dateFrom,
    dateTo,
    page,
    pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasFilters = Boolean(action || q || product || dateFrom || dateTo);

  // สร้าง query string สำหรับลิงก์เปลี่ยนหน้า โดยคงค่าตัวกรองปัจจุบันไว้
  const pageHref = (targetPage: number) => {
    const sp = new URLSearchParams();
    if (action) sp.set("action", action);
    if (q) sp.set("q", q);
    if (product) sp.set("product", product);
    if (dateFrom) sp.set("from", dateFrom);
    if (dateTo) sp.set("to", dateTo);
    sp.set("page", String(targetPage));
    return `/admin/logs?${sp.toString()}`;
  };

  return (
    <div>
      <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
        กิจกรรมระบบ
      </h1>
      <p className="mt-1 text-sm text-neutral-500">พบทั้งหมด {totalCount.toLocaleString("th-TH")} รายการ</p>

      <form action="/admin/logs" method="GET" className="mt-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="action" className="text-xs font-medium text-neutral-700">
            การกระทำ
          </label>
          <select
            id="action"
            name="action"
            defaultValue={action ?? ""}
            className="rounded-[var(--radius-md)] border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-primary-500"
          >
            <option value="">ทุกการกระทำ</option>
            {Object.entries(AUDIT_ACTION_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-neutral-700">
            ผู้ทำรายการ
          </label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="ค้นหาชื่อ..."
            className="rounded-[var(--radius-md)] border border-neutral-300 px-3.5 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-primary-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="product" className="text-xs font-medium text-neutral-700">
            สินค้า
          </label>
          <input
            id="product"
            type="text"
            name="product"
            defaultValue={product ?? ""}
            placeholder="ค้นหาชื่อสินค้า..."
            className="rounded-[var(--radius-md)] border border-neutral-300 px-3.5 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-primary-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs font-medium text-neutral-700">
            จากวันที่
          </label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={dateFrom ?? ""}
            className="rounded-[var(--radius-md)] border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs font-medium text-neutral-700">
            ถึงวันที่
          </label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={dateTo ?? ""}
            className="rounded-[var(--radius-md)] border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-primary-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-[var(--radius-md)] bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          กรอง
        </button>
        {hasFilters && (
          <Link href="/admin/logs" className="px-2 py-2 text-sm text-neutral-500 hover:text-primary-600">
            ล้างตัวกรอง
          </Link>
        )}
      </form>

      {entries.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-500">
          {hasFilters ? "ไม่พบกิจกรรมที่ตรงกับตัวกรอง" : "ยังไม่มีกิจกรรมในระบบ"}
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto rounded-[var(--radius-lg)] border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">เวลา</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">ผู้ทำรายการ</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">การกระทำ</th>
                  <th className="px-4 py-2.5 font-medium">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {entries.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 align-top text-xs tabular-nums text-neutral-400">
                      {new Date(log.createdAt).toLocaleString("th-TH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 align-top font-medium text-neutral-900">
                      {log.actorName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 align-top text-neutral-700">
                      {log.actionLabel}
                    </td>
                    <td className="px-4 py-2.5 align-top text-neutral-500">
                      {log.productTitle ?? "—"}
                      {log.disputeReason && (
                        <p className="mt-0.5 text-xs text-error-500">เหตุผล: {log.disputeReason}</p>
                      )}
                      {log.orderId && (
                        <Link
                          href={`/admin/orders/${log.orderId}`}
                          className="mt-0.5 block text-xs text-primary-600 hover:underline"
                        >
                          ดูออเดอร์ →
                        </Link>
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
