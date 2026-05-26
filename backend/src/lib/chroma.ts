const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8001";
const TENANT = "default_tenant";
const DATABASE = "default_database";

function base() {
  return `${CHROMA_URL}/api/v2/tenants/${TENANT}/databases/${DATABASE}`;
}

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${base()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ChromaDB ${res.status}: ${text.slice(0, 200)}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export async function listCollections(): Promise<any[]> {
  return request("/collections");
}

export async function ensureCollection(name: string) {
  const all = await listCollections();
  const existing = all.find((c: any) => c.name === name);
  if (existing) return existing;
  return request("/collections", {
    method: "POST",
    body: JSON.stringify({ name, metadata: { "hnsw:space": "cosine" } }),
  });
}

export async function addDocuments(
  collectionId: string,
  docs: { id: string; embedding: number[]; document: string; metadata?: Record<string, any> }[],
) {
  return request(`/collections/${collectionId}/add`, {
    method: "POST",
    body: JSON.stringify({
      ids: docs.map((d) => d.id),
      embeddings: docs.map((d) => d.embedding),
      documents: docs.map((d) => d.document),
      metadatas: docs.map((d) => d.metadata || {}),
    }),
  });
}
