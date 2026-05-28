import { useState, useMemo, useCallback, useEffect } from "react";
import { request } from "../../api/client";
import { impactApi } from "../../api";
import { theme } from "../../theme/tokens";
import Spinner from "../ui/Spinner";

// ── Types ──

interface ImpactResult {
  impactDescription: string;
  newEntities: Array<{
    name: string;
    type: string;
    parentName: string | null;
    fieldType: string | null;
    actionType: string | null;
  }>;
  affectedEntities: Array<{
    name: string;
    type: string;
    impact: string;
  }>;
  newEdges: Array<{
    sourceName: string;
    targetName: string;
    label: string;
    flowType: string;
  }>;
}

interface EntityOption {
  id: string;
  name: string;
  type: string;
}

type Step = "input" | "select_module" | "loading" | "result";

// ── Helper: extract module names from text ──

function extractModules(text: string): string[] {
  const re = /[【{]([^】}]+?):module[】}]/g;
  const names: string[] = [];
  let m;
  while ((m = re.exec(text)) !== null) names.push(m[1]);
  return names;
}

// ── Helper: color by entity type ──

const typeColor: Record<string, { bg: string; border: string; text: string }> = {
  module: { bg: `${theme.colors.accent.module}20`, border: theme.colors.accent.module, text: theme.colors.accent.module },
  page: { bg: `${theme.colors.accent.page}20`, border: theme.colors.accent.page, text: theme.colors.accent.page },
  field: { bg: `${theme.colors.accent.field}20`, border: theme.colors.accent.field, text: theme.colors.accent.field },
  action: { bg: `${theme.colors.accent.action}20`, border: theme.colors.accent.action, text: theme.colors.accent.action },
};

function entityBadgeStyle(type: string, isNew: boolean) {
  const base = typeColor[type] || typeColor.module;
  return {
    display: "inline-block" as const,
    padding: "2px 10px",
    margin: "2px 4px",
    borderRadius: 4,
    background: isNew ? "#581c87" : "#7c2d12",
    border: `1px solid ${isNew ? "#a855f7" : "#f97316"}`,
    color: isNew ? "#d8b4fe" : "#fdba74",
    fontSize: 12,
    fontWeight: 500,
    boxShadow: isNew
      ? "0 0 8px rgba(168,85,247,0.4)"
      : "0 0 8px rgba(249,115,22,0.4)",
  };
}

// ── Component ──

interface Props {
  projectId: string;
  refinedText: string;
  projectSummary?: string;
  initialResult?: ImpactResult | null;
  onClose: () => void;
  onApply: (project: any, affectedIds: string[]) => void;
  onDemo?: (result: ImpactResult) => void;
}

