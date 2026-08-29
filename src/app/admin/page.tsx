import type { ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";
import { fetchDisplayLogs } from "@/lib/auditLogDisplay";
import { buildSparkline, bucketDaily } from "@/lib/sparkline";
import { BUYER_CONFIRM_WINDOW_MS } from "@/lib/orderTiming";
import type { OrderStatus } from "@/types";

const ORDER_STATUSES: OrderStatus[] = [
  "pending_payment",
  "paid",
  "awaiting_buyer_confirmation",
  "awaiting_otp_entry",
  "completed",
  "disputed",
  "cancelled",
];

const TREND_DAYS = 14;
const FOURTEEN_DAYS_AGO = new Date(Date.now() - TREND_DAYS * 24 * 60 * 60 * 1000).toISOString();

// สีเดียวกับที่ Badge.tsx ใช้ — สถานะไหนแสดงเป็นสีอะไรในตัว badge ก็ใช้สีนั้นในกราฟด้วย
// เพื่อให้ทั้งแอปสื่อความหมายสีตรงกัน (pending=warning, success, neutral, error, info)
const STATUS_COLOR: Record<"pending" | "success" | "neutral" | "error" | "info", string> = {
  pending: "#d97706",
  success: "#16a34a",
  neutral: "#9ca3af",
  error: "#dc2626",
  info: "#0284c7",
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const { width, height, linePath, areaPath, lastX, lastY } = buildSparkline(values);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mt-2 overflow-visible">
      <path d={areaPath} fill={color} fillOpacity={0.12} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={4} fill={color} stroke="white" strokeWidth={2} />
    </svg>
  );
}

function KpiTile({
  label,
  value,
  delta,
  values,
  color,
}: {
  label: string;
  value: string | number;
  delta?: string;
  values?: number[];
  color?: string;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="font-[var(--font-display)] text-2xl font-semibold tabular-nums text-neutral-900">
          {typeof value === "number" ? value.toLocaleString("th-TH") : value}
        </p>
        {delta && (
          <span className="rounded-full bg-success-50 px-1.5 py-0.5 text-[11px] font-medium text-success-500">
            {delta}
          </span>
        )}
      </div>
      {values && <Sparkline values={values} color={color ?? "#4f46e5"} />}
    </div>
  );
}

