import { useCanvasStore } from "../../store/canvasStore";
import { useInferenceStore } from "../../store/inferenceStore";
import { theme } from "../../theme/tokens";
import Button from "../ui/Button";

interface Props {
  projectId: string;
}

export default function DecisionPanel({ projectId }: Props) {
  const visible = useInferenceStore((s) => s.decisionPanelVisible);
  const isProcessing = useInferenceStore((s) => s.isProcessing);
  const confirmSave = useInferenceStore((s) => s.confirmSave);
  const revertChanges = useInferenceStore((s) => s.revertChanges);
  const clearDiff = useCanvasStore((s) => s.clearDiff);

  if (!visible) return null;

  const handleRevert = () => {
    clearDiff();
    revertChanges();
  };

  return (
    <div
      className="glass"
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 100,
        padding: 16,
        borderRadius: theme.radius.md,
        minWidth: 220,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: theme.shadow.lg,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: theme.colors.text.primary,
        }}
      >
        推演结果
      </span>
      <span
        style={{
          fontSize: 12,
          color: theme.colors.text.secondary,
        }}
      >
        检查画布上的变更，确认或撤销。
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          variant="danger"
          size="sm"
          onClick={handleRevert}
          disabled={isProcessing}
        >
          ❌ 撤销
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => confirmSave(projectId)}
          disabled={isProcessing}
        >
          {isProcessing ? "保存中..." : "✅ 确认保存"}
        </Button>
      </div>
    </div>
  );
}
