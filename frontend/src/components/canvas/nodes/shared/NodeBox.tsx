import { useState, useRef, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import { theme } from "../../../../theme/tokens";
import type { ReactNode } from "react";

// ── Editable label ──

let onLabelSaveGlobal: ((nodeId: string, label: string) => void) | null = null;
export function setOnLabelSave(
  fn: ((nodeId: string, label: string) => void) | null,
) {
  onLabelSaveGlobal = fn;
}

function EditableLabel({
  value,
  nodeId,
}: {
  value: string;
  nodeId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);
  useEffect(() => setText(value), [value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onLabelSaveGlobal?.(nodeId, text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setEditing(false);
            onLabelSaveGlobal?.(nodeId, text);
          }
        }}
        style={{
          border: "none",
          outline: `1px solid ${theme.colors.accent.module}`,
          background: "transparent",
          padding: 0,
          fontSize: 12,
          fontWeight: 500,
          color: theme.colors.text.primary,
          fontFamily: theme.font,
          width: "100%",
          boxSizing: "border-box",
        }}
      />
    );
  }
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: theme.colors.text.primary,
        letterSpacing: -0.1,
        whiteSpace: "nowrap",
      }}
      onDoubleClick={() => setEditing(true)}
      title="双击编辑"
    >
      {text}
    </span>
  );
}

// ── Color palette ──

const nodeMeta: Record<
  string,
  { accent: string; bg: string; label: string }
> = {
  module: {
    accent: theme.colors.accent.module,
    bg: theme.colors.node.module.bg,
    label: "模块",
  },
  page: {
    accent: theme.colors.accent.page,
    bg: theme.colors.node.page.bg,
    label: "页面",
  },
  field: {
    accent: theme.colors.accent.field,
    bg: theme.colors.node.field.bg,
    label: "字段",
  },
  action: {
    accent: theme.colors.accent.action,
    bg: theme.colors.node.action.bg,
    label: "操作",
  },
};

// ── NodeBox ──

interface NodeBoxProps {
  id: string;
  data: any;
  type: string;
  children?: ReactNode;
}

type EvalDisplay = "active" | "parent" | null;

function getEvalDisplay(type: string, evalLevel?: string): EvalDisplay {
  if (!evalLevel) return null;
  if (type === evalLevel) return "active";
  // action is same level as field
  if (type === "action" && evalLevel === "field") return "active";
  // Module is always a parent when not active
  if (type === "module" && evalLevel !== "module") return "parent";
  // Page is a parent only at field level
  if (type === "page" && evalLevel === "field") return "parent";
  return null;
}

