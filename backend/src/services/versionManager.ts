import prisma from "../lib/prisma";

const MAX_VERSIONS = 20;

export async function getNextVersion(projectId: string): Promise<number> {
  const latest = await prisma.commitLog.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

export async function createSnapshot(projectId: string) {
  const [modules, pages, fields, actions, edges] = await Promise.all([
    prisma.module.findMany({ where: { projectId } }),
    prisma.page.findMany({ where: { projectId } }),
    prisma.field.findMany({ where: { projectId } }),
    prisma.action.findMany({ where: { projectId } }),
    prisma.edge.findMany({ where: { projectId } }),
  ]);
  return {
    modules: JSON.parse(JSON.stringify(modules)),
    pages: JSON.parse(JSON.stringify(pages)),
    fields: JSON.parse(JSON.stringify(fields)),
    actions: JSON.parse(JSON.stringify(actions)),
    edges: JSON.parse(JSON.stringify(edges)),
  };
}

export async function truncateIfNeeded(projectId: string) {
  const all = await prisma.commitLog.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { id: true, version: true },
  });
  if (all.length <= MAX_VERSIONS) return;
  const toDelete = all.slice(MAX_VERSIONS).map((c) => c.id);
  await prisma.commitLog.deleteMany({ where: { id: { in: toDelete } } });
}
