import { theme } from "../../theme/tokens";

interface Props {
  project: {
    id: string;
    name: string;
    description?: string | null;
    updatedAt: string;
    _count?: { modules: number; pages: number; fields: number; actions: number };
  };
  onClick: () => void;
}

export default function ProjectCard({ project, onClick }: Props) {
  const count = project._count;

  return (
    <div
      onClick={onClick}
      style={{
        width: 240,
        padding: 18,
        borderRadius: theme.radius.md,
        background: theme.colors.bg.surface,
        border: `1px solid ${theme.colors.border.subtle}`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: `all ${theme.transition}`,
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border.primary;
        e.currentTarget.style.background = theme.colors.bg.elevated;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border.subtle;
        e.currentTarget.style.background = theme.colors.bg.surface;
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${theme.colors.accent.module}20`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: theme.colors.accent.module,
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        {project.name.charAt(0).toUpperCase()}
      </div>

      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: theme.colors.text.primary,
            marginBottom: 4,
          }}
        >
          {project.name}
        </div>
        {project.description && (
          <div
            style={{
              fontSize: 12,
              color: theme.colors.text.tertiary,
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {project.description}
          </div>
        )}
      </div>

      {count && (
        <div
          style={{
            display: "flex",
            gap: 8,
            fontSize: 11,
            color: theme.colors.text.tertiary,
          }}
        >
          <span>{count.modules || 0} 模块</span>
          <span>·</span>
          <span>{count.pages || 0} 页面</span>
          <span>·</span>
          <span>{(count.fields || 0) + (count.actions || 0)} 原子</span>
        </div>
      )}

      <div
        style={{
          fontSize: 10,
          color: theme.colors.text.tertiary,
          opacity: 0.6,
        }}
      >
        {new Date(project.updatedAt).toLocaleDateString("zh-CN", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}
