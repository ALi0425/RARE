import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Viewport,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "../../store/canvasStore";
import type { ImpactPreview } from "../../store/canvasStore";
import { nodeTypes } from "../canvas/nodeTypes";
import { theme } from "../../theme/tokens";
import Spinner from "../ui/Spinner";
import OptimizationPanel from "./OptimizationPanel";

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
  const allNodes = useCanvasStore((s) => s.nodes);
  const allEdges = useCanvasStore((s) => s.edges);
  const loading = useCanvasStore((s) => s.loading);
  const confirmedAt = useCanvasStore((s) => s.confirmedAt);
  const confirmedSummary = useCanvasStore((s) => s.confirmedSummary);
  const impactPreview = useCanvasStore((s) => s.impactPreview);
  const setImpactPreview = useCanvasStore((s) => s.setImpactPreview);
  const triggerReopenModal = useCanvasStore((s) => s.triggerReopenModal);
  const rf = useReactFlow();
  const projectId = useCanvasStore((s) => s.projectId);

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

  // ── Generate demo nodes/edges from impact preview ──
  const { demoNodes: impactDemoNodes, demoEdges: impactDemoEdges } = useMemo(() => {
    const demoNodes: Node[] = [];
    const demoEdges: Edge[] = [];
    if (!impactPreview) return { demoNodes, demoEdges };

    // Build name→id map for existing nodes
    const nameToNode = new Map<string, Node>();
    for (const n of allNodes) {
      const label = (n.data as any)?.label || "";
      nameToNode.set(label, n);
    }

    // Temp ids + positions for new entities (also used as parent lookup for subsequent demo nodes)
    let demoIdx = 0;
    const newNameToId = new Map<string, string>();
    const demoNodeByName = new Map<string, Node>();

    // Helper: find parent node (check demo nodes first, then existing nodes, then fuzzy, then by type)
    const findParentNode = (parentName: string | null, childType: string): Node | null => {
      if (!parentName) return null;
      // 1. Exact match in already-created demo nodes
      const demoNode = demoNodeByName.get(parentName);
      if (demoNode) return demoNode;
      // 2. Exact match in existing nodes
      const existingNode = nameToNode.get(parentName);
      if (existingNode) return existingNode;
      // 3. Fuzzy match in existing nodes
      for (const [, n] of nameToNode) {
        const label = (n.data as any)?.label || "";
        if (label.includes(parentName) || parentName.includes(label)) return n;
      }
      // 4. Fallback: find any node of the expected parent type
      const expectedType = childType === "page" ? "module" : "page";
      for (const [, n] of demoNodeByName) {
        if (n.type === expectedType) return n;
      }
      for (const [, n] of nameToNode) {
        if (n.type === expectedType) return n;
      }
      return null;
    };

    // Sort entities: modules → pages → fields → actions (parents before children)
    const sortedEntities = [...impactPreview.newEntities].sort((a, b) => {
      const order: Record<string, number> = { module: 0, page: 1, field: 2, action: 3 };
      return (order[a.type] || 99) - (order[b.type] || 99);
    });

    // Create demo nodes for new entities
    // Track page/field count per parent for vertical stacking
    const pageCountPerParent = new Map<string, number>();
    const fieldCountPerParent = new Map<string, number>();
    for (const ne of sortedEntities) {
      const id = `demo-new-${demoIdx}`;
      newNameToId.set(ne.name, id);

      // Find parent node (checks demo nodes created so far + existing nodes)
      let parentNode = findParentNode(ne.parentName, ne.type);

      const isPage = ne.type === "page";
      const w = isPage ? 180 : 130;
      const h = isPage ? 80 : 44;

      // Position relative to parent + parentId → renders inside parent container
      let position: { x: number; y: number };
      let parentId: string | undefined;
      if (parentNode) {
        parentId = parentNode.id;
        const pLabel = (parentNode.data as any)?.label || parentNode.id;
        if (isPage) {
          const idx = pageCountPerParent.get(pLabel) || 0;
          pageCountPerParent.set(pLabel, idx + 1);
          position = { x: 20, y: 36 + idx * (h + 8) };
        } else {
          const idx = fieldCountPerParent.get(pLabel) || 0;
          fieldCountPerParent.set(pLabel, idx + 1);
          position = { x: 16, y: 36 + idx * (h + 8) };
        }
      } else {
        position = { x: 100 + (demoIdx % 3) * 200, y: 200 + Math.floor(demoIdx / 3) * 100 };
      }

      demoIdx++;
      const demoNode: Node = {
        id,
        type: ne.type,
        position,
        parentId,
        data: { label: `${ne.name}✨`, fieldType: ne.fieldType, actionType: ne.actionType, isDemo: true },
        style: {
          width: w,
          height: h,
          border: `2px dashed #a855f7`,
          borderRadius: 10,
          background: "rgba(168,85,247,0.08)",
          boxShadow: "0 0 12px rgba(168,85,247,0.3)",
          overflow: "visible",
          boxSizing: "border-box",
          zIndex: 9999,
        },
      };
      demoNodeByName.set(ne.name, { ...demoNode, data: { ...demoNode.data, label: ne.name } });
      demoNodes.push(demoNode);
    }

    // Create demo edges for new connections
    for (const edge of impactPreview.newEdges) {
      const sourceId = newNameToId.get(edge.sourceName) || nameToNode.get(edge.sourceName)?.id;
      const targetId = newNameToId.get(edge.targetName) || nameToNode.get(edge.targetName)?.id;
      if (sourceId && targetId) {
        demoEdges.push({
          id: `demo-edge-${demoIdx++}`,
          source: sourceId,
          target: targetId,
          label: edge.label,
          type: "smoothstep",
          style: { stroke: "#a855f7", strokeWidth: 2, strokeDasharray: "6 4" },
          markerEnd: { type: "arrowclosed" as any, color: "#a855f7" },
          data: { isDemo: true },
        });
      }
    }

    return { demoNodes, demoEdges };
  }, [impactPreview, allNodes]);

  // Filter + enrich nodes by level
  const displayNodes = useMemo(() => {
    const base = allNodes
      .filter((n) => {
        if (level === "module") return n.type === "module";
        if (level === "page") return n.type === "module" || n.type === "page";
        return true;
      })
      .map((n) => {
        // Check if this node is affected by impact preview
        let extraData: Record<string, any> = {};
        if (impactPreview) {
          const label = (n.data as any)?.label || "";
          const affected = impactPreview.affectedEntities.find((a) => a.name === label);
          if (affected) {
            extraData.affectedImpact = affected.impact;
            extraData.demoAffected = true;
          }
        }
        return {
          ...n,
          data: { ...n.data, evalZoom: currentZoom, evalLevel: level, ...extraData },
        };
      });
    // Add demo nodes — show all types at field level, pages+ at page level, all at module level
    for (const dn of impactDemoNodes) {
      const isPage = dn.type === "page";
      const isField = dn.type === "field" || dn.type === "action";
      if (level === "module" && isPage) { base.push(dn); continue; }
      if (level === "module" && isField) { base.push(dn); continue; }
      if (level === "page" && isField) { base.push(dn); continue; }
      base.push(dn);
    }

    // Expand parent containers to wrap demo children visually
    if (impactDemoNodes.length > 0) {
      const expandMap = new Map<string, { w: number; h: number }>();
      for (const dn of impactDemoNodes) {
        if (!dn.parentId) continue;
        const cw = ((dn.style as any)?.width as number) || 130;
        const ch = ((dn.style as any)?.height as number) || 44;
        const needW = dn.position.x + cw + 16;
        const needH = dn.position.y + ch + 12;
        const cur = expandMap.get(dn.parentId) || { w: 0, h: 0 };
        if (needW > cur.w || needH > cur.h) {
          expandMap.set(dn.parentId, { w: Math.max(cur.w, needW), h: Math.max(cur.h, needH) });
        }
      }
      if (expandMap.size > 0) {
        for (let i = 0; i < base.length; i++) {
          const exp = expandMap.get(base[i].id);
          if (exp) {
            const s = (base[i].style || {}) as Record<string, any>;
            base[i] = {
              ...base[i],
              style: {
                ...s,
                width: Math.max(s.width || 160, exp.w),
                height: Math.max(s.height || 36, exp.h),
              },
            };
          }
        }
      }
    }

    return base;
  }, [allNodes, level, currentZoom, impactPreview, impactDemoNodes]);

  // Edges: only show those connecting two visible nodes
  const displayEdges = useMemo(() => {
    const visibleIds = new Set(displayNodes.map((n) => n.id));
    const base = allEdges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    );
    // Add demo edges where both endpoints are visible
    for (const de of impactDemoEdges) {
      if (visibleIds.has(de.source) && visibleIds.has(de.target)) {
        base.push(de);
      }
    }
    return base;
  }, [allEdges, displayNodes, impactDemoEdges]);

  // Initial fitView (or re-fit when demo nodes appear)
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current && !impactPreview) return;
    fitted.current = true;
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, maxZoom: 1.2 }));
  }, [rf, impactPreview]);

  // Fit view when demo nodes appear
  const prevPreview = useRef(impactPreview);
  useEffect(() => {
    if (impactPreview && !prevPreview.current) {
      requestAnimationFrame(() => rf.fitView({ padding: 0.25, maxZoom: 1.2 }));
    }
    prevPreview.current = impactPreview;
  }, [impactPreview, rf]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: theme.colors.text.secondary, fontSize: 14 }}>
        <Spinner /> 加载中...
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: theme.colors.bg.app }}>
      {/* Top bar — simplified */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: theme.colors.bg.surface, borderBottom: `1px solid ${theme.colors.border.subtle}`, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text.primary }}>智能评估</span>
          {impactPreview && (
            <span style={{ fontSize: 11, color: "#a855f7", background: "rgba(168,85,247,0.12)", padding: "2px 10px", borderRadius: 10 }}>
              演示模式
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {impactPreview && (
            <button
              onClick={() => triggerReopenModal()}
              style={{
                padding: "4px 14px", border: "none", borderRadius: 8,
                background: "#7c3aed", color: "#fff", cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: theme.font,
              }}
            >
              回到评估
            </button>
          )}
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

        {/* Floating optimization panel */}
        {projectId && <OptimizationPanel projectId={projectId} />}
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
