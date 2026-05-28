import { Router } from "express";
import prisma from "../lib/prisma";
import { extractTextFromBuffer } from "../lib/fileExtractor";

const router = Router();

// POST /api/inference/refine
router.post("/refine", async (req, res) => {
  let { projectId, rawText, fileContent: rawFileContent, fileBase64, fileName } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: "projectId required" });
  }
  if (!rawText && !rawFileContent && !fileBase64) {
    return res.status(400).json({ error: "rawText or fileContent or fileBase64 required" });
  }

  // Extract text from binary file upload (base64)
  if (fileBase64 && fileName) {
    try {
      const buffer = Buffer.from(fileBase64, "base64");
      const extracted = await extractTextFromBuffer(buffer, fileName);
      if (extracted) {
        rawFileContent = extracted;
      }
    } catch (err) {
      console.warn("[refine] base64 extraction failed:", err);
    }
  }

  // Detect and filter binary garbled content
  const fileContent = isBinaryGarbage(rawFileContent || "") ? "" : (rawFileContent || "");

  try {
    // Fetch project cognition summary from DB
    let projectSummary = "";
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { description: true, name: true },
      });
      projectSummary = project?.description || "";
    } catch {
      // non-fatal
    }

    // Try n8n first
    let n8nResult = await tryN8nRefine(projectId, rawText || "", fileContent || "", projectSummary);
    let refinedText = "";

    if (n8nResult) {
      console.log("[refine] n8n response keys:", Object.keys(n8nResult));
      // Handle both old format (optimized_description) and new format (refinedText)
      refinedText = n8nResult.refinedText || n8nResult.optimized_description || "";
      if (!refinedText) {
        console.warn("[refine] n8n returned no text content, falling back");
        n8nResult = null;
      }
    }

    if (!n8nResult) {
      console.warn("[refine] n8n unavailable, using fallback. N8N_BASE=", N8N_BASE);
      // Fallback: use project summary + raw text to produce a useful result
      const fallback = fallbackRefine(rawText || "", fileContent || "", projectSummary);
      refinedText = fallback.refinedText;
      n8nResult = fallback;
    }

    // Get all existing entities from DB to validate against
    const existingEntities = await getEntityLookup(projectId);

    // Validate entities from n8n workflow
    const n8nEntities: any[] = n8nResult?.entities || [];
    const validatedEntities = n8nEntities.map((e: any) => {
      if (!e.isNew) {
        const match = existingEntities.find(
          (ex) => ex.name === e.name && ex.type === e.type,
        );
        if (match) {
          return { ...e, id: match.id };
        }
        return null;
      }
      return e;
    }).filter(Boolean);

    // Scan refinedText for known entity names (backup detection)
    const textDetected: Record<string, boolean> = {};
    for (const e of validatedEntities) {
      textDetected[e.name + ":" + e.type] = true;
    }
    for (const ex of existingEntities) {
      if (!textDetected[ex.name + ":" + ex.type] && refinedText.includes(ex.name)) {
        validatedEntities.push({ ...ex, isNew: false });
        textDetected[ex.name + ":" + ex.type] = true;
      }
    }

    // If no entities detected at all, fall back to all existing
    const mergedEntities = validatedEntities.length > 0
      ? validatedEntities
      : existingEntities.map((e) => ({ ...e, isNew: false }));

    res.json({
      refinedText: refinedText,
      entities: mergedEntities,
    });
  } catch (err) {
    console.error("Refine error:", err);
    res.status(500).json({ error: "Refine failed" });
  }
});

// POST /api/inference/evaluate
router.post("/evaluate", async (req, res) => {
  const { projectId, refinedText, entities } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: "projectId required" });
  }

  try {
    // Try n8n first
    let result = await tryN8nEvaluate(projectId, refinedText || "", entities || []);
    if (!result) {
      result = { greenIds: [], redIds: [], tooltips: {} };
    }
    res.json(result);
  } catch (err) {
    console.error("Evaluate error:", err);
    res.status(500).json({ error: "Evaluate failed" });
  }
});

// ── n8n helpers ──

const N8N_BASE = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook";

