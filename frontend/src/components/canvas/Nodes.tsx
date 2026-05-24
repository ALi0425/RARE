import { memo, useState, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

let onLabelSaveGlobal: ((nodeId: string, label: string) => void) | null = null;
export function setOnLabelSave(fn: ((nodeId: string, label: string) => void) | null) {
  onLabelSaveGlobal = fn;
}

// ── Editable label ──
function EditableLabel({ value, nodeId, style }: { value: string; nodeId: string; style?: React.CSSProperties }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);
  useEffect(() => { setText(value); }, [value]);

  if (editing) {
    return (
      <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => { setEditing(false); onLabelSaveGlobal?.(nodeId, text); }}
        onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); onLabelSaveGlobal?.(nodeId, text); } }}
        style={{ ...style, border: "none", outline: "1px solid #0071e3", background: "transparent", padding: 0, fontSize: "inherit", fontWeight: "inherit", color: "inherit" }}
      />
    );
  }
  return <span style={style} onDoubleClick={() => setEditing(true)} title="双击编辑">{text}</span>;
}

// ── Apple-style color palette ──
const colors: Record<string, { accent: string; bg: string }> = {
  module: { accent: "#007AFF", bg: "rgba(0,122,255,0.06)" },   // Blue
  page:   { accent: "#34C759", bg: "rgba(52,199,89,0.06)" },   // Green
  field:  { accent: "#FF9F0A", bg: "rgba(255,159,10,0.06)" },  // Orange
  action: { accent: "#FF375F", bg: "rgba(255,55,95,0.06)" },   // Rose
};

const labels: Record<string, string> = {
  module: "模块", page: "页面", field: "字段", action: "操作",
};

// ── Apple-style node ──
function NodeBox({ id, data, type, style: extra }: { id: string; data: any; type: string; style?: React.CSSProperties; children?: React.ReactNode }) {
  const c = colors[type] || colors.field;
  const isContainer = type === "module" || type === "page";

  return (
    <div style={{
      background: c.bg,
      backdropFilter: "blur(30px) saturate(1.5)",
      WebkitBackdropFilter: "blur(30px) saturate(1.5)",
      border: `1px solid ${c.accent}30`,
      borderRadius: isContainer ? 14 : 10,
      padding: isContainer ? "10px 14px" : "5px 10px",
      width: "100%", height: "100%",
      boxSizing: "border-box",
      display: "flex", flexDirection: "column",
      position: "relative", cursor: "grab",
      boxShadow: `0 1px 3px rgba(0,0,0,0.04), 0 0 0 0.5px ${c.accent}15`,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
      ...extra,
    }}>
      {/* Handles on all 4 sides */}
      <Handle type="target" position={Position.Left} style={{ background: c.accent, width: 7, height: 7, border: "2px solid #fff", borderRadius: "50%" }} id="left" />
      <Handle type="source" position={Position.Right} style={{ background: c.accent, width: 7, height: 7, border: "2px solid #fff", borderRadius: "50%" }} id="right" />
      <Handle type="target" position={Position.Top} style={{ background: c.accent, width: 7, height: 7, border: "2px solid #fff", borderRadius: "50%" }} id="top" />
      <Handle type="source" position={Position.Bottom} style={{ background: c.accent, width: 7, height: 7, border: "2px solid #fff", borderRadius: "50%" }} id="bottom" />

      {/* Label chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: isContainer ? 6 : 0 }}>
        <div style={{ background: c.accent, color: "#fff", fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4, lineHeight: "16px", letterSpacing: 0.3 }}>
          {labels[type] || type}
        </div>
      </div>

      <EditableLabel value={data?.label || ""} nodeId={id} style={{ fontSize: 12, fontWeight: 500, color: "#1d1d1f", letterSpacing: -0.1 }} />
    </div>
  );
}

export const ModuleNode = memo(({ id, data }: NodeProps) => <NodeBox id={id} data={data} type="module" />);
export const PageNode = memo(({ id, data }: NodeProps) => <NodeBox id={id} data={data} type="page" />);
export const FieldNode = memo(({ id, data }: NodeProps) => (
  <NodeBox id={id} data={data} type="field">
    {data?.fieldType && <span style={{ fontSize: 9, color: "#86868b", marginTop: 1 }}>{data.fieldType}</span>}
  </NodeBox>
));
export const ActionNode = memo(({ id, data }: NodeProps) => (
  <NodeBox id={id} data={data} type="action">
    {data?.actionType && <span style={{ fontSize: 9, color: "#86868b", marginTop: 1 }}>▶ {data.actionType}</span>}
  </NodeBox>
));
