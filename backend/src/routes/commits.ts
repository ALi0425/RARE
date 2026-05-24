import { Router } from "express";
import prisma from "../lib/prisma";
import { getNextVersion, createSnapshot, truncateIfNeeded } from "../services/versionManager";

const router = Router();

// List all commits for a project
router.get("/:projectId", async (req, res) => {
  const commits = await prisma.commitLog.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, message: true, createdAt: true },
  });
  res.json(commits);
});

// Create a new commit (snapshot) for a project
router.post("/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const { message } = req.body;

  const version = await getNextVersion(projectId);
  const snapshot = await createSnapshot(projectId);

  const commit = await prisma.commitLog.create({
    data: { projectId, version, message: message || `v${version}`, snapshot },
  });

  await truncateIfNeeded(projectId);

  res.json({
    id: commit.id,
    version: commit.version,
    message: commit.message,
    createdAt: commit.createdAt,
  });
});

// Get full snapshot for a specific version (preview)
router.get("/:projectId/:version", async (req, res) => {
  const commit = await prisma.commitLog.findFirst({
    where: {
      projectId: req.params.projectId,
      version: parseInt(req.params.version, 10),
    },
  });
  if (!commit) return res.status(404).json({ error: "版本不存在" });
  res.json(commit.snapshot);
});

export default router;