async function tryN8nRefine(projectId: string, rawText: string, fileContent: string, projectSummary: string) {
  try {
    const payload: Record<string, any> = { projectId, rawText };
    if (fileContent) payload.fileContent = fileContent;
    if (projectSummary) payload.projectSummary = projectSummary;
    // Pass all DB entities so the LLM can tag existing ones with 【】
    try {
      const allEntities = await getEntityLookup(projectId);
      if (allEntities.length > 0) payload.entities = allEntities;
    } catch {
      // non-fatal
    }

    const url = `${N8N_BASE}/req-optimize`;
    console.log("[refine] calling n8n at", url);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn("[refine] n8n returned", response.status, body.slice(0, 300));
      return null;
    }
    const data = await response.json();
    console.log("[refine] n8n response:", JSON.stringify(data).slice(0, 500));
    return data;
  } catch (err) {
    console.warn("[refine] n8n error:", err instanceof Error ? `${err.name}: ${err.message}` : err);
    return null;
  }
}

async function tryN8nEvaluate(
  projectId: string,
  refinedText: string,
  entities: any[],
) {
  try {
    const response = await fetch(`${N8N_BASE}/req-evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, refinedText, entities }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// ── DB lookup ──

async function getEntityLookup(projectId: string) {
  const [modules, pages, fields, actions] = await Promise.all([
    prisma.module.findMany({ where: { projectId }, select: { id: true, name: true } }),
    prisma.page.findMany({ where: { projectId }, select: { id: true, name: true, moduleId: true } }),
    prisma.field.findMany({ where: { projectId }, select: { id: true, name: true, pageId: true } }),
    prisma.action.findMany({ where: { projectId }, select: { id: true, name: true, pageId: true } }),
  ]);

  const moduleMap = new Map(modules.map((m) => [m.id, m.name]));
  const pageMap = new Map(pages.map((p) => [p.id, p.name]));

  return [
    ...modules.map((m) => ({
      id: m.id, name: m.name, type: "module" as const,
      module_name: null as string | null, page_name: null as string | null,
    })),
    ...pages.map((p) => ({
      id: p.id, name: p.name, type: "page" as const,
      module_name: p.moduleId ? moduleMap.get(p.moduleId) || null : null,
      page_name: null as string | null,
    })),
    ...fields.map((f) => ({
      id: f.id, name: f.name, type: "field" as const,
      module_name: null as string | null,
      page_name: f.pageId ? pageMap.get(f.pageId) || null : null,
    })),
    ...actions.map((a) => ({
      id: a.id, name: a.name, type: "action" as const,
      module_name: null as string | null,
      page_name: a.pageId ? pageMap.get(a.pageId) || null : null,
    })),
  ];
}

// ── POST /impact — Impact Assessment (via n8n) + save "未入库" entities ──
router.post("/impact", async (req, res) => {
  const { projectId, refinedText, selectedModule, projectSummary } = req.body;
  if (!projectId || !refinedText) {
    return res.status(400).json({ error: "projectId and refinedText required" });
  }

  try {
    // Fetch existing entities for context
    const existingEntities = await getEntityLookup(projectId);

    // Call n8n webhook (which calls Ollama internally)
    const response = await fetch(`${N8N_BASE}/req-impact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        refinedText,
        selectedModule: selectedModule || undefined,
        projectSummary: projectSummary || undefined,
        entities: existingEntities,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn("[impact] n8n returned", response.status, body.slice(0, 300));
      return res.status(502).json({ error: "影响评估服务暂不可用" });
    }

    const result = await response.json();

    // Save new entities with status "未入库"
    try {
      await saveNewEntitiesWithStatus(projectId, {
        newEntities: result.newEntities || [],
        newEdges: result.newEdges || [],
      }, existingEntities);
    } catch (saveErr) {
      console.error("[impact] save entities failed:", saveErr);
      // Non-fatal: still return result to frontend
    }

    // Trigger incremental vector sync (fire-and-forget)
    triggerVectorSync(projectId).catch((err) =>
      console.warn("[impact] vector sync trigger failed:", err)
    );

    res.json({
      impactDescription: result.impactDescription || "",
      newEntities: result.newEntities || [],
      affectedEntities: result.affectedEntities || [],
      newEdges: result.newEdges || [],
    });
  } catch (err) {
    console.error("[impact] error:", err);
    res.status(500).json({ error: "影响评估失败" });
  }
});

