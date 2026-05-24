import { create } from "zustand";
import type { Node, Edge } from "@xyflow/react";

interface CanvasStore {
  // Raw project data
  projectId: string | null;
  projectName: string;

  // React Flow state
  nodes: Node[];
  edges: Edge[];
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;

  // Drag state
  spaceUsed: boolean;
  setSpaceUsed: (v: boolean) => void;

  // Loading
  loading: boolean;

  // Actions
  loadProject: (id: string) => Promise<void>;
  reset: () => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  projectId: null,
  projectName: "",
  nodes: [],
  edges: [],
  setNodes: (updater) => {
    set((state) => ({
      nodes: typeof updater === "function" ? updater(state.nodes) : updater,
    }));
  },
  setEdges: (updater) => {
    set((state) => ({
      edges: typeof updater === "function" ? updater(state.edges) : updater,
    }));
  },
  spaceUsed: false,
  setSpaceUsed: (v) => set({ spaceUsed: v }),
  loading: false,
  loadProject: async (id) => {
    set({ loading: true });
    try {
      const { projectsApi } = await import("../api");
      const data = await projectsApi.get(id);
      set({ projectId: id, projectName: data.name });
      convertProjectToFlow(data, set);
    } catch (e) {
      console.error("loadProject failed:", e);
    } finally {
      set({ loading: false });
    }
  },
  reset: () => set({ nodes: [], edges: [], projectId: null, projectName: "" }),
}));

function nodeSize(type?: string, label = "", hasExtra = false) {
  if (type === "module") return { w: 160, h: 36 };
  if (type === "page") return { w: 120, h: 36 };
  const tw = [...label].reduce((s, c) => s + (c.charCodeAt(0) > 127 ? 14 : 8), 0);
  const extra = hasExtra ? 50 : 0;
  if (type === "field") return { w: Math.max(140, tw + 40 + extra), h: 32 };
  return { w: Math.max(140, tw + 40 + extra), h: 32 };
}

function convertProjectToFlow(data: any, set: any) {
  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  // Position lookup tables
  const modulePos = new Map<string, { x: number; y: number }>();
  for (const m of data.modules) modulePos.set(m.id, { x: m.posX, y: m.posY });

  // Collect all pages
  interface PE { id: string; name: string; posX: number; posY: number; moduleId: string | null; fields: any[]; actions: any[] }
  const allPages: PE[] = [];

  for (const m of data.modules) {
    for (const p of m.pages || []) {
      allPages.push({ id: p.id, name: p.name, posX: p.posX, posY: p.posY, moduleId: m.id, fields: p.fields || [], actions: p.actions || [] });
    }
  }
  for (const p of data.pages || []) {
    allPages.push({ id: p.id, name: p.name, posX: p.posX, posY: p.posY, moduleId: null, fields: p.fields || [], actions: p.actions || [] });
  }

  const pagePos = new Map<string, { x: number; y: number }>();
  for (const p of allPages) pagePos.set(p.id, { x: p.posX, y: p.posY });

  const allFields: any[] = [];
  const allActions: any[] = [];
  for (const p of allPages) {
    for (const f of p.fields) allFields.push({ ...f, pageId: p.id });
    for (const a of p.actions) allActions.push({ ...a, pageId: p.id });
  }
  for (const f of data.fields || []) allFields.push({ ...f, pageId: null });
  for (const a of data.actions || []) allActions.push({ ...a, pageId: null });

  // Compute page sizes
  const pageSizes = new Map<string, { w: number; h: number }>();
  for (const p of allPages) {
    let mx = 0, my = 0, has = false;
    for (const f of allFields.filter((x) => x.pageId === p.id)) {
      has = true; const s = nodeSize("field", f.name, !!f.fieldType); mx = Math.max(mx, f.posX - p.posX + s.w); my = Math.max(my, f.posY - p.posY + 32);
    }
    for (const a of allActions.filter((x) => x.pageId === p.id)) {
      has = true; const s = nodeSize("action", a.name, !!a.actionType); mx = Math.max(mx, a.posX - p.posX + s.w); my = Math.max(my, a.posY - p.posY + 32);
    }
    pageSizes.set(p.id, { w: Math.max(mx + 40, 120), h: has ? Math.max(my + 40, 36) : 36 });
  }

  // Create modules
  const modSizes = new Map<string, { w: number; h: number }>();
  for (const m of data.modules) {
    const kids = allPages.filter((p) => p.moduleId === m.id);
    let mx = 0, my = 0, has = false;
    for (const p of kids) {
      has = true; const ps = pageSizes.get(p.id) || { w: 120, h: 36 };
      mx = Math.max(mx, p.posX - m.posX + ps.w); my = Math.max(my, p.posY - m.posY + ps.h);
    }
    const w = Math.max(mx + 40, 160), h = has ? Math.max(my + 40, 36) : 36;
    modSizes.set(m.id, { w, h });
    flowNodes.push({ id: m.id, type: "module", position: { x: m.posX, y: m.posY }, data: { label: m.name }, style: { width: w, height: h, overflow: "visible", transition: "width 0.15s ease, height 0.15s ease" } });
  }

  // Create pages
  for (const p of allPages) {
    const mp = p.moduleId ? modulePos.get(p.moduleId) : null;
    const rx = mp ? p.posX - mp.x : p.posX;
    const ry = mp ? p.posY - mp.y : p.posY;
    const ps = pageSizes.get(p.id) || { w: 300, h: 60 };
    flowNodes.push({ id: p.id, type: "page", position: { x: rx, y: ry }, data: { label: p.name }, parentId: p.moduleId || undefined, extent: p.moduleId ? ("parent" as const) : undefined, style: { width: ps.w, height: ps.h, overflow: "visible", transition: "width 0.15s ease, height 0.15s ease" } });
  }

  // Create fields
  for (const f of allFields) {
    const pp = f.pageId ? pagePos.get(f.pageId) : null;
    const rx = pp ? f.posX - pp.x : f.posX;
    const ry = pp ? f.posY - pp.y : f.posY;
    const s = nodeSize("field", f.name, !!f.fieldType);
    flowNodes.push({ id: f.id, type: "field", position: { x: rx, y: ry }, data: { label: f.name, fieldType: f.fieldType }, parentId: f.pageId || undefined, extent: f.pageId ? ("parent" as const) : undefined, style: { width: s.w, height: s.h } });
  }

  // Create actions
  for (const a of allActions) {
    const pp = a.pageId ? pagePos.get(a.pageId) : null;
    const rx = pp ? a.posX - pp.x : a.posX;
    const ry = pp ? a.posY - pp.y : a.posY;
    const s = nodeSize("action", a.name, !!a.actionType);
    flowNodes.push({ id: a.id, type: "action", position: { x: rx, y: ry }, data: { label: a.name, actionType: a.actionType }, parentId: a.pageId || undefined, extent: a.pageId ? ("parent" as const) : undefined, style: { width: s.w, height: s.h } });
  }

  // Create edges
  for (const e of data.edges || []) {
    flowEdges.push({ id: e.id, source: e.sourceId, target: e.targetId, label: e.label, type: "smoothstep", style: { stroke: "#86868b", strokeWidth: 1.5 }, markerEnd: { type: "arrowclosed", color: "#86868b" } as any });
  }

  set({ nodes: flowNodes, edges: flowEdges });
}
