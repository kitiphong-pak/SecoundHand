// ไอคอนเส้นโปร่งตามสเปกดีไซน์ (stroke 1.75px หัว/ข้อต่อมน ห้ามปนไอคอนแบบถมทึบ) แทนของเดิมที่
// เป็น emoji/filled path — ใช้ currentColor เพื่อให้สีตามข้อความรอบข้างเสมอ ไม่ต้องกำหนดสีแยก
export function LocationPinIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 21s7-7.25 7-12a7 7 0 10-14 0c0 4.75 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