// ── POST /inference/apply-impact-status — "未入库" → "已入库" ──
router.post("/apply-impact-status", async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: "projectId required" });
  }

  try {
    await Promise.all([
      prisma.module.updateMany({ where: { projectId, recordStatus: "未入库" }, data: { recordStatus: "已入库" } }),
      prisma.page.updateMany({ where: { projectId, recordStatus: "未入库" }, data: { recordStatus: "已入库" } }),
      prisma.field.updateMany({ where: { projectId, recordStatus: "未入库" }, data: { recordStatus: "已入库" } }),
      prisma.action.updateMany({ where: { projectId, recordStatus: "未入库" }, data: { recordStatus: "已入库" } }),
      prisma.edge.updateMany({ where: { projectId, recordStatus: "未入库" }, data: { recordStatus: "已入库" } }),
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("[apply-impact-status] error:", err);
    res.status(500).json({ error: "状态更新失败" });
  }
});

// ── DELETE /inference/cancel-impact-entities — 删除 "未入库" 数据 ──
router.delete("/cancel-impact-entities", async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: "projectId required" });
  }

  try {
    await Promise.all([
      prisma.edge.deleteMany({ where: { projectId, recordStatus: "未入库" } }),
      prisma.action.deleteMany({ where: { projectId, recordStatus: "未入库" } }),
      prisma.field.deleteMany({ where: { projectId, recordStatus: "未入库" } }),
      prisma.page.deleteMany({ where: { projectId, recordStatus: "未入库" } }),
      prisma.module.deleteMany({ where: { projectId, recordStatus: "未入库" } }),
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("[cancel-impact-entities] error:", err);
    res.status(500).json({ error: "删除失败" });
  }
});

