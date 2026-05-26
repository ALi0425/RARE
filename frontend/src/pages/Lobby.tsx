import { useEffect, useState, useCallback } from "react";
import { projectsApi } from "../api";
import { theme } from "../theme/tokens";
import ProjectGrid from "../components/lobby/ProjectGrid";
import CreateProjectModal from "../components/lobby/CreateProjectModal";
import RequirementInputModal from "../components/lobby/RequirementInputModal";

interface Props { onOpenProject: (id: string) => void }

export default function Lobby({ onOpenProject }: Props) {
  const [projects, setProjects] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [selectedProject, setSelectedProject] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setProjects((await projectsApi.list()) || []); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const createProject = useCallback(async (name: string) => {
    await projectsApi.create({ name });
    await load();
  }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await projectsApi.delete(id);
      await load();
    } catch (e) {
      console.error("Delete failed:", e);
    }
    setDeleteConfirm(null);
  }, [load]);

  const deletingProject = deleteConfirm ? projects.find((p) => p.id === deleteConfirm) : null;

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
        onOpenProject={(id) => {
          const p = projects.find((x) => x.id === id);
          if (!p) return;
          const c = p._count || {};
          const total = (c.modules || 0) + (c.pages || 0) + (c.fields || 0) + (c.actions || 0);
          if (total === 0) {
            setSelectedProject({ id: p.id, name: p.name });
          } else {
            onOpenProject(id);
          }
        }}
        onCreateClick={() => setShowNew(true)}
        onDeleteProject={(id) => setDeleteConfirm(id)}
      />

      {/* Create modal */}
      {showNew && (
        <CreateProjectModal
          onClose={() => setShowNew(false)}
          onCreate={createProject}
        />
      )}

      {/* Requirement input capsule */}
      {selectedProject && (
        <RequirementInputModal
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          onComplete={() => {
            const id = selectedProject.id;
            setSelectedProject(null);
            onOpenProject(id);
          }}
          onClose={() => setSelectedProject(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && deletingProject && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: theme.colors.bg.overlay,
              zIndex: 999,
            }}
            onClick={() => setDeleteConfirm(null)}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 1000,
              width: 360,
              borderRadius: theme.radius.lg,
              background: theme.colors.bg.surface,
              border: `1px solid ${theme.colors.border.primary}`,
              boxShadow: theme.shadow.lg,
              padding: 28,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: theme.colors.text.primary,
                marginBottom: 12,
              }}
            >
              确认删除
            </div>
            <div
              style={{
                fontSize: 13,
                color: theme.colors.text.secondary,
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              确定要删除项目「{deletingProject.name}」吗？<br />
              此操作不可撤销，所有数据将永久删除。
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: "8px 24px",
                  background: "transparent",
                  border: `1px solid ${theme.colors.border.primary}`,
                  borderRadius: 20,
                  color: theme.colors.text.secondary,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: theme.font,
                }}
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  padding: "8px 24px",
                  background: theme.colors.accent.red,
                  border: "none",
                  borderRadius: 20,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: theme.font,
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
