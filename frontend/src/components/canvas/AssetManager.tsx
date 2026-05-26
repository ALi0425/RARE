import { useEffect, useState } from "react";
import { theme } from "../../theme/tokens";
import Spinner from "../ui/Spinner";

interface ProjectFile {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

interface Props {
  projectId: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const previewMimeTypes = ["text/plain", "text/markdown"];

export default function AssetManager({ projectId }: Props) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`http://localhost:3001/api/project-files/${projectId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`请求失败 (${r.status})`);
        return r.json();
      })
      .then((data) => {
        setFiles(data || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [projectId]);

  const handleDownload = (fileId: string, fileName: string) => {
    const a = document.createElement("a");
    a.href = `http://localhost:3001/api/project-files/${projectId}/download/${fileId}`;
    a.download = fileName;
    a.click();
  };

  const handlePreview = async (f: ProjectFile) => {
    if (!previewMimeTypes.some((t) => f.mimeType.startsWith(t) || f.originalName.endsWith(".txt") || f.originalName.endsWith(".md"))) return;
    setPreviewFile(f);
    setPreviewText(null);
    try {
      const res = await fetch(
        `http://localhost:3001/api/project-files/${projectId}/download/${f.id}`,
      );
      const text = await res.text();
      setPreviewText(text.slice(0, 5000));
    } catch {
      setPreviewText("（无法预览）");
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: theme.colors.bg.app,
      }}
    >
      {/* File list */}
      <div
        style={{
          width: previewFile ? 360 : "100%",
          display: "flex",
          flexDirection: "column",
          borderRight: previewFile ? `1px solid ${theme.colors.border.subtle}` : "none",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${theme.colors.border.subtle}`,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: theme.colors.text.primary,
              marginBottom: 4,
            }}
          >
            资产管理
          </div>
          <div
            style={{
              fontSize: 12,
              color: theme.colors.text.tertiary,
            }}
          >
            项目创建时上传的解析文件，共 {files.length} 个文件
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {loading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 48,
                color: theme.colors.text.secondary,
                fontSize: 13,
              }}
            >
              <Spinner /> 加载中...
            </div>
          )}

          {error && (
            <div
              style={{
                padding: 24,
                color: theme.colors.accent.red,
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && files.length === 0 && (
            <div
              style={{
                padding: 48,
                color: theme.colors.text.tertiary,
                fontSize: 13,
                textAlign: "center",
                lineHeight: 1.6,
              }}
            >
              暂无已上传的文件
              <div style={{ fontSize: 11, marginTop: 8, opacity: 0.7 }}>
                在审核画布中通过需求解析上传文档后，文件将在此处展示
              </div>
            </div>
          )}

          {!loading &&
            files.map((f) => {
              const canPreview = previewMimeTypes.some(
                (t) => f.mimeType.startsWith(t) || f.originalName.endsWith(".txt") || f.originalName.endsWith(".md"),
              );
              const isSelected = previewFile?.id === f.id;
              return (
                <div
                  key={f.id}
                  onClick={() => canPreview && handlePreview(f)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: theme.radius.sm,
                    background: isSelected ? theme.colors.bg.hover : "transparent",
                    cursor: canPreview ? "pointer" : "default",
                    borderBottom: `1px solid ${theme.colors.border.subtle}`,
                    transition: `all ${theme.transition}`,
                  }}
                >
                  {/* File icon — SVG */}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={theme.colors.accent.module}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: theme.colors.text.primary,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={f.originalName}
                    >
                      {f.originalName}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: theme.colors.text.tertiary,
                        marginTop: 2,
                      }}
                    >
                      {formatSize(f.fileSize)} · {formatTime(f.createdAt)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {canPreview && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreview(f);
                        }}
                        title="预览"
                        style={{
                          padding: "3px 8px",
                          background: isSelected ? theme.colors.accent.module + "20" : theme.colors.bg.elevated,
                          border: "none",
                          borderRadius: 6,
                          color: isSelected ? theme.colors.accent.module : theme.colors.text.secondary,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        预览
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(f.id, f.originalName);
                      }}
                      title="下载"
                      style={{
                        padding: "3px 8px",
                        background: theme.colors.bg.elevated,
                        border: "none",
                        borderRadius: 6,
                        color: theme.colors.text.secondary,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      下载
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Preview panel */}
      {previewFile && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: theme.colors.bg.app,
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: `1px solid ${theme.colors.border.subtle}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: theme.colors.bg.surface,
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: theme.colors.text.primary,
                fontWeight: 500,
              }}
            >
              {previewFile.originalName}
            </span>
            <button
              onClick={() => setPreviewFile(null)}
              style={{
                background: "none",
                border: "none",
                color: theme.colors.text.tertiary,
                cursor: "pointer",
                fontSize: 16,
                padding: 2,
              }}
            >
              ✕
            </button>
          </div>
          <div
            style={{
              flex: 1,
              padding: 20,
              overflow: "auto",
              fontSize: 13,
              color: theme.colors.text.primary,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              fontFamily: "monospace",
            }}
          >
            {previewText === null ? (
              <div
                style={{
                  color: theme.colors.text.tertiary,
                  textAlign: "center",
                  padding: 40,
                }}
              >
                加载中...
              </div>
            ) : (
              previewText
            )}
          </div>
        </div>
      )}
    </div>
  );
}
