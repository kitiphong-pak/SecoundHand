import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary-500 text-white hover:bg-primary-600 disabled:bg-neutral-200 disabled:text-neutral-400",
  secondary: "bg-white text-primary-600 border border-neutral-200 hover:bg-neutral-50 disabled:text-neutral-400 disabled:border-neutral-100",
  ghost: "bg-transparent text-primary-600 hover:bg-primary-50 disabled:text-neutral-400",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-3 text-base",
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
