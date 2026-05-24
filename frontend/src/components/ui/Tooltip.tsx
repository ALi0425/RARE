import { useState, type ReactNode } from "react";
import { theme } from "../../theme/tokens";

interface Props {
  content: string;
  children: ReactNode;
}

export default function Tooltip({ content, children }: Props) {
  const [show, setShow] = useState(false);

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: theme.colors.bg.elevated,
            color: theme.colors.text.primary,
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: theme.radius.sm,
            whiteSpace: "nowrap",
            border: `1px solid ${theme.colors.border.primary}`,
            boxShadow: theme.shadow.md,
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
