import { useEffect, useState } from "react";
import type { Project } from "../types";
import { projectsApi } from "../api";

interface Props {
  onSelectProject: (id: string) => void;
}

export default function ProjectLobby({ onSelectProject }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectsApi.list().then((data) => {
      setProjects(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = projects.filter((p) =>
    tab === "active" ? p.status === "active" : p.status === "archived"
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    const p = await projectsApi.create({ name: name.trim(), description });
    setProjects((prev) => [p, ...prev]);
    setName("");
    setDescription("");
    setShowCreate(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 100%)",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      padding: "40px 20px",
    }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", animation: "fadeIn 0.4s ease-out" }}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          marginBottom: 8,
        }}>
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            background: "linear-gradient(135deg, #0071e3, #40a9ff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: -0.5,
          }}>
            RARE
          </h1>
          <span style={{
            fontSize: 11,
            color: "#86868b",
            fontWeight: 500,
            background: "rgba(0,0,0,0.04)",
            padding: "2px 8px",
            borderRadius: 6,
          }}>
            v0.1
          </span>
        </div>
        <p style={{ color: "#86868b", marginBottom: 36, fontSize: 14, fontWeight: 400 }}>
          系统反向工程与需求审计工作台
        </p>

        {/* Tabs */}
        <div style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          background: "rgba(0,0,0,0.03)",
          padding: 4,
          borderRadius: 12,
          width: "fit-content",
        }}>
          {(["active", "archived"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? "rgba(255,255,255,0.85)" : "transparent",
                border: "none",
                fontSize: 14,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? "#1d1d1f" : "#86868b",
                cursor: "pointer",
                padding: "8px 20px",
                borderRadius: 10,
                transition: "all 0.2s",
                backdropFilter: tab === t ? "blur(12px)" : "none",
              }}
            >
              {t === "active" ? "活跃项目" : "归档项目"}
              {filtered.length > 0 && (
                <span style={{
                  marginLeft: 6,
                  fontSize: 11,
                  background: tab === t ? "rgba(0,113,227,0.1)" : "rgba(0,0,0,0.05)",
                  color: tab === t ? "#0071e3" : "#86868b",
                  padding: "1px 6px",
                  borderRadius: 6,
                }}>
                  {filtered.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "#86868b", fontSize: 14 }}>
            <div style={{
              width: 24,
              height: 24,
              border: "2px solid #e5e5e7",
              borderTopColor: "#0071e3",
              borderRadius: "50%",
              margin: "0 auto 12px",
              animation: "spin 0.8s linear infinite",
            }} />
            加载中...
          </div>
        )}

        {/* Empty state */}
        {!loading && tab === "active" && projects.filter(p => p.status === "active").length === 0 && !showCreate && (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "#86868b",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>◈</div>
            <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>暂无活跃项目</p>
            <p style={{ fontSize: 13, marginBottom: 24 }}>创建一个新项目开始分析你的系统</p>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                background: "#0071e3",
                color: "#fff",
                border: "none",
                padding: "10px 24px",
                borderRadius: 24,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              + 新建项目
            </button>
          </div>
        )}

        {/* Project grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}>
          {/* New project card */}
          {tab === "active" && !showCreate && filtered.length > 0 && (
            <div
              onClick={() => setShowCreate(true)}
              className="glass"
              style={{
                padding: 32,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 160,
                cursor: "pointer",
                color: "#86868b",
                fontSize: 14,
                border: "2px dashed rgba(0,0,0,0.08)",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = "#0071e3";
                e.currentTarget.style.color = "#0071e3";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)";
                e.currentTarget.style.color = "#86868b";
              }}
            >
              <span style={{ fontSize: 28, marginBottom: 8, fontWeight: 300, lineHeight: 1 }}>+</span>
              <span style={{ fontWeight: 500 }}>新建项目</span>
            </div>
          )}

          {/* Create form */}
          {showCreate && (
            <div className="glass scale-in" style={{
              padding: 24,
            }}>
              <input
                autoFocus
                placeholder="项目名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 8,
                  fontSize: 14,
                  marginBottom: 8,
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#0071e3"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; }}
              />
              <input
                placeholder="一句话目标（可选）"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 8,
                  fontSize: 14,
                  marginBottom: 12,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleCreate}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    background: "linear-gradient(135deg, #0071e3, #0056b3)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  创建
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  style={{
                    padding: "8px 16px",
                    background: "transparent",
                    color: "#86868b",
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Project cards */}
          {filtered.map((p, idx) => (
            <div
              key={p.id}
              onClick={() => onSelectProject(p.id)}
              className="glass"
              style={{
                padding: 24,
                cursor: "pointer",
                transition: "all 0.25s ease",
                opacity: p.status === "archived" ? 0.6 : 1,
                animation: `fadeIn 0.3s ease-out ${idx * 0.05}s both`,
              }}
              onMouseOver={(e) => {
                if (p.status !== "archived") {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.08)";
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: p.status === "archived" ? "#a1a1a6" : "#30d158",
                  flexShrink: 0,
                }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1d1d1f" }}>
                  {p.name}
                </h3>
                {p.status === "archived" && (
                  <span style={{ fontSize: 12, opacity: 0.5 }}>🧊</span>
                )}
              </div>
              {p.description && (
                <p style={{ margin: "4px 0", fontSize: 13, color: "#86868b", lineHeight: 1.4 }}>
                  {p.description}
                </p>
              )}
              {p._count && (
                <div style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid rgba(0,0,0,0.04)",
                }}>
                  {([
                    { key: "modules" as const, label: "模块", color: "#0071e3" },
                    { key: "pages" as const, label: "页面", color: "#30d158" },
                    { key: "fields" as const, label: "字段", color: "#ff9f0a" },
                    { key: "actions" as const, label: "操作", color: "#ff3b30" },
                  ]).map(({ key, label, color }) => (
                    <span key={key} style={{
                      fontSize: 11,
                      color: "#86868b",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}>
                      <span style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: color,
                        display: "inline-block",
                      }} />
                      {p._count![key]} {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
