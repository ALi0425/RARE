import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { theme } from "../../theme/tokens";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  children: ReactNode;
}

const styles: Record<string, React.CSSProperties> = {
  base: {
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: 13,
    borderRadius: theme.radius.sm,
    transition: `all ${theme.transition}`,
    fontFamily: theme.font,
    lineHeight: 1,
  },
};

const variants: Record<string, React.CSSProperties> = {
  primary: {
    background: theme.colors.accent.module,
    color: "#fff",
  },
  secondary: {
    background: theme.colors.bg.elevated,
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border.primary}`,
  },
  ghost: {
    background: "transparent",
    color: theme.colors.text.secondary,
  },
  danger: {
    background: "rgba(248,113,113,0.12)",
    color: theme.colors.accent.red,
  },
};

const sizes: Record<string, React.CSSProperties> = {
  sm: { padding: "6px 14px" },
  md: { padding: "10px 20px" },
};

export default function Button({
  variant = "secondary",
  size = "sm",
  children,
  style,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      style={{
        ...styles.base,
        ...variants[variant],
        ...sizes[size],
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
        ...style,
      }}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
