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

export default function NodeBox({ id, data, type, children }: NodeBoxProps) {
  const m = nodeMeta[type] || nodeMeta.field;
  const isContainer = type === "module" || type === "page";
  const isDiffGreen = data?.diffTooltip === undefined && false; // set by style override
  const diffTooltip = data?.diffTooltip as string | undefined;

  return (
    <div>
      <div
        style={{
          background: isContainer ? theme.colors.bg.elevated : m.bg,
          border: `1px solid ${m.accent}40`,
          borderRadius: isContainer ? theme.radius.md : theme.radius.sm,
          padding: isContainer ? "12px 16px" : "6px 12px",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          cursor: "grab",
          fontFamily: theme.font,
          color: theme.colors.text.primary,
        }}
        title={diffTooltip}
      >
        {/* Handles */}
        <Handle
          type="target"
          position={Position.Left}
          style={{
            background: m.accent,
            width: 7,
            height: 7,
            border: "2px solid #1a1a1a",
            borderRadius: "50%",
          }}
          id="left"
        />
        <Handle
          type="source"
          position={Position.Right}
          style={{
            background: m.accent,
            width: 7,
            height: 7,
            border: "2px solid #1a1a1a",
            borderRadius: "50%",
          }}
          id="right"
        />
        <Handle
          type="target"
          position={Position.Top}
          style={{
            background: m.accent,
            width: 7,
            height: 7,
            border: "2px solid #1a1a1a",
            borderRadius: "50%",
          }}
          id="top"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            background: m.accent,
            width: 7,
            height: 7,
            border: "2px solid #1a1a1a",
            borderRadius: "50%",
          }}
          id="bottom"
        />

        {/* Label chip + name inline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: isContainer ? 8 : 0,
            minWidth: 0,
            flexWrap: "nowrap",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              background: m.accent,
              color: theme.colors.text.inverse,
              fontSize: 9,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 4,
              lineHeight: "16px",
              letterSpacing: 0.3,
              opacity: 0.9,
            }}
          >
            {m.label}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <EditableLabel value={data?.label || ""} nodeId={id} />
          </div>
        </div>
        {children}
      </div>
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
