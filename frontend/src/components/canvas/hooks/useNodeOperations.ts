import { useCallback } from "react";
import type { Node, Edge, Connection } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import { request } from "../../../api/client";
import { edgesApi } from "../../../api";
import { useCanvasStore } from "../../../store/canvasStore";

function nodeDefaultSize(type?: string, label = "") {
  if (type === "module") return { w: 160, h: 36 };
  if (type === "page") return { w: 120, h: 36 };
  const tw = [...label].reduce((s, c) => s + (c.charCodeAt(0) > 127 ? 14 : 8), 0);
  return { w: Math.max(140, tw + 40), h: 52 };
}

function getNodeAbsPosition(node: Node, allNodes: Node[]) {
  let x = node.position.x,
    y = node.position.y;
  let p = node.parentId
    ? allNodes.find((n) => n.id === node.parentId)
    : null;
  while (p) {
    x += p.position.x;
    y += p.position.y;
    p = p.parentId ? allNodes.find((n) => n.id === p.parentId) : null;
  }
  return { x, y };
}

export function useNodeOperations(projectId: string) {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);

  // Delete node (orphan children)
  const deleteNodeById = useCallback(
    (nodeId: string) => {
      const nodes = useCanvasStore.getState().nodes;
      const n = nodes.find((x) => x.id === nodeId);
      if (!n) return;

      const children = nodes.filter((c) => c.parentId === nodeId);

      // Orphan children in frontend
      setNodes((nds) => {
        const filtered = nds.filter((x) => x.id !== nodeId);
        for (const child of children) {
          const abs = getNodeAbsPosition(child, nds);
          filtered.push({
            ...child,
            parentId: undefined,
            extent: undefined,
            position: { x: abs.x, y: abs.y },
            data: { ...child.data },
          });
        }
        return filtered;
      });

      // Orphan children in backend + delete parent
      for (const child of children) {
        const abs = getNodeAbsPosition(child, nodes);
        updateEntityParent(projectId, child.id, child.type, null);
        updateEntityPosition(
          projectId,
          child.id,
          child.type,
          Math.round(abs.x),
          Math.round(abs.y),
        );
      }

      const prefix =
        n.type === "module"
          ? "modules"
          : n.type === "page"
            ? "pages"
            : n.type === "field"
              ? "fields"
              : "actions";
      request(`/assets/${projectId}/${prefix}/${nodeId}`, {
        method: "DELETE",
      }).catch(console.warn);
    },
    [projectId, setNodes],
  );

  // Create new node
  const createNewNode = useCallback(
    (type: string, customName?: string) => {
      const label =
        customName ||
        (type === "module"
          ? "新模块"
          : type === "page"
            ? "新页面"
            : type === "field"
              ? "新字段"
              : "新操作");

      // Position at viewport center with slight random offset
      const vpCenter = useCanvasStore.getState().viewportCenter;
      const pos = vpCenter
        ? {
            x: vpCenter.x + (Math.random() - 0.5) * 80,
            y: vpCenter.y + (Math.random() - 0.5) * 80,
          }
        : {
            x: 200 + Math.random() * 400,
            y: 100 + Math.random() * 300,
          };

      // Auto-inject into matching parent container (use abs position for overlap check)
      const allNodes = useCanvasStore.getState().nodes;
      let parentId: string | undefined;
      let parentType: string | undefined;
      if (type === "page") parentType = "module";
      else if (type === "field" || type === "action") parentType = "page";

      if (parentType) {
        const s = nodeDefaultSize(type, label);
        for (const n of allNodes) {
          if (n.type !== parentType) continue;
          const nAbs = getNodeAbsPosition(n, allNodes);
          const cw = Number(n.style?.width) || 160;
          const ch = Number(n.style?.height) || 36;
          const ox = Math.max(
            0,
            Math.min(pos.x + s.w, nAbs.x + cw) - Math.max(pos.x, nAbs.x),
          );
          const oy = Math.max(
            0,
            Math.min(pos.y + s.h, nAbs.y + ch) - Math.max(pos.y, nAbs.y),
          );
          if (ox > 0 && oy > 0) {
            parentId = n.id;
            // Convert to parent-relative position
            pos.x = Math.round(pos.x - nAbs.x);
            pos.y = Math.round(pos.y - nAbs.y);
            break;
          }
        }
      }

      const node: Node = {
        id: `new-${type}-${Date.now()}`,
        type,
        position: pos,
        data: { label },
        parentId: parentId || undefined,
        extent: parentId ? ("parent" as const) : undefined,
        style: (type === "module" || type === "page")
          ? { border: type === "module" ? "1px solid #5e6ad2" : "1px solid #34d399", borderRadius: 10, boxSizing: "border-box" as const }
          : undefined,
      };

      const apis: Record<string, string> = {
        module: "modules",
        page: "pages",
        field: "fields",
        action: "actions",
      };

      // Backend stores absolute canvas coordinates (convertProjectToFlow expects absolute)
      let backendPosX = pos.x;
      let backendPosY = pos.y;
      if (parentId) {
        const pAbs = getNodeAbsPosition(
          allNodes.find((n) => n.id === parentId)!,
          allNodes,
        );
        backendPosX = pos.x + pAbs.x;
        backendPosY = pos.y + pAbs.y;
      }

      const body: Record<string, any> = { name: label };
      if (parentId) {
        if (type === "page") body.moduleId = parentId;
        else body.pageId = parentId;
      }
      body.posX = Math.round(backendPosX);
      body.posY = Math.round(backendPosY);
      request(`/assets/${projectId}/${apis[type]}`, {
        method: "POST",
        body: JSON.stringify(body),
      }).catch(console.warn);

      setNodes((nds) => [...nds, node]);
    },
    [projectId, setNodes],
  );

  // Connect edges
  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      const edge: Edge = {
        id: `edge-${Date.now()}`,
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle,
        targetHandle: conn.targetHandle,
        type: "smoothstep",
        style: { stroke: "#555555", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#555555" },
      };
      setEdges((eds) => [...eds, edge]);
      request(`/edges/${projectId}`, {
        method: "POST",
        body: JSON.stringify({
          sourceId: conn.source,
          targetId: conn.target,
          label: conn.sourceHandle || "",
        }),
      }).catch(console.warn);
    },
    [projectId, setEdges],
  );

  // Delete edge
  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      // API call: for DB-backed edges (UUID) this works; for freshly created
      // edges the frontend ID won't match the backend record — that's OK
      edgesApi.delete(projectId, edgeId).catch(console.warn);
    },
    [projectId, setEdges],
  );

  // Update label
  const onLabelSave = useCallback(
    (nodeId: string, label: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
        ),
      );
      const n = useCanvasStore.getState().nodes.find(
        (x) => x.id === nodeId,
      );
      if (!n) return;
      const prefix =
        n.type === "module"
          ? "modules"
          : n.type === "page"
            ? "pages"
            : n.type === "field"
              ? "fields"
              : "actions";
      request(`/assets/${projectId}/${prefix}/${nodeId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: label }),
      }).catch(console.warn);
    },
    [projectId, setNodes],
  );

  return { deleteNodeById, deleteEdgeById, createNewNode, onConnect, onLabelSave };
}

// ── Pure helpers used by multiple hooks ──

async function updateEntityParent(
  projectId: string,
  nodeId: string,
  nodeType: string | undefined,
  parentId: string | null,
) {
  const ep =
    nodeType === "page"
      ? `/assets/${projectId}/pages/${nodeId}`
      : nodeType === "field"
        ? `/assets/${projectId}/fields/${nodeId}`
        : `/assets/${projectId}/actions/${nodeId}`;
  const body = nodeType === "page" ? { moduleId: parentId } : { pageId: parentId };
  try {
    await request(ep, { method: "PATCH", body: JSON.stringify(body) });
  } catch (err) {
    console.warn("update parent failed:", err);
  }
}

async function updateEntityPosition(
  projectId: string,
  nodeId: string,
  nodeType: string | undefined,
  posX: number,
  posY: number,
) {
  const prefix =
    nodeType === "module"
      ? "modules"
      : nodeType === "page"
        ? "pages"
        : nodeType === "field"
          ? "fields"
          : "actions";
  try {
    await request(`/assets/${projectId}/${prefix}/${nodeId}`, {
      method: "PATCH",
      body: JSON.stringify({ posX, posY }),
    });
  } catch (err) {
    console.warn("update position failed:", err);
  }
}
