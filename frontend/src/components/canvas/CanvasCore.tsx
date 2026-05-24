import { useCallback, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
  type Node,
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

export default function CanvasCore({
  projectId,
  onContextMenu,
  onEdgeDoubleClick,
  onLabelSave,
}: Props) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { onNodeDrag, onNodeDragStop, initSpaceListeners } =
    useNodeInteractions(projectId);
  const { onConnect } = useNodeOperations(projectId);

  // Init space key listeners
  useEffect(() => {
    const cleanup = initSpaceListeners();
    return cleanup;
  }, [initSpaceListeners]);

  // Register label save handler
  useEffect(() => {
    setOnLabelSave(onLabelSave);
    return () => setOnLabelSave(null);
  }, [onLabelSave]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <div
      ref={reactFlowWrapper}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
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
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { stroke: "#555555", strokeWidth: 1.5 },
          markerEnd: { type: "arrowclosed" as any, color: "#555555" },
        }}
        selectionMode={SelectionMode.Partial}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.5 }}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        panOnScroll={false}
        zoomOnScroll={true}
        panOnDrag={[2]}
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