function AlertBanner({ tone, title, description, href }: { tone: "critical" | "warning"; title: string; description: string; href?: string }) {
  const toneClasses =
    tone === "critical"
      ? "border-error-500/30 bg-error-50"
      : "border-warning-500/30 bg-warning-50";
  const textClasses = tone === "critical" ? "text-error-500" : "text-warning-500";

  const content = (
    <div className={`flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border-l-4 ${toneClasses} px-4 py-3`}>
      <div>
        <p className={`text-sm font-semibold ${textClasses}`}>{title}</p>
        <p className="mt-0.5 text-xs text-neutral-600">{description}</p>
      </div>
      {href && <span className={`flex-none text-xs font-medium ${textClasses}`}>ดูรายละเอียด →</span>}
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function StatGrid({ children }: { children: ReactNode }) {
  return <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
      <p className="font-[var(--font-display)] text-2xl font-semibold tabular-nums text-neutral-900">
        {typeof value === "number" ? value.toLocaleString("th-TH") : value}
      </p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
    </div>
  );
}

// รูปร่างผลลัพธ์ของฟังก์ชัน aggregate ฝั่ง Postgres (ดู
// supabase/migrations/009_admin_aggregate_functions.sql) — โปรเจกต์นี้ไม่ได้ generate type
// จาก schema เลยต้องประกาศเองตรงนี้ ให้ตรงกับ `returns table (...)` ของแต่ละฟังก์ชัน
interface OrderStatusCountRow {
  status: string;
  cnt: number;
}
interface GmvDailyRow {
  day: string;
  total: number;
}
interface ReviewStatsRow {
  cnt: number;
  avg_rating: number | null;
}

export default async function AdminDashboardPage() {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const buyerConfirmCutoff = new Date(nowDate.getTime() - BUYER_CONFIRM_WINDOW_MS).toISOString();

  const [
    { count: totalUsers },
    { data: newUserRows },
    { count: totalProducts },
    { count: listedProducts },
    { count: soldProducts },
    { data: orderStatusRows },
    { data: newOrderRows },
    { data: gmvTotalRow },
    { data: gmvDailyRows },
    { data: reviewStatsRows },
    { count: overdueOtpCount },
    { count: overdueBuyerConfirmCount },
    { count: disputedCount },
    recentActivity,
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("users").select("created_at").gte("created_at", FOURTEEN_DAYS_AGO),
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "listed"),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "sold"),
    // นับออเดอร์แยกตามสถานะด้วย 1 query ฝั่ง Postgres (group by) แทนที่จะยิง count query
    // แยกทีละสถานะ 7 รอบแบบเดิม — ดู supabase/migrations/009_admin_aggregate_functions.sql
    supabase.rpc("admin_order_status_counts") as unknown as Promise<{ data: OrderStatusCountRow[] | null }>,
    supabase.from("orders").select("created_at").gte("created_at", FOURTEEN_DAYS_AGO),
    // ยอดขายรวม (lifetime) คำนวณฝั่ง Postgres แทนการดึงออเดอร์ completed ทุกแถวมาบวกเองใน JS
    supabase.rpc("admin_gmv_total") as unknown as Promise<{ data: number | null }>,
    // ยอดขายรายวัน 14 วันล่าสุด — เท่ากับข้อมูลไม่กี่แถว แทนที่จะดึงออเดอร์ completed ทั้งหมด
    // มา filter/bucket เองใน JS เหมือนเดิม
    supabase.rpc("admin_gmv_daily", { since: FOURTEEN_DAYS_AGO }) as unknown as Promise<{ data: GmvDailyRow[] | null }>,
    // จำนวนรีวิว + คะแนนเฉลี่ยทั้งระบบ คำนวณฝั่ง Postgres แทนการดึง rating ทุกแถวมาเฉลี่ยเอง
    supabase.rpc("admin_review_stats") as unknown as Promise<{ data: ReviewStatsRow[] | null }>,
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "awaiting_otp_entry")
      .lt("otp_expires_at", now),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "awaiting_buyer_confirmation")
      .lt("seller_marked_delivered_at", buyerConfirmCutoff),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "disputed"),
    fetchDisplayLogs({ page: 1, pageSize: 6 }),
  ]);

  // admin_order_status_counts() คืนมาแค่สถานะที่มีออเดอร์อยู่จริงอย่างน้อย 1 รายการ ต้องเติม 0
  // ให้สถานะที่เหลือเองเพื่อให้กราฟแท่งแสดงครบทุกสถานะเสมอเหมือนพฤติกรรมเดิม
  const countByStatus = new Map((orderStatusRows ?? []).map((r) => [r.status, Number(r.cnt)]));
  const orderStatusCounts = ORDER_STATUSES.map((status) => ({
    status,
    count: countByStatus.get(status) ?? 0,
  }));
  const totalOrders = orderStatusCounts.reduce((sum, s) => sum + s.count, 0);

  const gmv = Number(gmvTotalRow ?? 0);
  const reviewStats = reviewStatsRows?.[0];
  const reviewCount = Number(reviewStats?.cnt ?? 0);
  const avgRating = reviewStats?.avg_rating != null ? Number(reviewStats.avg_rating) : null;

  const userTrend = bucketDaily(newUserRows ?? [], TREND_DAYS, (r) => r.created_at);
  const orderTrend = bucketDaily(newOrderRows ?? [], TREND_DAYS, (r) => r.created_at);
  const gmvTrend = bucketDaily(
    gmvDailyRows ?? [],
    TREND_DAYS,
    (r) => r.day,
    (r) => Number(r.total)
  );
  const gmvLast14d = gmvTrend.reduce((sum, v) => sum + v, 0);

  const hasUrgent = (disputedCount ?? 0) > 0 || (overdueOtpCount ?? 0) > 0 || (overdueBuyerConfirmCount ?? 0) > 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
          ภาพรวมระบบ
        </h1>
      </div>

      <section>
        <h2 className="text-sm font-medium text-neutral-700">เรื่องด่วนที่ต้องดำเนินการ</h2>
        <div className="mt-3 flex flex-col gap-2">
          {(disputedCount ?? 0) > 0 && (
            <AlertBanner
              tone="critical"
              title={`${disputedCount} ข้อพิพาทรอตรวจสอบ`}
              description="ผู้ซื้อเปิดข้อพิพาทและกำลังรอแอดมินตัดสิน"
              href="/admin/disputes"
            />
          )}
          {(overdueOtpCount ?? 0) > 0 && (
            <AlertBanner
              tone="warning"
              title={`${overdueOtpCount} ออเดอร์เลยกำหนดรอผู้ขายกรอก OTP`}
              description="ผู้ซื้อยืนยันรับสินค้าแล้ว แต่ผู้ขายยังไม่กรอก OTP ภายในเวลาที่กำหนด — ระบบยังไม่ปิดออเดอร์ให้อัตโนมัติ"
            />
          )}
          {(overdueBuyerConfirmCount ?? 0) > 0 && (
            <AlertBanner
              tone="warning"
              title={`${overdueBuyerConfirmCount} ออเดอร์เลยกำหนดรอผู้ซื้อยืนยันรับสินค้า`}
              description="ผู้ขายแจ้งส่งมอบแล้ว แต่ผู้ซื้อยังไม่ยืนยันภายในเวลาที่กำหนด — ระบบยังไม่ปิดออเดอร์ให้อัตโนมัติ"
            />
          )}
          {!hasUrgent && (
            <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-500">
              ไม่มีเรื่องด่วนที่ต้องดำเนินการตอนนี้
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-700">ตัวชี้วัดหลัก ({TREND_DAYS} วันล่าสุด)</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiTile
            label="ผู้ใช้ทั้งหมด"
            value={totalUsers ?? 0}
            delta={`+${(newUserRows ?? []).length}`}
            values={userTrend}
            color="#4f46e5"
          />
          <KpiTile
            label="ออเดอร์ใหม่"
            value={(newOrderRows ?? []).length}
            values={orderTrend}
            color="#0284c7"
          />
          <KpiTile
            label="ยอดขาย (ปิดการขายแล้ว)"
            value={`฿${gmvLast14d.toLocaleString("th-TH")}`}
            values={gmvTrend}
            color="#16a34a"
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-700">
          ออเดอร์ตามสถานะ ({totalOrders.toLocaleString("th-TH")} รายการทั้งหมด)
        </h2>
        <div className="mt-3 rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
          <div className="flex flex-col gap-2.5">
            {orderStatusCounts.map((s) => {
              const label = ORDER_STATUS_LABEL[s.status];
              const max = Math.max(...orderStatusCounts.map((c) => c.count), 1);
              const widthPct = (s.count / max) * 100;
              return (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="w-40 flex-none text-xs text-neutral-600">{label.label}</span>
                  <div className="h-5 flex-1 rounded-full bg-neutral-100">
                    <div
                      className="h-5 rounded-full transition-[width]"
                      style={{ width: `${widthPct}%`, backgroundColor: STATUS_COLOR[label.status] }}
                    />
                  </div>
                  <span className="w-8 flex-none text-right text-xs font-medium tabular-nums text-neutral-700">
                    {s.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-700">สินค้าและรีวิว</h2>
        <StatGrid>
          <Stat label="สินค้าทั้งหมด" value={totalProducts ?? 0} />
          <Stat label="กำลังลงขาย" value={listedProducts ?? 0} />
          <Stat label="ขายแล้ว" value={soldProducts ?? 0} />
          <Stat label="รีวิวทั้งหมด" value={reviewCount} />
          <Stat label="คะแนนเฉลี่ยระบบ" value={avgRating !== null ? `⭐ ${avgRating.toFixed(1)}` : "—"} />
          <Stat label="ยอดขายรวมทั้งหมด" value={`฿${gmv.toLocaleString("th-TH")}`} />
        </StatGrid>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-700">กิจกรรมล่าสุด</h2>
          <Link href="/admin/logs" className="text-xs text-primary-600 hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
        {recentActivity.entries.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">ยังไม่มีกิจกรรมในระบบ</p>
        ) : (
          <div className="mt-3 divide-y divide-neutral-100 rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0">
            {recentActivity.entries.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <p className="text-neutral-700">
                  <span className="font-medium text-neutral-900">{log.actorName}</span> {log.actionLabel}
                  {log.productTitle && <> — {log.productTitle}</>}
                </p>
                <span className="flex-none whitespace-nowrap text-xs text-neutral-400">
                  {new Date(log.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
