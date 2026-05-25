import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
  useReactFlow,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "../../store/canvasStore";
import { nodeTypes, setOnLabelSave } from "./nodeTypes";
import { useNodeInteractions } from "./hooks/useNodeInteractions";
import { useNodeOperations } from "./hooks/useNodeOperations";
import { theme } from "../../theme/tokens";

interface Props {
  projectId: string;
  onContextMenu: (e: React.MouseEvent, nodeId?: string, nodeType?: string) => void;
  onEdgeDoubleClick: (edge: any) => void;
  onLabelSave: (nodeId: string, label: string) => void;
}

export default function CanvasCore(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasCoreInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasCoreInner({
  projectId,
  onContextMenu,
  onEdgeDoubleClick,
  onLabelSave,
}: Props) {
  const storeNodes = useCanvasStore((s) => s.nodes);
  const storeEdges = useCanvasStore((s) => s.edges);
  const loadKey = useCanvasStore((s) => s.loadKey);

  // Local ReactFlow state — initialized once from store
  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);
  const rf = useReactFlow();
  const prevKey = useRef(loadKey);

  // Sync external store → local state only on loadKey change
  useEffect(() => {
    if (loadKey === prevKey.current) return;
    prevKey.current = loadKey;
    setNodes(storeNodes);
    setEdges(storeEdges);
  }, [loadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const { onNodeDrag, onNodeDragStop, initSpaceListeners } =
    useNodeInteractions(projectId);
  const { onConnect } = useNodeOperations(projectId);

  useEffect(() => {
    const cleanup = initSpaceListeners();
    return cleanup;
  }, [initSpaceListeners]);

  useEffect(() => {
    setOnLabelSave(onLabelSave);
    return () => setOnLabelSave(null);
  }, [onLabelSave]);

  // One-time fitView
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    requestAnimationFrame(() => rf.fitView({ padding: 0.3, maxZoom: 1.5 }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track viewport center for new node placement
  const updateViewportCenter = useCallback(() => {
    try {
      const center = rf.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      useCanvasStore.setState({ viewportCenter: center });
    } catch {}
  }, [rf]);
  useEffect(() => {
    updateViewportCenter();
  }, [updateViewportCenter]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={(e, n) => {
          e.preventDefault();
          onContextMenu(e, n.id, n.type);
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e);
        }}
        onEdgeDoubleClick={(e, edge) => {
          e.preventDefault();
          onEdgeDoubleClick(edge);
        }}
        onMoveEnd={updateViewportCenter}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { stroke: "#555555", strokeWidth: 1.5 },
          markerEnd: { type: "arrowclosed" as any, color: "#555555" },
        }}
        selectionMode={SelectionMode.Partial}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        panOnScroll={false}
        zoomOnScroll={true}
        panOnDrag={[0]}
        selectNodesOnDrag={true}
        nodesDraggable={true}
        style={{ background: theme.colors.bg.app }}
        minZoom={0.05}
        maxZoom={4}
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
  );
}
