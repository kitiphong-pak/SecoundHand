// ไอคอนสำหรับ sidebar โซนแอดมิน — เส้นโปร่ง stroke 1.75px หัว/ข้อต่อมน ตามสเปกดีไซน์ (ห้ามปน
// ไอคอนแบบถมทึบในชุดเดียวกัน) เดิมเป็น path จาก Material Design แบบ filled ตอนนี้วาดใหม่เป็น
// เส้นล้วน, currentColor เพื่อให้สีตามข้อความรอบข้างเสมอ ไม่ต้องกำหนดสีแยก

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function AnalyticsIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20v-7M10 20V6M16 20v-6" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function DisputeIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l9.5 17.5h-19z" />
      <path d="M12 9.5v4.3M12 16.8v.1" />
    </svg>
  );
}

export function UsersIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 19c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" />
      <path d="M16 8.2a2.5 2.5 0 010 4.9" />
      <path d="M15 14.6c2.2.3 4 1.8 4 4.4" />
    </svg>
  );
}

export function ActivityIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 1.9" />
    </svg>
  );
}

export function MessagesIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5L12 13l8.5-6.5" />
    </svg>
  );
}

export function SettingsIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8L6.3 6.3" />
    </svg>
  );
}

export function SignOutIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4" />
      <path d="M15 17l5-5-5-5" />
      <path d="M20 12H9" />
    </svg>
  );
}

export function CheckShieldIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l7 3v5.2c0 4.5-3 8.4-7 9.8-4-1.4-7-5.3-7-9.8V6z" />
      <path d="M9 12.2l2 2 4-4.4" />
    </svg>
  );
}

export function ShoppingBagIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 8h10l1 12H6z" />
      <path d="M9 8V6a3 3 0 016 0v2" />
    </svg>
  );
}

export function CoinsIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <ellipse cx="12" cy="7" rx="6" ry="3" />
      <path d="M6 7v10c0 1.66 2.69 3 6 3s6-1.34 6-3V7" />
      <path d="M6 12c0 1.66 2.69 3 6 3s6-1.34 6-3" />
    </svg>
  );
}

export function StarRatingIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}
