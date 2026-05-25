import { theme } from "../../theme/tokens";
import Spinner from "../ui/Spinner";
import VersionItem from "./VersionItem";
import { useVersions } from "./hooks/useVersions";

interface Props {
  projectId: string;
  onRestore?: (version: number) => void;
  onClose?: () => void;
}

export default function VersionTimeline({
  projectId,
  onRestore,
  onClose,
}: Props) {
  const { commits, loading, previewVersion, enterPreview, exitPreview } =
    useVersions(projectId);

  return (
    <div
      style={{
        width: 260,
        background: theme.colors.bg.surface,
        borderLeft: `1px solid ${theme.colors.border.subtle}`,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${theme.colors.border.subtle}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.colors.text.primary,
          }}
        >
          版本历史
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: theme.colors.text.tertiary,
              cursor: "pointer",
              fontSize: 16,
              padding: 4,
              fontFamily: theme.font,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <Spinner />
          </div>
        ) : commits.length === 0 ? (
          <div
            style={{
              color: theme.colors.text.tertiary,
              fontSize: 12,
              textAlign: "center",
              padding: 24,
            }}
          >
            暂无版本记录
          </div>
        ) : (
          commits.map((c) => (
            <VersionItem
              key={c.id}
              version={c.version}
              message={c.message}
              createdAt={c.createdAt}
              isActive={previewVersion === c.version}
              onClick={() => {
                if (previewVersion === c.version) {
                  exitPreview();
                } else {
                  enterPreview(c.version);
                }
              }}
            />
          ))
        )}
      </div>

      {/* Footer info */}
      {previewVersion !== null && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: `1px solid ${theme.colors.border.subtle}`,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: theme.colors.text.tertiary,
              flex: 1,
            }}
          >
            预览 v{previewVersion}
          </span>
          {onRestore && (
            <button
              onClick={() => onRestore(previewVersion)}
              style={{
                padding: "4px 10px",
                background: theme.colors.accent.module,
                color: "#fff",
                border: "none",
                borderRadius: theme.radius.sm,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: theme.font,
              }}
            >
              恢复到此处
            </button>
          )}
          <button
            onClick={exitPreview}
            style={{
              padding: "4px 10px",
              background: theme.colors.bg.elevated,
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.primary}`,
              borderRadius: theme.radius.sm,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: theme.font,
            }}
          >
            退出预览
          </button>
        </div>
      )}
    </div>
  );
}
