import { useState, useEffect, useRef } from "react";
import { theme } from "../../theme/tokens";
import { confirmApi } from "../../api";

interface Props {
  projectId: string;
  positions: { modules: any[]; pages: any[]; fields: any[]; actions: any[] };
  onComplete: (project: any) => void;
  onCancel: () => void;
}

type Phase = "confirm" | "processing" | "error";

export default function ConfirmDialog({ projectId, positions, onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const aborter = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => aborter.current?.abort();
  }, []);

  const startConfirm = async () => {
    setPhase("processing");
    setProgress(0);
    setMessage("准备中...");

    const controller = new AbortController();
    aborter.current = controller;

    try {
      const response = await confirmApi.start(projectId, positions);
      if (!response.ok) throw new Error(`确认请求失败 (${response.status})`);
      if (!response.body) throw new Error("无响应数据流");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(trimmed.slice(6));
            if (event.stage === "error") {
              setErrorMsg(event.message || "处理出错");
              setPhase("error");
              return;
            }
            if (event.progress) setProgress(event.progress);
            if (event.message) setMessage(event.message);
            if (event.stage === "warning") {
              setMessage(`⚠ ${event.message}`);
            }
            if (event.stage === "result" && event.project) {
              setProgress(100);
              setMessage("梳理完成！");
              setTimeout(() => onComplete(event.project), 800);
              return;
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setErrorMsg(err.message || "网络错误");
      setPhase("error");
    }
  };

  // ── Confirm dialog ──
  if (phase === "confirm") {
    return (
      <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }} onClick={onCancel} />
        <div
          style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 1000, background: theme.colors.bg.surface,
            borderRadius: theme.radius.lg, padding: 28, minWidth: 380, maxWidth: 440,
            boxShadow: theme.shadow.lg, border: `1px solid ${theme.colors.border.subtle}`,
          }}
        >
          <h3 style={{ margin: "0 0 12px", color: theme.colors.text.primary, fontSize: 16, fontWeight: 600 }}>
            确认梳理
          </h3>
          <p style={{ margin: 0, color: theme.colors.text.secondary, fontSize: 13, lineHeight: 1.7 }}>
            确认后，所审核数据将保存入库并开始AI梳理流程，且不可再次对节点与流程关系进行编辑，是否确认？
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
            <button
              onClick={onCancel}
              style={{
                padding: "8px 18px", borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.border.subtle}`,
                background: "transparent", color: theme.colors.text.secondary, cursor: "pointer", fontSize: 13,
              }}
            >
              否
            </button>
            <button
              onClick={startConfirm}
              style={{
                padding: "8px 18px", borderRadius: theme.radius.sm, border: "none",
                background: theme.colors.accent.page, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
              }}
            >
              是，开始梳理
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Progress dialog ──
  if (phase === "processing") {
    return (
      <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }} />
        <div
          style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 1000, background: theme.colors.bg.surface,
            borderRadius: theme.radius.lg, padding: 28, minWidth: 360,
            boxShadow: theme.shadow.lg, border: `1px solid ${theme.colors.border.subtle}`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 48, height: 48, border: `3px solid ${theme.colors.border.subtle}`,
              borderTopColor: theme.colors.accent.page, borderRadius: "50%", margin: "0 auto 16px",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ color: theme.colors.text.primary, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {message}
          </div>
          <div
            style={{
              width: "100%", height: 6, background: theme.colors.bg.hover, borderRadius: 3,
              overflow: "hidden", marginTop: 12,
            }}
          >
            <div
              style={{
                width: `${progress}%`, height: "100%", background: theme.colors.accent.page,
                borderRadius: 3, transition: "width 0.5s ease",
              }}
            />
          </div>
          <div style={{ color: theme.colors.text.tertiary, fontSize: 11, marginTop: 8 }}>
            {progress}%
          </div>
        </div>
      </>
    );
  }

  // ── Error dialog ──
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }} onClick={onCancel} />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 1000, background: theme.colors.bg.surface,
          borderRadius: theme.radius.lg, padding: 28, minWidth: 380,
          boxShadow: theme.shadow.lg, border: `1px solid ${theme.colors.border.subtle}`,
        }}
      >
        <h3 style={{ margin: "0 0 12px", color: "#f87171", fontSize: 16, fontWeight: 600 }}>
          处理出错
        </h3>
        <p style={{ margin: 0, color: theme.colors.text.secondary, fontSize: 13, lineHeight: 1.7 }}>
          {errorMsg}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px", borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.border.subtle}`,
              background: "transparent", color: theme.colors.text.secondary, cursor: "pointer", fontSize: 13,
            }}
          >
            关闭
          </button>
          <button
            onClick={startConfirm}
            style={{
              padding: "8px 18px", borderRadius: theme.radius.sm, border: "none",
              background: theme.colors.accent.page, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            重试
          </button>
        </div>
      </div>
    </>
  );
}
