import { Router } from "express";
import prisma from "../lib/prisma";
import { extractText } from "../lib/fileExtractor";

const router = Router();

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook";

function sendSSE(res: any, data: any) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// POST /confirm/:projectId — SSE endpoint: save positions → vector sync → graph cognition
router.post("/:projectId", async (req, res) => {
  const projectId = req.params.projectId;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // ── Step 1: Save positions (progress 5-15%) ──
  sendSSE(res, { stage: "saving", progress: 5, message: "保存节点位置..." });
  try {
    const { entities } = req.body;
    if (entities) {
      const { modules, pages, fields, actions } = entities;
      await prisma.$transaction(async (tx) => {
        for (const m of modules || []) await tx.module.update({ where: { id: m.id }, data: { posX: m.posX, posY: m.posY } });
        for (const p of pages || []) await tx.page.update({ where: { id: p.id }, data: { posX: p.posX, posY: p.posY } });
        for (const f of fields || []) await tx.field.update({ where: { id: f.id }, data: { posX: f.posX, posY: f.posY } });
        for (const a of actions || []) await tx.action.update({ where: { id: a.id }, data: { posX: a.posX, posY: a.posY } });
      });
    }
  } catch (err) {
    console.warn("save-positions failed:", err);
    sendSSE(res, { stage: "warning", message: "保存位置失败，跳过" });
  }
  sendSSE(res, { stage: "saving", progress: 15, message: "位置保存完成" });

  // Set recordStatus = "已入库" for all entities after confirm
  try {
    await Promise.all([
      prisma.module.updateMany({ where: { projectId, recordStatus: "未入库" }, data: { recordStatus: "已入库" } }),
      prisma.page.updateMany({ where: { projectId, recordStatus: "未入库" }, data: { recordStatus: "已入库" } }),
      prisma.field.updateMany({ where: { projectId, recordStatus: "未入库" }, data: { recordStatus: "已入库" } }),
      prisma.action.updateMany({ where: { projectId, recordStatus: "未入库" }, data: { recordStatus: "已入库" } }),
      prisma.edge.updateMany({ where: { projectId, recordStatus: "未入库" }, data: { recordStatus: "已入库" } }),
    ]);
  } catch (err) {
    console.warn("set-recordStatus failed:", err);
  }

  // ── Step 2: Vector sync (progress 15-50%) ──
  sendSSE(res, { stage: "vector_sync", progress: 15, message: "同步向量数据库..." });
  try {
    // Fetch full project with all entities
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        modules: { include: { pages: { include: { fields: true, actions: true } } } },
        pages: { where: { moduleId: null }, include: { fields: true, actions: true } },
        edges: true,
        files: true,
      },
    });
    if (!project) throw new Error("Project not found");

    // Build flat entity list for vector sync
    const entities: any[] = [];
    for (const m of project.modules) {
      entities.push({ id: m.id, name: m.name, type: "module", projectId });
      for (const p of m.pages) {
        entities.push({ id: p.id, name: p.name, type: "page", moduleName: m.name, projectId });
        for (const f of p.fields) entities.push({ id: f.id, name: f.name, type: "field", pageName: p.name, projectId });
        for (const a of p.actions) entities.push({ id: a.id, name: a.name, type: "action", pageName: p.name, projectId });
      }
    }
    for (const p of project.pages) {
      entities.push({ id: p.id, name: p.name, type: "page", projectId, moduleName: null });
      for (const f of p.fields) entities.push({ id: f.id, name: f.name, type: "field", pageName: p.name, projectId });
      for (const a of p.actions) entities.push({ id: a.id, name: a.name, type: "action", pageName: p.name, projectId });
    }

    // Build edges list (only confirmed ones)
    const edgesList = project.edges
      .filter((e) => e.status !== "ai_inferred")
      .map((e) => ({ sourceId: e.sourceId, targetId: e.targetId, label: e.label, flowType: e.flowType }));

    // Call n8n vector-sync webhook
    const vsRes = await fetch(`${N8N_WEBHOOK_URL}/vector-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, entities, edges: edgesList }),
      signal: AbortSignal.timeout(120000),
    });

    if (!vsRes.ok) {
      console.warn("vector-sync returned", vsRes.status, await vsRes.text());
      sendSSE(res, { stage: "warning", message: "向量同步工作流异常，跳过" });
    } else {
      const vsResult = await vsRes.json();
      sendSSE(res, { stage: "vector_sync", progress: 50, message: `向量同步完成 (${vsResult.count || 0} entities)` });
    }
  } catch (err: any) {
    console.warn("vector-sync failed:", err);
    sendSSE(res, { stage: "warning", message: `向量同步失败: ${err.message}，跳过` });
  }

  // ── Step 3: Global graph cognition (progress 50-90%) ──
  sendSSE(res, { stage: "cognition", progress: 50, message: "全局图谱认知分析中..." });
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        modules: { include: { pages: { include: { fields: true, actions: true } } } },
        pages: { where: { moduleId: null }, include: { fields: true, actions: true } },
        edges: true,
        files: true,
      },
    });
    if (!project) throw new Error("Project not found");

    // Extract text from project files (supports .docx, .pdf, .xlsx, .pptx, .txt, etc.)
    const filesContent: string[] = [];
    for (const f of project.files) {
      try {
        const content = await extractText(f.storagePath, f.originalName);
        if (content) {
          filesContent.push(`[${f.originalName}]:\n${content.slice(0, 5000)}`);
        } else {
          console.log(`[cognition] no text extracted from: ${f.originalName}`);
        }
      } catch { /* skip */ }
    }

    const payload = {
      projectId,
      entities: project.modules.flatMap((m) => [
        { id: m.id, name: m.name, type: "module", description: "" },
        ...m.pages.flatMap((p) => [
          { id: p.id, name: p.name, type: "page", moduleName: m.name },
          ...p.fields.map((f) => ({ id: f.id, name: f.name, type: "field", pageName: p.name, fieldType: f.fieldType })),
          ...p.actions.map((a) => ({ id: a.id, name: a.name, type: "action", pageName: p.name, actionType: a.actionType })),
        ]),
      ]),
      edges: project.edges.map((e) => ({ sourceId: e.sourceId, targetId: e.targetId, label: e.label, flowType: e.flowType })),
      filesContent,
    };

    const gcRes = await fetch(`${N8N_WEBHOOK_URL}/graph-cognition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    });

    if (!gcRes.ok) {
      console.warn("graph-cognition returned", gcRes.status, await gcRes.text());
      sendSSE(res, { stage: "warning", message: "全局图谱认知工作流异常，跳过" });
    } else {
      const gcResult = await gcRes.json();
      sendSSE(res, { stage: "cognition", progress: 85, message: "全局分析完成" });

      // Save cognition results (global edges, summary)
      const summary = gcResult.summary || gcResult.output || "";
      const globalEdgesInput = gcResult.globalEdges || gcResult.edges || [];

      // Create global summary edges as ai_inferred
      let edgeCount = 0;
      for (const ge of globalEdgesInput) {
        if (!ge.sourceId || !ge.targetId) continue;
        // Check source/target exist
        const src = await prisma.page.findUnique({ where: { id: ge.sourceId } }).catch(() => null);
        const tgt = await prisma.page.findUnique({ where: { id: ge.targetId } }).catch(() => null);
        if (!src || !tgt) continue;
        const exists = await prisma.edge.findFirst({
          where: { projectId, sourceId: ge.sourceId, targetId: ge.targetId },
        });
        if (!exists) {
          await prisma.edge.create({
            data: {
              projectId,
              sourceId: ge.sourceId,
              targetId: ge.targetId,
              label: ge.label || "Global Relation",
              flowType: ge.flowType || "BUSINESS_FLOW",
              status: "cognition",
              sourceQuote: ge.reason || summary.slice(0, 200),
            },
          });
          edgeCount++;
        }
      }

      // Save cognition summary to project description or a new field
      if (summary) {
        await prisma.project.update({
          where: { id: projectId },
          data: { description: summary.slice(0, 5000) || project.description },
        });
      }

      sendSSE(res, { stage: "cognition", progress: 90, message: `认知结果入库 (${edgeCount}新连线)` });
    }
  } catch (err: any) {
    console.warn("graph-cognition failed:", err);
    sendSSE(res, { stage: "warning", message: `全局分析失败: ${err.message}，跳过` });
  }

  // ── Step 4: Complete (progress 100%) ──
  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { confirmedAt: new Date() },
    });
  } catch (err) {
    console.warn("Failed to set confirmedAt:", err);
  }

  sendSSE(res, { stage: "complete", progress: 100, message: "梳理完成" });

  // Return final project data
  const finalProject = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      modules: { include: { pages: { include: { fields: true, actions: true } } }, orderBy: { createdAt: "asc" } },
      pages: { where: { moduleId: null }, include: { fields: true, actions: true }, orderBy: { createdAt: "asc" } },
      fields: { where: { pageId: null } },
      actions: { where: { pageId: null } },
      edges: { orderBy: { createdAt: "asc" } },
    },
  });
  sendSSE(res, { stage: "result", project: finalProject });
  res.end();
});

export default router;
