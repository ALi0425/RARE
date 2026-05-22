import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Node } from "@xyflow/react";

export type ModuleNodeData = Node<{ label: string; description?: string; isHighlighted?: boolean }>;
export type PageNodeData = Node<{ label: string; isHighlighted?: boolean }>;
export type FieldNodeData = Node<{ label: string; fieldType?: string; isFloating?: boolean }>;
export type ActionNodeData = Node<{ label: string; actionType?: string; validations?: string[]; isFloating?: boolean }>;

/* ── Unified glass‑morphism base for ALL node types ────────────── */
const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.78)",
  backdropFilter: "blur(20px) saturate(1.3)",
  WebkitBackdropFilter: "blur(20px) saturate(1.3)",
  border: "1px solid rgba(255,255,255,0.7)",
  borderRadius: 12,
  boxShadow: "0 2px 12px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)",
};

const ACCENT = {
  module: "#0071e3",
  page: "#30d158",
  field: "#ff9f0a",
  action: "#ff3b30",
} as const;

/* ── Unified Container (Module / Page) ─────────────────────────── */
// Looks like a pane — accent top bar, children inside, no dashed nonsense.
function UnifiedContainer({
  accent,
  label,
  description,
  isHighlighted,
  children,
}: {
  accent: string;
  label: string;
  description?: string;
  isHighlighted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        ...CARD,
        width: "100%",
        height: "100%",
        minHeight: 36,
        position: "relative",
        overflow: "visible",
        borderTop: `3px solid ${accent}`,
        boxShadow: isHighlighted
          ? `0 0 0 2px ${accent}40, 0 4px 24px ${accent}15`
          : "0 2px 12px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)",
      }}
    >
      {/* Accent label bar at top */}
      <div
        style={{
          height: 24,
          background: `${accent}10`,
          borderBottom: `1px solid ${accent}15`,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          fontSize: 11,
          fontWeight: 600,
          color: accent,
          letterSpacing: 0.2,
          gap: 6,
        }}
      >
        <span style={{ fontSize: 8, opacity: 0.5, lineHeight: 1 }}>◆</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {label}
        </span>
      </div>

      {description && (
        <div
          style={{
            padding: "4px 10px 0",
            fontSize: 9,
            color: `${accent}65`,
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {description}
        </div>
      )}

      {children}
    </div>
  );
}

/* ── Unified Leaf Chip (Field / Action) ────────────────────────── */
// Same glass aesthetic as containers, just compact.
function LeafChip({
  accent,
  prefix,
  label,
  badge,
  isFloating,
  extra,
}: {
  accent: string;
  prefix: string;
  label: string;
  badge?: string;
  isFloating?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div
      style={{
        ...CARD,
        borderLeft: `3px solid ${accent}`,
        padding: "3px 8px",
        display: "flex",
        alignItems: "center",
        gap: 4,
        width: "100%",
        height: "100%",
        minHeight: 26,
        minWidth: 80,
        boxSizing: "border-box",
        background: isFloating ? `${accent}08` : "rgba(255,255,255,0.78)",
        animation: isFloating ? "floatPulse 1.5s ease-in-out infinite" : "none",
      }}
    >
      <span style={{ fontSize: 10, color: accent, fontWeight: 700, flexShrink: 0, lineHeight: 1 }}>
        {prefix}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "#1d1d1f",
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}
      >
        {label}
      </span>
      {badge && (
        <span
          style={{
            fontSize: 8,
            color: "#fff",
            background: accent,
            padding: "1px 5px",
            borderRadius: 3,
            fontWeight: 600,
            lineHeight: "14px",
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      )}
      {extra}
      {isFloating && (
        <span style={{ fontSize: 8, color: accent, fontWeight: 600, flexShrink: 0 }}>● 游离</span>
      )}
    </div>
  );
}

/* ── Module ────────────────────────────────────────────────────── */
export function ModuleNode({ data }: NodeProps<ModuleNodeData>) {
  return (
    <UnifiedContainer accent={ACCENT.module} label={data.label} description={data.description} isHighlighted={data.isHighlighted}>
      <Handle type="target" position={Position.Top} style={{ top: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ bottom: 0 }} />
    </UnifiedContainer>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */
export function PageNode({ data }: NodeProps<PageNodeData>) {
  return (
    <UnifiedContainer accent={ACCENT.page} label={data.label} isHighlighted={data.isHighlighted}>
      <Handle type="target" position={Position.Top} style={{ top: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ bottom: 0 }} />
    </UnifiedContainer>
  );
}

/* ── Field ─────────────────────────────────────────────────────── */
export function FieldNode({ data }: NodeProps<FieldNodeData>) {
  return (
    <LeafChip accent={ACCENT.field} prefix="#" label={data.label} badge={data.fieldType} isFloating={data.isFloating}>
      <Handle type="target" position={Position.Left} style={{ left: -1, width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ right: -1, width: 6, height: 6 }} />
    </LeafChip>
  );
}

/* ── Action ────────────────────────────────────────────────────── */
export function ActionNode({ data }: NodeProps<ActionNodeData>) {
  return (
    <LeafChip
      accent={ACCENT.action}
      prefix="▶"
      label={data.label}
      badge={data.actionType}
      isFloating={data.isFloating}
      extra={
        data.validations && data.validations.length > 0 ? (
          <span style={{ fontSize: 9, color: ACCENT.field, flexShrink: 0, lineHeight: 1 }}>
            🛡️{data.validations.length}
          </span>
        ) : undefined
      }
    >
      <Handle type="target" position={Position.Left} style={{ left: -1, width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ right: -1, width: 6, height: 6 }} />
    </LeafChip>
  );
}
