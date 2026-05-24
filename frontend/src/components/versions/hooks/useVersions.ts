import { useCallback, useEffect } from "react";
import { useVersionStore } from "../../../store/versionStore";

export function useVersions(projectId: string) {
  const commits = useVersionStore((s) => s.commits);
  const loading = useVersionStore((s) => s.loading);
  const previewMode = useVersionStore((s) => s.previewMode);
  const previewVersion = useVersionStore((s) => s.previewVersion);
  const loadCommits = useVersionStore((s) => s.loadCommits);
  const enterPreview = useVersionStore((s) => s.enterPreview);
  const exitPreview = useVersionStore((s) => s.exitPreview);

  useEffect(() => {
    loadCommits(projectId);
  }, [projectId, loadCommits]);

  const refresh = useCallback(() => {
    loadCommits(projectId);
  }, [projectId, loadCommits]);

  return {
    commits,
    loading,
    previewMode,
    previewVersion,
    enterPreview,
    exitPreview,
    refresh,
  };
}
