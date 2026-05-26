import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import { request } from "../api/client";
import { theme } from "../theme/tokens";

// ── Types ──

export interface DiffState {
  greenIds: string[];
  redIds: string[];
  tooltips: Record<string, string>;
}

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  modules: any[];
  pages: any[];
  fields: any[];
  actions: any[];
  edges: any[];
}

// ── Store ──

interface CanvasStore {
  projectId: string | null;
  projectName: string;
  confirmedAt: string | null;
  confirmedSummary: string;
  nodes: Node[];
  edges: Edge[];
  loading: boolean;
  error: string | null;
  diffState: DiffState | null;
  loadKey: number;
  viewportCenter: { x: number; y: number } | null;

  setNodes: (updater: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  syncNodes: (nodes: Node[]) => void;
  syncEdges: (edges: Edge[]) => void;
  patchNodes: (nodes: Node[]) => void;
  patchEdges: (edges: Edge[]) => void;

  loadProject: (id: string) => Promise<void>;
  applyDiff: (diff: DiffState) => void;
  clearDiff: () => void;
  reset: () => void;
  collectPositions: () => { modules: any[]; pages: any[]; fields: any[]; actions: any[] };
}

// ── Helpers ──

function nodeDefaultSize(type?: string, label = "") {
  if (type === "module") return { w: 160, h: 36 };
  if (type === "page") return { w: 120, h: 36 };
  const tw = [...label].reduce(
    (s: number, c: string) => s + (c.charCodeAt(0) > 127 ? 14 : 8),
    0,
  );
  return { w: Math.max(140, tw + 40), h: 52 };
}

export function convertProjectToFlow(
  data: ProjectData,
  _store?: { setNodes: any; setEdges: any },
) {
  const fn: Node[] = [];
  const fe: Edge[] = [];
  const mPos = new Map<string, { x: number; y: number }>();
  for (const m of data.modules || []) mPos.set(m.id, { x: m.posX, y: m.posY });

  const allPages: any[] = [];
  for (const m of data.modules || []) {
    for (const p of m.pages || []) allPages.push({ ...p, moduleId: m.id });
  }
  for (const p of data.pages || [])
    allPages.push({ ...p, moduleId: null });

  const pagePos = new Map<string, { x: number; y: number }>();
  for (const p of allPages) pagePos.set(p.id, { x: p.posX, y: p.posY });

  const allFields: any[] = [];
  const allActions: any[] = [];
  for (const p of allPages) {
    for (const f of p.fields || []) allFields.push({ ...f, pageId: p.id });
    for (const a of p.actions || []) allActions.push({ ...a, pageId: p.id });
  }
  for (const f of data.fields || []) allFields.push({ ...f, pageId: null });
  for (const a of data.actions || [])
    allActions.push({ ...a, pageId: null });

  // Page sizes + shifts (normalize children into positive coordinate space)
  const pageSizes = new Map<string, { w: number; h: number }>();
  const pageShift = new Map<string, { dx: number; dy: number }>();
  for (const p of allPages) {
    let minX = Infinity,
      minY = Infinity,
      mx = -Infinity,
      my = -Infinity,
      has = false;
    for (const f of allFields.filter((x) => x.pageId === p.id)) {
      has = true;
      const s = nodeDefaultSize("field", f.name);
      const rx = f.posX - p.posX;
      const ry = f.posY - p.posY;
      if (!Number.isFinite(rx) || !Number.isFinite(ry)) continue;
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      mx = Math.max(mx, rx + s.w);
      my = Math.max(my, ry + s.h);
    }
    for (const a of allActions.filter((x) => x.pageId === p.id)) {
      has = true;
      const s = nodeDefaultSize("action", a.name);
      const rx = a.posX - p.posX;
      const ry = a.posY - p.posY;
      if (!Number.isFinite(rx) || !Number.isFinite(ry)) continue;
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      mx = Math.max(mx, rx + s.w);
      my = Math.max(my, ry + s.h);
    }
    pageShift.set(p.id, {
      dx: Math.max(0, -(Number.isFinite(minX) ? minX : 0)),
      dy: Math.max(0, -(Number.isFinite(minY) ? minY : 0)),
    });
    pageSizes.set(p.id, {
      w: Math.max(Number.isFinite(mx) ? mx - Math.min(minX, 0) + 16 : 120, 120),
      h: has ? Math.max(Number.isFinite(my) ? my - Math.min(minY, 0) + 12 : 36, 36) : 36,
    });
  }

  // Module sizes + shifts (normalize pages into positive coordinate space)
  const moduleShift = new Map<string, { dx: number; dy: number }>();
  for (const m of data.modules || []) {
    const kids = allPages.filter((p) => p.moduleId === m.id);
    let minX = Infinity,
      minY = Infinity,
      mx = -Infinity,
      my = -Infinity,
      has = false;
    for (const p of kids) {
      has = true;
      const ps = pageSizes.get(p.id) || { w: 120, h: 36 };
      const rx = p.posX - m.posX;
      const ry = p.posY - m.posY;
      if (!Number.isFinite(rx) || !Number.isFinite(ry)) continue;
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      mx = Math.max(mx, rx + ps.w);
      my = Math.max(my, ry + ps.h);
    }
    moduleShift.set(m.id, {
      dx: Math.max(0, -(Number.isFinite(minX) ? minX : 0)),
      dy: Math.max(0, -(Number.isFinite(minY) ? minY : 0)),
    });
    const w = Math.max(Number.isFinite(mx) ? mx - Math.min(minX, 0) + 32 : 160, 160),
      h = has ? Math.max(Number.isFinite(my) ? my - Math.min(minY, 0) + 24 : 36, 36) : 36;
    fn.push({
      id: m.id,
      type: "module",
      position: { x: m.posX, y: m.posY },
      data: { label: m.name },
      style: {
        width: w,
        height: h,
        overflow: "visible",
        border: `1px solid ${theme.colors.accent.module}`,
        borderRadius: 10,
        boxSizing: "border-box",
      },
    });
  }

  // Pages
  for (const p of allPages) {
    const mp = p.moduleId ? mPos.get(p.moduleId) : null;
    const rx = mp ? p.posX - mp.x : p.posX;
    const ry = mp ? p.posY - mp.y : p.posY;
    const msh = p.moduleId ? (moduleShift.get(p.moduleId) || { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
    const ps = pageSizes.get(p.id) || { w: 300, h: 60 };
    fn.push({
      id: p.id,
      type: "page",
      position: { x: rx + msh.dx, y: ry + msh.dy },
      data: { label: p.name },
      parentId: p.moduleId || undefined,
      extent: p.moduleId ? ("parent" as const) : undefined,
      style: {
        width: ps.w,
        height: ps.h,
        overflow: "visible",
        border: `1px solid ${theme.colors.accent.page}`,
        borderRadius: 10,
        boxSizing: "border-box",
      },
    });
  }

  // Fields
  for (const f of allFields) {
    const pp = f.pageId ? pagePos.get(f.pageId) : null;
    const rx = pp ? f.posX - pp.x : f.posX;
    const ry = pp ? f.posY - pp.y : f.posY;
    const sh = f.pageId ? (pageShift.get(f.pageId) || { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
    const s = nodeDefaultSize("field", f.name);
    fn.push({
      id: f.id,
      type: "field",
      position: { x: rx + sh.dx, y: ry + sh.dy },
      data: { label: f.name, fieldType: f.fieldType },
      parentId: f.pageId || undefined,
      extent: f.pageId ? ("parent" as const) : undefined,
      style: { width: s.w, height: s.h },
    });
  }

  // Actions
  for (const a of allActions) {
    const pp = a.pageId ? pagePos.get(a.pageId) : null;
    const rx = pp ? a.posX - pp.x : a.posX;
    const ry = pp ? a.posY - pp.y : a.posY;
    const sh = a.pageId ? (pageShift.get(a.pageId) || { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
    const s = nodeDefaultSize("action", a.name);
    fn.push({
      id: a.id,
      type: "action",
      position: { x: rx + sh.dx, y: ry + sh.dy },
      data: { label: a.name, actionType: a.actionType },
      parentId: a.pageId || undefined,
      extent: a.pageId ? ("parent" as const) : undefined,
      style: { width: s.w, height: s.h },
    });
  }

  // Edges
  for (const e of data.edges || []) {
    const isInferred = e.status === "ai_inferred";
    fe.push({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      label: e.label,
      type: "smoothstep",
      style: isInferred
        ? { stroke: "#888888", strokeWidth: 1.5, strokeDasharray: "6 4" }
        : { stroke: "#555555", strokeWidth: 1.5 },
      markerEnd: {
        type: "arrowclosed" as any,
        color: isInferred ? "#888888" : "#555555",
      },
      data: isInferred ? { aiInferred: true, reason: e.sourceQuote || e.label || "" } : undefined,
    });
  }

  return { nodes: fn, edges: fe };
}

// ── Create store ──

function nodesEqual(a: Node[], b: Node[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].position.x !== b[i].position.x || a[i].position.y !== b[i].position.y) return false;
  }
  return true;
}

function edgesEqual(a: Edge[], b: Edge[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  projectId: null,
  projectName: "",
  confirmedAt: null,
  confirmedSummary: "",
  nodes: [],
  edges: [],
  loading: false,
  error: null,
  diffState: null,
  loadKey: 0,
  viewportCenter: null,

  setNodes: (updater) => {
    set((state) => {
      const next = typeof updater === "function" ? updater(state.nodes) : updater;
      return { nodes: next, loadKey: state.loadKey + 1 };
    });
  },
  setEdges: (updater) => {
    set((state) => {
      const next = typeof updater === "function" ? updater(state.edges) : updater;
      return { edges: next, loadKey: state.loadKey + 1 };
    });
  },

  syncNodes: (nodes) => {
    set((state) => {
      if (nodesEqual(state.nodes, nodes)) return {};
      return { nodes };
    });
  },

  syncEdges: (edges) => {
    set((state) => {
      if (edgesEqual(state.edges, edges)) return {};
      return { edges };
    });
  },

  /** Lightweight update — replaces nodes and bumps loadKey, no loading/API fetch */
  patchNodes: (nodes) => {
    set((state) => ({ nodes, loadKey: state.loadKey + 1 }));
  },

  patchEdges: (edges) => {
    set((state) => ({ edges, loadKey: state.loadKey + 1 }));
  },

  loadProject: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const data = await request<ProjectData>(`/projects/${id}`);
      const { nodes, edges } = convertProjectToFlow(data);
      set((state) => ({
        projectId: id,
        projectName: data.name,
        confirmedAt: (data as any).confirmedAt || null,
        confirmedSummary: (data as any).description || "",
        nodes,
        edges,
        loading: false,
        loadKey: state.loadKey + 1,
      }));
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load project",
      });
    }
  },

  applyDiff: (diff: DiffState) => {
    set((state) => {
      const updated = state.nodes.map((n) => {
        const isGreen = diff.greenIds.includes(n.id);
        const isRed = diff.redIds.includes(n.id);
        if (!isGreen && !isRed) return n;
        const borderColor = isGreen ? "#34d399" : "#f87171";
        const tip = isRed && diff.tooltips[n.id] ? diff.tooltips[n.id] : undefined;
        return {
          ...n,
          data: { ...n.data, diffTooltip: tip },
          style: {
            ...n.style,
            boxShadow: `0 0 12px ${borderColor}40`,
            border: `2px solid ${borderColor}`,
          },
        } as Node;
      });
      return { nodes: updated, diffState: diff, loadKey: state.loadKey + 1 };
    });
  },

  clearDiff: () => {
    set((state) => {
      const updated = state.nodes.map((n) => {
        const st = n.style || {};
        const { boxShadow, border, ...rest } = st as Record<string, any>;
        return { ...n, data: { ...n.data, diffTooltip: undefined }, style: rest };
      });
      return { nodes: updated, diffState: null, loadKey: state.loadKey + 1 };
    });
  },

  reset: () =>
    set({
      nodes: [],
      edges: [],
      projectId: null,
      projectName: "",
      confirmedAt: null,
      confirmedSummary: "",
      loading: false,
      error: null,
      diffState: null,
      loadKey: 0,
      viewportCenter: null,
    }),

  collectPositions: () => {
    const { nodes } = get();
    const modules: any[] = [];
    const pages: any[] = [];
    const fields: any[] = [];
    const actions: any[] = [];

    for (const n of nodes) {
      if (n.type === "module") {
        modules.push({ id: n.id, posX: n.position.x, posY: n.position.y });
      } else if (n.type === "page") {
        pages.push({ id: n.id, posX: n.position.x, posY: n.position.y });
      } else if (n.type === "field") {
        fields.push({ id: n.id, posX: n.position.x, posY: n.position.y });
      } else if (n.type === "action") {
        actions.push({ id: n.id, posX: n.position.x, posY: n.position.y });
      }
    }
    return { modules, pages, fields, actions };
  },
}));
