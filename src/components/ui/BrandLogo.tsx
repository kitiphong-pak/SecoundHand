import Image from "next/image";

// โลโก้แบรนด์สำหรับ navbar — มีสองไฟล์เพราะตัวอักษร "songtor" ในต้นฉบับเป็นสีน้ำเงินเขียวเข้ม
// ซึ่งอ่านแทบไม่ออกบนแถบสีเข้มของโหมดมืด กติกาการสลับไฟล์อยู่ใน globals.css (.logo-theme-*)
//
// alt เว้นว่างทั้งคู่โดยตั้งใจ เพราะชื่อแบรนด์ถูกประกาศผ่าน aria-label ของ <Link> ที่ครอบอยู่
// ถ้าใส่ alt ซ้ำ โปรแกรมอ่านหน้าจอจะอ่านชื่อสองรอบ
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <>
      <Image
        src="/logo-light.png"
        alt=""
        width={397}
        height={120}
        priority
        className={`logo-theme-light w-auto ${className}`}
      />
      <Image
        src="/logo-dark.png"
        alt=""
        width={397}
        height={120}
        priority
        className={`logo-theme-dark w-auto ${className}`}
      />
    </>
  );
}
