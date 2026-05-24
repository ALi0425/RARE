import { useCallback, useRef } from "react";
import { theme } from "../../theme/tokens";
import { useInferenceStore } from "../../store/inferenceStore";
import Button from "../ui/Button";

interface Props {
  projectId: string;
}

export default function SmartInputBar({ projectId }: Props) {
  const inputText = useInferenceStore((s) => s.inputText);
  const setInputText = useInferenceStore((s) => s.setInputText);
  const isProcessing = useInferenceStore((s) => s.isProcessing);
  const phase = useInferenceStore((s) => s.phase);
  const submitRefine = useInferenceStore((s) => s.submitRefine);
  const submitEvaluate = useInferenceStore((s) => s.submitEvaluate);
  const refinedText = useInferenceStore((s) => s.refinedText);
  const entities = useInferenceStore((s) => s.entities);
  const decisionPanelVisible = useInferenceStore((s) => s.decisionPanelVisible);
  const inputRef = useRef<HTMLInputElement>(null);

  const isIdle = phase === "idle";
  const isReviewing = phase === "reviewing";

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && inputText.trim()) {
        submitRefine(projectId, inputText);
      }
    },
    [inputText, projectId, submitRefine],
  );

  if (decisionPanelVisible) return null;

  return (
    <div
      style={{
        padding: "12px 20px",
        background: theme.colors.bg.surface,
        borderTop: `1px solid ${theme.colors.border.subtle}`,
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: theme.colors.bg.elevated,
          border: `1px solid ${theme.colors.border.primary}`,
          borderRadius: 24,
          padding: "0 18px",
          transition: `border-color ${theme.transition}`,
        }}
      >
        <input
          ref={inputRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isReviewing ? "已精炼，点击评估影响 →" : "输入新需求... Enter 提交精炼"}
          disabled={isProcessing || isReviewing}
          style={{
            flex: 1,
            padding: "10px 0",
            border: "none",
            background: "transparent",
            fontSize: 14,
            color: theme.colors.text.primary,
            outline: "none",
            fontFamily: theme.font,
          }}
        />
        {isReviewing && entities.length > 0 && (
          <span
            style={{
              fontSize: 11,
              color: theme.colors.text.tertiary,
              whiteSpace: "nowrap",
            }}
          >
            {entities.filter((e) => e.isNew).length} 新增 ·{" "}
            {entities.filter((e) => !e.isNew).length} 匹配
          </span>
        )}
      </div>

      {isReviewing ? (
        <Button
          variant="primary"
          size="md"
          onClick={() => submitEvaluate(projectId)}
          disabled={isProcessing}
        >
          ✨ 评估影响
        </Button>
      ) : (
        <Button
          variant="primary"
          size="md"
          onClick={() => submitRefine(projectId, inputText)}
          disabled={isProcessing || !inputText.trim()}
        >
          {isProcessing ? "精炼中..." : "精炼 →"}
        </Button>
      )}
    </div>
  );
}