export default function NodeBox({ id, data, type, children }: NodeBoxProps) {
  const m = nodeMeta[type] || nodeMeta.field;
  const isContainer = type === "module" || type === "page";
  const diffTooltip = data?.diffTooltip as string | undefined;

  // ── Evaluation mode ──
  const evalZoom = data?.evalZoom as number | undefined;
  const evalLevel = data?.evalLevel as string | undefined;
  const evalDisplay = getEvalDisplay(type, evalLevel);
  const isEval = evalDisplay !== null;

  // Compute font size based on display mode and zoom
  let fontSize: number;
  let fontWeight: number;
  let textColor: string;
  let isCentered = false;
  let showChip = false;
  let paddingX: number;
  let paddingY: number;

  if (isEval && evalDisplay === "active") {
    // Active: card放大名称缩小 (inverse font scaling for constant screen size)
    const z = Math.max(evalZoom || 0.4, 0.1);
    if (type === "module") {
      fontSize = Math.min(48, Math.max(20, Math.round(16 / z)));
    } else if (type === "page") {
      fontSize = Math.min(36, Math.max(14, Math.round(14 / z)));
    } else {
      // field / action
      fontSize = Math.min(24, Math.max(10, Math.round(12 / z)));
    }
    fontWeight = 700;
    textColor = m.accent;
    isCentered = true;
    paddingX = 20;
    paddingY = 20;
  } else if (isEval && evalDisplay === "parent") {
    // Parent: name at top, fixed font size
    fontSize = type === "module" ? 12 : 11;
    fontWeight = 600;
    textColor = theme.colors.text.secondary;
    isCentered = false;
    paddingX = 14;
    paddingY = 10;
  } else {
    // Normal mode
    fontSize = 12;
    fontWeight = 500;
    textColor = theme.colors.text.primary;
    showChip = true;
    paddingX = isContainer ? 16 : 12;
    paddingY = isContainer ? 12 : 6;
  }

  return (
    <div
      style={{
        background: isEval ? theme.colors.bg.surface : m.bg,
        border: isEval
          ? `1px solid ${m.accent}55`
          : isContainer
            ? "none"
            : `1px solid ${m.accent}88`,
        borderRadius: isEval ? theme.radius.md : isContainer ? theme.radius.md : theme.radius.sm,
        padding: `${paddingY}px ${paddingX}px`,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        position: "relative",
        cursor: "grab",
        fontFamily: theme.font,
        color: theme.colors.text.primary,
        boxShadow: isEval
          ? `inset 0 0 0 1px ${m.accent}18`
          : isContainer
            ? "inset 0 0 0 1px rgba(255,255,255,0.03)"
            : undefined,
        display: "flex",
        flexDirection: "column",
        justifyContent: isCentered ? "center" : "flex-start",
        alignItems: isCentered ? "center" : "stretch",
      }}
      title={diffTooltip}
    >
      {/* Handles (non-interactive in eval mode) */}
      <Handle type="target" position={Position.Left} style={{ background: m.accent, width: isEval ? 1 : 7, height: isEval ? 1 : 7, border: "2px solid #1a1a1a", borderRadius: "50%", opacity: isEval ? 0 : 1, pointerEvents: isEval ? "none" : "auto" }} id="left" />
      <Handle type="source" position={Position.Right} style={{ background: m.accent, width: isEval ? 1 : 7, height: isEval ? 1 : 7, border: "2px solid #1a1a1a", borderRadius: "50%", opacity: isEval ? 0 : 1, pointerEvents: isEval ? "none" : "auto" }} id="right" />
      <Handle type="target" position={Position.Top} style={{ background: m.accent, width: isEval ? 1 : 7, height: isEval ? 1 : 7, border: "2px solid #1a1a1a", borderRadius: "50%", opacity: isEval ? 0 : 1, pointerEvents: isEval ? "none" : "auto" }} id="top" />
      <Handle type="source" position={Position.Bottom} style={{ background: m.accent, width: isEval ? 1 : 7, height: isEval ? 1 : 7, border: "2px solid #1a1a1a", borderRadius: "50%", opacity: isEval ? 0 : 1, pointerEvents: isEval ? "none" : "auto" }} id="bottom" />

      {/* ── Active level: big centered name ── */}
      {isEval && evalDisplay === "active" && (
        <span
          style={{
            fontSize,
            fontWeight,
            color: textColor,
            lineHeight: 1.2,
            textAlign: "center",
            wordBreak: "break-word",
          }}
        >
          {data?.label || ""}
        </span>
      )}

      {/* ── Parent level: name at top, single card ── */}
      {isEval && evalDisplay === "parent" && (
        <span
          style={{
            fontSize,
            fontWeight,
            color: textColor,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textAlign: "left",
          }}
        >
          {data?.label || ""}
        </span>
      )}

      {/* ── Normal mode ── */}
      {!isEval && (
        <>
          {/* Label chip + name inline */}
          <div style={{ whiteSpace: "nowrap", marginBottom: isContainer ? 8 : 0 }}>
            <span
              style={{
                display: "inline-block",
                background: m.accent,
                color: theme.colors.text.inverse,
                fontSize: 9,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 4,
                lineHeight: "16px",
                letterSpacing: 0.3,
                opacity: 0.9,
                verticalAlign: "middle",
              }}
            >
              {m.label}
            </span>
            <span
              style={{
                verticalAlign: "middle",
                marginLeft: 6,
                display: "inline",
              }}
            >
              <EditableLabel value={data?.label || ""} nodeId={id} />
            </span>
          </div>
          {isContainer
            ? children
            : children && <div style={{ marginTop: 4 }}>{children}</div>}
        </>
      )}

      {/* Diff tooltip */}
      {diffTooltip && (
        <div
          style={{
            position: "absolute",
            bottom: -28,
            left: "50%",
            transform: "translateX(-50%)",
            background: theme.colors.accent.red,
            color: "#fff",
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: theme.radius.sm,
            whiteSpace: "nowrap",
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
          }}
        >
          {diffTooltip}
        </div>
      )}
    </div>
  );
}
