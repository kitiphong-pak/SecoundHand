import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-xs font-medium text-neutral-700">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={[
            "rounded-[var(--radius-md)] border px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition-colors",
            "placeholder:text-neutral-400",
            error
              ? "border-error-500 focus:border-error-500"
              : "border-neutral-300 focus:border-primary-500",
            className,
          ].join(" ")}
          {...props}
        />
        {error && <span className="text-xs text-error-500">{error}</span>}
      </div>
    );
  }
);
Input.displayName = "Input";
