import { useEffect, useState, useCallback, useRef } from "react";
import { ReactFlow, Background, Controls, MiniMap, MarkerType, SelectionMode, type Node, type Edge, type Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "../store/canvasStore";
import { assetsApi, edgesApi, parseApi } from "../api";
import { ModuleNode, PageNode, FieldNode, ActionNode, setOnLabelSave } from "../components/canvas/Nodes";

const nodeTypes = { module: ModuleNode, page: PageNode, field: FieldNode, action: ActionNode };

interface Props { projectId: string; onBack: () => void }

function nodeDefaultSize(type?: string, label = "", _extra = false) {
  if (type === "module") return { w: 160, h: 36 };
  if (type === "page") return { w: 120, h: 36 };
  const tw = [...label].reduce((s: number, c: string) => s + (c.charCodeAt(0) > 127 ? 14 : 8), 0);
  if (type === "field") return { w: Math.max(140, tw + 40), h: 32 };
  return { w: Math.max(140, tw + 40), h: 32 };
}

function computeFluidBounds(nodes: Node[], containerId: string, minW = 160, minH = 36) {
  const kids = nodes.filter((n) => n.parentId === containerId);
  if (!kids.length) return { w: minW, h: minH };
  let mx = 0, my = 0;
  for (const c of kids) {
    const cw = Number(c.style?.width) || nodeDefaultSize(c.type, c.data?.label).w;
    const ch = Number(c.style?.height) || nodeDefaultSize(c.type, c.data?.label).h;
    mx = Math.max(mx, c.position.x + cw);
    my = Math.max(my, c.position.y + ch);
  }
  return { w: Math.max(mx + 40, minW), h: Math.max(my + 40, minH) };
}

export default function ProjectCanvas({ projectId, onBack }: Props) {
  const { nodes, setNodes, edges, setEdges, loading } = useCanvasStore();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──
  const [inputText, setInputText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId?: string; nodeType?: string } | null>(null);
  const [newNodeName, setNewNodeName] = useState("");

  // Edge editing
  const [editEdge, setEditEdge] = useState<Edge | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Refs
  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;
  const spaceRef = useRef(false);
  const spaceUsedRef = useRef(false);

  // ── Space key ──
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === "Space") { spaceRef.current = true; e.preventDefault(); } };
    const ku = () => { spaceRef.current = false; };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  // ── Drag: track Space intent ──
  const onNodeDrag = useCallback((_event: any, node: Node) => {
    if (spaceRef.current && node.parentId) spaceUsedRef.current = true;
  }, []);

  // ── Helpers ──
  const getNodeAbsPosition = useCallback((node: Node, allNodes: Node[]) => {
    let x = node.position.x, y = node.position.y;
    let p = node.parentId ? allNodes.find((n) => n.id === node.parentId) : null;
    while (p) { x += p.position.x; y += p.position.y; p = p.parentId ? allNodes.find((n) => n.id === p.parentId) : null; }
    return { x, y };
  }, []);

  const containerDepth = useCallback((n: Node, allNodes: Node[]): number => {
    if (!n.parentId) return 1;
    const p = allNodes.find((x) => x.id === n.parentId);
    if (!p || (p.type !== "module" && p.type !== "page")) return 1;
    return containerDepth(p, allNodes) + 1;
  }, []);

  const updateEntityParent = useCallback(async (nodeId: string, nodeType: string | undefined, parentId: string | null) => {
    try {
      if (nodeType === "page") await assetsApi.updatePage(projectId, nodeId, { moduleId: parentId });
      else if (nodeType === "field") await assetsApi.updateField(projectId, nodeId, { pageId: parentId });
      else if (nodeType === "action") await assetsApi.updateAction(projectId, nodeId, { pageId: parentId });
    } catch (err) { console.warn("update parent failed:", err); }
  }, [projectId]);

  const updateEntityPosition = useCallback(async (nodeId: string, nodeType: string | undefined, posX: number, posY: number) => {
    try {
      if (nodeType === "module") await assetsApi.updateModule(projectId, nodeId, { posX, posY });
      else if (nodeType === "page") await assetsApi.updatePage(projectId, nodeId, { posX, posY });
      else if (nodeType === "field") await assetsApi.updateField(projectId, nodeId, { posX, posY });
      else if (nodeType === "action") await assetsApi.updateAction(projectId, nodeId, { posX, posY });
    } catch (err) { console.warn("update position failed:", err); }
  }, [projectId]);

  // ── Drag stop: detach + inject + recalc ──
  const onNodeDragStop = useCallback((_event: any, node: Node) => {
    const wasSpace = spaceUsedRef.current;
    spaceUsedRef.current = false;

    const apiCalls: Array<() => void> = [];

    setNodes((nds) => {
      let updated = nds;

      // Step 0: Space detach
      if (wasSpace && node.parentId) {
        const abs = getNodeAbsPosition(node, nds);
        apiCalls.push(() => { updateEntityParent(node.id, node.type, null); updateEntityPosition(node.id, node.type, Math.round(abs.x), Math.round(abs.y)); });
        updated = updated.map((n) => n.id === node.id ? { ...n, parentId: undefined, position: { x: abs.x, y: abs.y }, data: { ...n.data, isFloating: true } } : n);
      }

      // Step 1: inject floating node
      const cur = updated.find((n) => n.id === node.id) || node;
      if (!cur.parentId) {
        const nPos = cur.position;
        const nw = Number(cur.style?.width) || nodeDefaultSize(cur.type, cur.data?.label).w;
        const nh = Number(cur.style?.height) || nodeDefaultSize(cur.type, cur.data?.label).h;
        const containers = updated.filter((n) => n.id !== cur.id && (n.type === "module" || n.type === "page")).map((c) => ({ c, depth: containerDepth(c, updated) }));
        const matches: Array<{ c: Node; depth: number; overlap: number }> = [];
        for (const { c, depth } of containers) {
          const ca = getNodeAbsPosition(c, updated);
          const cw = Number(c.style?.width) || 160, ch = Number(c.style?.height) || 36;
          const ox = Math.max(0, Math.min(nPos.x + nw, ca.x + cw) - Math.max(nPos.x, ca.x));
          const oy = Math.max(0, Math.min(nPos.y + nh, ca.y + ch) - Math.max(nPos.y, ca.y));
          if (ox > 0 && oy > 0) matches.push({ c, depth, overlap: ox * oy });
        }
        matches.sort((a, b) => b.depth - a.depth || b.overlap - a.overlap);
        if (matches.length > 0) {
          const best = matches[0].c;
          const rx = Math.round(nPos.x - best.position.x), ry = Math.round(nPos.y - best.position.y);
          apiCalls.push(() => { updateEntityParent(cur.id, cur.type, best.id); updateEntityPosition(cur.id, cur.type, rx, ry); });
          updated = updated.map((n) => n.id === cur.id ? { ...n, parentId: best.id, position: { x: rx, y: ry }, data: { ...n.data, isFloating: false } } : n);
        }
      }

      // Step 2: recalc all containers
      for (const n of updated) {
        if (n.type !== "module" && n.type !== "page") continue;
        const { w, h } = computeFluidBounds(updated, n.id, n.type === "module" ? 160 : 120, 36);
        const cw = Number(n.style?.width) || 0, ch = Number(n.style?.height) || 0;
        if (w !== cw || h !== ch) updated = updated.map((x) => x.id === n.id ? { ...x, style: { ...x.style, width: w, height: h } } : x);
      }

      setTimeout(() => apiCalls.forEach((fn) => fn()), 0);
      return updated;
    });
  }, [setNodes, updateEntityParent, updateEntityPosition, getNodeAbsPosition, containerDepth]);

  // ── Delete node: only the container, children become floating ──
  const deleteNodeById = useCallback((nodeId: string) => {
    const n = nodesRef.current.find((x) => x.id === nodeId);
    if (!n) return;

    // Orphan children
    const children = nodesRef.current.filter((c) => c.parentId === nodeId);
    for (const child of children) {
      const abs = getNodeAbsPosition(child, nodesRef.current);
      updateEntityParent(child.id, child.type, null);
      updateEntityPosition(child.id, child.type, Math.round(abs.x), Math.round(abs.y));
    }

    setNodes((nds) => {
      let updated = nds.filter((x) => x.id !== nodeId);
      // Re-add children as floating
      for (const child of children) {
        if (!child.parentId) continue;
        const abs = getNodeAbsPosition(child, nds);
        updated.push({ ...child, parentId: undefined, position: { x: abs.x, y: abs.y }, data: { ...child.data, isFloating: true } });
      }
      return updated;
    });

    if (n.type === "module") assetsApi.deleteModule(projectId, nodeId).catch(console.warn);
    else if (n.type === "page") assetsApi.deletePage(projectId, nodeId).catch(console.warn);
    else if (n.type === "field") assetsApi.deleteField(projectId, nodeId).catch(console.warn);
    else if (n.type === "action") assetsApi.deleteAction(projectId, nodeId).catch(console.warn);
  }, [setNodes, projectId, getNodeAbsPosition, updateEntityParent, updateEntityPosition]);

  // ── Create new node ──
  const createNewNode = useCallback((type: string, customName?: string) => {
    const label = customName || (type === "module" ? "新模块" : type === "page" ? "新页面" : type === "field" ? "新字段" : "新操作");
    const node: Node = {
      id: `new-${type}-${Date.now()}`,
      type,
      position: { x: 200 + Math.random() * 400, y: 100 + Math.random() * 300 },
      data: { label },
      style: nodeDefaultSize(type, label),
    };
    const apis: Record<string, any> = { module: assetsApi.createModule, page: assetsApi.createPage, field: assetsApi.createField, action: assetsApi.createAction };
    apis[type]?.(projectId, { name: label, posX: node.position.x, posY: node.position.y }).catch(console.warn);
    setNodes((nds) => [...nds, node]);
  }, [setNodes, projectId]);

  // ── Label save ──
  const onLabelSave = useCallback((nodeId: string, label: string) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, label } } : n));
    const n = nodesRef.current.find((x) => x.id === nodeId);
    if (n?.type === "module") assetsApi.updateModule(projectId, nodeId, { name: label }).catch(() => {});
    else if (n?.type === "page") assetsApi.updatePage(projectId, nodeId, { name: label }).catch(() => {});
    else if (n?.type === "field") assetsApi.updateField(projectId, nodeId, { name: label }).catch(() => {});
    else if (n?.type === "action") assetsApi.updateAction(projectId, nodeId, { name: label }).catch(() => {});
  }, [setNodes, projectId]);

  useEffect(() => { setOnLabelSave(onLabelSave); return () => setOnLabelSave(null); }, [onLabelSave]);

  // ── Connect edges ──
  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return;
    const edge = { id: `edge-${Date.now()}`, source: conn.source, target: conn.target, sourceHandle: conn.sourceHandle, targetHandle: conn.targetHandle, type: "smoothstep" as const, style: { stroke: "#86868b", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#86868b" } };
    setEdges((eds) => [...eds, edge as Edge]);
  }, [setEdges]);

  // ── Parse ──
  const handleParse = useCallback(async (text: string) => {
    if (!text.trim() || parsing) return;
    setError(""); setParsing(true);
    try {
      const data = await parseApi.parse(projectId, text);
      useCanvasStore.getState().loadProject(projectId);
      setInputText("");
    } catch (err) { setError(err instanceof Error ? err.message : "解析失败"); }
    finally { setParsing(false); }
  }, [parsing, projectId]);

  // ── Styles ──
  const menuBtn: React.CSSProperties = { border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#1d1d1f", padding: "8px 14px", borderRadius: 8, textAlign: "left", width: "100%" };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#86868b", fontSize: 14 }}>加载中...</div>;

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: "#f5f5f7", position: "relative" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
    >
      {/* Header */}
      <div style={{ padding: "12px 20px", background: "rgba(255,255,255,0.78)", backdropFilter: "blur(24px) saturate(1.4)", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 12, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: "rgba(0,113,227,0.08)", border: "none", cursor: "pointer", color: "#0071e3", fontSize: 13, fontWeight: 500, padding: "6px 14px", borderRadius: 20 }}>← 返回大厅</button>
        <span style={{ color: "#d2d2d7", fontSize: 18, fontWeight: 200 }}>|</span>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#1d1d1f" }}>{useCanvasStore.getState().projectName || "加载中..."}</span>
        <span style={{ color: "#86868b", fontSize: 12, marginLeft: 4 }}>{nodes.length} 节点 · {edges.length} 连线</span>
        <span style={{ color: "#86868b", fontSize: 11, background: "rgba(0,0,0,0.03)", padding: "4px 10px", borderRadius: 6, marginLeft: "auto" }}>Space + 拖拽脱出 · 拖到容器自动注入</span>
        {error && <span style={{ color: "#ff3b30", fontSize: 13, fontWeight: 500 }}>⚠ {error}</span>}
        {parsing && <span style={{ color: "#0071e3", fontSize: 13 }}>解析中...</span>}
      </div>

      {/* Canvas */}
      <div ref={reactFlowWrapper} style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={(changes: any) => setNodes((nds: Node[]) => {
            // Manually apply changes to avoid useNodesState dependency
            let result = [...nds];
            for (const c of changes) {
              if (c.type === "position" && c.position) {
                result = result.map((n) => n.id === c.id ? { ...n, position: c.position } : n);
              } else if (c.type === "select") {
                result = result.map((n) => n.id === c.id ? { ...n, selected: !!c.selected } : n);
              } else if (c.type === "remove") {
                result = result.filter((n) => n.id !== c.id);
              } else if (c.type === "add") {
                if (c.item) result.push(c.item as Node);
              }
            }
            return result;
          })}
          onEdgesChange={(changes: any) => setEdges((eds: Edge[]) => {
            let result = [...eds];
            for (const c of changes) {
              if (c.type === "add" && c.item) result.push(c.item as Edge);
              if (c.type === "remove") result = result.filter((e) => e.id !== c.id);
              if (c.type === "select") result = result.map((e) => e.id === c.id ? { ...e, selected: !!c.selected } : e);
            }
            return result;
          })}
          onConnect={onConnect}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodeContextMenu={(e, n) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: n.id, nodeType: n.type }); }}
          onPaneContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
          onEdgeDoubleClick={(e, edge) => { setEditEdge(edge); setEditLabel(edge.label || ""); }}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#86868b", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#86868b" } } as any}
          selectionMode={SelectionMode.Partial}
          fitView fitViewOptions={{ padding: 0.3, maxZoom: 1.5 }}
          deleteKeyCode="Delete" multiSelectionKeyCode="Shift"
          panOnScroll={false} zoomOnScroll={true} panOnDrag={[2]} selectNodesOnDrag={true}
          nodesDraggable={true}
          style={{ background: "#f5f5f7" }} minZoom={0.05} maxZoom={4}
        >
          <Background color="#e5e5e5" gap={20} size={1} />
          <Controls style={{ borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }} />
          <MiniMap style={{ borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }} pannable zoomable />
        </ReactFlow>

        {/* Context Menu */}
        {ctxMenu && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setCtxMenu(null)} />
            <div className="glass" style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 999, padding: 6, minWidth: 150, borderRadius: 10, display: "flex", flexDirection: "column", gap: 2 }}>
              {ctxMenu.nodeId ? (
                <>
                  <span style={{ padding: "4px 14px", fontSize: 11, color: "#86868b" }}>删除</span>
                  <button style={menuBtn} onClick={() => { deleteNodeById(ctxMenu.nodeId!); setCtxMenu(null); }}>🗑 删除此节点</button>
                </>
              ) : (
                <>
                  <span style={{ padding: "4px 14px", fontSize: 11, color: "#86868b" }}>新建</span>
                  {["module", "page", "field", "action"].map((t) => (
                    <div key={t} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 14px" }}>
                      <button style={menuBtn} onClick={() => { setNewNodeName(""); createNewNode(t); setCtxMenu(null); }}>📦 {t === "module" ? "模块" : t === "page" ? "页面" : t === "field" ? "字段" : "操作"}</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}

        {/* Edge Edit Dialog */}
        {editEdge && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 998, background: "rgba(0,0,0,0.2)" }} onClick={() => setEditEdge(null)} />
            <div className="glass" style={{ position: "fixed", top: "40%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 999, padding: 20, borderRadius: 12, minWidth: 280, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>编辑连线</span>
              <input placeholder="标签" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ padding: "8px 10px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 13, outline: "none" }} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={{ ...menuBtn, color: "#86868b" }} onClick={() => setEditEdge(null)}>取消</button>
                <button style={{ ...menuBtn, background: "#0071e3", color: "#fff" }} onClick={() => {
                  edgesApi.update(projectId, editEdge.id, { label: editLabel }).catch(() => {});
                  setEdges((eds) => eds.map((e) => e.id === editEdge.id ? { ...e, label: editLabel } : e));
                  setEditEdge(null);
                }}>保存</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Input Bar */}
      <div style={{
        padding: "12px 20px", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(24px) saturate(1.4)",
        borderTop: "1px solid rgba(0,0,0,0.05)", display: "flex", gap: 8, alignItems: "center"
      }}>
        <input value={inputText} onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && inputText.trim()) handleParse(inputText); }}
          placeholder="粘贴需求文档... Enter 提交解析" disabled={parsing}
          style={{
            flex: 1, padding: "10px 18px", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 24,
            fontSize: 14, outline: "none", background: "rgba(245,245,247,0.8)", color: "#1d1d1f"
          }}
        />
        <button onClick={() => fileInputRef.current?.click()} disabled={parsing}
          style={{ padding: "10px 14px", background: "rgba(0,0,0,0.04)", color: "#86868b", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 24, cursor: parsing ? "default" : "pointer", fontSize: 16 }}
        >📎</button>
        <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <button onClick={() => handleParse(inputText)} disabled={parsing || !inputText.trim()}
          style={{
            padding: "10px 24px", background: parsing || !inputText.trim() ? "rgba(0,113,227,0.3)" : "linear-gradient(135deg, #0071e3, #0056b3)",
            color: "#fff", border: "none", borderRadius: 24, cursor: parsing || !inputText.trim() ? "default" : "pointer", fontSize: 14, fontWeight: 500
          }}
        >{parsing ? "解析中..." : "解析 →"}</button>
      </div>
    </div>
  );
}

async function handleFile(file: File) { /* placeholder - file upload handler */ console.log("file selected:", file.name); }
