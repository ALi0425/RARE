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
  let minX = Infinity, minY = Infinity, mx = -Infinity, my = -Infinity;
  for (const c of kids) {
    const px = c.position?.x;
    const py = c.position?.y;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const cw = Number(c.style?.width) || nodeDefaultSize(c.type, c.data?.label).w;
    const ch = Number(c.style?.height) || nodeDefaultSize(c.type, c.data?.label).h;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    mx = Math.max(mx, px + cw);
    my = Math.max(my, py + ch);
  }
  if (!Number.isFinite(mx)) return { w: minW, h: minH };
  return {
    w: Math.max(mx - minX + 32, minW),
    h: Math.max(my - minY + 24, minH),
  };
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
  const getNodes = useCallback(() => useCanvasStore.getState().nodes, []);
  const dragResizeThrottle = useRef(0);

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

    // Real-time parent container resize (throttled to ~50ms)
    if (node.parentId) {
      const now = Date.now();
      if (now - dragResizeThrottle.current < 50) return;
      dragResizeThrottle.current = now;

      const allNodes = getNodes();
      const merged = allNodes.map((n) =>
        n.id === node.id
          ? { ...n, position: { x: node.position.x, y: node.position.y } }
          : n,
      );
      const bounds = computeFluidBounds(merged, node.parentId);
      const parent = allNodes.find((n) => n.id === node.parentId);
      if (parent && (Number(parent.style?.width) !== bounds.w || Number(parent.style?.height) !== bounds.h)) {
        useCanvasStore.setState({
          nodes: merged.map((n) =>
            n.id === node.parentId
              ? { ...n, style: { ...n.style, width: bounds.w, height: bounds.h } }
              : n,
          ),
        });
        // Direct DOM resize to avoid disrupting ReactFlow's drag state
        const el = document.querySelector(`[data-id="${node.parentId}"]`) as HTMLElement | null;
        if (el) {
          el.style.width = `${bounds.w}px`;
          el.style.height = `${bounds.h}px`;
        }
      }
    }
  }, [getNodes]);

  const onNodeDragStop = useCallback(
    async (_event: any, node: Node) => {
      const wasSpace = spaceUsedRef.current && spaceRef.current;
      spaceUsedRef.current = false;

      // Skip clicks without actual drag (position unchanged)
      const prev = getNodes().find((n) => n.id === node.id);
      if (
        prev &&
        prev.position.x === node.position.x &&
        prev.position.y === node.position.y
      ) {
        return;
      }

      const oldNodes = getNodes();
      // Merge the dragged node's new position into the snapshot
      let updatedNodes = oldNodes.map((n) =>
        n.id === node.id
          ? { ...n, position: { x: node.position.x, y: node.position.y } }
          : n,
      );
      const abs = getNodeAbsPosition(node, oldNodes);
      const parentsToResize = new Set<string>();

      if (wasSpace && node.parentId) {
        // ── Space+drag: Detach from parent, then check injection into new container ──
        updateEntityParent(projectId, node.id, node.type, null);
        parentsToResize.add(node.parentId);

        // After detach, check for injection into a new container
        const nw =
          Number(node.style?.width) ||
          nodeDefaultSize(node.type, node.data?.label).w;
        const nh =
          Number(node.style?.height) ||
          nodeDefaultSize(node.type, node.data?.label).h;
        const validParentTypes: string[] =
          node.type === "page"
            ? ["module"]
            : node.type === "field" || node.type === "action"
              ? ["page"]
              : [];
        const containers = oldNodes
          .filter(
            (n) =>
              n.id !== node.id && validParentTypes.includes(n.type),
          )
          .map((c) => ({ c, depth: containerDepth(c, oldNodes) }));
        const matches: Array<{
          c: Node;
          depth: number;
          overlap: number;
        }> = [];
        for (const { c, depth } of containers) {
          const ca = getNodeAbsPosition(c, oldNodes);
          const cw = Number(c.style?.width) || 160;
          const ch = Number(c.style?.height) || 36;
          const ox = Math.max(
            0,
            Math.min(abs.x + nw, ca.x + cw) - Math.max(abs.x, ca.x),
          );
          const oy = Math.max(
            0,
            Math.min(abs.y + nh, ca.y + ch) - Math.max(abs.y, ca.y),
          );
          if (ox > 0 && oy > 0)
            matches.push({ c, depth, overlap: ox * oy });
        }
        matches.sort(
          (a, b) => b.depth - a.depth || b.overlap - a.overlap,
        );

        if (matches.length > 0 && matches[0].c.id !== node.parentId) {
          const best = matches[0].c;
          const ba = getNodeAbsPosition(best, oldNodes);
          const rx = Math.round(abs.x - ba.x);
          const ry = Math.round(abs.y - ba.y);
          updateEntityParent(
            projectId,
            node.id,
            node.type,
            best.id,
          );
          updateEntityPosition(
            projectId,
            node.id,
            node.type,
            rx,
            ry,
          );
          parentsToResize.add(best.id);
          updatedNodes = updatedNodes.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  parentId: best.id,
                  position: { x: rx, y: ry },
                  extent: "parent" as const,
                }
              : n,
          );
        } else {
          // No new container found — save absolute position
          updateEntityPosition(
            projectId,
            node.id,
            node.type,
            Math.round(abs.x),
            Math.round(abs.y),
          );
          updatedNodes = updatedNodes.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  parentId: undefined,
                  position: { x: Math.round(abs.x), y: Math.round(abs.y) },
                }
              : n,
          );
        }
      } else if (node.parentId) {
        // ── Normal drag within parent — save position, resize parent, check re-injection ──
        const nw =
          Number(node.style?.width) ||
          nodeDefaultSize(node.type, node.data?.label).w;
        const nh =
          Number(node.style?.height) ||
          nodeDefaultSize(node.type, node.data?.label).h;

        // Determine valid parent types for this node type
        const validParentTypes: string[] =
          node.type === "page"
            ? ["module"]
            : node.type === "field" || node.type === "action"
              ? ["page"]
              : [];

        // Check for re-injection into a different container
        const containers = oldNodes
          .filter(
            (n) =>
              n.id !== node.id &&
              validParentTypes.includes(n.type),
          )
          .map((c) => ({ c, depth: containerDepth(c, oldNodes) }));
        const matches: Array<{
          c: Node;
          depth: number;
          overlap: number;
        }> = [];
        for (const { c, depth } of containers) {
          const ca = getNodeAbsPosition(c, oldNodes);
          const cw = Number(c.style?.width) || 160;
          const ch = Number(c.style?.height) || 36;
          const ox = Math.max(
            0,
            Math.min(abs.x + nw, ca.x + cw) - Math.max(abs.x, ca.x),
          );
          const oy = Math.max(
            0,
            Math.min(abs.y + nh, ca.y + ch) - Math.max(abs.y, ca.y),
          );
          if (ox > 0 && oy > 0)
            matches.push({ c, depth, overlap: ox * oy });
        }
        matches.sort(
          (a, b) => b.depth - a.depth || b.overlap - a.overlap,
        );

        const bestContainer =
          matches.length > 0 ? matches[0].c : null;
        if (bestContainer && bestContainer.id !== node.parentId) {
          // Reparent to new container
          const ba = getNodeAbsPosition(bestContainer, oldNodes);
          const rx = Math.round(abs.x - ba.x);
          const ry = Math.round(abs.y - ba.y);
          updateEntityParent(
            projectId,
            node.id,
            node.type,
            bestContainer.id,
          );
          updateEntityPosition(
            projectId,
            node.id,
            node.type,
            rx,
            ry,
          );
          parentsToResize.add(bestContainer.id);
          parentsToResize.add(node.parentId); // old parent
          updatedNodes = updatedNodes.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  parentId: bestContainer.id,
                  position: { x: rx, y: ry },
                  extent: "parent" as const,
                }
              : n,
          );
        } else {
          // Stay in current parent — save position
          updateEntityPosition(
            projectId,
            node.id,
            node.type,
            Math.round(abs.x),
            Math.round(abs.y),
          );
          parentsToResize.add(node.parentId);
        }
      } else {
        // ── Top-level drag — save position, then check injection into containers ──
        const nPos = node.position;

        // Always save top-level position to backend
        updateEntityPosition(
          projectId,
          node.id,
          node.type,
          Math.round(nPos.x),
          Math.round(nPos.y),
        );

        // Check for injection into a parent container
        const nw =
          Number(node.style?.width) ||
          nodeDefaultSize(node.type, node.data?.label).w;
        const nh =
          Number(node.style?.height) ||
          nodeDefaultSize(node.type, node.data?.label).h;
        const validParentTypes: string[] =
          node.type === "page"
            ? ["module"]
            : node.type === "field" || node.type === "action"
              ? ["page"]
              : [];
        const containers = oldNodes
          .filter(
            (n) =>
              n.id !== node.id &&
              validParentTypes.includes(n.type),
          )
          .map((c) => ({ c, depth: containerDepth(c, oldNodes) }));
        const matches: Array<{
          c: Node;
          depth: number;
          overlap: number;
        }> = [];
        for (const { c, depth } of containers) {
          const ca = getNodeAbsPosition(c, oldNodes);
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
          const ba = getNodeAbsPosition(best, oldNodes);
          const rx = Math.round(nPos.x - ba.x);
          const ry = Math.round(nPos.y - ba.y);
          updateEntityParent(projectId, node.id, node.type, best.id);
          updateEntityPosition(projectId, node.id, node.type, rx, ry);
          parentsToResize.add(best.id);
          updatedNodes = updatedNodes.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  parentId: best.id,
                  position: { x: rx, y: ry },
                  extent: "parent" as const,
                }
              : n,
          );
        }
      }

      // ── Auto-resize affected parent containers ──
      for (const pid of parentsToResize) {
        const bounds = computeFluidBounds(updatedNodes, pid);
        updatedNodes = updatedNodes.map((n) =>
          n.id === pid
            ? {
                ...n,
                style: { ...n.style, width: bounds.w, height: bounds.h },
              }
            : n,
        );
      }

      // ── Sync to store (triggers ReactFlow update via loadKey) ──
      useCanvasStore.getState().patchNodes(updatedNodes);
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
