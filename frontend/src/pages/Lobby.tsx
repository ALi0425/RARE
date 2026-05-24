import { useEffect, useState, useCallback } from "react";
import { projectsApi } from "../api";

interface Props { onOpenProject: (id: string) => void }

export default function Lobby({ onOpenProject }: Props) {
  const [projects, setProjects] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try { setProjects((await projectsApi.list()) || []); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createProject = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      await projectsApi.create({ name: newName });
      setNewName("");
      setShowNew(false);
      await load();
    } catch (e) { console.error(e); }
  }, [newName, load]);

  return (
    <div style={{ padding: "40px 60px", minHeight: "100vh", background: "#f5f5f7" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1d1d1f", margin: 0 }}>RARE</h1>
        <span style={{ color: "#d2d2d7", fontSize: 14 }}>v0.1</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <span style={{ color: "#0071e3", fontSize: 14, fontWeight: 600, cursor: "pointer", borderBottom: "2px solid #0071e3", paddingBottom: 4 }}>活跃项目</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {/* New project card */}
        <div
          onClick={() => setShowNew(true)}
          style={{
            width: 220, height: 140, borderRadius: 12, border: "2px dashed rgba(0,0,0,0.1)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#86868b", fontSize: 14, gap: 8, transition: "all 0.15s",
          }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = "#0071e3"}
          onMouseOut={(e) => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"}
        >
          <span style={{ fontSize: 28 }}>+</span>
          <span>新建项目</span>
        </div>

        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => onOpenProject(p.id)}
            style={{
              width: 220, height: 140, borderRadius: 12,
              background: "rgba(255,255,255,0.7)", backdropFilter: "blur(20px)",
              border: "1px solid rgba(0,0,0,0.04)", cursor: "pointer", padding: 16,
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              transition: "all 0.15s", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
            onMouseOver={(e) => e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)"}
            onMouseOut={(e) => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"}
          >
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f", margin: 0 }}>{p.name}</h3>
              <div style={{ fontSize: 11, color: "#86868b", marginTop: 4 }}>
                {p._count?.modules || 0} 模块 · {p._count?.pages || 0} 页面 · {p._count?.fields || 0} 字段 · {p._count?.actions || 0} 操作
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#aeaeb2" }}>
              {new Date(p.updatedAt).toLocaleDateString("zh-CN")}
            </div>
          </div>
        ))}
      </div>

      {/* New project modal */}
      {showNew && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", zIndex: 999, backdropFilter: "blur(4px)" }} onClick={() => setShowNew(false)} />
          <div style={{
            position: "fixed", top: "40%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1000,
            background: "rgba(255,255,255,0.9)", backdropFilter: "blur(24px)", borderRadius: 16, padding: 24, minWidth: 320,
            display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.12)"
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f" }}>新建项目</span>
            <input placeholder="项目名称" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createProject(); }}
              style={{ padding: "10px 14px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, fontSize: 14, outline: "none" }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowNew(false)} style={{ padding: "8px 20px", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 10, background: "transparent", cursor: "pointer", fontSize: 13 }}>取消</button>
              <button onClick={createProject} disabled={!newName.trim()} style={{ padding: "8px 20px", border: "none", borderRadius: 10, background: !newName.trim() ? "rgba(0,113,227,0.3)" : "#0071e3", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>创建</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
