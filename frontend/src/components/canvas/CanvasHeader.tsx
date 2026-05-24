import { theme } from "../../theme/tokens";
import Button from "../ui/Button";

interface Props {
  projectName: string;
  nodeCount: number;
  edgeCount: number;
  onBack: () => void;
  onFileSelect?: () => void;
  parsing?: boolean;
  error?: string;
}

export default function CanvasHeader({
  projectName,
  nodeCount,
  edgeCount,
  onBack,
  onFileSelect,
  parsing,
  error,
}: Props) {
  return (
    <div
      style={{
        padding: "10px 20px",
        background: theme.colors.bg.surface,
        borderBottom: `1px solid ${theme.colors.border.subtle}`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 10,
      }}
    >
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← 返回大厅
      </Button>

      <span
        style={{
          color: theme.colors.text.tertiary,
          fontSize: 18,
          fontWeight: 200,
        }}
      >
        |
      </span>

      <span
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: theme.colors.text.primary,
        }}
      >
        {projectName || "加载中..."}
      </span>

      <span
        style={{
          color: theme.colors.text.tertiary,
          fontSize: 12,
          marginLeft: 4,
        }}
      >
        {nodeCount} 节点 · {edgeCount} 连线
      </span>

      <span
        style={{
          color: theme.colors.text.tertiary,
          fontSize: 11,
          background: theme.colors.bg.elevated,
          padding: "4px 10px",
          borderRadius: theme.radius.sm,
          marginLeft: "auto",
        }}
      >
        Space + 拖拽脱出 · 拖到容器自动注入
      </span>

      {error && (
        <span
          style={{
            color: theme.colors.accent.red,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          ⚠ {error}
        </span>
      )}

      {parsing && (
        <span
          style={{
            color: theme.colors.accent.module,
            fontSize: 13,
          }}
        >
          解析中...
        </span>
      )}
    </div>
  );
}
