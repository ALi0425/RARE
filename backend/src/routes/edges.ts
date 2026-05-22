import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

function pid(req: { params: Record<string, string | string[]> }): string {
  return req.params.projectId as string;
}

// List edges for a project
router.get("/:projectId", async (req, res) => {
  const edges = await prisma.edge.findMany({ where: { projectId: pid(req) } });
  res.json(edges);
});

// Create edge
router.post("/:projectId", async (req, res) => {
  const { sourceId, targetId, sourceType, targetType, flowType, status, label, sourceQuote } = req.body;
  const edge = await prisma.edge.create({
    data: {
      projectId: pid(req),
      sourceId, targetId, sourceType, targetType,
      flowType: flowType || "BUSINESS_FLOW",
      status: status || "extracted",
      label, sourceQuote,
    },
  });
  res.status(201).json(edge);
});

// Update edge
router.patch("/:projectId/:id", async (req, res) => {
  const { flowType, status, label, sourceQuote } = req.body;
  const edge = await prisma.edge.update({
    where: { id: req.params.id as string },
    data: { ...(flowType && { flowType }), ...(status && { status }), label, sourceQuote },
  });
  res.json(edge);
});

// Delete edge
router.delete("/:projectId/:id", async (req, res) => {
  await prisma.edge.delete({ where: { id: req.params.id as string } });
  res.json({ ok: true });
});

export default router;
