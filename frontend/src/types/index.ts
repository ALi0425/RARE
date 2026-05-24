export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: { modules: number; pages: number; fields: number; actions: number };
}

export interface Module {
  id: string;
  projectId: string;
  name: string;
  posX: number;
  posY: number;
  pages?: Page[];
}

export interface Page {
  id: string;
  projectId: string;
  moduleId: string | null;
  name: string;
  posX: number;
  posY: number;
  fields?: Field[];
  actions?: Action[];
}

export interface Field {
  id: string;
  projectId: string;
  pageId: string | null;
  name: string;
  fieldType: string;
  posX: number;
  posY: number;
}

export interface Action {
  id: string;
  projectId: string;
  pageId: string | null;
  name: string;
  actionType: string;
  posX: number;
  posY: number;
  validations?: string[];
}

export interface Edge {
  id: string;
  projectId: string;
  sourceId: string;
  targetId: string;
  label?: string;
  sourceQuote?: string;
  flowType: string;
  status: string;
}

export interface FullProject {
  id: string;
  name: string;
  description?: string;
  status: string;
  modules: Module[];
  pages: Page[];
  fields: Field[];
  actions: Action[];
  edges: Edge[];
}

export type NodeType = "module" | "page" | "field" | "action";
