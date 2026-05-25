import type { Node } from "@xyflow/react";

type SetNodesFn = (nodes: Node[] | ((prev: Node[]) => Node[])) => void;

let _setNodes: SetNodesFn | null = null;
let _setEdges: SetNodesFn | null = null;

export function setRuntimeSetNodes(fn: SetNodesFn | null) {
  _setNodes = fn;
}
export function setRuntimeSetEdges(fn: SetNodesFn | null) {
  _setEdges = fn;
}

export function updateNodeSize(nodeId: string, w: number, h: number) {
  _setNodes?.((nds) =>
    nds.map((n) =>
      n.id === nodeId
        ? { ...n, style: { ...n.style, width: w, height: h } }
        : n,
    ),
  );
}
