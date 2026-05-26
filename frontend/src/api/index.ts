const BASE = "http://localhost:3001/api";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const projectsApi = {
  list: () => request<any[]>("/projects"),
  create: (data: { name: string }) => request<any>("/projects", { method: "POST", body: JSON.stringify(data) }),
  get: (id: string) => request<any>(`/projects/${id}`),
  update: (id: string, data: any) => request<any>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request<any>(`/projects/${id}`, { method: "DELETE" }),
};

export const assetsApi = {
  // Modules
  createModule: (pid: string, data: any) => request<any>(`/assets/${pid}/modules`, { method: "POST", body: JSON.stringify(data) }),
  updateModule: (pid: string, id: string, data: any) => request<any>(`/assets/${pid}/modules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteModule: (pid: string, id: string) => request<any>(`/assets/${pid}/modules/${id}`, { method: "DELETE" }),
  // Pages
  createPage: (pid: string, data: any) => request<any>(`/assets/${pid}/pages`, { method: "POST", body: JSON.stringify(data) }),
  updatePage: (pid: string, id: string, data: any) => request<any>(`/assets/${pid}/pages/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePage: (pid: string, id: string) => request<any>(`/assets/${pid}/pages/${id}`, { method: "DELETE" }),
  // Fields
  createField: (pid: string, data: any) => request<any>(`/assets/${pid}/fields`, { method: "POST", body: JSON.stringify(data) }),
  updateField: (pid: string, id: string, data: any) => request<any>(`/assets/${pid}/fields/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteField: (pid: string, id: string) => request<any>(`/assets/${pid}/fields/${id}`, { method: "DELETE" }),
  // Actions
  createAction: (pid: string, data: any) => request<any>(`/assets/${pid}/actions`, { method: "POST", body: JSON.stringify(data) }),
  updateAction: (pid: string, id: string, data: any) => request<any>(`/assets/${pid}/actions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAction: (pid: string, id: string) => request<any>(`/assets/${pid}/actions/${id}`, { method: "DELETE" }),
};

export const edgesApi = {
  list: (pid: string) => request<any[]>(`/edges/${pid}`),
  create: (pid: string, data: any) => request<any>(`/edges/${pid}`, { method: "POST", body: JSON.stringify(data) }),
  update: (pid: string, id: string, data: any) => request<any>(`/edges/${pid}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (pid: string, id: string) => request<any>(`/edges/${pid}/${id}`, { method: "DELETE" }),
  confirm: (pid: string, id: string) =>
    request<any>(`/edges/${pid}/${id}`, { method: "PATCH", body: JSON.stringify({ status: "extracted" }) }),
};

export const parseApi = {
  parse: (projectId: string, text: string) =>
    request<any>(`/parse/${projectId}`, { method: "POST", body: JSON.stringify({ text }) }),
};
