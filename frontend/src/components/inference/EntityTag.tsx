import { theme } from "../../theme/tokens";
import type { EntityTagData } from "../../store/inferenceStore";

interface Props {
  entity: EntityTagData;
  onClick?: () => void;
}

const typeLabels: Record<string, string> = {
  module: "模块",
  page: "页面",
  field: "字段",
  action: "操作",
};

export default function EntityTag({ entity, onClick }: Props) {
  const isNew = entity.isNew;

  return (
    <span
      onClick={onClick}
      title={isNew ? "点击编辑" : "已有实体"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: theme.radius.sm,
        fontSize: 12,
        fontFamily: theme.font,
        cursor: onClick ? "pointer" : "default",
        transition: `all ${theme.transition}`,
        background: isNew
          ? "rgba(52,211,153,0.12)"
          : theme.colors.bg.elevated,
        border: `1px solid ${
          isNew ? "rgba(52,211,153,0.3)" : theme.colors.border.primary
        }`,
        color: isNew ? theme.colors.accent.page : theme.colors.text.secondary,
      }}
    >
      {isNew && (
        <span style={{ fontSize: 10 }}>✨</span>
      )}
      <span style={{ fontWeight: 500 }}>
        {typeLabels[entity.type] || entity.type}: {entity.name}
      </span>
      {!isNew && entity.id && (
        <span style={{ fontSize: 9, opacity: 0.6 }}>✓</span>
      )}
    </span>
  );
}
