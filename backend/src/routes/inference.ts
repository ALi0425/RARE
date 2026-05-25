import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// POST /api/inference/refine
router.post("/refine", async (req, res) => {
  const { projectId, rawText } = req.body;
  if (!projectId || !rawText) {
    return res.status(400).json({ error: "projectId and rawText required" });
  }

  try {
    // Try n8n first, fallback to simple regex
    let result = await tryN8nRefine(projectId, rawText);

    if (!result) {
      // Fallback: extract entities via regex
      result = fallbackRefine(rawText);
    }

    // Get all existing entities from DB to validate against
    const existingEntities = await getEntityLookup(projectId);

    // Validate entities against DB
    const validatedEntities = result.entities.map((e: any) => {
      if (!e.isNew) {
        const match = existingEntities.find(
          (ex) =>
            ex.name === e.name && ex.type === e.type,
        );
        if (match) {
          return { ...e, id: match.id };
        }
        // Not found → degrade (remove from list)
        return null;
      }
      return e;
    }).filter(Boolean);

    res.json({
      refinedText: result.refinedText,
      entities: validatedEntities,
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

async function tryN8nRefine(projectId: string, rawText: string) {
  try {
    const response = await fetch(`${N8N_BASE}/req-optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, rawText }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
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
    prisma.page.findMany({ where: { projectId }, select: { id: true, name: true } }),
    prisma.field.findMany({ where: { projectId }, select: { id: true, name: true } }),
    prisma.action.findMany({ where: { projectId }, select: { id: true, name: true } }),
  ]);

  return [
    ...modules.map((m) => ({ id: m.id, name: m.name, type: "module" as const })),
    ...pages.map((p) => ({ id: p.id, name: p.name, type: "page" as const })),
    ...fields.map((f) => ({ id: f.id, name: f.name, type: "field" as const })),
    ...actions.map((a) => ({ id: a.id, name: a.name, type: "action" as const })),
  ];
}

// ── Fallback refine (when n8n unavailable) ──

function fallbackRefine(text: string) {
  const modules: Array<{ name: string; type: string; isNew: boolean }> = [];
  const pages: Array<{ name: string; type: string; isNew: boolean }> = [];
  const fields: Array<{ name: string; type: string; isNew: boolean; fieldType?: string }> = [];
  const actions: Array<{ name: string; type: string; isNew: boolean; actionType?: string }> = [];

  const sentences = text.split(/[。；，]/).map((s) => s.trim()).filter(Boolean);

  let currentModule = "";
  let currentPage = "";

  for (const s of sentences) {
    if (s.includes("模块") || s.includes("系统")) {
      const name = s.replace(/包含.*/, "").replace(/[#\s*\-]+/g, "").trim();
      if (name && name.length < 20) {
        currentModule = name;
        modules.push({ name, type: "module", isNew: true });
      }
    }

    if (s.includes("页") || s.includes("选项卡")) {
      const name = s.replace(/包含.*/, "").replace(/[#\s*\-]+/g, "").trim();
      if (name && name.length < 20) {
        currentPage = name;
        pages.push({ name, type: "page", isNew: true });
      }
    }

    const fMatch = s.match(/([^，。；]+?)(输入框|复选框|下拉框|列表|文本框)/);
    if (fMatch) {
      fields.push({
        name: fMatch[0].trim(),
        type: "field",
        isNew: true,
        fieldType: fMatch[2].includes("复选框") ? "boolean" : "string",
      });
    }

    const aMatch = s.match(/([^，。；]+?)(按钮|提交|保存|删除|编辑|搜索|新增|登录|注册)/);
    if (aMatch) {
      actions.push({
        name: aMatch[0].trim(),
        type: "action",
        isNew: true,
        actionType: aMatch[2].includes("按钮") ? "button" : "operation",
      });
    }
  }

  const entities = [
    ...modules,
    ...pages,
    ...fields,
    ...actions,
  ] as any[];

  return {
    refinedText: text,
    entities,
  };
}

export default router;
