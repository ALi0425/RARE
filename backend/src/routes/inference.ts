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

export default router;