// ── POST /apply-impact — Save impact assessment results ──
router.post("/apply-impact", async (req, res) => {
  const { projectId, impactResult } = req.body;
  if (!projectId || !impactResult) {
    return res.status(400).json({ error: "projectId and impactResult required" });
  }

  try {
    const { newEntities, affectedEntities, newEdges } = impactResult;

    // Build a name→id map for existing entities
    const existing = await getEntityLookup(projectId);
    const nameToExistingId = new Map<string, string>();
    for (const e of existing) nameToExistingId.set(e.name, e.id);

    // Fetch parent positions for calculating child positions
    const [parentModules, parentPages] = await Promise.all([
      prisma.module.findMany({ where: { projectId }, select: { id: true, name: true, posX: true, posY: true } }),
      prisma.page.findMany({ where: { projectId }, select: { id: true, name: true, posX: true, posY: true, moduleId: true } }),
    ]);
    const parentNameToPos = new Map<string, { x: number; y: number }>();
    for (const m of parentModules) parentNameToPos.set(m.name, { x: m.posX, y: m.posY });
    for (const p of parentPages) parentNameToPos.set(p.name, { x: p.posX, y: p.posY });

    const calcPos = (parentName: string | null, idx: number, isPage: boolean) => {
      if (parentName && parentNameToPos.has(parentName)) {
        const p = parentNameToPos.get(parentName)!;
        return { posX: p.x + (isPage ? 20 : 16), posY: p.y + 36 + idx * 52 };
      }
      return { posX: 100 + (idx % 3) * 200, posY: 200 + Math.floor(idx / 3) * 100 };
    };

    // Also create maps for newly created entities
    const nameToNewId = new Map<string, string>();

    // Auto-create missing parent entity (fallback for safety)
    const ensureApplyParent = async (parentName: string | null): Promise<string | null> => {
      if (!parentName) return null;
      const existingId = nameToNewId.get(parentName) || nameToExistingId.get(parentName);
      if (existingId) return existingId;
      const candidate = (newEntities || []).find((e: any) => e.name === parentName);
      if (!candidate) return null;
      if (nameToNewId.has(candidate.name)) return nameToNewId.get(candidate.name)!;
      if (candidate.type === "module") {
        const m = await prisma.module.create({ data: { projectId, name: candidate.name, posX: 100, posY: 100 } });
        nameToNewId.set(m.name, m.id);
        parentNameToPos.set(m.name, { x: m.posX, y: m.posY });
        return m.id;
      }
      if (candidate.type === "page") {
        const mid = candidate.parentName ? await ensureApplyParent(candidate.parentName) : null;
        const p = await prisma.page.create({ data: { projectId, moduleId: mid, name: candidate.name, posX: 100, posY: 100 } });
        nameToNewId.set(p.name, p.id);
        parentNameToPos.set(p.name, { x: p.posX, y: p.posY });
        return p.id;
      }
      return null;
    };

    // 1. Create modules first
    const newModules = (newEntities || []).filter((e: any) => e.type === "module");
    for (const m of newModules) {
      if (nameToExistingId.has(m.name)) {
        nameToNewId.set(m.name, nameToExistingId.get(m.name)!);
        continue;
      }
      const created = await prisma.module.create({
        data: { projectId, name: m.name, posX: 100, posY: 100 },
      });
      nameToNewId.set(m.name, created.id);
      applyIdx++;
    }

    // 2. Create pages (with per-parent counter for stacking)
    const pageCnt = new Map<string, number>();
    // Seed with existing pages per parent module
    const parentModuleIdToName = new Map(parentModules.map((m: any) => [m.id, m.name]));
    for (const p of parentPages) {
      if (p.moduleId) {
        const mName = parentModuleIdToName.get(p.moduleId);
        if (mName) pageCnt.set(mName, (pageCnt.get(mName) || 0) + 1);
      }
    }
    const newPages = (newEntities || []).filter((e: any) => e.type === "page");
    for (const p of newPages) {
      if (nameToExistingId.has(p.name)) {
        nameToNewId.set(p.name, nameToExistingId.get(p.name)!);
        continue;
      }
      const moduleId = await ensureApplyParent(p.parentName);
      const pk = p.parentName || "__root__";
      const idx = pageCnt.get(pk) || 0;
      pageCnt.set(pk, idx + 1);
      const pos = calcPos(p.parentName, idx, true);
      const created = await prisma.page.create({
        data: { projectId, moduleId, name: p.name, posX: pos.posX, posY: pos.posY },
      });
      nameToNewId.set(p.name, created.id);
    }

    // 3+4. Create fields & actions (shared per-parent counter to prevent overlap)
    const childCountPerParent = new Map<string, number>();
    // Seed counter with existing children count per parent
    const existingChildCounts = await getExistingChildCount(projectId);
    for (const [parentKey, count] of existingChildCounts) {
      childCountPerParent.set(parentKey, count);
    }
    const newFields = (newEntities || []).filter((e: any) => e.type === "field");
    for (const f of newFields) {
      if (nameToExistingId.has(f.name)) {
        nameToNewId.set(f.name, nameToExistingId.get(f.name)!);
        continue;
      }
      const pageId = await ensureApplyParent(f.parentName);
      const pk = f.parentName || "__root__";
      const idx = childCountPerParent.get(pk) || 0;
      childCountPerParent.set(pk, idx + 1);
      const pos = calcPos(f.parentName, idx, false);
      const created = await prisma.field.create({
        data: { projectId, pageId, name: f.name, fieldType: f.fieldType || "string", posX: pos.posX, posY: pos.posY },
      });
      nameToNewId.set(f.name, created.id);
    }

    const newActions = (newEntities || []).filter((e: any) => e.type === "action");
    for (const a of newActions) {
      if (nameToExistingId.has(a.name)) {
        nameToNewId.set(a.name, nameToExistingId.get(a.name)!);
        continue;
      }
      const pageId = await ensureApplyParent(a.parentName);
      const pk = a.parentName || "__root__";
      const idx = childCountPerParent.get(pk) || 0;
      childCountPerParent.set(pk, idx + 1);
      const pos = calcPos(a.parentName, idx, false);
      const created = await prisma.action.create({
        data: { projectId, pageId, name: a.name, actionType: a.actionType || "operation", posX: pos.posX, posY: pos.posY },
      });
      nameToNewId.set(a.name, created.id);
    }

    // 5. Determine affected entity IDs (mark existing ones)
    const affectedIds: string[] = [];
    for (const ae of affectedEntities || []) {
      const id = nameToExistingId.get(ae.name);
      if (id) affectedIds.push(id);
    }

    // 6. Create new edges
    for (const edge of newEdges || []) {
      const sourceId = nameToNewId.get(edge.sourceName) || nameToExistingId.get(edge.sourceName);
      const targetId = nameToNewId.get(edge.targetName) || nameToExistingId.get(edge.targetName);
      if (!sourceId || !targetId) {
        console.warn(`[apply-impact] skipping edge: unknown entity "${edge.sourceName}" → "${edge.targetName}"`);
        continue;
      }
      // Check if edge already exists
      const exists = await prisma.edge.findFirst({
        where: { projectId, sourceId, targetId },
      });
      if (!exists) {
        await prisma.edge.create({
          data: {
            projectId,
            sourceId,
            targetId,
            label: edge.label || "影响关联",
            flowType: edge.flowType || "BUSINESS_FLOW",
            status: "extracted",
          },
        });
      }
    }

    // 7. Return updated project data
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        modules: { include: { pages: { include: { fields: true, actions: true } } }, orderBy: { createdAt: "asc" } },
        pages: { where: { moduleId: null }, include: { fields: true, actions: true }, orderBy: { createdAt: "asc" } },
        fields: { where: { pageId: null } },
        actions: { where: { pageId: null } },
        edges: { orderBy: { createdAt: "asc" } },
      },
    });

    res.json({ project, affectedIds });
  } catch (err) {
    console.error("[apply-impact] error:", err);
    res.status(500).json({ error: "Apply impact failed" });
  }
});

