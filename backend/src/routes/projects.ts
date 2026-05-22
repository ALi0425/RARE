import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

function pid(req: { params: Record<string, string | string[]> }): string {
  return req.params.id as string;
}

// List all projects
router.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { modules: true, pages: true, fields: true, actions: true } },
    },
  });
  res.json(projects);
});

// Get single project (full graph data)
router.get("/:id", async (req, res) => {
  const id = pid(req);
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      modules: { include: { pages: { include: { fields: true, actions: true } } } },
      pages: { where: { moduleId: null }, include: { fields: true, actions: true } },
      fields: { where: { pageId: null } },
      actions: { where: { pageId: null } },
      edges: true,
    },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(project);
});

// Create project
router.post("/", async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  const project = await prisma.project.create({
    data: { name, description },
  });
  res.status(201).json(project);
});

// Update project
router.patch("/:id", async (req, res) => {
  const { name, description, status } = req.body;
  const project = await prisma.project.update({
    where: { id: pid(req) },
    data: { ...(name && { name }), ...(description !== undefined && { description }), ...(status && { status }) },
  });
  res.json(project);
});

// Archive project
router.post("/:id/archive", async (req, res) => {
  const project = await prisma.project.update({
    where: { id: pid(req) },
    data: { status: "archived" },
  });
  res.json(project);
});

// Unarchive project
router.post("/:id/unarchive", async (req, res) => {
  const existing = await prisma.project.findUnique({ where: { id: pid(req) } });
  if (!existing) return res.status(404).json({ error: "项目不存在" });
  if (existing.status === "active") return res.json({ ...existing, message: "项目已处于活跃状态" });

  const project = await prisma.project.update({
    where: { id: pid(req) },
    data: { status: "active" },
  });
  res.json(project);
});

export default router;
