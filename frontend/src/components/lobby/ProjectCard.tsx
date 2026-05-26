import { useState } from "react";
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
  onDelete?: (id: string) => void;
}

export default function ProjectCard({ project, onClick, onDelete }: Props) {
  const [hover, setHover] = useState(false);
  const count = project._count;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 20,
        borderRadius: theme.radius.md,
        background: hover ? theme.colors.bg.elevated : theme.colors.bg.surface,
        border: `1px solid ${hover ? theme.colors.border.primary : theme.colors.border.subtle}`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 180,
        transition: `all ${theme.transition}`,
        position: "relative",
      }}
    >
      {/* Delete button — top right */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project.id);
          }}
          title="删除项目"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 28,
            height: 28,
            borderRadius: 8,
            border: "none",
            background: hover ? `${theme.colors.accent.red}20` : "transparent",
            color: hover ? theme.colors.accent.red : theme.colors.text.tertiary,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: `all ${theme.transition}`,
          }}
        >
          ✕
        </button>
      )}

      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: `${theme.colors.accent.module}20`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: theme.colors.accent.module,
          fontSize: 18,
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