// ── Fallback refine (when n8n unavailable) ──

function fallbackRefine(rawText: string, _fileContent: string, projectSummary: string) {
  const text = rawText || _fileContent || "";
  const sentences = text.split(/[。；，\n]/).map((s) => s.trim()).filter(Boolean);

  const modules: Array<{ name: string; type: string; isNew: boolean }> = [];
  const pages: Array<{ name: string; type: string; isNew: boolean }> = [];
  const fields: Array<{ name: string; type: string; isNew: boolean; fieldType?: string }> = [];
  const actions: Array<{ name: string; type: string; isNew: boolean; actionType?: string }> = [];

  for (const s of sentences) {
    if (s.includes("模块") || s.includes("系统")) {
      const name = s.replace(/[#\s*\-]+/g, "").trim();
      if (name && name.length < 30) {
        modules.push({ name: name.length > 10 ? name.slice(0, 10) : name, type: "module", isNew: true });
      }
    }
    if (s.includes("页")) {
      const name = s.replace(/[#\s*\-]+/g, "").trim();
      if (name && name.length < 20) {
        pages.push({ name, type: "page", isNew: true });
      }
    }
    const fMatch = s.match(/([^，。；]+?)(输入框|复选框|下拉框|列表|文本框|开关|选择器|日期|上传)/);
    if (fMatch) {
      fields.push({
        name: fMatch[0].trim(),
        type: "field",
        isNew: true,
        fieldType: fMatch[2].includes("复选框") ? "boolean" : "string",
      });
    }
    const aMatch = s.match(/([^，。；]+?)(按钮|提交|保存|删除|编辑|搜索|新增|登录|注册|导出|导入|批量)/);
    if (aMatch) {
      actions.push({
        name: aMatch[0].trim(),
        type: "action",
        isNew: true,
        actionType: aMatch[2].includes("按钮") ? "button" : "operation",
      });
    }
  }

  // Build a useful refinedText from the raw text, wrapping known entities
  let refinedText = text;
  if (projectSummary) {
    refinedText = `【需求分析】\n${text}\n\n【项目现状】\n${projectSummary.slice(0, 500)}\n\n【优化说明】\n（AI优化请求超时，以上为原始需求文本，可稍后重试。新增实体${modules.length > 0 ? `模块: ${modules.map(m => `{${m.name}:module}`).join("、")}` : ""}${pages.length > 0 ? `、页面: ${pages.map(p => `{${p.name}:page}`).join("、")}` : ""}${fields.length > 0 ? `、字段: ${fields.map(f => `{${f.name}:field}`).join("、")}` : ""}${actions.length > 0 ? `、操作: ${actions.map(a => `{${a.name}:action}`).join("、")}` : ""})`;
  } else {
    refinedText = `【需求分析】\n${text}\n\n（AI优化请求超时，以上为原始需求文本，可稍后重试）`;
  }

  const entities = [
    ...modules,
    ...pages,
    ...fields,
    ...actions,
  ];

  return { refinedText, entities };
}

// ── Binary content detection ──

function isBinaryGarbage(text: string): boolean {
  if (!text) return false;
  if (text.includes("�")) return true;
  if (text.includes("\0")) return true;
  let ctrlCount = 0;
  const len = Math.min(text.length, 2000);
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if (code === 0 || (code < 32 && code !== 10 && code !== 13 && code !== 9)) {
      ctrlCount++;
    }
  }
  return ctrlCount > Math.max(20, len * 0.1);
}

// ── GET /inference/unsaved-entities/:projectId — 获取 "未入库" 数据 ──
router.get("/unsaved-entities/:projectId", async (req, res) => {
  const { projectId } = req.params;
  try {
    const [modules, pages, fields, actions, edges] = await Promise.all([
      prisma.module.findMany({ where: { projectId, recordStatus: "未入库" } }),
      prisma.page.findMany({ where: { projectId, recordStatus: "未入库" } }),
      prisma.field.findMany({ where: { projectId, recordStatus: "未入库" } }),
      prisma.action.findMany({ where: { projectId, recordStatus: "未入库" } }),
      prisma.edge.findMany({ where: { projectId, recordStatus: "未入库" } }),
    ]);

    const allIds = new Set<string>();
    for (const m of modules) allIds.add(m.id);
    for (const p of pages) allIds.add(p.id);
    for (const f of fields) allIds.add(f.id);
    for (const a of actions) allIds.add(a.id);

    // Only return edges where both endpoints are "未入库"
    const filteredEdges = edges.filter((e) => allIds.has(e.sourceId) && allIds.has(e.targetId));

    res.json({ modules, pages, fields, actions, edges: filteredEdges });
  } catch (err) {
    console.error("[unsaved-entities] error:", err);
    res.status(500).json({ error: "获取失败" });
  }
});

// ── Helpers: save "未入库" entities ──

async function saveNewEntitiesWithStatus(
  projectId: string,
  impactResult: { newEntities: any[]; newEdges: any[] },
  existingEntities: Array<{ id: string; name: string; type: string; module_name: string | null; page_name: string | null }>,
) {
  // Strip ":type" suffix from entity name (safety net for LLM output like "拓扑图绘制:page")
  const stripSuffix = (name: string | null) => {
    if (!name) return name;
    return name.replace(/:(module|page|field|action)$/, "");
  };

  // Fetch all project entities for wider name-based parent resolution
  const [extraModules, extraPages] = await Promise.all([
    prisma.module.findMany({ where: { projectId }, select: { id: true, name: true, posX: true, posY: true } }),
    prisma.page.findMany({ where: { projectId }, select: { id: true, name: true, moduleId: true, posX: true, posY: true } }),
  ]);
  const extraModuleNameToId = new Map(extraModules.map((m) => [m.name, m.id]));
  const extraModulePos = new Map(extraModules.map((m) => [m.id, { x: m.posX, y: m.posY }]));
  const extraPageNameToId = new Map(extraPages.map((p) => [p.name, p.id]));
  const extraPagePos = new Map(extraPages.map((p) => [p.id, { x: p.posX, y: p.posY }]));

  // Calculate child position relative to parent
  const childPos = (parentName: string | null, idx: number, isPage: boolean): { posX: number; posY: number } => {
    if (!parentName) return { posX: 100 + (idx % 3) * 200, posY: 200 + Math.floor(idx / 3) * 100 };
    const parentId = extraModuleNameToId.get(parentName) || extraPageNameToId.get(parentName);
    if (!parentId) return { posX: 100 + (idx % 3) * 200, posY: 200 + Math.floor(idx / 3) * 100 };
    const pos = extraModulePos.get(parentId) || extraPagePos.get(parentId);
    if (!pos) return { posX: 100 + (idx % 3) * 200, posY: 200 + Math.floor(idx / 3) * 100 };
    const offsetX = isPage ? 20 : 16;
    const offsetY = isPage ? 36 : 36;
    return { posX: pos.x + offsetX, posY: pos.y + offsetY + idx * 52 };
  };

  const { newEntities, newEdges } = impactResult;
  const nameToExistingId = new Map<string, string>();
  for (const e of existingEntities) nameToExistingId.set(e.name, e.id);

  const nameToNewId = new Map<string, string>();

  // Try: new entities → existing entities → project-wide name lookup
  const resolveParentId = (parentName: string | null) => {
    if (!parentName) return null;
    const cleaned = stripSuffix(parentName) || parentName;
    return nameToNewId.get(cleaned) || nameToExistingId.get(cleaned) ||
           extraModuleNameToId.get(cleaned) || extraPageNameToId.get(cleaned) || null;
  };

  // Auto-create missing parent entity (recursive, handles parent chains)
  const ensureParent = async (parentName: string | null): Promise<string | null> => {
    if (!parentName) return null;
    const existingId = resolveParentId(parentName);
    if (existingId) return existingId;
    // Try finding a matching newEntity and create it
    const candidate = newEntities.find((e: any) => e.name === stripSuffix(parentName) || e.name === parentName);
    if (!candidate) return null;
    if (nameToNewId.has(candidate.name)) return nameToNewId.get(candidate.name)!;
    if (nameToExistingId.has(candidate.name)) return nameToExistingId.get(candidate.name)!;
    // Recursively ensure grandparent first
    if (candidate.parentName) await ensureParent(candidate.parentName);
    // Create based on type
    if (candidate.type === "module") {
      const m = await prisma.module.create({
        data: { projectId, name: candidate.name, posX: 100, posY: 100, recordStatus: "未入库" },
      });
      nameToNewId.set(m.name, m.id);
      extraModuleNameToId.set(m.name, m.id);
      extraModulePos.set(m.id, { x: m.posX, y: m.posY });
      return m.id;
    }
    if (candidate.type === "page") {
      const mid = candidate.parentName ? await ensureParent(candidate.parentName) : null;
      const p = await prisma.page.create({
        data: { projectId, moduleId: mid, name: candidate.name, posX: 100, posY: 100, recordStatus: "未入库" },
      });
      nameToNewId.set(p.name, p.id);
      extraPageNameToId.set(p.name, p.id);
      extraPagePos.set(p.id, { x: p.posX, y: p.posY });
      return p.id;
    }
    return null;
  };

  // 1. Create modules
  const newModules = newEntities.filter((e: any) => e.type === "module");
  for (const m of newModules) {
    if (nameToExistingId.has(m.name)) { nameToNewId.set(m.name, nameToExistingId.get(m.name)!); continue; }
    const created = await prisma.module.create({
      data: { projectId, name: m.name, posX: 100, posY: 100, recordStatus: "未入库" },
    });
    nameToNewId.set(m.name, created.id);
  }

  // 2. Create pages (with per-module counter for stacking)
  const pageCountPerParent = new Map<string, number>();
  // Seed with existing pages per parent module
  const extraModuleIdToName = new Map(extraModules.map((m: any) => [m.id, m.name]));
  for (const p of extraPages) {
    if (p.moduleId) {
      const mName = extraModuleIdToName.get(p.moduleId);
      if (mName) pageCountPerParent.set(mName, (pageCountPerParent.get(mName) || 0) + 1);
    }
  }
  const newPages = newEntities.filter((e: any) => e.type === "page");
  for (const p of newPages) {
    if (nameToExistingId.has(p.name)) { nameToNewId.set(p.name, nameToExistingId.get(p.name)!); continue; }
    const parentKey = p.parentName || "__root__";
    const idx = pageCountPerParent.get(parentKey) || 0;
    pageCountPerParent.set(parentKey, idx + 1);
    const pos = childPos(p.parentName, idx, true);
    // Auto-create missing parent module if needed
    const moduleId = await ensureParent(p.parentName);
    const created = await prisma.page.create({
      data: { projectId, moduleId, name: p.name, posX: pos.posX, posY: pos.posY, recordStatus: "未入库" },
    });
    nameToNewId.set(p.name, created.id);
  }

  // 3+4. Create fields & actions (shared per-parent counter to prevent overlap)
  const childCountPerParent = new Map<string, number>();
  // Seed counter with existing children already in DB for this parent
  const existingChildCounts = await getExistingChildCount(projectId);
  for (const [parentKey, count] of existingChildCounts) {
    childCountPerParent.set(parentKey, count);
  }
  const newFields = newEntities.filter((e: any) => e.type === "field");
  for (const f of newFields) {
    if (nameToExistingId.has(f.name)) { nameToNewId.set(f.name, nameToExistingId.get(f.name)!); continue; }
    const parentKey = f.parentName || "__root__";
    const idx = childCountPerParent.get(parentKey) || 0;
    childCountPerParent.set(parentKey, idx + 1);
    const pos = childPos(f.parentName, idx, false);
    const pageId = await ensureParent(f.parentName);
    const created = await prisma.field.create({
      data: { projectId, pageId: pageId || resolveParentId(f.parentName), name: f.name, fieldType: f.fieldType || "string", posX: pos.posX, posY: pos.posY, recordStatus: "未入库" },
    });
    nameToNewId.set(f.name, created.id);
  }

  const newActions = newEntities.filter((e: any) => e.type === "action");
  for (const a of newActions) {
    if (nameToExistingId.has(a.name)) { nameToNewId.set(a.name, nameToExistingId.get(a.name)!); continue; }
    const parentKey = a.parentName || "__root__";
    const idx = childCountPerParent.get(parentKey) || 0;
    childCountPerParent.set(parentKey, idx + 1);
    const pos = childPos(a.parentName, idx, false);
    const pageId = await ensureParent(a.parentName);
    const created = await prisma.action.create({
      data: { projectId, pageId: pageId || resolveParentId(a.parentName), name: a.name, actionType: a.actionType || "operation", posX: pos.posX, posY: pos.posY, recordStatus: "未入库" },
    });
    nameToNewId.set(a.name, created.id);
  }

  // 5. Create new edges
  for (const edge of newEdges || []) {
    const sourceId = nameToNewId.get(edge.sourceName) || nameToExistingId.get(edge.sourceName);
    const targetId = nameToNewId.get(edge.targetName) || nameToExistingId.get(edge.targetName);
    if (!sourceId || !targetId) continue;
    const exists = await prisma.edge.findFirst({ where: { projectId, sourceId, targetId } });
    if (!exists) {
      await prisma.edge.create({
        data: { projectId, sourceId, targetId, label: edge.label || "影响关联", flowType: edge.flowType || "BUSINESS_FLOW", status: "extracted", recordStatus: "未入库" },
      });
    }
  }
}

async function triggerVectorSync(projectId: string) {
  try {
    // Fetch all "未入库" entities
    const [modules, pages, fields, actions] = await Promise.all([
      prisma.module.findMany({ where: { projectId, recordStatus: "未入库" }, select: { id: true, name: true } }),
      prisma.page.findMany({ where: { projectId, recordStatus: "未入库" }, select: { id: true, name: true, moduleId: true } }),
      prisma.field.findMany({ where: { projectId, recordStatus: "未入库" }, select: { id: true, name: true, pageId: true, fieldType: true } }),
      prisma.action.findMany({ where: { projectId, recordStatus: "未入库" }, select: { id: true, name: true, pageId: true, actionType: true } }),
    ]);

    // Fetch ALL modules/pages in the project for name-based parent resolution
    const [allModules, allPages] = await Promise.all([
      prisma.module.findMany({ where: { projectId }, select: { id: true, name: true } }),
      prisma.page.findMany({ where: { projectId }, select: { id: true, name: true, moduleId: true } }),
    ]);

    // Build maps: ID→name for foreign key lookup
    const moduleNameById = new Map(allModules.map((m) => [m.id, m.name]));
    const pageNameById = new Map(allPages.map((p) => [p.id, p.name]));
    const pageModuleId = new Map(allPages.map((p) => [p.id, p.moduleId]));

    // Helper: resolve camelCase parent names
    const resolveParent = (pageId: string | null) => {
      let pageName = "";
      let moduleName = "";
      if (pageId) {
        pageName = pageNameById.get(pageId) || "";
        const parentModuleId = pageModuleId.get(pageId);
        if (parentModuleId) moduleName = moduleNameById.get(parentModuleId) || "";
      }
      return { moduleName, pageName };
    };

    const entities = [
      ...modules.map((m) => ({ id: m.id, name: m.name, type: "module" as const, moduleName: "", pageName: "" })),
      ...pages.map((p) => ({ id: p.id, name: p.name, type: "page" as const, moduleName: p.moduleId ? moduleNameById.get(p.moduleId) || "" : "", pageName: "" })),
      ...fields.map((f) => ({ id: f.id, name: f.name, type: "field" as const, ...resolveParent(f.pageId) })),
      ...actions.map((a) => ({ id: a.id, name: a.name, type: "action" as const, ...resolveParent(a.pageId) })),
    ];

    if (entities.length === 0) return;

    await fetch(`${N8N_BASE}/vector-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, entities }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    console.warn("[vector-sync] trigger failed:", err);
  }
}

// ── Helper: count existing fields+actions per parent page (by page NAME, not ID) ──
async function getExistingChildCount(projectId: string): Promise<Map<string, number>> {
  const [fields, actions, allPages] = await Promise.all([
    prisma.field.findMany({ where: { projectId, pageId: { not: null } }, select: { pageId: true } }),
    prisma.action.findMany({ where: { projectId, pageId: { not: null } }, select: { pageId: true } }),
    prisma.page.findMany({ where: { projectId }, select: { id: true, name: true } }),
  ]);
  const pageIdToName = new Map(allPages.map((p) => [p.id, p.name]));
  const counts = new Map<string, number>();
  for (const f of fields) {
    if (f.pageId) {
      const name = pageIdToName.get(f.pageId);
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  for (const a of actions) {
    if (a.pageId) {
      const name = pageIdToName.get(a.pageId);
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return counts;
}

export default router;
