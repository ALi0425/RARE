import { Router } from "express";
import multer from "multer";
import prisma from "../lib/prisma";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const PARSER_URL = process.env.PARSER_URL || "http://localhost:8003";
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook";

// ── POST /api/analyze/:projectId ──
router.post(
  "/:projectId",
  upload.array("files"),
  async (req, res) => {
    const projectId = req.params.projectId;
    const text = (req.body.text || "").trim();
    const files = (req.files || []) as Express.Multer.File[];

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (stage: string, progress: number, message: string) => {
      res.write(`data: ${JSON.stringify({ stage, progress, message })}\n\n`);
    };

    try {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) { send("error", 0, "项目不存在"); res.end(); return; }

      // ── Stage 1: Parse files ──
      send("parsing", 5, "准备解析...");
      let allText = text;
      if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          send("parsing", 10 + Math.round((i / files.length) * 20), `解析文件 ${i + 1}/${files.length}: ${f.originalname}`);
          const extracted = await extractFileText(f);
          if (extracted) allText += `\n\n--- ${f.originalname} ---\n${extracted}`;
        }
      }
      if (!allText.trim()) { send("error", 0, "没有可分析的内容"); res.end(); return; }

      // ── Stage 2: Parse (via n8n workflow + regex) ──
      send("analyzing", 35, "解析需求中...");
      const result = await parseWithFallback(allText);

      // ── Stage 3: Graph reasoning (rule-based for now) ──
      send("reasoning", 60, "推理业务流程...");
      const graphResult = deriveGraphRelations(result);

      // ── Stage 4: Save to DB ──
      send("saving", 75, "保存到数据库...");
      await prisma.validation.deleteMany({ where: { projectId } });
      await prisma.edge.deleteMany({ where: { projectId } });
      await prisma.action.deleteMany({ where: { projectId } });
      await prisma.field.deleteMany({ where: { projectId } });
      await prisma.page.deleteMany({ where: { projectId } });
      await prisma.module.deleteMany({ where: { projectId } });

      let moduleX = 80;
      const pageMap = new Map<string, string>();

      for (const mod of result.modules || []) {
        const m = await prisma.module.create({
          data: { projectId, name: mod.name, posX: moduleX, posY: 80 },
        });
        moduleX += 500;

        let pageY = 40;
        for (const page of mod.pages || []) {
          const p = await prisma.page.create({
            data: { projectId, name: page.name, moduleId: m.id, posX: 40, posY: pageY },
          });
          pageMap.set(page.name, p.id);

          let fieldX = 10;
          for (const field of page.fields || []) {
            await prisma.field.create({
              data: { projectId, name: field.name, fieldType: field.fieldType || "string", pageId: p.id, posX: fieldX, posY: 44 },
            });
            fieldX += 180;
          }

          let actionY = 44 + (page.fields?.length || 0) * 28 + 10;
          for (const action of page.actions || []) {
            const a = await prisma.action.create({
              data: { projectId, name: action.name, actionType: action.actionType || "operation", pageId: p.id, posX: 10, posY: actionY },
            });
            if (action.validations?.length) {
              await prisma.validation.createMany({
                data: action.validations.map((v: string) => ({ projectId, actionId: a.id, rule: v, type: "pre_condition" as const })),
              });
            }
            actionY += 32;
          }
          pageY += 140;
        }
      }

      // Create edges
      for (const edge of graphResult.edges || []) {
        const sourceId = pageMap.get(edge.sourceName);
        const targetId = pageMap.get(edge.targetName);
        if (sourceId && targetId) {
          await prisma.edge.create({
            data: { projectId, sourceId, targetId, label: edge.label || "", flowType: edge.flowType || "BUSINESS_FLOW" },
          });
        }
      }

      // Create pre-conditions
      if (graphResult.validations?.length) {
        const allActions = await prisma.action.findMany({ where: { projectId } });
        for (const v of graphResult.validations) {
          const action = v.actionName ? allActions.find((a) => a.name === v.actionName) : allActions[0];
          if (action) {
            await prisma.validation.create({ data: { projectId, actionId: action.id, rule: v.rule, type: "pre_condition" } });
          }
        }
      }

      send("saving", 92, "生成画布...");
      const full = await prisma.project.findUnique({
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

      send("complete", 100, "分析完成");
      res.write(`data: ${JSON.stringify({ stage: "result", project: full })}\n\n`);
      res.end();
    } catch (err) {
      console.error("Analyze error:", err);
      send("error", 0, err instanceof Error ? err.message : "分析失败");
      res.end();
    }
  },
);

// ── Parse with Ollama attempt + regex fallback ──

