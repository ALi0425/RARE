import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// POST /:projectId/save-positions — batch save all entity positions
router.post("/:projectId/save-positions", async (req, res) => {
  const { entities } = req.body;
  if (!entities) return res.status(400).json({ error: "Missing entities" });

  try {
    const { modules, pages, fields, actions } = entities;

    await prisma.$transaction(async (tx) => {
      for (const m of modules || []) {
        await tx.module.update({ where: { id: m.id }, data: { posX: m.posX, posY: m.posY } });
      }
      for (const p of pages || []) {
        await tx.page.update({ where: { id: p.id }, data: { posX: p.posX, posY: p.posY } });
      }
      for (const f of fields || []) {
        await tx.field.update({ where: { id: f.id }, data: { posX: f.posX, posY: f.posY } });
      }
      for (const a of actions || []) {
        await tx.action.update({ where: { id: a.id }, data: { posX: a.posX, posY: a.posY } });
      }
    });
    const total = (modules?.length || 0) + (pages?.length || 0) + (fields?.length || 0) + (actions?.length || 0);
    res.json({ ok: true, saved: total });
  } catch (err) {
    console.error("save-positions error:", err);
    res.status(500).json({ error: "保存位置失败" });
  }
});

router.get("/:projectId", async (req, res) => {
  const edges = await prisma.edge.findMany({ where: { projectId: req.params.projectId } });
  res.json(edges);
});

router.post("/:projectId", async (req, res) => {
  const { sourceId, targetId, label, sourceQuote, flowType, status } = req.body;
  const e = await prisma.edge.create({
    data: { projectId: req.params.projectId, sourceId, targetId, label, sourceQuote, flowType, status },
  });
  res.status(201).json(e);
});

router.patch("/:projectId/:id", async (req, res) => {
  const { label, sourceQuote, flowType, status } = req.body;
  const e = await prisma.edge.update({
    where: { id: req.params.id },
    data: { ...(label !== undefined && { label }), ...(sourceQuote !== undefined && { sourceQuote }), ...(flowType !== undefined && { flowType }), ...(status !== undefined && { status }) },
  });
  res.json(e);
});

router.delete("/:projectId/:id", async (req, res) => {
  await prisma.edge.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
