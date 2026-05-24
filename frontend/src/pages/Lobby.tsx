import { useEffect, useState, useCallback } from "react";
import { projectsApi } from "../api";
import { theme } from "../theme/tokens";
import ProjectGrid from "../components/lobby/ProjectGrid";
import CreateProjectModal from "../components/lobby/CreateProjectModal";

interface Props { onOpenProject: (id: string) => void }

export default function Lobby({ onOpenProject }: Props) {
  const [projects, setProjects] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try { setProjects((await projectsApi.list()) || []); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createProject = useCallback(async (name: string) => {
    await projectsApi.create({ name });
    await load();
  }, [load]);

  return (
    <div
      style={{
        padding: "40px 60px",
        minHeight: "100vh",
        background: theme.colors.bg.app,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 40,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: theme.colors.text.primary,
            letterSpacing: -0.5,
          }}
        >
          RARE
        </span>
        <span
          style={{
            color: theme.colors.text.tertiary,
            fontSize: 12,
          }}
        >
          v0.1
        </span>
      </div>

      {/* Section */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 24,
          borderBottom: `1px solid ${theme.colors.border.subtle}`,
          paddingBottom: 12,
        }}
      >
        <span
          style={{
            color: theme.colors.text.primary,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          活跃项目
        </span>
        <span
          style={{
            color: theme.colors.text.tertiary,
            fontSize: 13,
          }}
        >
          {projects.length}
        </span>
      </div>

      {/* Project grid */}
      <ProjectGrid
        projects={projects}
        onOpenProject={onOpenProject}
        onCreateClick={() => setShowNew(true)}
      />

      {/* Create modal */}
      {showNew && (
        <CreateProjectModal
          onClose={() => setShowNew(false)}
          onCreate={createProject}
        />
      )}
    </div>
  );
}