interface PageItem { name: string; fields: Array<{ name: string; fieldType?: string }>; actions: Array<{ name: string; actionType?: string; validations?: string[] }> }
interface ModuleItem { name: string; pages: PageItem[] }
interface ParseResult { modules: ModuleItem[] }

async function parseWithFallback(text: string): Promise<ParseResult> {
  // Send through n8n workflow first (fast pass-through, records execution in n8n)
  try {
    await sendToN8n(text);
  } catch {
    // n8n unavailable — fall through, still do regex
  }
  return regexParse(text);
}

async function sendToN8n(text: string): Promise<void> {
  const response = await fetch(`${N8N_WEBHOOK_URL}/rare-regex-parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`n8n returned ${response.status}`);
  // Data successfully passed through n8n
}

function regexParse(text: string): ParseResult {
  const modules: ModuleItem[] = [];
  const sentences = text.split(/[。；\n]/).map((s) => s.trim()).filter(Boolean);

  let currentModule: ModuleItem | null = null;
  let currentPage: PageItem | null = null;

  for (const s of sentences) {
    // Detect module
    if (s.includes("系统") || s.includes("模块") || (!currentModule && sentences.indexOf(s) === 0)) {
      const name = s.replace(/包含.*/, "").replace(/[#\s*\-]+/g, "").trim();
      currentModule = { name: name || "系统", pages: [] };
      modules.push(currentModule);
      currentPage = null;
    }
    if (!currentModule) { currentModule = { name: "系统", pages: [] }; modules.push(currentModule); }

    // Detect page
    if (s.includes("页") || s.includes("页面") || s.includes("选项卡") || s.includes("区域")) {
      const name = s.replace(/[#\s*\-]+/, "").replace(/包含.*/g, "").replace(/[、，].*/g, "").trim();
      if (name.length > 1 && name.length < 20) {
        currentPage = { name, fields: [], actions: [] };
        currentModule.pages.push(currentPage);
      }
    }
    if (!currentPage) {
      currentPage = { name: "主页面", fields: [], actions: [] };
      currentModule.pages.push(currentPage);
    }

    // Detect items
    const items = s.split(/[、，,]|(?<=[^和])和(?=[^和])/);
    for (const item of items) {
      const i = item.trim();
      if (!i || i.length < 2) continue;

      const fMatch = i.match(/([^，。；]+?)(输入框|复选框|下拉框|列表|展示|选择框|文本框|搜索框|选框|上传|滑块)/);
      if (fMatch) {
        const name = fMatch[0].trim();
        if (!currentPage.fields.find((f) => f.name === name)) {
          currentPage.fields.push({ name, fieldType: fMatch[2].includes("复选框") ? "boolean" : "string" });
        }
        continue;
      }

      const aMatch = i.match(/([^，。；]+?)(按钮|提交|保存|删除|编辑|搜索|新增|登录|注册|重置|取消|确认|返回|导出|导入|刷新|添加)/);
      if (aMatch) {
        const name = aMatch[0].trim();
        if (!currentPage.actions.find((a) => a.name === name)) {
          currentPage.actions.push({ name, actionType: "operation", validations: [] });
        }
      }
    }
  }

  return { modules };
}

// ── Graph reasoning (rule-based) ──

function deriveGraphRelations(result: ParseResult) {
  const edges: Array<{ sourceName: string; targetName: string; label: string; flowType: string }> = [];
  const validations: Array<{ actionName: string; rule: string }> = [];

  // Connect pages within the same module sequentially (business flow)
  for (const mod of result.modules || []) {
    for (let i = 0; i < mod.pages.length - 1; i++) {
      edges.push({
        sourceName: mod.pages[i].name,
        targetName: mod.pages[i + 1].name,
        label: "进入",
        flowType: "BUSINESS_FLOW",
      });
    }
    // Derive pre-conditions from actions that imply validation
    for (const page of mod.pages || []) {
      for (const action of page.actions || []) {
        if (["登录", "注册", "提交", "保存", "删除"].includes(action.name)) {
          validations.push({ actionName: action.name, rule: `${action.name}前需校验输入合法性` });
        }
      }
    }
  }

  return { edges, validations };
}

// ── File parsing ──

async function extractFileText(file: Express.Multer.File): Promise<string | null> {
  if (file.mimetype.startsWith("text/") || file.originalname.endsWith(".txt") || file.originalname.endsWith(".md")) {
    return file.buffer.toString("utf-8");
  }
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
    const response = await fetch(`${PARSER_URL}/parse`, {
      method: "POST",
      body: form as any,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return `[文件: ${file.originalname}] (无法解析)`;
    const data = await response.json();
    return data.text || null;
  } catch {
    return `[文件: ${file.originalname}] (解析服务暂不可用)`;
  }
}

export default router;
