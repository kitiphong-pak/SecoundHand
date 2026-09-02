import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ORDER_STATUS_LABEL } from "@/lib/orderStatus";
import { BUYER_CONFIRM_WINDOW_MS } from "@/lib/orderTiming";
import { DonutChart } from "@/components/ui/DonutChart";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { BarChart } from "@/components/ui/BarChart";
import { AreaChart } from "@/components/ui/AreaChart";
import { Badge } from "@/components/ui/Badge";
import {
  ShoppingBagIcon,
  CheckShieldIcon,
  DisputeIcon,
  UsersIcon,
  CoinsIcon,
  StarRatingIcon,
} from "@/components/ui/AdminIcons";
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

// สร้างป้าย วว/ดด ของ TREND_DAYS วันล่าสุด เรียงเก่า→ใหม่ ให้ตรงลำดับ index เดียวกับที่
// bucketDaily() ใน src/lib/sparkline.ts ใช้ (index 0 = เก่าสุด, ตัวสุดท้าย = วันนี้)
function dayLabels(days: number): string[] {
  const labels: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    labels.push(d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" }));
  }
  return labels;
}

function KpiCard({
  label,
  value,
  Icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  Icon: (props: { className?: string }) => React.ReactElement;
  tone?: "primary" | "success" | "error" | "info";
}) {
  const toneClasses: Record<string, string> = {
    primary: "bg-primary-50 text-primary-600",
    success: "bg-success-50 text-success-500",
    error: "bg-error-50 text-error-500",
    info: "bg-info-50 text-info-500",
  };
  return (
    <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">{label}</p>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${toneClasses[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 font-[var(--font-display)] text-2xl font-semibold tabular-nums text-neutral-900">
        {typeof value === "number" ? value.toLocaleString("th-TH") : value}
      </p>
    </div>
  );
}

function ChartCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function AlertBanner({ tone, title, description, href }: { tone: "critical" | "warning"; title: string; description: string; href?: string }) {
  const toneClasses = tone === "critical" ? "border-error-500/30 bg-error-50" : "border-warning-500/30 bg-warning-50";
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
interface RecentOrderRow {
  id: string;
  buyer_id: string;
  status: OrderStatus;
  amount: number;
  created_at: string;
  product_id: string;
}

export default async function AdminDashboardPage() {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const buyerConfirmCutoff = new Date(nowDate.getTime() - BUYER_CONFIRM_WINDOW_MS).toISOString();

  const [
    { count: totalUsers },
    { count: verifiedUsers },
    { count: suspendedUsers },
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
    { data: recentOrderRows },
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("is_verified", true),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("is_suspended", true),
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
    supabase
      .from("orders")
      .select("id, buyer_id, status, amount, created_at, product_id")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  // admin_order_status_counts() คืนมาแค่สถานะที่มีออเดอร์อยู่จริงอย่างน้อย 1 รายการ ต้องเติม 0
  // ให้สถานะที่เหลือเองเพื่อให้คำนวณ "ปิดการขายสำเร็จ" ครบทุกสถานะเสมอ
  const countByStatus = new Map((orderStatusRows ?? []).map((r) => [r.status, Number(r.cnt)]));
  const orderStatusCounts = ORDER_STATUSES.map((status) => ({
    status,
    count: countByStatus.get(status) ?? 0,
  }));
  const totalOrders = orderStatusCounts.reduce((sum, s) => sum + s.count, 0);
  const completedOrders = countByStatus.get("completed") ?? 0;

  const gmv = Number(gmvTotalRow ?? 0);
  const reviewStats = reviewStatsRows?.[0];
  const avgRating = reviewStats?.avg_rating != null ? Number(reviewStats.avg_rating) : null;

  const labels = dayLabels(TREND_DAYS);
  const gmvByDay = new Map((gmvDailyRows ?? []).map((r) => [r.day, Number(r.total)]));
  const salesData = labels.map((label, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (TREND_DAYS - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return { label, value: gmvByDay.get(key) ?? 0 };
  });

  const newUsersByDay = new Map<string, number>();
  for (const row of newUserRows ?? []) {
    const key = row.created_at.slice(0, 10);
    newUsersByDay.set(key, (newUsersByDay.get(key) ?? 0) + 1);
  }
  const userActivityData = labels.map((label, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (TREND_DAYS - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return { label, value: newUsersByDay.get(key) ?? 0 };
  });

  const hasUrgent = (disputedCount ?? 0) > 0 || (overdueOtpCount ?? 0) > 0 || (overdueBuyerConfirmCount ?? 0) > 0;

  // เตรียมข้อมูลตาราง "ออเดอร์ล่าสุด" — ต้อง resolve ชื่อผู้ซื้อ + ชื่อสินค้าจาก id แยกต่างหาก
  const recentOrders = (recentOrderRows ?? []) as RecentOrderRow[];
  const buyerIds = [...new Set(recentOrders.map((o) => o.buyer_id))];
  const productIds = [...new Set(recentOrders.map((o) => o.product_id))];
  const [{ data: buyerRows }, { data: productRows }] = await Promise.all([
    buyerIds.length > 0
      ? supabase.from("users").select("id, name, province").in("id", buyerIds)
      : Promise.resolve({ data: [] as { id: string; name: string; province: string }[] }),
    productIds.length > 0
      ? supabase.from("products").select("id, title").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const buyerById = new Map((buyerRows ?? []).map((u) => [u.id, u]));
  const productTitleById = new Map((productRows ?? []).map((p) => [p.id, p.title]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-[var(--font-display)] text-xl font-semibold text-neutral-900">
        ภาพรวมระบบ
      </h1>

      <section className="flex flex-col gap-2">
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
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="ผู้ใช้ใหม่ (14 วัน)" value={(newUserRows ?? []).length} Icon={UsersIcon} tone="primary" />
        <KpiCard label="ออเดอร์ใหม่ (14 วัน)" value={(newOrderRows ?? []).length} Icon={ShoppingBagIcon} tone="info" />
        <KpiCard label="ยืนยันตัวตนแล้ว" value={verifiedUsers ?? 0} Icon={CheckShieldIcon} tone="success" />
        <KpiCard label="ข้อพิพาทค้าง" value={disputedCount ?? 0} Icon={DisputeIcon} tone="error" />
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="ผู้ใช้ตามสถานะ">
          <DonutChart
            segments={[
              { label: "ยืนยันตัวตนแล้ว", value: verifiedUsers ?? 0, color: "var(--color-success-500)" },
              { label: "ถูกระงับ", value: suspendedUsers ?? 0, color: "var(--color-error-500)" },
              {
                label: "ยังไม่ยืนยัน",
                value: Math.max((totalUsers ?? 0) - (verifiedUsers ?? 0) - (suspendedUsers ?? 0), 0),
                color: "var(--color-neutral-300)",
              },
            ]}
          />
        </ChartCard>
        <ChartCard title="สินค้าตามสถานะ">
          <DonutChart
            segments={[
              { label: "กำลังขาย", value: listedProducts ?? 0, color: "var(--color-primary-500)" },
              { label: "ขายแล้ว", value: soldProducts ?? 0, color: "var(--color-success-500)" },
              {
                label: "อื่นๆ",
                value: Math.max((totalProducts ?? 0) - (listedProducts ?? 0) - (soldProducts ?? 0), 0),
                color: "var(--color-neutral-300)",
              },
            ]}
          />
        </ChartCard>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <KpiCard label="ยอดขายรวมทั้งหมด" value={`฿${gmv.toLocaleString("th-TH")}`} Icon={CoinsIcon} tone="success" />
        <KpiCard
          label="คะแนนรีวิวเฉลี่ย"
          value={avgRating !== null ? avgRating.toFixed(1) : "—"}
          Icon={StarRatingIcon}
          tone="primary"
        />
      </section>

      <ChartCard title="ยอดขายรายวัน" action={<span className="text-xs text-neutral-400">{TREND_DAYS} วันล่าสุด</span>}>
        <BarChart data={salesData} color="var(--color-primary-500)" />
      </ChartCard>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
          <ProgressRing
            percent={totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0}
            color="var(--color-success-500)"
          />
          <div>
            <p className="text-sm font-medium text-neutral-700">ปิดการขายสำเร็จ</p>
            <p className="mt-1 text-xs text-neutral-500">
              {completedOrders.toLocaleString("th-TH")} จาก {totalOrders.toLocaleString("th-TH")} ออเดอร์
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0 p-4">
          <ProgressRing
            percent={(totalUsers ?? 0) > 0 ? ((verifiedUsers ?? 0) / (totalUsers ?? 1)) * 100 : 0}
            color="var(--color-info-500)"
          />
          <div>
            <p className="text-sm font-medium text-neutral-700">ผู้ใช้ยืนยันตัวตนแล้ว</p>
            <p className="mt-1 text-xs text-neutral-500">
              {(verifiedUsers ?? 0).toLocaleString("th-TH")} จาก {(totalUsers ?? 0).toLocaleString("th-TH")} คน
            </p>
          </div>
        </div>
      </section>

      <ChartCard title="ผู้ใช้ใหม่รายวัน" action={<span className="text-xs text-neutral-400">{TREND_DAYS} วันล่าสุด</span>}>
        <AreaChart data={userActivityData} color="var(--color-primary-500)" />
      </ChartCard>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-700">ออเดอร์ล่าสุด</h2>
          <Link href="/admin/logs" className="text-xs text-primary-600 hover:underline">
            ดูกิจกรรมทั้งหมด →
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">ยังไม่มีออเดอร์ในระบบ</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[var(--radius-lg)] border border-neutral-200 bg-neutral-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">ผู้ซื้อ</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">สินค้า</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">จังหวัด</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">วันที่</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">สถานะ</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">ยอด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {recentOrders.map((order) => {
                  const buyer = buyerById.get(order.buyer_id);
                  const badge = ORDER_STATUS_LABEL[order.status];
                  const initial = buyer?.name?.trim().charAt(0).toUpperCase() ?? "?";
                  return (
                    <tr key={order.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 align-middle">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700">
                            {initial}
                          </span>
                          <span className="font-medium text-neutral-900">{buyer?.name ?? "ไม่พบ"}</span>
                        </div>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 align-middle text-neutral-500">
                        {productTitleById.get(order.product_id) ?? "สินค้าไม่พบ"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 align-middle text-neutral-500">
                        {buyer?.province ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 align-middle text-xs text-neutral-400">
                        {new Date(order.created_at).toLocaleDateString("th-TH")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 align-middle">
                        {badge && <Badge status={badge.status}>{badge.label}</Badge>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right align-middle font-medium tabular-nums text-neutral-900">
                        ฿{order.amount.toLocaleString("th-TH")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
