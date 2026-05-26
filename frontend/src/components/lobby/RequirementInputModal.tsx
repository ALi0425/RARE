import { useState, useRef, useCallback } from "react";
import { theme } from "../../theme/tokens";
import type { ProjectData } from "../../store/canvasStore";

interface Props {
  projectId: string;
  projectName: string;
  onComplete: (projectData: ProjectData) => void;
  onClose: () => void;
}

type Phase = "input" | "processing" | "error";

interface ProgressState {
  stage: string;
  progress: number;
  message: string;
}

const stageLabels: Record<string, string> = {
  parsing: "解析文件中",
  analyzing: "AI 资产逆向解析",
  reasoning: "图谱推理",
  saving: "保存结果生成画布",
  inferring: "AI 推理业务流程",
  complete: "分析完成",
};

export default function RequirementInputModal({
  projectId,
  projectName,
  onComplete,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({
    stage: "",
    progress: 0,
    message: "",
  });
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 10));
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = useCallback(async () => {
    if (!text.trim() && files.length === 0) return;

    setPhase("processing");
    setProgress({ stage: "parsing", progress: 0, message: "开始分析..." });
    setErrorMsg("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const formData = new FormData();
      if (text.trim()) formData.append("text", text);
      for (const f of files) {
        formData.append("files", f);
      }

      const response = await fetch(
        `http://localhost:3001/api/analyze/${projectId}`,
        {
          method: "POST",
          body: formData,
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(errText || `请求失败 (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));

          if (data.stage === "error") {
            setPhase("error");
            setErrorMsg(data.message || "分析失败");
            return;
          }

          if (data.stage === "result") {
            setProgress({
              stage: "complete",
              progress: 100,
              message: "分析完成",
            });
            if (data.project) {
              onComplete(data.project);
            }
            return;
          }

          setProgress({
            stage: data.stage,
            progress: data.progress,
            message: data.message,
          });
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setPhase("error");
      setErrorMsg(err.message || "网络错误");
    }
  }, [text, files, projectId, onComplete]);

  const progressPct = progress.progress;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: theme.colors.bg.overlay,
          zIndex: 999,
        }}
        onClick={phase === "input" ? onClose : undefined}
      />

      {/* Capsule modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1000,
          width: 560,
          maxHeight: "80vh",
          borderRadius: 32,
          background: theme.colors.bg.surface,
          border: `1px solid ${theme.colors.border.primary}`,
          boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: theme.colors.text.primary,
            }}
          >
            {projectName}
          </div>
          {phase === "input" && (
            <div
              style={{
                fontSize: 12,
                color: theme.colors.text.tertiary,
                marginTop: 4,
              }}
            >
              输入需求描述或上传文档，系统将自动解析并构建实体
            </div>
          )}
        </div>

        {/* ── Input mode ── */}
        {phase === "input" && (
          <>
            {/* Textarea */}
            <div style={{ padding: "16px 24px 0" }}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="在此输入需求描述..."
                rows={4}
                style={{
                  width: "100%",
                  padding: 12,
                  background: theme.colors.bg.app,
                  border: `1px solid ${theme.colors.border.subtle}`,
                  borderRadius: 12,
                  fontSize: 13,
                  color: theme.colors.text.primary,
                  fontFamily: theme.font,
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                  lineHeight: 1.5,
                }}
              />
            </div>

            {/* File upload */}
            <div style={{ padding: "12px 24px 0" }}>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                style={{
                  border: `2px dashed ${dragging ? theme.colors.accent.module : theme.colors.border.primary}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragging
                    ? `${theme.colors.accent.module}08`
                    : "transparent",
                  transition: `all ${theme.transition}`,
                  color: theme.colors.text.tertiary,
                  fontSize: 12,
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.pdf,.doc,.docx"
                  onChange={(e) => addFiles(e.target.files)}
                  style={{ display: "none" }}
                />
                {files.length > 0
                  ? `已选择 ${files.length} 个文件`
                  : "点击或拖拽上传需求文档（txt / md / pdf / doc）"}
              </div>

              {files.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  {files.map((f, i) => (
                    <span
                      key={i}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 8px",
                        background: theme.colors.bg.elevated,
                        borderRadius: 8,
                        fontSize: 11,
                        color: theme.colors.text.secondary,
                      }}
                    >
                      {f.name}
                      <span
                        onClick={() => removeFile(i)}
                        style={{
                          cursor: "pointer",
                          opacity: 0.5,
                          marginLeft: 2,
                        }}
                      >
                        ✕
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div
              style={{
                padding: "16px 24px 20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={onClose}
                style={{
                  padding: "8px 18px",
                  background: "transparent",
                  border: `1px solid ${theme.colors.border.primary}`,
                  borderRadius: 20,
                  color: theme.colors.text.secondary,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: theme.font,
                }}
              >
                取消
              </button>
              <button
                onClick={handleAnalyze}
                disabled={!text.trim() && files.length === 0}
                style={{
                  padding: "8px 24px",
                  background:
                    !text.trim() && files.length === 0
                      ? theme.colors.bg.elevated
                      : theme.colors.accent.module,
                  border: "none",
                  borderRadius: 20,
                  color:
                    !text.trim() && files.length === 0
                      ? theme.colors.text.tertiary
                      : "#fff",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor:
                    !text.trim() && files.length === 0
                      ? "default"
                      : "pointer",
                  fontFamily: theme.font,
                  transition: `all ${theme.transition}`,
                }}
              >
                分析
              </button>
            </div>
          </>
        )}

        {/* ── Processing mode ── */}
        {phase === "processing" && (
          <div style={{ padding: "40px 48px", textAlign: "center" }}>
            {/* Animated spinner */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                border: `3px solid ${theme.colors.border.subtle}`,
                borderTopColor: theme.colors.accent.module,
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 24px",
              }}
            />

            {/* Progress bar */}
            <div
              style={{
                width: "100%",
                height: 6,
                background: theme.colors.border.subtle,
                borderRadius: 3,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  width: `${Math.max(progressPct, 5)}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${theme.colors.accent.module}, ${theme.colors.accent.page})`,
                  borderRadius: 3,
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            {/* Stage label */}
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: theme.colors.text.primary,
                marginBottom: 6,
              }}
            >
              {stageLabels[progress.stage] || progress.stage}
            </div>

            {/* Detail message */}
            <div
              style={{
                fontSize: 12,
                color: theme.colors.text.tertiary,
              }}
            >
              {progress.message}
            </div>
          </div>
        )}

        {/* ── Error mode ── */}
        {phase === "error" && (
          <div style={{ padding: "40px 48px", textAlign: "center" }}>
            <div
              style={{
                fontSize: 40,
                marginBottom: 16,
                color: theme.colors.accent.red,
              }}
            >
              ✕
            </div>
            <div
              style={{
                fontSize: 14,
                color: theme.colors.text.primary,
                marginBottom: 8,
              }}
            >
              分析失败
            </div>
            <div
              style={{
                fontSize: 12,
                color: theme.colors.text.tertiary,
                marginBottom: 20,
              }}
            >
              {errorMsg}
            </div>
            <button
              onClick={() => setPhase("input")}
              style={{
                padding: "8px 24px",
                background: theme.colors.accent.module,
                border: "none",
                borderRadius: 20,
                color: "#fff",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: theme.font,
              }}
            >
              返回重试
            </button>
          </div>
        )}
      </div>
    </>
  );
}
