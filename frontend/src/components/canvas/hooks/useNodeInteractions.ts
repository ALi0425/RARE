import { useCallback, useRef } from "react";
import type { Node } from "@xyflow/react";
import { useCanvasStore } from "../../../store/canvasStore";
import { request } from "../../../api/client";

// ── Helpers ──

function nodeDefaultSize(type?: string, label = "") {
  if (type === "module") return { w: 160, h: 36 };
  if (type === "page") return { w: 120, h: 36 };
  const tw = [...label].reduce(
    (s, c) => s + (c.charCodeAt(0) > 127 ? 14 : 8),
    0,
  );
  return { w: Math.max(140, tw + 40), h: 32 };
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

function containerDepth(n: Node, allNodes: Node[]): number {
  if (!n.parentId) return 1;
  const p = allNodes.find((x) => x.id === n.parentId);
  if (!p || (p.type !== "module" && p.type !== "page")) return 1;
  return containerDepth(p, allNodes) + 1;
}

function computeFluidBounds(nodes: Node[], containerId: string, minW = 160, minH = 36) {
  const kids = nodes.filter((n) => n.parentId === containerId);
  if (!kids.length) return { w: minW, h: minH };
  let mx = 0, my = 0;
  for (const c of kids) {
    const cw = Number(c.style?.width) || nodeDefaultSize(c.type, c.data?.label).w;
    const ch = Number(c.style?.height) || nodeDefaultSize(c.type, c.data?.label).h;
    mx = Math.max(mx, c.position.x + cw);
    my = Math.max(my, c.position.y + ch);
  }
  return { w: Math.max(mx + 40, minW), h: Math.max(my + 40, minH) };
}

// ── API helpers ──

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
  const body =
    nodeType === "page"
      ? { moduleId: parentId }
      : { pageId: parentId };
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

// ── Hook ──

export function useNodeInteractions(projectId: string) {
  const spaceRef = useRef(false);
  const spaceUsedRef = useRef(false);
  const getNodes = useCanvasStore((s) => () => s.nodes);

  // Space key tracking
  const initSpaceListeners = useCallback(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = true;
        e.preventDefault();
      }
    };
    const ku = () => {
      spaceRef.current = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const onNodeDrag = useCallback((_event: any, node: Node) => {
    if (spaceRef.current && node.parentId) spaceUsedRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(
    async (_event: any, node: Node) => {
      const wasSpace = spaceUsedRef.current;
      spaceUsedRef.current = false;

      const nds = getNodes();
      const apiCalls: Array<() => Promise<void>> = [];

      if (wasSpace && node.parentId) {
        // Detach
        const abs = getNodeAbsPosition(node, nds);
        apiCalls.push(async () => {
          await updateEntityParent(projectId, node.id, node.type, null);
          await updateEntityPosition(
            projectId,
            node.id,
            node.type,
            Math.round(abs.x),
            Math.round(abs.y),
          );
        });
      } else if (!node.parentId) {
        // Check injection into containers
        const nPos = node.position;
        const nw =
          Number(node.style?.width) ||
          nodeDefaultSize(node.type, node.data?.label).w;
        const nh =
          Number(node.style?.height) ||
          nodeDefaultSize(node.type, node.data?.label).h;
        const containers = nds
          .filter(
            (n) =>
              n.id !== node.id &&
              (n.type === "module" || n.type === "page"),
          )
          .map((c) => ({ c, depth: containerDepth(c, nds) }));
        const matches: Array<{
          c: Node;
          depth: number;
          overlap: number;
        }> = [];
        for (const { c, depth } of containers) {
          const ca = getNodeAbsPosition(c, nds);
          const cw = Number(c.style?.width) || 160;
          const ch = Number(c.style?.height) || 36;
          const ox = Math.max(
            0,
            Math.min(nPos.x + nw, ca.x + cw) - Math.max(nPos.x, ca.x),
          );
          const oy = Math.max(
            0,
            Math.min(nPos.y + nh, ca.y + ch) - Math.max(nPos.y, ca.y),
          );
          if (ox > 0 && oy > 0)
            matches.push({ c, depth, overlap: ox * oy });
        }
        matches.sort(
          (a, b) => b.depth - a.depth || b.overlap - a.overlap,
        );
        if (matches.length > 0) {
          const best = matches[0].c;
          const rx = Math.round(nPos.x - best.position.x);
          const ry = Math.round(nPos.y - best.position.y);
          apiCalls.push(async () => {
            await updateEntityParent(projectId, node.id, node.type, best.id);
            await updateEntityPosition(projectId, node.id, node.type, rx, ry);
          });
        }
      }

      if (apiCalls.length > 0) {
        Promise.all(apiCalls.map((fn) => fn())).then(() => {
          useCanvasStore.getState().loadProject(projectId);
        });
      }
    },
    [projectId, getNodes],
  );

  return {
    spaceRef,
    spaceUsedRef,
    initSpaceListeners,
    onNodeDrag,
    onNodeDragStop,
    computeFluidBounds,
  };
}
