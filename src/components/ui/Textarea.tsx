import { type TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const areaId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={areaId} className="text-xs font-medium text-neutral-700">
          {label}
        </label>
        <textarea
          ref={ref}
          id={areaId}
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
Textarea.displayName = "Textarea";
