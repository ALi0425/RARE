import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
  useReactFlow,
  type Node,
  type Edge,
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
  const rf = useReactFlow();

  const [level, setLevel] = useState<ZoomLevel>("module");
  const levelRef = useRef<ZoomLevel>("module");
  const [currentZoom, setCurrentZoom] = useState(0.4);
  const zoomRef = useRef(0.4);

  // Track zoom and update level
  const onMove = useCallback((_: any, viewport: Viewport) => {
    zoomRef.current = viewport.zoom;
    setCurrentZoom(viewport.zoom);
    const newLevel = getLevel(viewport.zoom);
    if (newLevel !== levelRef.current) {
      levelRef.current = newLevel;
      setLevel(newLevel);
    }
  }, []);

  // Determine visible nodes and edges based on current level
  const { visibleNodes, visibleEdges } = useMemo(() => {
    const zoom = currentZoom;
    const enrich = (nodes: any[], evalLevel: string) =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, evalZoom: zoom, evalLevel },
      }));

    let nodesForLevel: any[];
    if (level === "module") {
      nodesForLevel = allNodes.filter((n) => n.type === "module");
    } else if (level === "page") {
      nodesForLevel = allNodes.filter(
        (n) => n.type === "module" || n.type === "page",
      );
    } else {
      nodesForLevel = allNodes;
    }

    // Show only edges where both source and target are in the visible set
    const visibleIds = new Set(nodesForLevel.map((n) => n.id));
    const edgesForLevel = allEdges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    );

    return {
      visibleNodes: enrich(nodesForLevel, level),
      visibleEdges: edgesForLevel,
    };
  }, [level, currentZoom, allNodes, allEdges]);


  // Hold ref for initial fitView
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, maxZoom: 1.2 }));
  }, [rf]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 10,
          color: theme.colors.text.secondary,
          fontSize: 14,
        }}
      >
        <Spinner /> 加载中...
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: theme.colors.bg.app,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          background: theme.colors.bg.surface,
          borderBottom: `1px solid ${theme.colors.border.subtle}`,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: theme.colors.text.primary,
            }}
          >
            智能评估
          </span>
          <span
            style={{
              fontSize: 11,
              color: theme.colors.text.tertiary,
              background: theme.colors.bg.elevated,
              padding: "2px 8px",
              borderRadius: 8,
            }}
          >
            {projectName}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              color: theme.colors.text.tertiary,
              marginRight: 4,
            }}
          >
            当前层级:
          </span>
          {(["module", "page", "field"] as const).map((l) => {
            const label = l === "module" ? "模块" : l === "page" ? "页面" : "字段";
            const active = level === l;
            return (
              <button
                key={l}
                onClick={() => {
                  levelRef.current = l;
                  setLevel(l);
                  // Adjust zoom to match level
                  const z = l === "module" ? 0.4 : l === "page" ? 0.8 : 1.5;
                  rf.zoomTo(z, { duration: 300 });
                }}
                style={{
                  padding: "3px 12px",
                  border: "none",
                  borderRadius: 12,
                  background: active
                    ? theme.colors.accent.module
                    : theme.colors.bg.elevated,
                  color: active ? "#fff" : theme.colors.text.secondary,
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: theme.font,
                }}
              >
                {label}
              </button>
            );
          })}
          <span
            style={{
              fontSize: 10,
              color: theme.colors.text.tertiary,
              marginLeft: 4,
            }}
          >
            滚轮缩放切换 · 可拖动
          </span>

        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={false}
          selectionOnDrag={false}
          panOnDrag={[0]}
          zoomOnScroll={true}
          panOnScroll={false}
          onMove={onMove}
          defaultEdgeOptions={{
            type: "smoothstep",
            style: { stroke: "#555555", strokeWidth: 1.5 },
            markerEnd: { type: "arrowclosed" as any, color: "#555555" },
          }}
          selectionMode={SelectionMode.Partial}
          minZoom={0.1}
          maxZoom={4}
          style={{ background: theme.colors.bg.app }}
        >
          <Background color="#2a2a2a" gap={20} size={1} />
          <Controls
            style={{
              borderRadius: theme.radius.sm,
              boxShadow: theme.shadow.md,
            }}
          />
          <MiniMap
            style={{
              borderRadius: theme.radius.sm,
              boxShadow: theme.shadow.md,
            }}
            pannable
            zoomable
          />
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
