import { Router } from "express";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma";

const router = Router();
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "../../uploads");

// GET /api/project-files/:projectId — list files for a project
router.get("/:projectId", async (req, res) => {
  try {
    const files = await prisma.projectFile.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
      },
    });
    res.json(files);
  } catch (err) {
    console.error("Error listing project files:", err);
    res.status(500).json({ error: "Failed to list files" });
  }
});

// GET /api/project-files/:projectId/download/:fileId — download/preview a file
router.get("/:projectId/download/:fileId", async (req, res) => {
  try {
    const file = await prisma.projectFile.findFirst({
      where: { id: req.params.fileId, projectId: req.params.projectId },
    });
    if (!file) return res.status(404).json({ error: "File not found" });

    if (!fs.existsSync(file.storagePath)) {
      return res.status(404).json({ error: "File not found on disk" });
    }

    const previewable = file.mimeType.startsWith("text/") ||
      file.mimeType === "application/pdf" ||
      file.originalName.endsWith(".md") ||
      file.originalName.endsWith(".txt");

    const encodedName = encodeURIComponent(file.originalName);
    const dispType = previewable ? "inline" : "attachment";
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `${dispType}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);

    const stream = fs.createReadStream(file.storagePath);
    stream.pipe(res);
  } catch (err) {
    console.error("Error serving file:", err);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

export default router;
