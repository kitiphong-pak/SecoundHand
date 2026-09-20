// ไอคอนสำหรับเมนูนำทางหลัก (ใช้ทั้งแถบมือถือด้านล่างและจุดอื่นในอนาคตถ้าต้องการ) — เส้นโปร่ง
// stroke 1.75px หัว/ข้อต่อมน ตามสเปกดีไซน์ (ห้ามปนไอคอนแบบถมทึบในชุดเดียวกัน), currentColor
// เพื่อให้สีตามข้อความรอบข้างเสมอ ไม่ต้องกำหนดสีแยก

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

export function HomeIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 001 1h3.5v-5.5h3V20H17a1 1 0 001-1v-9" />
    </svg>
  );
}

export function InventoryIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 8.5L12 4l8.5 4.5L12 13z" />
      <path d="M3.5 8.5V17L12 21l8.5-4V8.5" />
      <path d="M12 13v8" />
    </svg>
  );
}

export function ListIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 12.5h8M8 16h5" />
    </svg>
  );
}

export function ChatIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v11a1.5 1.5 0 01-1.5 1.5H8l-4 4V5.5z" />
    </svg>
  );
}
