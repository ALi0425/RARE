import { useInferenceStore, type EntityTagData } from "../../store/inferenceStore";
import { theme } from "../../theme/tokens";
import EntityTag from "./EntityTag";
import EntityEditor from "./EntityEditor";
import { useState } from "react";

export default function InferenceOutput() {
  const phase = useInferenceStore((s) => s.phase);
  const refinedText = useInferenceStore((s) => s.refinedText);
  const entities = useInferenceStore((s) => s.entities);
  const isProcessing = useInferenceStore((s) => s.isProcessing);
  const error = useInferenceStore((s) => s.error);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  if (phase === "idle" && !error) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 20,
        right: 20,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {/* Error bubble */}
      {error && (
        <div
          className="glass"
          style={{
            padding: "10px 16px",
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.accent.red}40`,
            color: theme.colors.accent.red,
            fontSize: 13,
            pointerEvents: "auto",
            maxWidth: 400,
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div
          className="glass"
          style={{
            padding: "10px 16px",
            borderRadius: theme.radius.md,
            fontSize: 13,
            color: theme.colors.text.secondary,
            pointerEvents: "auto",
            maxWidth: 300,
          }}
        >
          {phase === "refining"
            ? "正在精炼需求..."
            : phase === "evaluating"
              ? "正在评估影响..."
              : "处理中..."}
        </div>
      )}

      {/* Refined output with entity tags */}
      {refinedText && phase === "reviewing" && entities.length > 0 && (
        <div
          className="glass"
          style={{
            padding: "14px 18px",
            borderRadius: theme.radius.md,
            pointerEvents: "auto",
            maxWidth: 600,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: theme.colors.text.tertiary,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            需求精炼结果
          </span>

          <div
            style={{
              fontSize: 13,
              color: theme.colors.text.primary,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {refinedText}
          </div>

          {/* Entity tags */}
          {entities.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                paddingTop: 4,
                borderTop: `1px solid ${theme.colors.border.subtle}`,
              }}
            >
              {entities.map((e, i) => (
                <EntityTag
                  key={`${e.name}-${i}`}
                  entity={e}
                  onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                />
              ))}
            </div>
          )}

          {/* Entity editor */}
          {editingIndex !== null && entities[editingIndex] && (
            <EntityEditor
              entity={entities[editingIndex]}
              index={editingIndex}
              onClose={() => setEditingIndex(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
