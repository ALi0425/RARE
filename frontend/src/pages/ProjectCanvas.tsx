import { useEffect, useState, useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge as FlowEdge,
  type Connection,
  MarkerType,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { FullProject } from "../types";
import { projectsApi, parseApi, assetsApi, edgesApi } from "../api";
import { ModuleNode, PageNode, FieldNode, ActionNode, setOnLabelSave } from "../components/canvas/Nodes";

const nodeTypes = {
  module: ModuleNode,
  page: PageNode,
  field: FieldNode,
  action: ActionNode,
};

interface Props {
  projectId: string;
  onBack: () => void;
}

type TabState = "view" | "diff";

// Estimate a node's rendered width/height from its type and content.
// We use these instead of `measured` because React Flow does not propagate
// measured dimensions back into the `nodes` state from useNodesState.
function nodeDefaultSize(type?: string, label = "", hasExtra = false): { w: number; h: number } {
  if (type === "module") return { w: 160, h: 36 };
  if (type === "page") return { w: 120, h: 36 };
  // Estimate content width: CJK chars are ~14px, latin ~8px
  const textW = [...label].reduce((s, c) => s + (c.charCodeAt(0) > 127 ? 14 : 8), 0);
  const extra = hasExtra ? 50 : 0;
  if (type === "field") return { w: Math.max(140, textW + 40 + extra), h: 32 };
  return { w: Math.max(140, textW + 40 + extra), h: 32 };
}

function computeFluidBounds(nodes: Node[], containerId: string, minW = 160, minH = 36) {
  const children = nodes.filter((n) => n.parentId === containerId);
  if (children.length === 0) return { w: minW, h: minH };
  let maxX = 0, maxY = 0;
  for (const c of children) {
    const cw = Number(c.style?.width) || nodeDefaultSize(c.type, c.data?.label).w;
    const ch = Number(c.style?.height) || nodeDefaultSize(c.type, c.data?.label).h;
    const rx = c.position.x + cw;
    const by = c.position.y + ch;
    if (rx > maxX) maxX = rx;
    if (by > maxY) maxY = by;
  }
  return { w: Math.max(maxX + 40, minW), h: Math.max(maxY + 40, minH) };
}

export default function ProjectCanvas({ projectId, onBack }: Props) {
  const [project, setProject] = useState<FullProject | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [inputText, setInputText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [tabState] = useState<TabState>("view");
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── Context menu state ──────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; nodeId?: string; nodeType?: string;
  } | null>(null);

  // ── Edge editing state ──────────────────────────────────────────
  const [editEdge, setEditEdge] = useState<FlowEdge | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editQuote, setEditQuote] = useState("");

  // Keep a mutable ref to latest nodes for use in event callbacks
  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;

  // ── Space key tracking ──────────────────────────────────────────
  const spaceRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── Fluid bounds auto-resize containers ────────────────────────
  const prevSizesRef = useRef<Map<string, { w: number; h: number }>>(new Map());

  const recalcFluidBounds = useCallback(() => {
    setNodes((nds) => {
      let changed = false;
      const updated = nds.map((n) => {
        if (n.type !== "module" && n.type !== "page") return n;
        const minW = n.type === "module" ? 160 : 120;
        const minH = 36;
        const { w, h } = computeFluidBounds(nds, n.id, minW, minH);
        const prev = prevSizesRef.current.get(n.id);
        if (prev && prev.w === w && prev.h === h) return n;
        changed = true;
        prevSizesRef.current.set(n.id, { w, h });
        return {
          ...n,
          style: {
            ...(n.style || {}),
            width: w,
            height: h,
          },
        };
      });
      return changed ? updated : nds;
    });
  }, [setNodes]);

  // ── Drag: detach on Space+drag (once per drag, ref-guarded) ──
  const detachedThisDragRef = useRef<string | null>(null);

  // ── API helpers ──────────────────────────────────────────────────
  const updateEntityParent = useCallback(
    async (nodeId: string, nodeType: string | undefined, parentId: string | null) => {
      try {
        if (nodeType === "page") {
          await assetsApi.updatePage(projectId, nodeId, { moduleId: parentId });
        } else if (nodeType === "field") {
          await assetsApi.updateField(projectId, nodeId, { pageId: parentId });
        } else if (nodeType === "action") {
          await assetsApi.updateAction(projectId, nodeId, { pageId: parentId });
        }
      } catch (err) {
        console.warn("update parent failed:", err);
      }
    },
    [projectId],
  );

  const updateEntityPosition = useCallback(
    async (nodeId: string, nodeType: string | undefined, posX: number, posY: number) => {
      try {
        if (nodeType === "module") {
          await assetsApi.updateModule(projectId, nodeId, { posX, posY });
        } else if (nodeType === "page") {
          await assetsApi.updatePage(projectId, nodeId, { posX, posY });
        } else if (nodeType === "field") {
          await assetsApi.updateField(projectId, nodeId, { posX, posY });
        } else if (nodeType === "action") {
          await assetsApi.updateAction(projectId, nodeId, { posX, posY });
        }
      } catch (err) {
        console.warn("update position failed:", err);
      }
    },
    [projectId],
  );

  // ── Coordinate helpers ──────────────────────────────────────────
  const getNodeAbsPosition = useCallback((node: Node, allNodes: Node[]) => {
    let x = node.position.x;
    let y = node.position.y;
    let parent = node.parentId ? allNodes.find((n) => n.id === node.parentId) : null;
    while (parent) {
      x += parent.position.x;
      y += parent.position.y;
      parent = parent.parentId ? allNodes.find((n) => n.id === parent.parentId) : null;
    }
    return { x, y };
  }, []);

  // ── Create / Delete helpers for context menu ────────────────────
  const menuBtn: React.CSSProperties = {
    border: "none", background: "transparent", cursor: "pointer",
    fontSize: 13, fontWeight: 500, color: "#1d1d1f", padding: "8px 14px",
    borderRadius: 8, textAlign: "left" as const, width: "100%",
  };
  const editInput: React.CSSProperties = {
    padding: "8px 10px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8,
    fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" as const,
  };

  const deleteNodeById = useCallback((nodeId: string) => {
    const n = nodesRef.current.find((x) => x.id === nodeId);
    if (!n) return;
    if (n.type === "module") assetsApi.deleteModule(projectId, nodeId).catch(console.warn);
    if (n.type === "page") assetsApi.deletePage(projectId, nodeId).catch(console.warn);
    if (n.type === "field") assetsApi.deleteField(projectId, nodeId).catch(console.warn);
    if (n.type === "action") assetsApi.deleteAction(projectId, nodeId).catch(console.warn);
    setNodes((nds) => nds.filter((x) => x.id !== nodeId));
  }, [setNodes, projectId]);

  const createNewNode = useCallback((type: string) => {
    const ts = Date.now();
    const id = `new-${type}-${ts}`;
    const label = type === "module" ? "新模块" : type === "page" ? "新页面" : type === "field" ? "新字段" : "新操作";
    const node: Node = {
      id, type, position: { x: 200 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label },
      style: nodeDefaultSize(type, label),
    };
    const map: Record<string, string> = { module: "module", page: "page", field: "field", action: "action" };
    const entityType = map[type] || type;
    const apis: Record<string, CallableFunction> = {
      module: (d: any) => assetsApi.createModule(projectId, d),
      page: (d: any) => assetsApi.createPage(projectId, d),
      field: (d: any) => assetsApi.createField(projectId, d),
      action: (d: any) => assetsApi.createAction(projectId, d),
    };
    apis[type]?.({ name: label, posX: node.position.x, posY: node.position.y }).catch(console.warn);
    setNodes((nds) => [...nds, node]);
  }, [setNodes, projectId]);
  // ── Drag system: Space+drag detach + nested priority inject ──

  // Helper: how deep is a container nested? (canvas-level = 1)
  const containerDepth = useCallback((n: Node, allNodes: Node[]): number => {
    if (!n.parentId) return 1;
    const p = allNodes.find((x) => x.id === n.parentId);
    if (!p) return 1;
    // Only count module/page ancestors as depth layers
    return (p.type === "module" || p.type === "page") ? containerDepth(p, allNodes) + 1 : 1;
  }, []);

  const onNodeDrag = useCallback(
    (_event: any, node: Node) => {
      if (!spaceRef.current || !node.parentId) return;
      if (detachedThisDragRef.current === node.id) return;
      detachedThisDragRef.current = node.id;
      spaceUsedThisDragRef.current = true;

      const parent = nodesRef.current.find((n) => n.id === node.parentId);
      if (!parent) return;
      const absX = parent.position.x + node.position.x;
      const absY = parent.position.y + node.position.y;
      updateEntityParent(node.id, node.type, null);
      updateEntityPosition(node.id, node.type, Math.round(absX), Math.round(absY));
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? { ...n, parentId: undefined, position: { x: absX, y: absY }, data: { ...n.data, isFloating: true } }
            : n,
        ),
      );
    },
    [setNodes, updateEntityParent, updateEntityPosition],
  );

  // ── Container visual pulse when bounds change ──────────────────
  // Add a subtle data attribute for CSS-driven animation
  useEffect(() => {
    if (!nodes.length) return;
    const containerNodes = nodes.filter(n => n.type === "module" || n.type === "page");
    for (const cn of containerNodes) {
      const prev = prevSizesRef.current.get(cn.id);
      const cw = Number(cn.style?.width) || 0;
      const ch = Number(cn.style?.height) || 0;
      if (prev && (prev.w !== cw || prev.h !== ch)) {
        prevSizesRef.current.set(cn.id, { w: cw, h: ch });
      }
    }
  }, [nodes]);

  // ── Drag stop: nested-priority inject + container recalc ────────
  const onNodeDragStop = useCallback(
    (_event: any, node: Node) => {
      detachedThisDragRef.current = null;
      spaceUsedThisDragRef.current = false;

      setNodes((nds) => {
        let updated = nds;

        // ── Step 1: if floating, find best container by depth+overlap ──
        if (!node.parentId) {
          const nPos = node.position;
          const nw = Number(node.style?.width) || nodeDefaultSize(node.type, node.data?.label).w;
          const nh = Number(node.style?.height) || nodeDefaultSize(node.type, node.data?.label).h;

          // Collect containers with depth (how many module/page ancestors)
          const containers = updated
            .filter((n) => n.id !== node.id && (n.type === "module" || n.type === "page"))
            .map((c) => ({ c, depth: containerDepth(c, updated) }));

          // Find ALL matches (any overlap — only need ox>0 && oy>0)
          const matches: Array<{ c: Node; depth: number; overlap: number }> = [];
          for (const { c, depth } of containers) {
            const cAbs = getNodeAbsPosition(c, updated);
            const cw = Number(c.style?.width) || 160;
            const ch = Number(c.style?.height) || 36;
            const ox = Math.max(0, Math.min(nPos.x + nw, cAbs.x + cw) - Math.max(nPos.x, cAbs.x));
            const oy = Math.max(0, Math.min(nPos.y + nh, cAbs.y + ch) - Math.max(nPos.y, cAbs.y));
            if (ox > 0 && oy > 0) {
              matches.push({ c, depth, overlap: ox * oy });
            }
          }

          // Sort: deepest container first, then largest overlap
          matches.sort((a, b) => b.depth - a.depth || b.overlap - a.overlap);

          if (matches.length > 0) {
            const best = matches[0].c;
            const relX = Math.round(nPos.x - best.position.x);
            const relY = Math.round(nPos.y - best.position.y);
            updateEntityParent(node.id, node.type, best.id);
            updateEntityPosition(node.id, node.type, relX, relY);
            updated = updated.map((n) =>
              n.id === node.id
                ? { ...n, parentId: best.id, position: { x: relX, y: relY }, data: { ...n.data, isFloating: false } }
                : n,
            );
          }
        }

        // ── Step 2: recalc ALL container sizes ──
        for (const n of updated) {
          if (n.type !== "module" && n.type !== "page") continue;
          const minW = n.type === "module" ? 160 : 120;
          const { w, h } = computeFluidBounds(updated, n.id, minW, 36);
          const cw = Number(n.style?.width) || 0;
          const ch = Number(n.style?.height) || 0;
          if (w !== cw || h !== ch) {
            updated = updated.map((x) =>
              x.id === n.id ? { ...x, style: { ...x.style, width: w, height: h } } : x,
            );
          }
        }

        return updated;
      });
    },
    [setNodes, updateEntityParent, updateEntityPosition, getNodeAbsPosition, containerDepth],
  );

  // ── Orphan protection on delete ────────────────────────────────
  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      const currentNodes = nodesRef.current;
      const deletedIds = new Set(deletedNodes.map((n) => n.id));

      const orphans = currentNodes.filter((n) => {
        if (!n.parentId) return false;
        if (!deletedIds.has(n.parentId)) return false;
        return !deletedIds.has(n.id);
      });

      if (orphans.length > 0) {
        setNodes((nds) => {
          const existingIds = new Set(nds.map((n) => n.id));
          const reAdded = orphans
            .filter((o) => !existingIds.has(o.id))
            .map((orphan) => {
              const parent = deletedNodes.find((d) => d.id === orphan.parentId);
              return {
                ...orphan,
                parentId: undefined,
                position: {
                  x: parent ? parent.position.x + orphan.position.x : orphan.position.x,
                  y: parent ? parent.position.y + orphan.position.y : orphan.position.y,
                },
                data: { ...orphan.data, isFloating: true },
              };
            });
          return [...nds, ...reAdded];
        });

        for (const orphan of orphans) {
          updateEntityParent(orphan.id, orphan.type, null);
        }
      }
      if (orphans.length > 0) requestAnimationFrame(() => recalcFluidBounds());

      for (const node of deletedNodes) {
        if (node.type === "module") {
          assetsApi.deleteModule(projectId, node.id).catch(console.warn);
        } else if (node.type === "page") {
          assetsApi.deletePage(projectId, node.id).catch(console.warn);
        } else if (node.type === "field") {
          assetsApi.deleteField(projectId, node.id).catch(console.warn);
        } else if (node.type === "action") {
          assetsApi.deleteAction(projectId, node.id).catch(console.warn);
        }
      }
    },
    [setNodes, projectId, updateEntityParent],
  );

  // ── Load project ────────────────────────────────────────────────
  const loadProject = useCallback(async () => {
    try {
      const data = await projectsApi.get(projectId);
      setProject(data as FullProject);
    } catch (err) {
      setError("加载项目失败");
      console.error(err);
    }
  }, [projectId]);

  // ── Inline label editing ───────────────────────────────────────
  const onLabelSave = useCallback((nodeId: string, label: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
      ),
    );
    // Persist to API
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (node?.type === "module") {
      assetsApi.updateModule(projectId, nodeId, { name: label }).catch(() => {});
    } else if (node?.type === "page") {
      assetsApi.updatePage(projectId, nodeId, { name: label }).catch(() => {});
    } else if (node?.type === "field") {
      assetsApi.updateField(projectId, nodeId, { name: label }).catch(() => {});
    } else if (node?.type === "action") {
      assetsApi.updateAction(projectId, nodeId, { name: label }).catch(() => {});
    }
  }, [setNodes, projectId]);

  useEffect(() => { setOnLabelSave(onLabelSave); return () => setOnLabelSave(null as any); }, [onLabelSave]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // ── Convert project data to React Flow nodes/edges ─────────────
  useEffect(() => {
    if (!project) return;

    const flowNodes: Node[] = [];
    const flowEdges: FlowEdge[] = [];

    // ── Collect ALL entities & resolve parent-child relationships ──
    // Backend returns a nested structure:
    //   project.modules[].pages[].fields/actions[]
    //   project.pages[] = orphan pages (moduleId: null)
    //   project.fields/actions[] = orphan fields/actions (pageId: null)
    //
    // React Flow nested nodes require RELATIVE positions (child.pos - parent.pos).

    // Build module position lookup
    const modulePos = new Map<string, { x: number; y: number }>();
    for (const m of project.modules) modulePos.set(m.id, { x: m.posX, y: m.posY });

    // Collect pages with their fields/actions, computing relative positions
    interface PageEntry {
      id: string; name: string; posX: number; posY: number;
      moduleId: string | null;
      fields: Array<{ id: string; name: string; fieldType: string; posX: number; posY: number }>;
      actions: Array<{ id: string; name: string; actionType: string; validations?: string[]; posX: number; posY: number }>;
    }

    const allPages: PageEntry[] = [];

    // Pages nested inside modules
    for (const m of project.modules) {
      for (const p of m.pages || []) {
        allPages.push({
          id: p.id, name: p.name,
          posX: p.posX, posY: p.posY,
          moduleId: m.id,
          fields: p.fields || [],
          actions: p.actions || [],
        });
      }
    }
    // Orphan pages (and their nested fields/actions from the include)
    for (const p of project.pages || []) {
      allPages.push({
        id: p.id, name: p.name,
        posX: p.posX, posY: p.posY,
        moduleId: null,
        fields: p.fields || [],
        actions: p.actions || [],
      });
    }

    const pagePos = new Map<string, { x: number; y: number }>();
    for (const p of allPages) pagePos.set(p.id, { x: p.posX, y: p.posY });

    // Collect all fields & actions (nested + orphan)
    const allFields: Array<{ id: string; name: string; fieldType: string; pageId: string | null; posX: number; posY: number }> = [];
    const allActions: Array<{ id: string; name: string; actionType: string; validations?: string[]; pageId: string | null; posX: number; posY: number }> = [];

    for (const p of allPages) {
      for (const f of p.fields) allFields.push({ ...f, pageId: p.id });
      for (const a of p.actions) allActions.push({ ...a, pageId: p.id });
    }
    for (const f of project.fields || []) allFields.push({ ...f, pageId: null });
    for (const a of project.actions || []) allActions.push({ ...a, pageId: null });

    // ── Pre-compute page sizes (including children) for module sizing ──
    const pageSizes = new Map<string, { w: number; h: number }>();
    for (const p of allPages) {
      const childFields = allFields.filter((f) => f.pageId === p.id);
      const childActions = allActions.filter((a) => a.pageId === p.id);
      let maxX = 0, maxY = 0, hasChildren = false;
      for (const f of childFields) {
        hasChildren = true;
        const fRelX = f.posX - p.posX;
        const fRelY = f.posY - p.posY;
        const { w } = nodeDefaultSize("field", f.name, !!f.fieldType);
        maxX = Math.max(maxX, fRelX + w);
        maxY = Math.max(maxY, fRelY + 32);
      }
      for (const a of childActions) {
        hasChildren = true;
        const aRelX = a.posX - p.posX;
        const aRelY = a.posY - p.posY;
        const { w } = nodeDefaultSize("action", a.name, !!a.actionType);
        maxX = Math.max(maxX, aRelX + w);
        maxY = Math.max(maxY, aRelY + 32);
      }
      pageSizes.set(p.id, {
        w: Math.max(maxX + 40, 120),
        h: hasChildren ? Math.max(maxY + 40, 36) : 36,
      });
    }

    // ── Create nodes with relative positions ──

    // Modules (using actual page sizes so modules wrap their contained pages)
    for (const m of project.modules) {
      const children = allPages.filter((p) => p.moduleId === m.id);
      let maxX = 0, maxY = 0, hasChildren = false;
      for (const p of children) {
        hasChildren = true;
        const relX = p.posX - m.posX;
        const relY = p.posY - m.posY;
        const ps = pageSizes.get(p.id) || { w: 120, h: 36 };
        maxX = Math.max(maxX, relX + ps.w);
        maxY = Math.max(maxY, relY + ps.h);
      }
      const w = Math.max(maxX + 40, 160);
      const h = hasChildren ? Math.max(maxY + 40, 36) : 36;

      flowNodes.push({
        id: m.id,
        type: "module",
        position: { x: m.posX, y: m.posY },
        data: { label: m.name, description: m.description },
        style: { width: w, height: h, overflow: "visible", transition: "none" },
      });
    }

    // Pages
    for (const p of allPages) {
      const parentModPos = p.moduleId ? modulePos.get(p.moduleId) : null;
      const relX = parentModPos ? p.posX - parentModPos.x : p.posX;
      const relY = parentModPos ? p.posY - parentModPos.y : p.posY;
      const ps = pageSizes.get(p.id) || { w: 300, h: 60 };

      flowNodes.push({
        id: p.id,
        type: "page",
        position: { x: relX, y: relY },
        data: { label: p.name },
        parentId: p.moduleId || undefined,
        style: { width: ps.w, height: ps.h, overflow: "visible", transition: "none" },
      });
    }

    // Fields
    for (const f of allFields) {
      const parentPagePos = f.pageId ? pagePos.get(f.pageId) : null;
      const relX = parentPagePos ? f.posX - parentPagePos.x : f.posX;
      const relY = parentPagePos ? f.posY - parentPagePos.y : f.posY;
      const { w, h } = nodeDefaultSize("field", f.name, !!f.fieldType);
      flowNodes.push({
        id: f.id,
        type: "field",
        position: { x: relX, y: relY },
        data: { label: f.name, fieldType: f.fieldType },
        parentId: f.pageId || undefined,
        style: { width: w, height: h },
      });
    }

    // Actions
    for (const a of allActions) {
      const parentPagePos = a.pageId ? pagePos.get(a.pageId) : null;
      const relX = parentPagePos ? a.posX - parentPagePos.x : a.posX;
      const relY = parentPagePos ? a.posY - parentPagePos.y : a.posY;
      const { w, h } = nodeDefaultSize("action", a.name, !!a.actionType);
      flowNodes.push({
        id: a.id,
        type: "action",
        position: { x: relX, y: relY },
        data: { label: a.name, actionType: a.actionType, validations: a.validations },
        parentId: a.pageId || undefined,
        style: { width: w, height: h },
      });
    }

    // Edges
    for (const e of project.edges) {
      const isInferred = e.status === "inferred";
      const isDataFlow = e.flowType === "DATA_FLOW";
      flowEdges.push({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        label: e.label,
        type: "smoothstep",
        animated: isInferred,
        style: {
          stroke: isInferred ? (isDataFlow ? "#30d158" : "#007aff") : "#86868b",
          strokeWidth: isInferred ? 2 : 1.5,
          strokeDasharray: isInferred ? "5 5" : "none",
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isInferred ? (isDataFlow ? "#30d158" : "#007aff") : "#86868b",
        },
        labelStyle: { fontSize: 11 },
      });
    }

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [project, setNodes, setEdges]);

  // ── Parse handler ───────────────────────────────────────────────
  const doParse = useCallback(async (text: string) => {
    setError("");
    try {
      const result = await parseApi.parse(projectId, text);
      setProject(result as FullProject);
      setInputText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    } finally {
      setParsing(false);
    }
  }, [projectId]);

  const handleParse = useCallback(async (text: string) => {
    if (!text.trim() || parsing) return;
    setParsing(true);
    await doParse(text);
  }, [parsing, doParse]);

  const handleFileSelect = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["txt", "md", "doc", "docx", "json", "csv"].includes(ext || "")) {
      setError("支持的文件格式: .txt, .md, .doc, .docx, .json, .csv");
      return;
    }
    try {
      setParsing(true);
      setError("");

      // Read the file, trying UTF-8 first with GBK fallback for Chinese text
      let text = await file.text();
      const hasReplacementChars = text.includes("�");
      const hasGarbledPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text); // control chars

      if ((hasReplacementChars || hasGarbledPattern) && /\.(txt|md|csv|json)$/i.test(file.name)) {
        // Try GBK decoding as fallback
        try {
          const buffer = await file.arrayBuffer();
          const decoder = new TextDecoder("gbk");
          const gbkText = decoder.decode(buffer);
          if (gbkText.length > 0 && !gbkText.includes("�") && gbkText.length >= text.length * 0.8) {
            text = gbkText;
            console.log("Detected GBK encoding, re-decoded successfully");
          }
        } catch (_e) {
          // GBK not available, keep UTF-8 text
        }
      }

      if (!text.trim()) {
        setError("文件内容为空");
        setParsing(false);
        return;
      }
      await doParse(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "文件读取失败");
      setParsing(false);
    }
  }, [doParse]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      setEdges((eds) => [
        ...eds,
        {
          id: `edge-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          type: "smoothstep",
          style: { stroke: "#86868b", strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#86868b" },
        } as FlowEdge,
      ]);
    },
    [setEdges],
  );

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f5f5f7",
        position: "relative",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div style={{
          position: "absolute",
          inset: 0,
          zIndex: 100,
          background: "rgba(0,113,227,0.06)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: 600,
          color: "#0071e3",
          pointerEvents: "none",
        }}>
          <div className="glass" style={{ padding: "24px 48px", fontSize: 16 }}>
            📄 释放以上传文件
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: "12px 20px",
        background: "rgba(255,255,255,0.78)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        borderBottom: "1px solid rgba(0,0,0,0.05)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 10,
        position: "relative",
      }}>
        <button
          onClick={onBack}
          style={{
            background: "rgba(0,113,227,0.08)",
            border: "none",
            cursor: "pointer",
            color: "#0071e3",
            fontSize: 13,
            fontWeight: 500,
            padding: "6px 14px",
            borderRadius: 20,
            transition: "all 0.15s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "rgba(0,113,227,0.15)")}
          onMouseOut={(e) => (e.currentTarget.style.background = "rgba(0,113,227,0.08)")}
        >
          ← 返回大厅
        </button>
        <span style={{ color: "#d2d2d7", fontSize: 18, fontWeight: 200 }}>|</span>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#1d1d1f" }}>
          {project?.name || "加载中..."}
        </span>

        {project && (
          <span style={{ color: "#86868b", fontSize: 12, marginLeft: 4 }}>
            {project.modules?.length || 0} 模块 ·{" "}
            {(() => {
              const nestedPages = (project.modules || []).reduce((n, m) => n + (m.pages?.length || 0), 0);
              const totalPages = nestedPages + (project.pages?.length || 0);
              const nestedFields = (project.modules || []).reduce((n, m) => n + (m.pages || []).reduce((pn, p) => pn + (p.fields?.length || 0), 0), 0);
              const nestedActions = (project.modules || []).reduce((n, m) => n + (m.pages || []).reduce((pn, p) => pn + (p.actions?.length || 0), 0), 0);
              const totalFields = nestedFields + (project.fields?.length || 0);
              const totalActions = nestedActions + (project.actions?.length || 0);
              return `${totalPages} 页面 · ${totalFields} 字段 · ${totalActions} 操作 ·`;
            })()}{" "}
            {project.edges?.length || 0} 连线
          </span>
        )}

        <div style={{ flex: 1 }} />

        <span style={{
          color: "#86868b",
          fontSize: 11,
          background: "rgba(0,0,0,0.03)",
          padding: "4px 10px",
          borderRadius: 6,
        }}>
          Space + 拖拽脱出 · 拖到容器自动注入
        </span>

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.doc,.docx,.json,.csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={parsing}
          title="上传文件"
          style={{
            background: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(0,0,0,0.06)",
            cursor: "pointer",
            color: "#0071e3",
            fontSize: 13,
            fontWeight: 500,
            padding: "6px 14px",
            borderRadius: 20,
            transition: "all 0.15s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "rgba(0,113,227,0.1)")}
          onMouseOut={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.6)")}
        >
          📎 上传文件
        </button>

        {error && (
          <span style={{ color: "#ff3b30", fontSize: 13, fontWeight: 500 }}>
            ⚠️ {error}
          </span>
        )}
        {parsing && (
          <span style={{
            color: "#0071e3",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#0071e3",
              animation: "pulse 1s ease-in-out infinite",
            }} />
            AI 解析中...
          </span>
        )}
      </div>

      {/* Canvas */}
      <div ref={reactFlowWrapper} style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodesDelete={onNodesDelete}
          onNodeContextMenu={(_e, n) => { _e.preventDefault(); setCtxMenu({ x: _e.clientX, y: _e.clientY, nodeId: n.id, nodeType: n.type }); }}
          onPaneContextMenu={(_e) => { _e.preventDefault(); setCtxMenu({ x: _e.clientX, y: _e.clientY }); }}
          onEdgeDoubleClick={(_e, edge) => { setEditEdge(edge); setEditLabel(edge.label || ""); setEditQuote(edge.data?.sourceQuote || ""); }}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            type: "smoothstep",
            style: { stroke: "#86868b", strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#86868b" },
          }}
          selectionMode={SelectionMode.Partial}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1.5, minZoom: 0.1 }}
          deleteKeyCode="Delete"
          multiSelectionKeyCode="Shift"
          panOnScroll={false}
          zoomOnScroll={true}
          zoomOnDoubleClick={true}
          panOnDrag={[2]}
          selectNodesOnDrag={true}
          nodesDraggable={true}
          style={{ background: "#f5f5f7" }}
          minZoom={0.05}
          maxZoom={4}
        >
          <Background color="#e5e5e5" gap={20} size={1} />
          <Controls
            style={{
              borderRadius: 10,
              boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            }}
          />
          <MiniMap
            style={{
              borderRadius: 10,
              boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            }}
            nodeStrokeWidth={3}
            pannable
            zoomable
          />
        </ReactFlow>

        {/* Context menu */}
        {ctxMenu && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setCtxMenu(null)} />
            <div className="glass" style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 999, padding: 6, minWidth: 150, borderRadius: 10, display: "flex", flexDirection: "column", gap: 2 }}>
              {ctxMenu.nodeId ? (
                <>
                  <button className="glass" style={menuBtn} onClick={() => { deleteNodeById(ctxMenu.nodeId!); setCtxMenu(null); }}>🗑 删除此节点</button>
                </>
              ) : (
                <>
                  <button className="glass" style={menuBtn} onClick={() => { createNewNode("module"); setCtxMenu(null); }}>📦 新建模块</button>
                  <button className="glass" style={menuBtn} onClick={() => { createNewNode("page"); setCtxMenu(null); }}>📄 新建页面</button>
                  <button className="glass" style={menuBtn} onClick={() => { createNewNode("field"); setCtxMenu(null); }}>🏷 新建字段</button>
                  <button className="glass" style={menuBtn} onClick={() => { createNewNode("action"); setCtxMenu(null); }}>▶ 新建操作</button>
                </>
              )}
            </div>
          </>
        )}

        {/* Edge edit dialog */}
        {editEdge && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 998, background: "rgba(0,0,0,0.2)", backdropFilter: "blur(4px)" }} onClick={() => setEditEdge(null)} />
            <div className="glass" style={{ position: "fixed", top: "40%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 999, padding: 20, borderRadius: 12, minWidth: 280, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>编辑连线</span>
              <input placeholder="标签（如：点击后进入）" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={editInput} />
              <input placeholder="原文引用（sourceQuote）" value={editQuote} onChange={(e) => setEditQuote(e.target.value)} style={editInput} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="glass" style={{ ...menuBtn, color: "#86868b" }} onClick={() => setEditEdge(null)}>取消</button>
                <button className="glass" style={{ ...menuBtn, background: "#0071e3", color: "#fff" }} onClick={() => {
                  edgesApi.update(projectId, editEdge.id, { label: editLabel, sourceQuote: editQuote }).catch(() => {});
                  setEdges((eds) => eds.map((e) => e.id === editEdge.id ? { ...e, label: editLabel, data: { ...(e.data || {}), sourceQuote: editQuote } } : e));
                  setEditEdge(null);
                }}>保存</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom input bar */}
      <div style={{
        padding: "12px 20px",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        borderTop: "1px solid rgba(0,0,0,0.05)",
        display: "flex",
        gap: 8,
        alignItems: "center",
        position: "relative",
        zIndex: 10,
      }}>
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && inputText.trim()) {
              handleParse(inputText);
            }
          }}
          placeholder="粘贴需求文档或系统描述... Enter 提交解析（支持拖拽文件到画布）"
          disabled={parsing}
          style={{
            flex: 1,
            padding: "10px 18px",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 24,
            fontSize: 14,
            outline: "none",
            background: "rgba(245,245,247,0.8)",
            transition: "all 0.15s",
            color: "#1d1d1f",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#0071e3";
            e.currentTarget.style.background = "#fff";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)";
            e.currentTarget.style.background = "rgba(245,245,247,0.8)";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={parsing}
          title="上传文件"
          style={{
            padding: "10px 14px",
            background: "rgba(0,0,0,0.04)",
            color: "#86868b",
            border: "1px solid rgba(0,0,0,0.06)",
            borderRadius: 24,
            cursor: parsing ? "default" : "pointer",
            fontSize: 16,
            transition: "all 0.15s",
          }}
        >
          📎
        </button>
        <button
          onClick={() => handleParse(inputText)}
          disabled={parsing || !inputText.trim()}
          style={{
            padding: "10px 24px",
            background: parsing || !inputText.trim() ? "rgba(0,113,227,0.3)" : "linear-gradient(135deg, #0071e3, #0056b3)",
            color: "#fff",
            border: "none",
            borderRadius: 24,
            cursor: parsing || !inputText.trim() ? "default" : "pointer",
            fontSize: 14,
            fontWeight: 500,
            transition: "all 0.15s",
            letterSpacing: 0.2,
          }}
        >
          {parsing ? "解析中..." : "解析 →"}
        </button>
      </div>
    </div>
  );
}
