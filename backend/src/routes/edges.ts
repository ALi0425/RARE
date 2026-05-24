import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

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
