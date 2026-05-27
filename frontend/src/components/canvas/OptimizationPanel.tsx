import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { request } from "../../api/client";
import { theme } from "../../theme/tokens";
import Spinner from "../ui/Spinner";

// ── Types ──

interface EntityOption {
  id: string;
  name: string;
  type: "module" | "page" | "field" | "action";
}

interface RefineResult {
  refinedText: string;
  entities: Array<{
    name: string;
    type: string;
    isNew: boolean;
    id?: string;
  }>;
}

type PanelState = "input" | "loading" | "result";

type ParsedSegment =
  | { type: "text"; text: string }
  | { type: "existing"; name: string; kind: string }
  | { type: "new"; name: string; kind: string };

// ── Helpers ──

function parseResult(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const re = /[【{]([^】}]+?)[】}]|([^【{]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[2] !== undefined) {
      segments.push({ type: "text", text: match[2] });
    } else if (match[1] !== undefined) {
      const raw = match[1];
      const colonIdx = raw.lastIndexOf(":");
      const name = colonIdx > 0 ? raw.slice(0, colonIdx) : raw;
      const kind = colonIdx > 0 ? raw.slice(colonIdx + 1) : "";
      const isExisting = text[match.index] === "【";
      segments.push(isExisting ? { type: "existing", name, kind } : { type: "new", name, kind });
    }
  }
  return segments;
}

function segmentsToPlainText(segments: ParsedSegment[]): string {
  return segments.map((s) => {
    if (s.type === "text") return s.text;
    const tag = s.type === "existing" ? "【" : "{";
    const close = s.type === "existing" ? "】" : "}";
    return `${tag}${s.name}:${s.kind}${close}`;
  }).join("");
}

// ── Component ──

interface Props {
  projectId: string;
}

