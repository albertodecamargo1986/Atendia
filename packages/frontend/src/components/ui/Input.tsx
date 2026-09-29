import { type InputHTMLAttributes, forwardRef, useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-[var(--text-primary)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={`w-full px-3 py-2 rounded-lg border text-sm transition-all duration-150 bg-[var(--surface-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:border-transparent ${
            error
              ? 'border-[var(--color-error)]'
              : 'border-[var(--border-color)] hover:border-[var(--border-color-hover)]'
          } ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
        {helperText && !error && (
          <p className="text-xs text-[var(--text-tertiary)]">{helperText}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
