import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

function pid(req: any) {
  return req.params.projectId as string;
}

// ── Modules ──
router.get("/:projectId/modules", async (req, res) => {
  const items = await prisma.module.findMany({ where: { projectId: pid(req) } });
  res.json(items);
});

router.post("/:projectId/modules", async (req, res) => {
  const { name, posX, posY } = req.body;
  const m = await prisma.module.create({ data: { projectId: pid(req), name, posX, posY } });
  res.status(201).json(m);
});

router.patch("/:projectId/modules/:id", async (req, res) => {
  const { name, posX, posY } = req.body;
  const m = await prisma.module.update({
    where: { id: req.params.id },
    data: { ...(name !== undefined && { name }), ...(posX !== undefined && { posX }), ...(posY !== undefined && { posY }) },
  });
  res.json(m);
});

router.delete("/:projectId/modules/:id", async (req, res) => {
  // Orphan children first
  await prisma.page.updateMany({ where: { moduleId: req.params.id }, data: { moduleId: null } });
  await prisma.module.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── Pages ──
router.get("/:projectId/pages", async (req, res) => {
  const items = await prisma.page.findMany({ where: { projectId: pid(req) } });
  res.json(items);
});

router.post("/:projectId/pages", async (req, res) => {
  const { name, moduleId, posX, posY } = req.body;
  const p = await prisma.page.create({ data: { projectId: pid(req), name, moduleId, posX, posY } });
  res.status(201).json(p);
});

router.patch("/:projectId/pages/:id", async (req, res) => {
  const { name, moduleId, posX, posY } = req.body;
  const p = await prisma.page.update({
    where: { id: req.params.id },
    data: { ...(name !== undefined && { name }), ...(moduleId !== undefined && { moduleId }), ...(posX !== undefined && { posX }), ...(posY !== undefined && { posY }) },
  });
  res.json(p);
});

router.delete("/:projectId/pages/:id", async (req, res) => {
  // Orphan children
  await prisma.field.updateMany({ where: { pageId: req.params.id }, data: { pageId: null } });
  await prisma.action.updateMany({ where: { pageId: req.params.id }, data: { pageId: null } });
  await prisma.page.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── Fields ──
router.get("/:projectId/fields", async (req, res) => {
  const items = await prisma.field.findMany({ where: { projectId: pid(req) } });
  res.json(items);
});

router.post("/:projectId/fields", async (req, res) => {
  const { name, fieldType, pageId, posX, posY } = req.body;
  const f = await prisma.field.create({ data: { projectId: pid(req), name, fieldType, pageId, posX, posY } });
  res.status(201).json(f);
});

router.patch("/:projectId/fields/:id", async (req, res) => {
  const { name, fieldType, pageId, posX, posY } = req.body;
  const f = await prisma.field.update({
    where: { id: req.params.id },
    data: { ...(name !== undefined && { name }), ...(fieldType !== undefined && { fieldType }), ...(pageId !== undefined && { pageId }), ...(posX !== undefined && { posX }), ...(posY !== undefined && { posY }) },
  });
  res.json(f);
});

router.delete("/:projectId/fields/:id", async (req, res) => {
  await prisma.field.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── Actions ──
router.get("/:projectId/actions", async (req, res) => {
  const items = await prisma.action.findMany({ where: { projectId: pid(req) } });
  res.json(items);
});

router.post("/:projectId/actions", async (req, res) => {
  const { name, actionType, pageId, posX, posY, validations } = req.body;
  const a = await prisma.action.create({ data: { projectId: pid(req), name, actionType, pageId, posX, posY } });
  // Create validations if provided
  if (validations?.length) {
    await prisma.validation.createMany({
      data: validations.map((v: string) => ({ projectId: pid(req), actionId: a.id, rule: v, type: "pre_condition" })),
    });
  }
  res.status(201).json(a);
});

router.patch("/:projectId/actions/:id", async (req, res) => {
  const { name, actionType, pageId, posX, posY } = req.body;
  const a = await prisma.action.update({
    where: { id: req.params.id },
    data: { ...(name !== undefined && { name }), ...(actionType !== undefined && { actionType }), ...(pageId !== undefined && { pageId }), ...(posX !== undefined && { posX }), ...(posY !== undefined && { posY }) },
  });
  res.json(a);
});

router.delete("/:projectId/actions/:id", async (req, res) => {
  await prisma.action.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── Validations ──
router.get("/:projectId/validations", async (req, res) => {
  const items = await prisma.validation.findMany({ where: { projectId: pid(req) } });
  res.json(items);
});

router.post("/:projectId/validations", async (req, res) => {
  const { rule, type, sourceQuote, fieldId, actionId, edgeId } = req.body;
  const v = await prisma.validation.create({
    data: { projectId: pid(req), rule, type, sourceQuote, fieldId, actionId, edgeId },
  });
  res.status(201).json(v);
});

router.patch("/:projectId/validations/:id", async (req, res) => {
  const { rule, type, sourceQuote } = req.body;
  const v = await prisma.validation.update({
    where: { id: req.params.id },
    data: { ...(rule !== undefined && { rule }), ...(type !== undefined && { type }), ...(sourceQuote !== undefined && { sourceQuote }) },
  });
  res.json(v);
});

router.delete("/:projectId/validations/:id", async (req, res) => {
  await prisma.validation.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
