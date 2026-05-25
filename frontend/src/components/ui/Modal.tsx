import { type ReactNode, useEffect } from "react";
import { theme } from "../../theme/tokens";

interface Props {
  open?: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: number;
}

export default function Modal({
  open = true,
  onClose,
  title,
  children,
  width = 320,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: theme.colors.bg.overlay,
          zIndex: 999,
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />
      <div
        className="glass"
        style={{
          position: "fixed",
          top: "40%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 1000,
          borderRadius: theme.radius.md,
          padding: 24,
          minWidth: width,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: theme.shadow.lg,
        }}
      >
        {title && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: theme.colors.text.primary,
            }}
          >
            {title}
          </span>
        )}
        {children}
      </div>
    </>
  );
}
