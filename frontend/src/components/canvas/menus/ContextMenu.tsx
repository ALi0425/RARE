import { theme } from "../../../theme/tokens";

interface Props {
  x: number;
  y: number;
  nodeId?: string;
  nodeType?: string;
  onClose: () => void;
  onDelete: (id: string) => void;
  onCreate: (type: string) => void;
}

const menuBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  color: theme.colors.text.primary,
  padding: "8px 14px",
  borderRadius: theme.radius.sm,
  textAlign: "left",
  width: "100%",
  fontFamily: theme.font,
  transition: `background ${theme.transition}`,
};

const itemTypes = [
  { key: "module", label: "模块", icon: "⊞" },
  { key: "page", label: "页面", icon: "⊟" },
  { key: "field", label: "字段", icon: "⊡" },
  { key: "action", label: "操作", icon: "▶" },
];

export default function ContextMenu({
  x,
  y,
  nodeId,
  onClose,
  onDelete,
  onCreate,
}: Props) {
  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 998 }}
        onClick={onClose}
      />
      <div
        className="glass-menu"
        style={{
          position: "fixed",
          left: x,
          top: y,
          zIndex: 999,
          padding: 6,
          minWidth: 160,
          borderRadius: theme.radius.md,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {nodeId ? (
          <>
            <span
              style={{
                padding: "4px 14px",
                fontSize: 11,
                color: theme.colors.text.tertiary,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              操作
            </span>
            <button
              style={{ ...menuBtn, color: theme.colors.accent.red }}
              onClick={() => {
                onDelete(nodeId!);
                onClose();
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = theme.colors.bg.hover)}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              删除此节点
            </button>
          </>
        ) : (
          <>
            <span
              style={{
                padding: "4px 14px",
                fontSize: 11,
                color: theme.colors.text.tertiary,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              新建
            </span>
            {itemTypes.map((t) => (
              <button
                key={t.key}
                style={menuBtn}
                onClick={() => {
                  onCreate(t.key);
                  onClose();
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = theme.colors.bg.hover)}
                onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ marginRight: 8, opacity: 0.6 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}
