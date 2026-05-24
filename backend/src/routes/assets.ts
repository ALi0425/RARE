import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

function pid(req: { params: Record<string, string | string[]> }): string {
  return req.params.projectId as string;
}

// --- Modules ---
router.get("/:projectId/modules", async (req, res) => {
  const modules = await prisma.module.findMany({ where: { projectId: pid(req) } });
  res.json(modules);
});

router.post("/:projectId/modules", async (req, res) => {
  const { name, description, posX, posY } = req.body;
  const module = await prisma.module.create({
    data: { projectId: pid(req), name, description, posX, posY },
  });
  res.status(201).json(module);
});

router.patch("/:projectId/modules/:id", async (req, res) => {
  const { name, description, posX, posY } = req.body;
  const m = await prisma.module.update({
    where: { id: req.params.id as string },
    data: { ...(name && { name }), ...(description !== undefined && { description }), ...(posX !== undefined && { posX }), ...(posY !== undefined && { posY }) },
  });
  res.json(m);
});

router.delete("/:projectId/modules/:id", async (req, res) => {
  await prisma.page.updateMany({ where: { moduleId: req.params.id as string }, data: { moduleId: null } });
  await prisma.module.delete({ where: { id: req.params.id as string } });
  res.json({ ok: true });
});

// --- Pages ---
router.get("/:projectId/pages", async (req, res) => {
  const pages = await prisma.page.findMany({ where: { projectId: pid(req) } });
  res.json(pages);
});

router.post("/:projectId/pages", async (req, res) => {
  const { name, moduleId, posX, posY } = req.body;
  const page = await prisma.page.create({
    data: { projectId: pid(req), name, moduleId, posX, posY },
  });
  res.status(201).json(page);
});

router.patch("/:projectId/pages/:id", async (req, res) => {
  const { name, moduleId: rawModuleId, posX, posY } = req.body;
  // Coerce empty string / undefined → null for nullable FK
  const moduleId = rawModuleId === "" || rawModuleId === undefined ? null : rawModuleId;
  const p = await prisma.page.update({
    where: { id: req.params.id as string },
    data: { ...(name && { name }), ...(moduleId !== undefined && { moduleId }), ...(posX !== undefined && { posX }), ...(posY !== undefined && { posY }) },
  });
  res.json(p);
});

router.delete("/:projectId/pages/:id", async (req, res) => {
  const pageId = req.params.id as string;
  await prisma.field.updateMany({ where: { pageId }, data: { pageId: null } });
  await prisma.action.updateMany({ where: { pageId }, data: { pageId: null } });
  await prisma.page.delete({ where: { id: pageId } });
  res.json({ ok: true });
});

// --- Fields ---
router.get("/:projectId/fields", async (req, res) => {
  const fields = await prisma.field.findMany({ where: { projectId: pid(req) } });
  res.json(fields);
});

router.post("/:projectId/fields", async (req, res) => {
  const { name, fieldType, pageId, posX, posY } = req.body;
  const field = await prisma.field.create({
    data: { projectId: pid(req), name, fieldType, pageId, posX, posY },
  });
  res.status(201).json(field);
});

router.patch("/:projectId/fields/:id", async (req, res) => {
  const { name, fieldType, pageId: rawPageId, posX, posY } = req.body;
  const pageId = rawPageId === "" || rawPageId === undefined ? null : rawPageId;
  const f = await prisma.field.update({
    where: { id: req.params.id as string },
    data: { ...(name && { name }), ...(fieldType && { fieldType }), ...(pageId !== undefined && { pageId }), ...(posX !== undefined && { posX }), ...(posY !== undefined && { posY }) },
  });
  res.json(f);
});

router.delete("/:projectId/fields/:id", async (req, res) => {
  await prisma.field.delete({ where: { id: req.params.id as string } });
  res.json({ ok: true });
});

// --- Actions ---
router.get("/:projectId/actions", async (req, res) => {
  const actions = await prisma.action.findMany({ where: { projectId: pid(req) } });
  res.json(actions);
});

router.post("/:projectId/actions", async (req, res) => {
  const { name, actionType, pageId, validations, posX, posY } = req.body;
  const action = await prisma.action.create({
    data: { projectId: pid(req), name, actionType, pageId, validations, posX, posY },
  });
  res.status(201).json(action);
});

router.patch("/:projectId/actions/:id", async (req, res) => {
  const { name, actionType, pageId: rawPageId, validations, posX, posY } = req.body;
  const pageId = rawPageId === "" || rawPageId === undefined ? null : rawPageId;
  const a = await prisma.action.update({
    where: { id: req.params.id as string },
    data: { ...(name && { name }), ...(actionType && { actionType }), ...(pageId !== undefined && { pageId }), ...(validations && { validations }), ...(posX !== undefined && { posX }), ...(posY !== undefined && { posY }) },
  });
  res.json(a);
});

router.delete("/:projectId/actions/:id", async (req, res) => {
  await prisma.action.delete({ where: { id: req.params.id as string } });
  res.json({ ok: true });
});

export default router;
