import { useCallback } from "react";
import type { Node, Edge, Connection } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import { request } from "../../../api/client";
import { useCanvasStore } from "../../../store/canvasStore";

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

      const node: Node = {
        id: `new-${type}-${Date.now()}`,
        type,
        position: { x: 200 + Math.random() * 400, y: 100 + Math.random() * 300 },
        data: { label },
      };

      const apis: Record<string, string> = {
        module: "modules",
        page: "pages",
        field: "fields",
        action: "actions",
      };

      request(`/assets/${projectId}/${apis[type]}`, {
        method: "POST",
        body: JSON.stringify({
          name: label,
          posX: node.position.x,
          posY: node.position.y,
        }),
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
    },
    [setEdges],
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

  return { deleteNodeById, createNewNode, onConnect, onLabelSave };
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
