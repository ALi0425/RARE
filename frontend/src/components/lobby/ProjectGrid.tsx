import { theme } from "../../theme/tokens";
import ProjectCard from "./ProjectCard";
import CreateProjectCard from "./CreateProjectCard";

interface Props {
  projects: Array<{
    id: string;
    name: string;
    description?: string | null;
    updatedAt: string;
    _count?: { modules: number; pages: number; fields: number; actions: number };
  }>;
  onOpenProject: (id: string) => void;
  onCreateClick: () => void;
}

export default function ProjectGrid({
  projects,
  onOpenProject,
  onCreateClick,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <CreateProjectCard onClick={onCreateClick} />
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          onClick={() => onOpenProject(p.id)}
        />
      ))}
    </div>
  );
}
