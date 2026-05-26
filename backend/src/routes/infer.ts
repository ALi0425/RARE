import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook";

// POST /api/infer/:projectId — trigger graph inference
router.post("/:projectId", async (req, res) => {
  const projectId = req.params.projectId;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        modules: {
          include: { pages: { include: { fields: true, actions: true } } },
        },
        pages: { where: { moduleId: null }, include: { fields: true, actions: true } },
        edges: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: "项目不存在" });
    }

    // Build page-level data for the inference workflow
    const pagesData = [];
    for (const m of project.modules) {
      for (const p of m.pages) {
        pagesData.push({
          id: p.id,
          name: p.name,
          moduleName: m.name,
          fields: p.fields.map((f) => ({ name: f.name, type: f.fieldType })),
          actions: p.actions.map((a) => ({ name: a.name, type: a.actionType })),
        });
      }
    }
    for (const p of project.pages) {
      pagesData.push({
        id: p.id,
        name: p.name,
        moduleName: null,
        fields: p.fields.map((f) => ({ name: f.name, type: f.fieldType })),
        actions: p.actions.map((a) => ({ name: a.name, type: a.actionType })),
      });
    }

    // Build existing edge context (only confirmed edges)
    const existingEdges = project.edges
      .filter((e) => e.status !== "ai_inferred")
      .map((e) => ({
        sourceId: e.sourceId,
        targetId: e.targetId,
        label: e.label,
        flowType: e.flowType,
      }));

    // Call n8n graph-infer webhook
    const response = await fetch(`${N8N_WEBHOOK_URL}/graph-infer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, pages: pagesData, existingEdges }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn("n8n graph-infer returned", response.status, text);
      return res.status(502).json({ error: `推理工作流返回 ${response.status}` });
    }

    const inferResult = await response.json();
    // Expected format: { edges: [{ sourceId, targetId, label, reason }] }
    const inferredEdges = inferResult.edges || [];
    const savedEdges = [];

    for (const e of inferredEdges) {
      // Validate source and target exist in DB
      if (!e.sourceId || !e.targetId) continue;
      const source = await prisma.page.findUnique({ where: { id: e.sourceId } });
      const target = await prisma.page.findUnique({ where: { id: e.targetId } });
      if (!source || !target) continue;

      const saved = await prisma.edge.create({
        data: {
          projectId,
          sourceId: e.sourceId,
          targetId: e.targetId,
          label: e.label || "",
          flowType: e.flowType || "BUSINESS_FLOW",
          status: "ai_inferred",
          sourceQuote: e.reason || null,
        },
      });
      savedEdges.push(saved);
    }

    res.json({ edges: savedEdges, total: savedEdges.length });
  } catch (err) {
    console.error("Infer error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "推理失败" });
  }
});

export default router;
