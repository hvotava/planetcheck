import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-accent text-bg hover:bg-accent-deep glow",
  secondary: "bg-surface-2 text-text border border-border hover:border-border-strong",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  danger: "bg-danger text-bg hover:opacity-90",
};

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
