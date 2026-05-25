import { theme } from "../../theme/tokens";

interface Props {
  onClick: () => void;
}

export default function CreateProjectCard({ onClick }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: 20,
        borderRadius: theme.radius.md,
        border: `2px dashed ${theme.colors.border.primary}`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        minHeight: 180,
        color: theme.colors.text.tertiary,
        fontSize: 14,
        transition: `all ${theme.transition}`,
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = theme.colors.accent.module;
        e.currentTarget.style.color = theme.colors.accent.module;
        e.currentTarget.style.background = `${theme.colors.accent.module}08`;
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border.primary;
        e.currentTarget.style.color = theme.colors.text.tertiary;
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          fontSize: 28,
          fontWeight: 200,
          lineHeight: 1,
        }}
      >
        +
      </span>
      <span>新建项目</span>
    </div>
  );
}
