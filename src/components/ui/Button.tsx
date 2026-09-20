import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// สีปุ่มหลักใช้ --action-on แทน text-white ตรงๆ เพราะโหมดมืดของสเปกให้ปุ่มพื้นสีอ่อน
// (--action สว่างขึ้นในโหมดมืด) ตัวอักษรจึงต้องเป็นสีเข้ม ไม่ใช่ขาว ไม่งั้นคอนทราสต์ตก
const variantClasses: Record<Variant, string> = {
  primary: "bg-action text-action-on hover:bg-action-hover disabled:bg-neutral-200 disabled:text-neutral-400",
  secondary: "bg-surface-card text-brand-text border border-border hover:bg-surface-sunken disabled:text-neutral-400 disabled:border-neutral-100",
  ghost: "bg-transparent text-brand-text hover:bg-brand-surface disabled:text-neutral-400",
};

// md คือขนาดปุ่มหลักที่ใช้ปิดการซื้อขาย/ยืนยันต่างๆ — บังคับ min-h-11 (44px) ตามเกณฑ์พื้นที่กด
// ขั้นต่ำบนมือถือ ส่วน sm ใช้ในที่แออัด (แถวการ์ด/แถบเครื่องมือ) จึงไม่บังคับขนาดนี้
const sizeClasses: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "min-h-11 px-5 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={[
          "font-medium rounded-[var(--radius-md)] transition-colors disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
