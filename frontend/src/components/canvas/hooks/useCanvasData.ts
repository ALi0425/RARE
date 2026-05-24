import { useEffect } from "react";
import { useCanvasStore } from "../../../store/canvasStore";

export function useCanvasData(projectId: string) {
  const loadProject = useCanvasStore((s) => s.loadProject);
  const reset = useCanvasStore((s) => s.reset);
  const loading = useCanvasStore((s) => s.loading);
  const error = useCanvasStore((s) => s.error);
  const projectName = useCanvasStore((s) => s.projectName);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  useEffect(() => {
    loadProject(projectId);
    return () => reset();
  }, [projectId, loadProject, reset]);

  return { loading, error, projectName, nodes, edges };
}
