import { memo, useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Node } from "@xyflow/react";

// ── Global callback registry for label save ──
let onLabelSaveGlobal: ((nodeId: string, label: string) => void) | null = null;
export function setOnLabelSave(fn: ((nodeId: string, label: string) => void) | null) {
  onLabelSaveGlobal = fn;
}

// ── Editable label (double-click to edit) ──
function EditableLabel({ value, nodeId, style }: { value: string; nodeId: string; style?: React.CSSProperties }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => { setText(value); }, [value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { setEditing(false); onLabelSaveGlobal?.(nodeId, text); }}
        onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); onLabelSaveGlobal?.(nodeId, text); } }}
        style={{ ...style, border: "none", outline: "1px solid #0071e3", background: "transparent", padding: 0, fontSize: "inherit", fontWeight: "inherit", color: "inherit" }}
      />
    );
  }

  return (
    <span style={style} onDoubleClick={() => setEditing(true)} title="双击编辑名称">
      {text}
    </span>
  );
}

// ── Node visual mapping ──
const typeColors: Record<string, { border: string; bg: string; chip: string }> = {
  module: { border: "#007aff", bg: "rgba(0,122,255,0.04)", chip: "#007aff" },
  page: { border: "#30d158", bg: "rgba(48,209,88,0.04)", chip: "#30d158" },
  field: { border: "#ff9f0a", bg: "rgba(255,159,10,0.04)", chip: "#ff9f0a" },
  action: { border: "#ff375f", bg: "rgba(255,55,95,0.04)", chip: "#ff375f" },
};

const typeLabels: Record<string, string> = {
  module: "模块", page: "页面", field: "字段", action: "操作",
};

// ── Base node wrapper ──
function NodeBox({ id, data, type, children, style: extraStyle }: { id: string; data: any; type: string; children?: React.ReactNode; style?: React.CSSProperties }) {
  const colors = typeColors[type] || typeColors.field;
  return (
    <div
      style={{
        background: colors.bg,
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        border: `1px solid ${colors.border}40`,
        borderRadius: 10,
        padding: type === "module" ? "8px 12px" : "4px 10px",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        cursor: "grab",
        ...extraStyle,
      }}
    >
      {/* Handle on all 4 sides */}
      <Handle type="target" position={Position.Left} style={{ background: colors.border, width: 6, height: 6, border: "2px solid #fff" }} id="left" />
      <Handle type="source" position={Position.Right} style={{ background: colors.border, width: 6, height: 6, border: "2px solid #fff" }} id="right" />
      <Handle type="target" position={Position.Top} style={{ background: colors.border, width: 6, height: 6, border: "2px solid #fff" }} id="top" />
      <Handle type="source" position={Position.Bottom} style={{ background: colors.border, width: 6, height: 6, border: "2px solid #fff" }} id="bottom" />

      {/* Label chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          background: colors.chip, color: "#fff", fontSize: 10, fontWeight: 600,
          padding: "1px 6px", borderRadius: 4, lineHeight: "16px", letterSpacing: 0.3,
        }}>
          ◆ {typeLabels[type] || type}
        </span>
      </div>

      {/* Name */}
      <EditableLabel value={data?.label || ""} nodeId={id} style={{ fontSize: 12, fontWeight: 500, color: "#1d1d1f", marginTop: 2 }} />

      {children}
    </div>
  );
}

// ── Individual node types ──

export const ModuleNode = memo(({ id, data }: NodeProps) => {
  return <NodeBox id={id} data={data} type="module" />;
});

export const PageNode = memo(({ id, data }: NodeProps) => {
  return <NodeBox id={id} data={data} type="page" />;
});

export const FieldNode = memo(({ id, data }: NodeProps) => {
  return (
    <NodeBox id={id} data={data} type="field">
      {data?.fieldType && (
        <span style={{ fontSize: 9, color: "#86868b", marginTop: 1 }}>
          {data.fieldType}
        </span>
      )}
    </NodeBox>
  );
});

export const ActionNode = memo(({ id, data }: NodeProps) => {
  return (
    <NodeBox id={id} data={data} type="action">
      {data?.actionType && (
        <span style={{ fontSize: 9, color: "#86868b", marginTop: 1 }}>
          ▶ {data.actionType}
        </span>
      )}
    </NodeBox>
  );
});
