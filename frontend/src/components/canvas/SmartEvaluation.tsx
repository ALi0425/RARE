import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "../../store/canvasStore";
import { nodeTypes } from "../canvas/nodeTypes";
import { theme } from "../../theme/tokens";
import Spinner from "../ui/Spinner";

interface Props {
  projectId: string;
}

type ZoomLevel = "module" | "page" | "field";

const MODULE_THRESHOLD = 0.6;
const PAGE_THRESHOLD = 1.2;

function getLevel(zoom: number): ZoomLevel {
  if (zoom < MODULE_THRESHOLD) return "module";
  if (zoom < PAGE_THRESHOLD) return "page";
  return "field";
}

function SmartEvaluationInner() {
  const projectName = useCanvasStore((s) => s.projectName);
  const allNodes = useCanvasStore((s) => s.nodes);
  const allEdges = useCanvasStore((s) => s.edges);
  const loading = useCanvasStore((s) => s.loading);
  const confirmedAt = useCanvasStore((s) => s.confirmedAt);
  const confirmedSummary = useCanvasStore((s) => s.confirmedSummary);
  const rf = useReactFlow();

  const [level, setLevel] = useState<ZoomLevel>("module");
  const levelRef = useRef<ZoomLevel>("module");
  const [currentZoom, setCurrentZoom] = useState(0.4);
  const [showSummaryBanner, setShowSummaryBanner] = useState(true);

  // Track zoom
  const onMove = useCallback((_: any, viewport: Viewport) => {
    setCurrentZoom(viewport.zoom);
    const newLevel = getLevel(viewport.zoom);
    if (newLevel !== levelRef.current) {
      levelRef.current = newLevel;
      setLevel(newLevel);
    }
  }, []);

  // Filter + enrich nodes by level
  const displayNodes = useMemo(() => {
    return allNodes
      .filter((n) => {
        if (level === "module") return n.type === "module";
        if (level === "page") return n.type === "module" || n.type === "page";
        return true;
      })
      .map((n) => ({
        ...n,
        data: { ...n.data, evalZoom: currentZoom, evalLevel: level },
      }));
  }, [allNodes, level, currentZoom]);

  // Edges: only show those connecting two visible nodes
  const displayEdges = useMemo(() => {
    const visibleIds = new Set(displayNodes.map((n) => n.id));
    return allEdges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    );
  }, [allEdges, displayNodes]);

  // Initial fitView
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, maxZoom: 1.2 }));
  }, [rf]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: theme.colors.text.secondary, fontSize: 14 }}>
        <Spinner /> 加载中...
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: theme.colors.bg.app }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: theme.colors.bg.surface, borderBottom: `1px solid ${theme.colors.border.subtle}`, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text.primary }}>智能评估</span>
          <span style={{ fontSize: 11, color: theme.colors.text.tertiary, background: theme.colors.bg.elevated, padding: "2px 8px", borderRadius: 8 }}>{projectName}</span>
          <span style={{ fontSize: 11, color: theme.colors.text.tertiary, background: theme.colors.bg.elevated, padding: "2px 8px", borderRadius: 8 }}>节点 {allNodes.length} / 连线 {allEdges.length}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: theme.colors.text.tertiary, marginRight: 4 }}>当前层级:</span>
          {(["module", "page", "field"] as const).map((l) => {
            const label = l === "module" ? "模块" : l === "page" ? "页面" : "字段";
            return (
              <button key={l} onClick={() => { levelRef.current = l; setLevel(l); rf.zoomTo(l === "module" ? 0.4 : l === "page" ? 0.8 : 1.5, { duration: 300 }); }}
                style={{ padding: "3px 12px", border: "none", borderRadius: 12, background: level === l ? theme.colors.accent.module : theme.colors.bg.elevated, color: level === l ? "#fff" : theme.colors.text.secondary, fontSize: 11, fontWeight: level === l ? 600 : 400, cursor: "pointer", fontFamily: theme.font }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary banner */}
      {confirmedAt && showSummaryBanner && confirmedSummary && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 16px", background: theme.colors.bg.surface, borderBottom: `1px solid ${theme.colors.border.subtle}`, fontSize: 12, color: theme.colors.text.secondary, lineHeight: 1.6 }}>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap", color: theme.colors.text.primary }}>项目总结:</span>
          <div style={{ flex: 1, maxHeight: 72, overflow: "auto", whiteSpace: "pre-wrap" }}>{confirmedSummary}</div>
          <button onClick={() => setShowSummaryBanner(false)} style={{ background: "none", border: "none", color: theme.colors.text.tertiary, cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={true}
          nodesConnectable={false}
          panOnDrag={[0, 2]}
          zoomOnScroll={true}
          onMove={onMove}
          fitView
          minZoom={0.05}
          maxZoom={4}
          style={{ background: theme.colors.bg.app }}
        >
          <Background color="#2a2a2a" gap={20} size={1} />
          <Controls style={{ borderRadius: theme.radius.sm, boxShadow: theme.shadow.md }} />
          <MiniMap style={{ borderRadius: theme.radius.sm, boxShadow: theme.shadow.md }} pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function SmartEvaluation(props: Props) {
  return (
    <ReactFlowProvider>
      <SmartEvaluationInner {...props} />
    </ReactFlowProvider>
  );
}
