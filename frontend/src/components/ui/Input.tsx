import { forwardRef, type InputHTMLAttributes } from "react";
import { theme } from "../../theme/tokens";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, style, ...rest }, ref) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: theme.colors.text.secondary,
          }}
        >
          {label}
        </span>
      )}
      <input
        ref={ref}
        style={{
          padding: "10px 14px",
          background: theme.colors.bg.surface,
          border: `1px solid ${theme.colors.border.primary}`,
          borderRadius: theme.radius.sm,
          fontSize: 14,
          color: theme.colors.text.primary,
          outline: "none",
          fontFamily: theme.font,
          transition: `border-color ${theme.transition}`,
          ...style,
        }}
        {...rest}
      />
    </div>
  )
);

Input.displayName = "Input";
export default Input;
