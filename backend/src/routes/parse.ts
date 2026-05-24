import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// Layout constants
const MODULE_X_START = 80;
const MODULE_GAP = 500;
const MODULE_Y = 80;
const PAGE_X_OFFSET = 40;
const PAGE_Y_OFFSET = 40;
const FIELD_X = 10;
const FIELD_Y_OFFSET = 44;

let moduleCounter = 0;
function nextModuleX() {
  const x = MODULE_X_START + moduleCounter * MODULE_GAP;
  moduleCounter++;
  return x;
}

async function getFullProject(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      modules: { include: { pages: { include: { fields: true, actions: true } } }, orderBy: { createdAt: "asc" } },
      pages: { where: { moduleId: null }, include: { fields: true, actions: true }, orderBy: { createdAt: "asc" } },
      fields: { where: { pageId: null } },
      actions: { where: { pageId: null } },
      edges: true,
      validations: true,
    },
  });
}

router.post("/:projectId", async (req, res) => {
  const { text } = req.body;
  const projectId = req.params.projectId as string;
  if (!text) return res.status(400).json({ error: "text is required" });

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Clear existing data
    await prisma.validation.deleteMany({ where: { projectId } });
    await prisma.edge.deleteMany({ where: { projectId } });
    await prisma.action.deleteMany({ where: { projectId } });
    await prisma.field.deleteMany({ where: { projectId } });
    await prisma.page.deleteMany({ where: { projectId } });
    await prisma.module.deleteMany({ where: { projectId } });

    moduleCounter = 0;

    // Try Ollama first, fallback to regex
    let parsed = await tryOllamaParse(text);
    if (!parsed) parsed = regexParse(text);

    // Create modules
    const moduleMap = new Map<string, string>();
    const pageMap = new Map<string, string>();

    for (const mod of parsed.modules) {
      const m = await prisma.module.create({
        data: { projectId, name: mod.name, posX: nextModuleX(), posY: MODULE_Y },
      });
      moduleMap.set(mod.name, m.id);

      let py = PAGE_Y_OFFSET;
      for (const page of mod.pages) {
        const p = await prisma.page.create({
          data: { projectId, name: page.name, moduleId: m.id, posX: PAGE_X_OFFSET, posY: py },
        });
        pageMap.set(page.name, p.id);

        let fx = FIELD_X;
        for (const field of page.fields) {
          await prisma.field.create({
            data: { projectId, name: field.name, fieldType: field.fieldType || "string", pageId: p.id, posX: fx, posY: FIELD_Y_OFFSET },
          });
          fx += 180;
        }

        let ay = FIELD_Y_OFFSET + 32;
        for (const action of page.actions) {
          const a = await prisma.action.create({
            data: { projectId, name: action.name, actionType: action.actionType || "button", pageId: p.id, posX: FIELD_X, posY: ay },
          });
          if (action.validations?.length) {
            await prisma.validation.createMany({
              data: action.validations.map((v: string) => ({ projectId, actionId: a.id, rule: v, type: "pre_condition" })),
            });
          }
          ay += 32;
        }
        py += 140;
      }
    }

    // Create edges
    for (const edge of parsed.edges) {
      const sourceId = pageMap.get(edge.sourceName) || null;
      const targetId = pageMap.get(edge.targetName) || null;
      if (sourceId && targetId) {
        await prisma.edge.create({
          data: { projectId, sourceId, targetId, label: edge.label || "", sourceQuote: edge.sourceQuote || "", flowType: edge.flowType || "BUSINESS_FLOW" },
        });
      }
    }

    const full = await getFullProject(projectId);
    res.json(full);
  } catch (err) {
    console.error("Parse error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Parse failed" });
  }
});

