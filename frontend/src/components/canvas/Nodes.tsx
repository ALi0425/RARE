import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Node } from "@xyflow/react";

export type ModuleNodeData = Node<{ label: string; description?: string; isHighlighted?: boolean }>;
export type PageNodeData = Node<{ label: string; isHighlighted?: boolean }>;
export type FieldNodeData = Node<{ label: string; fieldType?: string; isFloating?: boolean }>;
export type ActionNodeData = Node<{ label: string; actionType?: string; validations?: string[]; isFloating?: boolean }>;

/* ── Accent palette ───────────────────────────────────────────── */
const ACCENT = {
  module: "#0071e3",
  page: "#30d158",
  field: "#ff9f0a",
  action: "#ff3b30",
} as const;

const TYPE_LABEL = {
  module: "模块",
  page: "页面",
  field: "字段",
  action: "操作",
} as const;

/* ── Unified node box for ALL types: Module / Page / Field / Action ──
 *   Every node is a thin‑bordered glass box with a colored edge.
 *   Containers (module/page) are bigger and enclose children.
 *   Leaf nodes (field/action) are compact inline boxes inside pages.
 *   ALL share the same visual language — only the accent colour differs.
 */
interface NodeBoxProps {
  accent: string;
  typeLabel: string;
  label: string;
  description?: string;
  isHighlighted?: boolean;
  isFloating?: boolean;
  children?: React.ReactNode;
}

function NodeBox({ accent, typeLabel, label, description, isHighlighted, isFloating, children }: NodeBoxProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 26,
        position: "relative",
        overflow: "visible",
        background: isFloating
          ? `linear-gradient(135deg, ${accent}08, ${accent}04)`
          : "rgba(255,255,255,0.72)",
        backdropFilter: "blur(24px) saturate(1.3)",
        WebkitBackdropFilter: "blur(24px) saturate(1.3)",
        border: `1.5px solid ${accent}40`,
        borderRadius: 10,
        boxShadow: isHighlighted
          ? `inset 0 0 0 2px ${accent}50, 0 0 24px ${accent}20`
          : isFloating
            ? `0 0 0 2px ${accent}50, 0 0 16px ${accent}30`
            : "0 2px 8px rgba(0,0,0,0.04)",
        transition: "box-shadow 0.15s ease",
      }}
    >
      {/* Title chip embedded in the top‑left corner */}
      <div
        style={{
          position: "absolute",
          top: -1,
          left: -1,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: `${accent}12`,
          color: accent,
          fontSize: 10,
          fontWeight: 600,
          padding: "1px 8px 1px 6px",
          borderRadius: "10px 0 10px 0",
          letterSpacing: 0.2,
          maxWidth: "calc(100% - 4px)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 7, opacity: 0.5 }}>◆</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{label}</span>
      </div>

      {description && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 8,
            fontSize: 9,
            color: `${accent}60`,
            lineHeight: 1.3,
            maxWidth: "calc(100% - 16px)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {description}
        </div>
      )}

      {/* Floating indicator pulse ring */}
      {isFloating && (
        <div
          style={{
            position: "absolute",
            inset: -1,
            borderRadius: 11,
            border: `1.5px solid ${accent}`,
            opacity: 0.4,
            pointerEvents: "none",
            animation: "floatPulse 1.5s ease-in-out infinite",
          }}
        />
      )}

      {children}
    </div>
  );
}

/* ── Shared small handle style ────────────────────────────────── */
const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  border: "2px solid #fff",
};

