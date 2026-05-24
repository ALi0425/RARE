import { useState, useCallback, useEffect } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useInferenceStore } from "../store/inferenceStore";
import { theme } from "../theme/tokens";
import CanvasHeader from "../components/canvas/CanvasHeader";
import CanvasCore from "../components/canvas/CanvasCore";
import ContextMenu from "../components/canvas/menus/ContextMenu";
import EdgeEditDialog from "../components/canvas/menus/EdgeEditDialog";
import { useNodeOperations } from "../components/canvas/hooks/useNodeOperations";
import Spinner from "../components/ui/Spinner";
import SmartInputBar from "../components/inference/SmartInputBar";
import InferenceOutput from "../components/inference/InferenceOutput";
import CanvasDiffOverlay from "../components/inference/CanvasDiffOverlay";
import DecisionPanel from "../components/inference/DecisionPanel";
import VersionTimeline from "../components/versions/VersionTimeline";

interface Props {
  projectId: string;
  onBack: () => void;
}

export default function ProjectCanvas({ projectId, onBack }: Props) {
  const loading = useCanvasStore((s) => s.loading);
  const error = useCanvasStore((s) => s.error);
  const projectName = useCanvasStore((s) => s.projectName);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const loadProject = useCanvasStore((s) => s.loadProject);

  const inferenceProcessing = useInferenceStore((s) => s.isProcessing);
  const resetInference = useInferenceStore((s) => s.resetInference);

  const [showTimeline, setShowTimeline] = useState(false);

  // Menus
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
  } | null>(null);
  const [editEdge, setEditEdge] = useState<any>(null);

  const { deleteNodeById, createNewNode, onLabelSave } =
    useNodeOperations(projectId);

  useEffect(() => {
    resetInference();
  }, [resetInference]);

  // ── Context menu ──
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, nodeId?: string) => {
      setCtxMenu({ x: e.clientX, y: e.clientY, nodeId });
    },
    [],
  );

  // ── Loading state ──
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 10,
          background: theme.colors.bg.app,
          color: theme.colors.text.secondary,
          fontSize: 14,
        }}
      >
        <Spinner /> 加载中...
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: theme.colors.bg.app,
        position: "relative",
      }}
    >
      {/* Header */}
      <CanvasHeader
        projectName={projectName}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        onBack={onBack}
        parsing={inferenceProcessing}
        error={error || undefined}
      />

      {/* Canvas + Timeline */}
      <div style={{ flex: 1, position: "relative", display: "flex", overflow: "hidden" }}>
        {showTimeline && (
          <VersionTimeline
            projectId={projectId}
            onClose={() => setShowTimeline(false)}
          />
        )}

        <div style={{ flex: 1, position: "relative" }}>
          <CanvasCore
            projectId={projectId}
            onContextMenu={handleContextMenu}
            onEdgeDoubleClick={setEditEdge}
            onLabelSave={onLabelSave}
          />

          {/* Version toggle button */}
          <button
            onClick={() => setShowTimeline((v) => !v)}
            title={showTimeline ? "关闭版本历史" : "版本历史"}
            style={{
              position: "absolute",
              top: 12,
              left: showTimeline ? 270 : 12,
              zIndex: 20,
              padding: "6px 10px",
              background: theme.colors.bg.surface,
              border: `1px solid ${theme.colors.border.subtle}`,
              borderRadius: theme.radius.sm,
              color: theme.colors.text.secondary,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: theme.font,
              transition: `left ${theme.transition}`,
            }}
          >
            {showTimeline ? "✕" : "⏱"}
          </button>

          {/* Inference overlays */}
          <InferenceOutput />
          <CanvasDiffOverlay />
          <DecisionPanel projectId={projectId} />

          {/* Context menu */}
          {ctxMenu && (
            <ContextMenu
              x={ctxMenu.x}
              y={ctxMenu.y}
              nodeId={ctxMenu.nodeId}
              onClose={() => setCtxMenu(null)}
              onDelete={deleteNodeById}
              onCreate={createNewNode}
            />
          )}

          {/* Edge edit dialog */}
          {editEdge && (
            <EdgeEditDialog
              edge={editEdge}
              projectId={projectId}
              onClose={() => setEditEdge(null)}
            />
          )}
        </div>
      </div>

      {/* Smart input bar */}
      <SmartInputBar projectId={projectId} />
    </div>
  );
}
