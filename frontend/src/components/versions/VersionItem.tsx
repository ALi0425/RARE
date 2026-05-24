import { theme } from "../../theme/tokens";

interface Props {
  version: number;
  message: string;
  createdAt: string;
  isActive: boolean;
  onClick: () => void;
}

export default function VersionItem({
  version,
  message,
  createdAt,
  isActive,
  onClick,
}: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: theme.radius.sm,
        cursor: "pointer",
        background: isActive ? theme.colors.bg.elevated : "transparent",
        border: `1px solid ${isActive ? theme.colors.border.primary : "transparent"}`,
        transition: `all ${theme.transition}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: theme.colors.accent.module,
            background: `${theme.colors.accent.module}18`,
            padding: "2px 8px",
            borderRadius: 10,
          }}
        >
          v{version}
        </span>
        <span
          style={{
            fontSize: 11,
            color: theme.colors.text.tertiary,
          }}
        >
          {new Date(createdAt).toLocaleDateString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          color: theme.colors.text.secondary,
          lineHeight: 1.4,
        }}
      >
        {message}
      </div>
    </div>
  );
}
