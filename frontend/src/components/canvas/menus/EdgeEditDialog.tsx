import { useState } from "react";
import type { Edge } from "@xyflow/react";
import { theme } from "../../../theme/tokens";
import { request } from "../../../api/client";
import { useCanvasStore } from "../../../store/canvasStore";

interface Props {
  edge: Edge;
  projectId: string;
  onClose: () => void;
}

export default function EdgeEditDialog({ edge, projectId, onClose }: Props) {
  const [label, setLabel] = useState(edge.label || "");
  const setEdges = useCanvasStore((s) => s.setEdges);

  const handleSave = () => {
    request(`/edges/${projectId}/${edge.id}`, {
      method: "PATCH",
      body: JSON.stringify({ label }),
    }).catch(() => {});
    setEdges((eds) =>
      eds.map((e) => (e.id === edge.id ? { ...e, label } : e)),
    );
    onClose();
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 998,
          background: theme.colors.bg.overlay,
        }}
        onClick={onClose}
      />
      <div
        className="glass"
        style={{
          position: "fixed",
          top: "40%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 999,
          padding: 20,
          borderRadius: theme.radius.md,
          minWidth: 280,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.colors.text.primary,
          }}
        >
          编辑连线
        </span>
        <input
          placeholder="标签"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          style={{
            padding: "8px 10px",
            background: theme.colors.bg.surface,
            border: `1px solid ${theme.colors.border.primary}`,
            borderRadius: theme.radius.sm,
            fontSize: 13,
            color: theme.colors.text.primary,
            outline: "none",
            fontFamily: theme.font,
          }}
          autoFocus
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            style={{
              padding: "8px 20px",
              border: "none",
              borderRadius: theme.radius.sm,
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: theme.colors.text.secondary,
              fontFamily: theme.font,
            }}
            onClick={onClose}
          >
            取消
          </button>
          <button
            style={{
              padding: "8px 20px",
              border: "none",
              borderRadius: theme.radius.sm,
              background: theme.colors.accent.module,
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: theme.font,
            }}
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>
    </>
  );
}
