import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// GET /api/assets/:projectId/lookup — flat entity list for n8n validation
router.get("/:projectId/lookup", async (req, res) => {
  const { projectId } = req.params;
  const [modules, pages, fields, actions] = await Promise.all([
    prisma.module.findMany({ where: { projectId }, select: { id: true, name: true } }),
    prisma.page.findMany({ where: { projectId }, select: { id: true, name: true } }),
    prisma.field.findMany({ where: { projectId }, select: { id: true, name: true } }),
    prisma.action.findMany({ where: { projectId }, select: { id: true, name: true } }),
  ]);

  res.json({
    entities: [
      ...modules.map((m) => ({ id: m.id, name: m.name, type: "module" })),
      ...pages.map((p) => ({ id: p.id, name: p.name, type: "page" })),
      ...fields.map((f) => ({ id: f.id, name: f.name, type: "field" })),
      ...actions.map((a) => ({ id: a.id, name: a.name, type: "action" })),
    ],
  });
});

export default router;