export default function OptimizationPanel({ projectId }: Props) {
  const [state, setState] = useState<PanelState>("input");
  const [inputText, setInputText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [segments, setSegments] = useState<ParsedSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [entityLookup, setEntityLookup] = useState<EntityOption[]>([]);
  const [editingText, setEditingText] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Dropdown state for clicking existing entities
  const [dropdownIndex, setDropdownIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load entity lookup on mount
  useEffect(() => {
    request<{ entities: EntityOption[] }>(`/assets-lookup/${projectId}/lookup`)
      .then((data) => setEntityLookup(data.entities || []))
      .catch(() => {});
  }, [projectId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (dropdownIndex === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-dropdown]")) setDropdownIndex(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownIndex]);

  // File upload handler
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileContent(reader.result as string);
    };
    reader.readAsText(file, "utf-8");
  }, []);

  // Submit optimization
  const handleOptimize = useCallback(async () => {
    const text = inputText.trim() || "";
    if (!text && !fileContent) return;

    setState("loading");
    setError(null);

    try {
      const result = await request<RefineResult>("/inference/refine", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          rawText: text,
          fileContent: fileContent || undefined,
        }),
      });

      // Parse result into segments for rich display
      const parsed = parseResult(result.refinedText);
      setSegments(parsed);
      setEditingText(result.refinedText);
      setState("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "优化失败");
      setState("input");
    }
  }, [inputText, fileContent, projectId]);

  // Replace existing entity
  const handleReplaceEntity = useCallback((segIdx: number, entity: EntityOption) => {
    setSegments((prev) => {
      const next = [...prev];
      const seg = next[segIdx];
      if (seg.type === "existing" || seg.type === "new") {
        next[segIdx] = { ...seg, name: entity.name, kind: entity.type };
      }
      return next;
    });
    setEditingText(segmentsToPlainText(
      segments.map((s, i) => {
        if (i === segIdx && (s.type === "existing" || s.type === "new")) {
          return { ...s, name: entity.name, kind: entity.type };
        }
        return s;
      })
    ));
    setDropdownIndex(null);
  }, [segments]);

  // Handle text edit from textarea
  const handleEditChange = useCallback((text: string) => {
    setEditingText(text);
  }, []);

  // Apply edits from textarea back to rich display
  const handleApplyEdit = useCallback(() => {
    const parsed = parseResult(editingText);
    setSegments(parsed);
    setIsEditing(false);
  }, [editingText]);

  // Filter lookup for a specific type
  const filterLookup = useCallback((kind: string) => {
    return entityLookup.filter((e) => e.type === kind || !kind);
  }, [entityLookup]);

  // Reset panel
  const handleClose = useCallback(() => {
    setState("input");
    setInputText("");
    setFileName(null);
    setFileContent(null);
    setSegments([]);
    setError(null);
    setEditingText("");
    setIsEditing(false);
    setDropdownIndex(null);
  }, []);

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        width: state === "result" ? "70%" : 560,
        maxWidth: "90vw",
        maxHeight: state === "result" ? "70vh" : "auto",
        background: theme.colors.bg.surface,
        border: `1px solid ${theme.colors.border.primary}`,
        borderRadius: 16,
        boxShadow: theme.shadow.lg,
        zIndex: 20,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease, max-height 0.2s ease",
      }}
    >
      {/* ── Input mode ── */}
      {state === "input" && (
        <>
          {/* Text input */}
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入新需求描述，或上传文件..."
            rows={3}
            style={{
              width: "100%",
              minHeight: 60,
              padding: "14px 16px",
              border: "none",
              background: "transparent",
              color: theme.colors.text.primary,
              fontSize: 13,
              fontFamily: theme.font,
              lineHeight: 1.5,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          {/* File info + actions row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "8px 12px",
              borderTop: `1px solid ${theme.colors.border.subtle}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.csv,.pdf"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="上传文件"
                style={{
                  padding: "6px 10px",
                  border: `1px solid ${theme.colors.border.primary}`,
                  borderRadius: 8,
                  background: theme.colors.bg.elevated,
                  color: theme.colors.text.secondary,
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: theme.font,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                📎 {fileName ? "更换文件" : "上传文件"}
              </button>
              {fileName && (
                <span style={{ fontSize: 11, color: theme.colors.text.tertiary, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fileName}
                </span>
              )}
            </div>

            {/* Optimize button */}
            <button
              onClick={handleOptimize}
              disabled={!inputText.trim() && !fileContent}
              style={{
                padding: "8px 20px",
                border: "none",
                borderRadius: 10,
                background: (inputText.trim() || fileContent) ? theme.colors.accent.module : theme.colors.bg.elevated,
                color: (inputText.trim() || fileContent) ? "#fff" : theme.colors.text.tertiary,
                cursor: (inputText.trim() || fileContent) ? "pointer" : "default",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: theme.font,
              }}
            >
              优化
            </button>
          </div>

          {error && (
            <div style={{ padding: "8px 16px", fontSize: 12, color: theme.colors.accent.red, borderTop: `1px solid ${theme.colors.border.subtle}` }}>
              {error}
            </div>
          )}
        </>
      )}

      {/* ── Loading mode ── */}
      {state === "loading" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "24px 16px" }}>
          <Spinner />
          <span style={{ fontSize: 13, color: theme.colors.text.secondary }}>正在优化...</span>
        </div>
      )}

      {/* ── Result mode ── */}
      {state === "result" && (
        <div style={{ display: "flex", flexDirection: "column", maxHeight: "70vh" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${theme.colors.border.subtle}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text.primary }}>优化结果</span>
            <div style={{ display: "flex", gap: 6 }}>
              {isEditing ? (
                <button onClick={handleApplyEdit} style={{ padding: "4px 12px", border: "none", borderRadius: 8, background: theme.colors.accent.module, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: theme.font }}>
                  应用编辑
                </button>
              ) : (
                <button onClick={() => setIsEditing(true)} style={{ padding: "4px 12px", border: `1px solid ${theme.colors.border.primary}`, borderRadius: 8, background: "transparent", color: theme.colors.text.secondary, fontSize: 11, cursor: "pointer", fontFamily: theme.font }}>
                  编辑
                </button>
              )}
              <button onClick={handleClose} style={{ padding: "4px 10px", border: "none", borderRadius: 8, background: theme.colors.bg.elevated, color: theme.colors.text.tertiary, fontSize: 11, cursor: "pointer", fontFamily: theme.font }}>
                关闭
              </button>
            </div>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
            {isEditing ? (
              <textarea
                value={editingText}
                onChange={(e) => handleEditChange(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 120,
                  padding: 10,
                  border: `1px solid ${theme.colors.border.primary}`,
                  borderRadius: 8,
                  background: theme.colors.bg.app,
                  color: theme.colors.text.primary,
                  fontSize: 13,
                  fontFamily: "monospace",
                  lineHeight: 1.6,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.8, color: theme.colors.text.primary, whiteSpace: "pre-wrap" }}>
                {segments.map((seg, i) => {
                  if (seg.type === "text") {
                    return <span key={i}>{seg.text}</span>;
                  }
                  if (seg.type === "existing") {
                    const matched = entityLookup.find((e) => e.name === seg.name && e.type === seg.kind);
                    return (
                      <span key={i} style={{ position: "relative", display: "inline" }}>
                        <span
                          onClick={() => setDropdownIndex(dropdownIndex === i ? null : i)}
                          style={{
                            display: "inline-block",
                            padding: "1px 8px",
                            margin: "0 2px",
                            borderRadius: 4,
                            background: `${theme.colors.accent.module}25`,
                            border: `1px solid ${theme.colors.accent.module}50`,
                            color: theme.colors.accent.module,
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                          title={matched ? `${seg.name} (${seg.kind})` : `未匹配: ${seg.name}`}
                        >
                           {seg.name}:{seg.kind}
                        </span>

                        {/* Dropdown for entity replacement */}
                        {dropdownIndex === i && (
                          <div
                            data-dropdown
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              zIndex: 30,
                              minWidth: 200,
                              maxHeight: 200,
                              overflow: "auto",
                              background: theme.colors.bg.elevated,
                              border: `1px solid ${theme.colors.border.primary}`,
                              borderRadius: 8,
                              boxShadow: theme.shadow.md,
                              padding: 4,
                            }}
                          >
                            <div style={{ padding: "4px 8px", fontSize: 10, color: theme.colors.text.tertiary, borderBottom: `1px solid ${theme.colors.border.subtle}`, marginBottom: 4 }}>
                              选择要替换的实体:
                            </div>
                            {filterLookup(seg.kind).length === 0 && (
                              <div style={{ padding: "6px 8px", fontSize: 11, color: theme.colors.text.tertiary }}>
                                无匹配的{seg.kind}实体
                              </div>
                            )}
                            {filterLookup(seg.kind).map((entity) => (
                              <div
                                key={entity.id}
                                onClick={() => handleReplaceEntity(i, entity)}
                                style={{
                                  padding: "6px 8px",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  fontSize: 12,
                                  color: entity.name === seg.name ? theme.colors.accent.module : theme.colors.text.primary,
                                  background: entity.name === seg.name ? `${theme.colors.accent.module}15` : "transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = theme.colors.bg.hover)}
                                onMouseLeave={(e) => (e.currentTarget.style.background = entity.name === seg.name ? `${theme.colors.accent.module}15` : "transparent")}
                              >
                                <span style={{ fontWeight: entity.name === seg.name ? 600 : 400 }}>{entity.name}</span>
                                <span style={{ fontSize: 10, color: theme.colors.text.tertiary }}>{entity.type}</span>
                                {entity.name === seg.name && <span style={{ fontSize: 10, color: theme.colors.accent.module, marginLeft: "auto" }}>当前</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </span>
                    );
                  }
                  if (seg.type === "new") {
                    return (
                      <span
                        key={i}
                        style={{
                          display: "inline-block",
                          padding: "1px 8px",
                          margin: "0 2px",
                          borderRadius: 4,
                          background: `${theme.colors.accent.page}20`,
                          border: `1px solid ${theme.colors.accent.page}50`,
                          color: theme.colors.accent.page,
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                        title={`新${seg.kind}: ${seg.name}`}
                      >
                        {seg.name}:{seg.kind}
                      </span>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </div>

          {/* Re-optimize button at bottom */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${theme.colors.border.subtle}`, display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => { setState("input"); setSegments([]); setIsEditing(false); }}
              style={{
                padding: "6px 16px",
                border: `1px solid ${theme.colors.border.primary}`,
                borderRadius: 8,
                background: "transparent",
                color: theme.colors.text.secondary,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: theme.font,
              }}
            >
              重新优化
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
