import { Router, type Request, type Response } from "express";
import prisma from "../lib/prisma";
import { parseDocument } from "../services/llm";
import { callN8nParser } from "../services/n8n";

const router = Router();

router.post("/:projectId", async (req: Request, res: Response) => {
  const { text } = req.body;
  const projectId = req.params.projectId as string;

  if (!text) return res.status(400).json({ error: "text is required" });

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Clear existing entities before re-parsing (avoid duplicates)
    await prisma.edge.deleteMany({ where: { projectId } });
    await prisma.action.deleteMany({ where: { projectId } });
    await prisma.field.deleteMany({ where: { projectId } });
    await prisma.page.deleteMany({ where: { projectId } });
    await prisma.module.deleteMany({ where: { projectId } });
    await prisma.macroSummary.deleteMany({ where: { projectId } });

    // Try n8n first (if available), then fall back to local/LLM parser
    let result = await callN8nParser(text);
    if (!result || result.entities.length === 0) {
      result = await parseDocument(text);
    }

    // Map entities to DB records
    const moduleMap = new Map<string, string>(); // name -> id
    const pageMap = new Map<string, string>();

    // First pass: create modules with better layout
    for (const entity of result.entities) {
      if (entity.type === "module") {
        const m = await prisma.module.create({
          data: { projectId, name: entity.name, posX: 80 + moduleMap.size * 500, posY: 80 },
        });
        moduleMap.set(entity.name, m.id);
      }
    }

    // Track page positions for computing absolute field/action positions
    const pagePositions = new Map<string, { x: number; y: number }>();

    // Second pass: create pages — side by side within module
    const pagesInModule = new Map<string, number>();
    // Track module positions for computing absolute page positions
    const modulePositions = new Map<string, { x: number; y: number }>();
    for (const [k, v] of moduleMap) {
      const idx = [...moduleMap.keys()].indexOf(k);
      modulePositions.set(k, { x: 80 + idx * 500, y: 80 });
    }

    for (const entity of result.entities) {
      if (entity.type === "page") {
        const parentId = entity.parentName ? moduleMap.get(entity.parentName) : null;
        const modPos = entity.parentName ? modulePositions.get(entity.parentName) : null;
        const pageOffset = pagesInModule.get(entity.parentName || "") || 0;
        pagesInModule.set(entity.parentName || "", pageOffset + 1);
        const px = parentId && modPos ? modPos.x + 20 + pageOffset * 340 : 200 + pageMap.size * 30;
        const py = parentId && modPos ? modPos.y + 50 : 200;
        const p = await prisma.page.create({
          data: {
            projectId,
            name: entity.name,
            moduleId: parentId,
            posX: px,
            posY: py,
          },
        });
        pageMap.set(entity.name, p.id);
        pagePositions.set(entity.name, { x: px, y: py });
      }
    }

    const fieldMap = new Map<string, string>();
    const actionMap = new Map<string, string>();
    const fieldsInPage = new Map<string, number>();
    const actionsInPage = new Map<string, number>();

    // Third pass: create fields and actions — laid out left/right within page
    for (const entity of result.entities) {
      if (entity.type === "field") {
        const parentId = entity.parentName ? pageMap.get(entity.parentName) : null;
        const pagePos = entity.parentName ? pagePositions.get(entity.parentName) : null;
        const offset = fieldsInPage.get(entity.parentName || "") || 0;
        fieldsInPage.set(entity.parentName || "", offset + 1);
        const f = await prisma.field.create({
          data: {
            projectId,
            name: entity.name,
            fieldType: entity.fieldType || "string",
            pageId: parentId,
            posX: parentId && pagePos ? pagePos.x + 8 + offset * 170 : 300,
            posY: parentId && pagePos ? pagePos.y + 44 : 300,
          },
        });
        fieldMap.set(entity.name, f.id);
      }
      if (entity.type === "action") {
        const parentId = entity.parentName ? pageMap.get(entity.parentName) : null;
        const pagePos = entity.parentName ? pagePositions.get(entity.parentName) : null;
        const offset = actionsInPage.get(entity.parentName || "") || 0;
        actionsInPage.set(entity.parentName || "", offset + 1);
        const a = await prisma.action.create({
          data: {
            projectId,
            name: entity.name,
            actionType: entity.actionType || "operation",
            pageId: parentId,
            validations: entity.validations || [],
            posX: parentId && pagePos ? pagePos.x + 8 + offset * 170 : 300,
            posY: parentId && pagePos ? pagePos.y + 76 : 350,
          },
        });
        actionMap.set(entity.name, a.id);
      }
    }

    // Map names to IDs for edge resolution
    const allNames = new Map<string, string>();
    for (const [k, v] of moduleMap) allNames.set(k, v);
    for (const [k, v] of pageMap) allNames.set(k, v);
    for (const [k, v] of fieldMap) allNames.set(k, v);
    for (const [k, v] of actionMap) allNames.set(k, v);

    // Create edges
    for (const edge of result.edges) {
      const sourceId = allNames.get(edge.sourceName);
      const targetId = allNames.get(edge.targetName);
      if (sourceId && targetId) {
        await prisma.edge.create({
          data: {
            projectId,
            sourceId,
            targetId,
            sourceType: edge.sourceType,
            targetType: edge.targetType,
            flowType: edge.flowType,
            status: edge.status,
            label: edge.label,
            sourceQuote: edge.sourceQuote,
          },
        });
      }
    }

    // Generate macro summary
    const summaryText = generateMacroSummary(result);
    await prisma.macroSummary.create({
      data: { projectId, content: summaryText },
    });

    // Fetch and return the full project state
    const fullProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        modules: { include: { pages: { include: { fields: true, actions: true } } } },
        pages: { where: { moduleId: null }, include: { fields: true, actions: true } },
        fields: { where: { pageId: null } },
        actions: { where: { pageId: null } },
        edges: true,
        summaries: true,
      },
    });

    res.json(fullProject);
  } catch (err) {
    console.error("Parse error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Parse failed" });
  }
});

function generateMacroSummary(result: { entities: Array<{ name: string; type: string; parentName?: string }>; edges: Array<{ sourceName: string; targetName: string; flowType: string; label?: string }> }): string {
  const moduleNames = result.entities.filter(e => e.type === "module").map(e => e.name);
  const pages = result.entities.filter(e => e.type === "page").map(e => ({ name: e.name, module: e.parentName || "unassigned" }));
  const flows = result.edges.map(e => `${e.sourceName} --(${e.label || e.flowType})--> ${e.targetName}`);

  return `## System Macro Architecture\n\nModules: ${moduleNames.join(", ") || "(none)"}\n\nPages:\n${pages.map(p => `  - ${p.name} [${p.module}]`).join("\n") || "  (none)"}\n\nFlows:\n${flows.map(f => `  - ${f}`).join("\n") || "  (none)"}`;
}

export default router;
