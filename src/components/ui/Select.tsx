import { type SelectHTMLAttributes, forwardRef } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = "", id, children, ...props }, ref) => {
    const selectId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-xs font-medium text-neutral-700">
          {label}
        </label>
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={[
              "w-full appearance-none rounded-[var(--radius-md)] border bg-neutral-0 px-3.5 py-2.5 pr-9 text-sm text-neutral-900 outline-none transition-colors",
              error
                ? "border-error-500 focus:border-error-500"
                : "border-neutral-300 focus:border-primary-500",
              className,
            ].join(" ")}
            {...props}
          >
            {children}
          </select>
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500">
            ⌄
          </span>
        </div>
        {error && <span className="text-xs text-error-500">{error}</span>}
      </div>
    );
  }
);
Select.displayName = "Select";