// Try local Ollama for structured JSON output
async function tryOllamaParse(text: string): Promise<ParsedResult | null> {
  try {
    const prompt = `从以下中文需求文档中提取系统模块、页面、字段（输入项）和操作（按钮/动作）。
返回 JSON 格式（必须严格符合此 schema）：
{"modules": [{"name": "模块名", "pages": [{"name": "页面名", "fields": [{"name": "字段名", "fieldType": "string|boolean"}], "actions": [{"name": "操作名", "actionType": "button|operation", "validations": ["前置条件1"]}]}]}], "edges": [{"sourceName": "来源页面名", "targetName": "目标页面名", "label": "触发动作描述", "flowType": "BUSINESS_FLOW"}]}

需求文档：
${text}

JSON 输出（只输出 JSON，不要其他文字）：`;

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "qwen2.5:7b", prompt, stream: false, format: "json" }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const result = JSON.parse(data.response);
    if (result.modules?.length) return result;
    return null;
  } catch {
    return null;
  }
}

interface ParsedResult {
  modules: Array<{
    name: string;
    pages: Array<{
      name: string;
      fields: Array<{ name: string; fieldType?: string }>;
      actions: Array<{ name: string; actionType?: string; validations?: string[] }>;
    }>;
  }>;
  edges: Array<{ sourceName: string; targetName: string; label?: string; sourceQuote?: string; flowType?: string }>;
}

// Improved regex parser for Chinese text
// Handles: "系统名。页面名包含字段名、字段名和操作名。另一个页面..."
function regexParse(text: string): ParsedResult {
  const modules: ParsedResult["modules"] = [];
  const edges: ParsedResult["edges"] = [];

  // Split by 句号
  const sentences = text.split(/[。；]/).map((s) => s.trim()).filter(Boolean);

  let currentModule: ParsedResult["modules"][0] | null = null;
  let currentPage: ParsedResult["modules"][0]["pages"][0] | null = null;

  for (const s of sentences) {
    // Detect module: first sentence that contains "系统" or first sentence overall
    if (!currentModule && (s.includes("系统") || sentences.indexOf(s) === 0)) {
      const modName = s.replace(/包含.*/, "").trim();
      currentModule = { name: modName || "系统", pages: [] };
      modules.push(currentModule);
    }

    if (!currentModule) {
      currentModule = { name: "系统", pages: [] };
      modules.push(currentModule);
    }

    // Detect page: sentences with "页" or "包含" (but not already used as module name)
    if ((s.includes("页") || s.includes("页面") || s.includes("选项卡") || s.includes("区域")) && s.length < 30) {
      const pageName = s.replace(/^[#\s*\-]+/, "").replace(/包含.*/g, "").replace(/、/g, "、").trim();
      if (pageName.length > 1 && pageName.length < 20) {
        currentPage = { name: pageName, fields: [], actions: [] };
        currentModule.pages.push(currentPage);
      }
    }

    // Always ensure there's a current page
    if (!currentPage) {
      currentPage = { name: "通用页面", fields: [], actions: [] };
      currentModule.pages.push(currentPage);
    }

    // Extract items from this sentence
    // Split by "、" or "和" or ","
    const items = s.split(/[、，,]|(?<=[^和])和(?=[^和])/);

    for (const item of items) {
      const i = item.trim();
      if (!i || i.length < 2) continue;

      // Check if it's a field (input, checkbox, dropdown, list, area)
      const fMatch = i.match(/([^，。；]+?)(输入框|复选框|下拉框|列表|展示|选择框|文本框|选框)/);
      if (fMatch) {
        const name = fMatch[0].trim();
        if (!currentPage.fields.find((f) => f.name === name)) {
          currentPage.fields.push({ name, fieldType: fMatch[2].includes("复选框") ? "boolean" : "string" });
        }
        continue;
      }

      // Check if it's an action (button, submit, save, delete, edit, search, add, login, register)
      const aMatch = i.match(/([^，。；]+?)(按钮|提交|保存|删除|编辑|搜索|新增|登录|注册|重置|取消|确认|返回)/);
      if (aMatch) {
        const name = aMatch[0].trim();
        if (!currentPage.actions.find((a) => a.name === name)) {
          currentPage.actions.push({ name, actionType: aMatch[2].includes("按钮") ? "button" : "operation", validations: [] });
        }
      }
    }
  }

  // Post-processing: if we only have 1 page, check if the sentences describe different pages
  // (e.g., "登录页包含...用户管理页包含...")
  return { modules, edges };
}

export default router;