export default function ImpactModal({ projectId, refinedText, projectSummary, initialResult, onClose, onApply, onDemo }: Props) {
  const [step, setStep] = useState<Step>(initialResult ? "result" : "input");
  const [modules, setModules] = useState<EntityOption[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>("");
  const [customModule, setCustomModule] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImpactResult | null>(initialResult || null);
  const [applying, setApplying] = useState(false);

  // Extract modules from text
  const textModules = useMemo(() => extractModules(refinedText), [refinedText]);

  // On mount: skip if initialResult provided, otherwise start assessment
  useEffect(() => {
    if (initialResult) return;
    if (textModules.length > 0) {
      startAssessment(undefined);
    } else {
      loadModules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load available modules from entity lookup
  const loadModules = async () => {
    setStep("select_module");
    try {
      const data = await request<{ entities: EntityOption[] }>(`/assets-lookup/${projectId}/lookup`);
      setModules((data.entities || []).filter((e) => e.type === "module"));
    } catch {
      setModules([]);
    }
  };

  // Start impact assessment
  const startAssessment = useCallback(async (moduleName?: string) => {
    setStep("loading");
    setError(null);
    try {
      const result = await impactApi.assess(projectId, {
        refinedText,
        selectedModule: moduleName || selectedModule || undefined,
        projectSummary,
      });
      setResult(result);
      setStep("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "影响评估失败");
      // Go back to previous step
      if (textModules.length > 0) setStep("result");
      else setStep("select_module");
    }
  }, [projectId, refinedText, selectedModule, projectSummary, textModules.length]);

  // Confirm module selection
  const handleModuleConfirm = () => {
    const name = customModule.trim() || selectedModule;
    if (!name) return;
    startAssessment(name);
  };

  // Apply results
  const handleApply = async () => {
    if (!result) return;
    setApplying(true);
    try {
      // Change "未入库" → "已入库"
      await impactApi.applyStatus(projectId);
      const data = await impactApi.apply(projectId, result);
      onApply(data.project, data.affectedIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "应用失败");
    } finally {
      setApplying(false);
    }
  };

  // Cancel: delete "未入库" data
  const handleCancel = async () => {
    setApplying(true);
    try {
      await impactApi.cancelEntities(projectId);
    } catch {
      // non-fatal
    }
    setApplying(false);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !applying) onClose(); }}
    >
      <div
        style={{
          width: 640,
          maxWidth: "90vw",
          maxHeight: "80vh",
          background: theme.colors.bg.surface,
          border: `1px solid ${theme.colors.border.primary}`,
          borderRadius: 16,
          boxShadow: theme.shadow.lg,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: `1px solid ${theme.colors.border.subtle}`,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: theme.colors.text.primary }}>
            🔮 影响评估
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: theme.colors.text.tertiary,
              cursor: "pointer", fontSize: 18, padding: "0 4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflow: "auto", padding: 18 }}>

          {/* Step: Select Module */}
          {step === "select_module" && (
            <div>
              <div style={{ fontSize: 13, color: theme.colors.text.secondary, marginBottom: 12 }}>
                优化结果中未检测到模块信息，请选择一个目标模块或输入新模块名称：
              </div>

              {/* Existing modules */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: theme.colors.text.tertiary, marginBottom: 6 }}>已有模块：</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {modules.length === 0 && (
                    <span style={{ fontSize: 12, color: theme.colors.text.tertiary }}>暂无可选模块</span>
                  )}
                  {modules.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModule(m.name); setCustomModule(""); }}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        border: `1px solid ${selectedModule === m.name ? theme.colors.accent.module : theme.colors.border.primary}`,
                        background: selectedModule === m.name ? `${theme.colors.accent.module}20` : "transparent",
                        color: selectedModule === m.name ? theme.colors.accent.module : theme.colors.text.primary,
                        cursor: "pointer", fontSize: 12, fontFamily: theme.font,
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom module */}
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.tertiary, marginBottom: 6 }}>或输入新模块名称：</div>
                <input
                  value={customModule}
                  onChange={(e) => { setCustomModule(e.target.value); setSelectedModule(""); }}
                  placeholder="输入新模块名称..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: `1px solid ${theme.colors.border.primary}`,
                    borderRadius: 8,
                    background: theme.colors.bg.app,
                    color: theme.colors.text.primary,
                    fontSize: 13,
                    fontFamily: theme.font,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Confirm button */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: "8px 18px", border: `1px solid ${theme.colors.border.primary}`,
                    borderRadius: 8, background: "transparent",
                    color: theme.colors.text.secondary, cursor: "pointer", fontSize: 13, fontFamily: theme.font,
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleModuleConfirm}
                  disabled={!selectedModule && !customModule.trim()}
                  style={{
                    padding: "8px 20px", border: "none", borderRadius: 8,
                    background: (selectedModule || customModule.trim()) ? theme.colors.accent.module : theme.colors.bg.elevated,
                    color: (selectedModule || customModule.trim()) ? "#fff" : theme.colors.text.tertiary,
                    cursor: (selectedModule || customModule.trim()) ? "pointer" : "default",
                    fontSize: 13, fontWeight: 600, fontFamily: theme.font,
                  }}
                >
                  开始评估
                </button>
              </div>
            </div>
          )}

          {/* Step: Loading */}
          {step === "loading" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0" }}>
              <Spinner />
              <span style={{ fontSize: 13, color: theme.colors.text.secondary }}>AI 正在分析影响范围...</span>
            </div>
          )}

          {/* Step: Result */}
          {step === "result" && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Impact Description */}
              {result.impactDescription && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.colors.text.primary, marginBottom: 6 }}>影响说明</div>
                  <div style={{
                    fontSize: 13, lineHeight: 1.7, color: theme.colors.text.secondary,
                    padding: 12, background: theme.colors.bg.app, borderRadius: 8,
                    whiteSpace: "pre-wrap",
                  }}>
                    {result.impactDescription}
                  </div>
                </div>
              )}

              {/* New Entities */}
              {result.newEntities.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#a855f7", marginBottom: 6 }}>
                    🆕 新增实体 ({result.newEntities.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {result.newEntities.map((e, i) => (
                      <span key={i} style={entityBadgeStyle(e.type, true)} title={`parent: ${e.parentName || "—"}`}>
                        {e.name}:{e.type}
                        {e.parentName && <span style={{ opacity: 0.6, fontSize: 10, marginLeft: 4 }}>⊂{e.parentName}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Affected Entities */}
              {result.affectedEntities.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#f97316", marginBottom: 6 }}>
                    ⚠️ 受影响实体 ({result.affectedEntities.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {result.affectedEntities.map((e, i) => (
                      <div
                        key={i}
                        title={e.impact}
                        style={{
                          ...entityBadgeStyle(e.type, false),
                          cursor: "help",
                        }}
                      >
                        {e.name}:{e.type}
                      </div>
                    ))}
                  </div>
                  {/* Detailed impact explanation */}
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {result.affectedEntities.map((e, i) => e.impact ? (
                      <div key={i} style={{
                        fontSize: 11, color: theme.colors.text.tertiary,
                        padding: "4px 8px", background: `${theme.colors.bg.app}`,
                        borderRadius: 4,
                      }}>
                        <span style={{ color: "#fdba74", fontWeight: 500 }}>{e.name}</span>: {e.impact}
                      </div>
                    ) : null)}
                  </div>
                </div>
              )}

              {/* New Edges */}
              {result.newEdges.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.colors.text.primary, marginBottom: 6 }}>
                    🔗 新增连线 ({result.newEdges.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {result.newEdges.map((e, i) => (
                      <div key={i} style={{
                        fontSize: 12, color: theme.colors.text.secondary,
                        padding: "6px 10px", background: theme.colors.bg.app, borderRadius: 6,
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <span style={{ color: "#a855f7", fontWeight: 500 }}>{e.sourceName}</span>
                        <span style={{ color: theme.colors.text.tertiary }}>→</span>
                        <span style={{ color: "#a855f7", fontWeight: 500 }}>{e.targetName}</span>
                        {e.label && <span style={{ color: theme.colors.text.tertiary, fontSize: 11 }}>({e.label})</span>}
                        <span style={{ color: theme.colors.text.tertiary, fontSize: 10, marginLeft: "auto" }}>
                          {e.flowType}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!result.newEntities.length && !result.affectedEntities.length && !result.newEdges.length && (
                <div style={{
                  textAlign: "center", padding: 20, fontSize: 13,
                  color: theme.colors.text.tertiary,
                }}>
                  AI 分析未检测到明显的影响范围。
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: "8px 12px", fontSize: 12, color: theme.colors.accent.red,
              background: `${theme.colors.accent.red}10`, borderRadius: 6, marginTop: 8,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Footer (Result step only) ── */}
        {step === "result" && result && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: "12px 18px",
              borderTop: `1px solid ${theme.colors.border.subtle}`,
            }}
          >
            <button
              onClick={handleCancel}
              disabled={applying}
              style={{
                padding: "8px 18px", border: `1px solid ${theme.colors.border.primary}`,
                borderRadius: 8, background: "transparent",
                color: theme.colors.text.secondary, cursor: "pointer",
                fontSize: 13, fontFamily: theme.font,
              }}
            >
              取消
            </button>
            <button
              onClick={() => result && onDemo?.(result)}
              disabled={applying}
              style={{
                padding: "8px 18px", border: `1px solid ${theme.colors.accent.action}`,
                borderRadius: 8, background: "transparent",
                color: theme.colors.accent.action, cursor: "pointer",
                fontSize: 13, fontWeight: 600, fontFamily: theme.font,
              }}
            >
              👁 演示
            </button>
            <button
              onClick={handleApply}
              disabled={applying}
              style={{
                padding: "8px 20px", border: "none", borderRadius: 8,
                background: applying ? theme.colors.bg.elevated : "#7c3aed",
                color: applying ? theme.colors.text.tertiary : "#fff",
                cursor: applying ? "default" : "pointer",
                fontSize: 13, fontWeight: 600, fontFamily: theme.font,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {applying && <Spinner />}
              应用
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
