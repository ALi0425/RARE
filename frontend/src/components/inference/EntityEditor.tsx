import { useState } from "react";
import { theme } from "../../theme/tokens";
import { useInferenceStore, type EntityTagData } from "../../store/inferenceStore";

interface Props {
  entity: EntityTagData;
  index: number;
  onClose: () => void;
}

const typeOptions: Array<{ value: string; label: string }> = [
  { value: "module", label: "模块" },
  { value: "page", label: "页面" },
  { value: "field", label: "字段" },
  { value: "action", label: "操作" },
];

export default function EntityEditor({ entity, index, onClose }: Props) {
  const updateEntity = useInferenceStore((s) => s.updateEntity);
  const [name, setName] = useState(entity.name);
  const [type, setType] = useState(entity.type);

  const handleSave = () => {
    updateEntity(index, { name, type: type as EntityTagData["type"] });
    onClose();
  };

  return (
    <div
      style={{
        padding: 12,
        background: theme.colors.bg.surface,
        borderRadius: theme.radius.sm,
        border: `1px solid ${theme.colors.border.primary}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: theme.colors.text.tertiary,
          textTransform: "uppercase",
        }}
      >
        编辑实体
      </span>

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span
            style={{
              fontSize: 10,
              color: theme.colors.text.tertiary,
              marginBottom: 4,
              display: "block",
            }}
          >
            名称
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              background: theme.colors.bg.elevated,
              border: `1px solid ${theme.colors.border.primary}`,
              borderRadius: theme.radius.sm,
              fontSize: 12,
              color: theme.colors.text.primary,
              outline: "none",
              fontFamily: theme.font,
            }}
          />
        </div>
        <div style={{ width: 100 }}>
          <span
            style={{
              fontSize: 10,
              color: theme.colors.text.tertiary,
              marginBottom: 4,
              display: "block",
            }}
          >
            类型
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              background: theme.colors.bg.elevated,
              border: `1px solid ${theme.colors.border.primary}`,
              borderRadius: theme.radius.sm,
              fontSize: 12,
              color: theme.colors.text.primary,
              outline: "none",
              fontFamily: theme.font,
            }}
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{
            padding: "4px 12px",
            border: "none",
            borderRadius: theme.radius.sm,
            background: "transparent",
            color: theme.colors.text.secondary,
            cursor: "pointer",
            fontSize: 12,
            fontFamily: theme.font,
          }}
        >
          取消
        </button>
        <button
          onClick={handleSave}
          style={{
            padding: "4px 12px",
            border: "none",
            borderRadius: theme.radius.sm,
            background: theme.colors.accent.module,
            color: "#fff",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            fontFamily: theme.font,
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
}