/* ── Module ────────────────────────────────────────────────────── */
export function ModuleNode({ data }: NodeProps<ModuleNodeData>) {
  return (
    <NodeBox accent={ACCENT.module} typeLabel={TYPE_LABEL.module} label={data.label} description={data.description} isHighlighted={data.isHighlighted}>
      <Handle type="target" position={Position.Top} id="top-t" style={{ ...handleStyle, background: ACCENT.module, top: -4 }} />
      <Handle type="source" position={Position.Bottom} id="bottom-s" style={{ ...handleStyle, background: ACCENT.module, bottom: -4 }} />
      <Handle type="target" position={Position.Left} id="left-t" style={{ ...handleStyle, background: ACCENT.module, left: -4 }} />
      <Handle type="source" position={Position.Right} id="right-s" style={{ ...handleStyle, background: ACCENT.module, right: -4 }} />
    </NodeBox>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */
export function PageNode({ data }: NodeProps<PageNodeData>) {
  return (
    <NodeBox accent={ACCENT.page} typeLabel={TYPE_LABEL.page} label={data.label} isHighlighted={data.isHighlighted}>
      <Handle type="target" position={Position.Top} id="top-t" style={{ ...handleStyle, background: ACCENT.page, top: -4 }} />
      <Handle type="source" position={Position.Bottom} id="bottom-s" style={{ ...handleStyle, background: ACCENT.page, bottom: -4 }} />
      <Handle type="target" position={Position.Left} id="left-t" style={{ ...handleStyle, background: ACCENT.page, left: -4 }} />
      <Handle type="source" position={Position.Right} id="right-s" style={{ ...handleStyle, background: ACCENT.page, right: -4 }} />
    </NodeBox>
  );
}

/* ── Field ─────────────────────────────────────────────────────── */
export function FieldNode({ data }: NodeProps<FieldNodeData>) {
  return (
    <NodeBox accent={ACCENT.field} typeLabel={TYPE_LABEL.field} label={data.label} isFloating={data.isFloating}>
      {data.fieldType && (
        <div
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 8,
            color: "#fff",
            background: ACCENT.field,
            padding: "0 5px",
            borderRadius: 3,
            lineHeight: "16px",
            fontWeight: 600,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {data.fieldType}
        </div>
      )}
      <Handle type="target" position={Position.Top} id="top-t" style={{ ...handleStyle, background: ACCENT.field, top: -4 }} />
      <Handle type="source" position={Position.Bottom} id="bottom-s" style={{ ...handleStyle, background: ACCENT.field, bottom: -4 }} />
      <Handle type="target" position={Position.Left} id="left-t" style={{ ...handleStyle, background: ACCENT.field, left: -4 }} />
      <Handle type="source" position={Position.Right} id="right-s" style={{ ...handleStyle, background: ACCENT.field, right: -4 }} />
    </NodeBox>
  );
}

/* ── Action ────────────────────────────────────────────────────── */
export function ActionNode({ data }: NodeProps<ActionNodeData>) {
  return (
    <NodeBox accent={ACCENT.action} typeLabel={TYPE_LABEL.action} label={data.label} isFloating={data.isFloating}>
      {data.actionType && (
        <div
          style={{
            position: "absolute",
            right: data.validations?.length ? 20 : 4,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 8,
            color: "#fff",
            background: data.actionType === "navigation" ? ACCENT.module : data.actionType === "validation" ? ACCENT.field : "#86868b",
            padding: "0 5px",
            borderRadius: 3,
            lineHeight: "16px",
            fontWeight: 600,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {data.actionType}
        </div>
      )}

      {data.validations && data.validations.length > 0 && (
        <div
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
            fontSize: 10,
            color: ACCENT.field,
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          🛡️{data.validations.length}
        </div>
      )}

      <Handle type="target" position={Position.Top} id="top-t" style={{ ...handleStyle, background: ACCENT.action, top: -4 }} />
      <Handle type="source" position={Position.Bottom} id="bottom-s" style={{ ...handleStyle, background: ACCENT.action, bottom: -4 }} />
      <Handle type="target" position={Position.Left} id="left-t" style={{ ...handleStyle, background: ACCENT.action, left: -4 }} />
      <Handle type="source" position={Position.Right} id="right-s" style={{ ...handleStyle, background: ACCENT.action, right: -4 }} />
    </NodeBox>
  );
}
