import { useState, useCallback, useEffect } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useInferenceStore } from "../store/inferenceStore";
import { theme } from "../theme/tokens";
import CanvasHeader from "../components/canvas/CanvasHeader";
import CanvasCore from "../components/canvas/CanvasCore";
import CanvasSideMenu from "../components/canvas/CanvasSideMenu";
import AssetManager from "../components/canvas/AssetManager";
import SmartEvaluation from "../components/canvas/SmartEvaluation";
import ContextMenu from "../components/canvas/menus/ContextMenu";
import EdgeEditDialog from "../components/canvas/menus/EdgeEditDialog";
import { useNodeOperations } from "../components/canvas/hooks/useNodeOperations";
import Spinner from "../components/ui/Spinner";
import InferenceOutput from "../components/inference/InferenceOutput";
import CanvasDiffOverlay from "../components/inference/CanvasDiffOverlay";
import DecisionPanel from "../components/inference/DecisionPanel";
import VersionTimeline from "../components/versions/VersionTimeline";

interface Props {
  projectId: string;
  onBack: () => void;
}

type Page = "review" | "assets" | "evaluate" | "versions";

export default function ProjectCanvas({ projectId, onBack }: Props) {
  const loading = useCanvasStore((s) => s.loading);
  const error = useCanvasStore((s) => s.error);
  const projectName = useCanvasStore((s) => s.projectName);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  const inferenceProcessing = useInferenceStore((s) => s.isProcessing);
  const resetInference = useInferenceStore((s) => s.resetInference);

  const [activePage, setActivePage] = useState<Page>("review");

  // Menus
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
    edgeId?: string;
  } | null>(null);
  const [editEdge, setEditEdge] = useState<any>(null);

  const { deleteNodeById, deleteEdgeById, confirmEdgeById, createNewNode, onLabelSave } =
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

  const handleEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edgeId: string) => {
      setCtxMenu({ x: e.clientX, y: e.clientY, edgeId });
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

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Persistent sidebar */}
        <CanvasSideMenu
          activeItem={activePage}
          onSelect={(id) => setActivePage(id as Page)}
        />

        {/* Content area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* ── Page: Review Canvas ── */}
          {activePage === "review" && (
            <>
              <CanvasCore
                projectId={projectId}
                onContextMenu={handleContextMenu}
                onEdgeContextMenu={handleEdgeContextMenu}
                onEdgeDoubleClick={setEditEdge}
                onLabelSave={onLabelSave}
              />

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
                  edgeId={ctxMenu.edgeId}
                  onClose={() => setCtxMenu(null)}
                  onDelete={deleteNodeById}
                  onDeleteEdge={deleteEdgeById}
                  onConfirmEdge={confirmEdgeById}
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
            </>
          )}

          {/* ── Page: Asset Management ── */}
          {activePage === "assets" && (
            <AssetManager projectId={projectId} />
          )}

          {/* ── Page: Smart Evaluation ── */}
          {activePage === "evaluate" && (
            <SmartEvaluation projectId={projectId} />
          )}

          {/* ── Page: Version Management ── */}
          {activePage === "versions" && (
            <div style={{ width: "100%", height: "100%", maxWidth: 500 }}>
              <VersionTimeline projectId={projectId} fullPage />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
