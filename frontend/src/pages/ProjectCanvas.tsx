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
import ConfirmDialog from "../components/canvas/ConfirmDialog";
import { positionsApi } from "../api";

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
  const confirmedAt = useCanvasStore((s) => s.confirmedAt);
  const collectPositions = useCanvasStore((s) => s.collectPositions);
  const loadProject = useCanvasStore((s) => s.loadProject);

  const [activePage, setActivePage] = useState<Page>("review");
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  // ── Save & Confirm handlers ──
  const handleSave = async () => {
    try {
      const positions = collectPositions();
      await positionsApi.saveAll(projectId, positions);
      setToast("保存成功");
    } catch (e) {
      console.error("save error:", e);
      setToast(`保存失败: ${e instanceof Error ? e.message : "未知错误"}`);
    }
    setTimeout(() => setToast(null), 2000);
  };

  const handleConfirmComplete = (project: any) => {
    setShowConfirm(false);
    loadProject(projectId);
    setActivePage("evaluate");
  };

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

      {/* Bottom save/confirm bar */}
      {confirmedAt === null && activePage === "review" && (
        <div
          style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            display: "flex", justifyContent: "center", alignItems: "center",
            padding: "16px 0", gap: 12,
            background: "linear-gradient(transparent, rgba(0,0,0,0.5))",
            zIndex: 100, pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", gap: 12, pointerEvents: "auto" }}>
            <button
              onClick={handleSave}
              style={{
                padding: "8px 24px", borderRadius: theme.radius.sm,
                border: `1px solid ${theme.colors.border.subtle}`,
                background: theme.colors.bg.surface,
                color: theme.colors.text.primary,
                cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}
            >
              💾 保存
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              style={{
                padding: "8px 24px", borderRadius: theme.radius.sm, border: "none",
                background: theme.colors.accent.page, color: "#fff",
                cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}
            >
              ✅ 确认
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
            background: theme.colors.bg.surface, color: theme.colors.text.primary,
            padding: "8px 20px", borderRadius: theme.radius.sm,
            boxShadow: theme.shadow.md, zIndex: 1001, fontSize: 13,
          }}
        >
          {toast}
        </div>
      )}

      {/* Confirm dialog */}
      {showConfirm && (
        <ConfirmDialog
          projectId={projectId}
          positions={collectPositions()}
          onComplete={handleConfirmComplete}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
