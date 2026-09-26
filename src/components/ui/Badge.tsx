import type { ReactNode } from "react";

type BadgeStatus = "pending" | "success" | "neutral" | "error" | "info";

const statusClasses: Record<BadgeStatus, string> = {
  pending: "bg-warning-50 text-warning-500",
  success: "bg-success-50 text-success-500",
  neutral: "bg-neutral-100 text-neutral-700",
  error: "bg-error-50 text-error-500",
  info: "bg-info-50 text-info-500",
};

export function Badge({ status, children }: { status: BadgeStatus; children: ReactNode }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        statusClasses[status],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
