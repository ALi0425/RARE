export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    modules: number;
    pages: number;
    fields: number;
    actions: number;
  };
}

export interface Module {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  posX: number;
  posY: number;
  pages?: Page[];
}

export interface Page {
  id: string;
  projectId: string;
  moduleId?: string;
  name: string;
  posX: number;
  posY: number;
  fields?: Field[];
  actions?: Action[];
}

export interface Field {
  id: string;
  projectId: string;
  pageId?: string;
  name: string;
  fieldType: string;
  posX: number;
  posY: number;
}

export interface Action {
  id: string;
  projectId: string;
  pageId?: string;
  name: string;
  actionType: string;
  validations?: string[];
  posX: number;
  posY: number;
}

export interface Edge {
  id: string;
  projectId: string;
  sourceId: string;
  targetId: string;
  sourceType: string;
  targetType: string;
  flowType: string;
  status: "extracted" | "inferred";
  label?: string;
  sourceQuote?: string;
}

export interface FullProject extends Project {
  modules: Module[];
  pages: Page[];
  fields: Field[];
  actions: Action[];
  edges: Edge[];
  summaries?: MacroSummary[];
}

export interface MacroSummary {
  id: string;
  projectId: string;
  content: string;
}

export interface CommitLog {
  id: string;
  projectId: string;
  version: number;
  description?: string;
  baseVersion?: number;
  createdAt: string;
}
