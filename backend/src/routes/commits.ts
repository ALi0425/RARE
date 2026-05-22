import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

function pid(req: { params: Record<string, string | string[]> }): string {
  return req.params.projectId as string;
}

// List versions for a project
router.get("/:projectId", async (req, res) => {
  const commits = await prisma.commitLog.findMany({
    where: { projectId: pid(req) },
    orderBy: { version: "desc" },
  });
  res.json(commits);
});

// Create new version
router.post("/:projectId", async (req, res) => {
  const projectId = pid(req);
  const { description, baseVersion } = req.body;

  // Get current max version
  const latest = await prisma.commitLog.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const newVersion = (latest?.version || 0) + 1;

  // If baseVersion is set and different from latest, truncate
  if (baseVersion !== undefined && baseVersion < (latest?.version || 0)) {
    // Soft-delete: remove logs after baseVersion
    await prisma.commitLog.deleteMany({
      where: { projectId, version: { gt: baseVersion } },
    });
  }

  // Take snapshot of current state
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { modules: true, pages: true, fields: true, actions: true, edges: true },
  });

  const commit = await prisma.commitLog.create({
    data: {
      projectId,
      version: newVersion,
      description,
      baseVersion: baseVersion || latest?.version || 0,
      snapshot: project || {},
    },
  });

  res.status(201).json(commit);
});

// Get specific version
router.get("/:projectId/:version", async (req, res) => {
  const commit = await prisma.commitLog.findUnique({
    where: {
      projectId_version: {
        projectId: pid(req),
        version: parseInt(req.params.version as string),
      },
    },
  });
  if (!commit) return res.status(404).json({ error: "Version not found" });
  res.json(commit);
});

// Get canvas data for a specific version
router.get("/:projectId/:version/canvas", async (req, res) => {
  const commit = await prisma.commitLog.findUnique({
    where: {
      projectId_version: {
        projectId: pid(req),
        version: parseInt(req.params.version as string),
      },
    },
  });
  if (!commit?.snapshot) return res.status(404).json({ error: "Version snapshot not found" });
  res.json(commit.snapshot);
});

export default router;
