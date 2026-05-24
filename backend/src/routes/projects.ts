import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// List all projects
router.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({
    where: { status: "active" },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { modules: true, pages: true, fields: true, actions: true } } },
  });
  res.json(projects);
});

// Create project
router.post("/", async (req, res) => {
  const { name, description } = req.body;
  const p = await prisma.project.create({ data: { name, description } });
  res.status(201).json(p);
});

// Get project with full tree
router.get("/:id", async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      modules: {
        include: { pages: { include: { fields: true, actions: true } } },
        orderBy: { createdAt: "asc" },
      },
      pages: {
        where: { moduleId: null },
        include: { fields: true, actions: true },
        orderBy: { createdAt: "asc" },
      },
      fields: { where: { pageId: null } },
      actions: { where: { pageId: null } },
      edges: true,
      validations: true,
    },
  });
  if (!project) return res.status(404).json({ error: "Not found" });
  res.json(project);
});

// Update project
router.patch("/:id", async (req, res) => {
  const { name, description, status } = req.body;
  const p = await prisma.project.update({
    where: { id: req.params.id },
    data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(status !== undefined && { status }) },
  });
  res.json(p);
});

// Delete project
router.delete("/:id", async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
