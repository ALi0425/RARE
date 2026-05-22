const API_BASE = "http://localhost:3001/api";

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

// Projects
export const projectsApi = {
  list: () => request("/projects"),
  get: (id: string) => request(`/projects/${id}`),
  create: (data: { name: string; description?: string }) =>
    request("/projects", { method: "POST", body: JSON.stringify(data) }),
  archive: (id: string) => request(`/projects/${id}/archive`, { method: "POST" }),
  unarchive: (id: string) => request(`/projects/${id}/unarchive`, { method: "POST" }),
};

// Assets
export const assetsApi = {
  createModule: (projectId: string, data: Record<string, unknown>) =>
    request(`/projects/${projectId}/modules`, { method: "POST", body: JSON.stringify(data) }),
  updateModule: (projectId: string, id: string, data: Record<string, unknown>) =>
    request(`/projects/${projectId}/modules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteModule: (projectId: string, id: string) =>
    request(`/projects/${projectId}/modules/${id}`, { method: "DELETE" }),

  createPage: (projectId: string, data: Record<string, unknown>) =>
    request(`/projects/${projectId}/pages`, { method: "POST", body: JSON.stringify(data) }),
  updatePage: (projectId: string, id: string, data: Record<string, unknown>) =>
    request(`/projects/${projectId}/pages/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePage: (projectId: string, id: string) =>
    request(`/projects/${projectId}/pages/${id}`, { method: "DELETE" }),

  createField: (projectId: string, data: Record<string, unknown>) =>
    request(`/projects/${projectId}/fields`, { method: "POST", body: JSON.stringify(data) }),
  updateField: (projectId: string, id: string, data: Record<string, unknown>) =>
    request(`/projects/${projectId}/fields/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteField: (projectId: string, id: string) =>
    request(`/projects/${projectId}/fields/${id}`, { method: "DELETE" }),

  createAction: (projectId: string, data: Record<string, unknown>) =>
    request(`/projects/${projectId}/actions`, { method: "POST", body: JSON.stringify(data) }),
  updateAction: (projectId: string, id: string, data: Record<string, unknown>) =>
    request(`/projects/${projectId}/actions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAction: (projectId: string, id: string) =>
    request(`/projects/${projectId}/actions/${id}`, { method: "DELETE" }),
};

// Edges
export const edgesApi = {
  list: (projectId: string) => request(`/edges/${projectId}`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request(`/edges/${projectId}`, { method: "POST", body: JSON.stringify(data) }),
  update: (projectId: string, id: string, data: Record<string, unknown>) =>
    request(`/edges/${projectId}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (projectId: string, id: string) =>
    request(`/edges/${projectId}/${id}`, { method: "DELETE" }),
};

// Parse
export const parseApi = {
  parse: (projectId: string, text: string) =>
    request(`/parse/${projectId}`, { method: "POST", body: JSON.stringify({ text }) }),
};

// Commits
export const commitsApi = {
  list: (projectId: string) => request(`/commits/${projectId}`),
  create: (projectId: string, data: { description?: string; baseVersion?: number }) =>
    request(`/commits/${projectId}`, { method: "POST", body: JSON.stringify(data) }),
};
