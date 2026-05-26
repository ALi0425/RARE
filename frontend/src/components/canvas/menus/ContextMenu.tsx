import { useState } from "react";
import { theme } from "../../../theme/tokens";
import { useCanvasStore } from "../../../store/canvasStore";

interface Props {
  x: number;
  y: number;
  nodeId?: string;
  nodeType?: string;
  edgeId?: string;
  onClose: () => void;
  onDelete: (id: string) => void;
  onDeleteEdge?: (id: string) => void;
  onConfirmEdge?: (id: string) => void;
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

const divider: React.CSSProperties = {
  height: 1,
  background: theme.colors.border.subtle,
  margin: "4px 8px",
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
  edgeId,
  onClose,
  onDelete,
  onDeleteEdge,
  onConfirmEdge,
  onCreate,
}: Props) {
  const edges = useCanvasStore((s) => s.edges);
  const [showReason, setShowReason] = useState(false);

  // 如果是连线，查看是否是 AI 推理的
  const edgeData = edgeId ? edges.find((e) => e.id === edgeId) : null;
  const isAiInferred = edgeData?.data?.aiInferred === true;
  const aiReason = edgeData?.data?.reason as string | undefined;

  if (showReason) {
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
            left: Math.min(x, window.innerWidth - 320),
            top: Math.min(y, window.innerHeight - 200),
            zIndex: 999,
            padding: 6,
            minWidth: 300,
            maxWidth: 400,
            borderRadius: theme.radius.md,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span
            style={{
              padding: "4px 14px",
              fontSize: 11,
              color: theme.colors.text.tertiary,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            AI 推理依据
          </span>
          <div
            style={{
              padding: "10px 14px",
              fontSize: 12,
              color: theme.colors.text.secondary,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            {aiReason || "（无推理依据）"}
          </div>
          <button
            style={menuBtn}
            onClick={onClose}
            onMouseOver={(e) => (e.currentTarget.style.background = theme.colors.bg.hover)}
            onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
          >
            关闭
          </button>
        </div>
      </>
    );
  }

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
          minWidth: 180,
          borderRadius: theme.radius.md,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {edgeId ? (
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
              连线操作
            </span>
            {isAiInferred && (
              <>
                <button
                  style={{ ...menuBtn, color: theme.colors.accent.page }}
                  onClick={() => {
                    onConfirmEdge?.(edgeId);
                    onClose();
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = theme.colors.bg.hover)}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  ✓ 确认此连线（变实线）
                </button>
                {aiReason && (
                  <button
                    style={menuBtn}
                    onClick={() => setShowReason(true)}
                    onMouseOver={(e) => (e.currentTarget.style.background = theme.colors.bg.hover)}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    ℹ 查看推理依据
                  </button>
                )}
                <div style={divider} />
              </>
            )}
            <button
              style={{ ...menuBtn, color: theme.colors.accent.red }}
              onClick={() => {
                onDeleteEdge?.(edgeId);
                onClose();
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = theme.colors.bg.hover)}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              删除此连线
            </button>
          </>
        ) : nodeId ? (
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
