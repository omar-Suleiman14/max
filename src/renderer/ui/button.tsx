import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'consequential' | 'ghost' | 'primary' | 'secondary';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  Readonly<{
    icon?: ReactNode;
    variant?: ButtonVariant;
  }>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className = '', icon, type = 'button', variant = 'secondary', ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={`button button--${variant} ${className}`.trim()}
    >
      {icon && <span className="button__icon">{icon}</span>}
      {children && <span className="button__label">{children}</span>}
    </button>
  );
});
