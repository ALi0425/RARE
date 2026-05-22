export interface LLMConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
}

export interface ParseRequest {
  text: string;
  projectId: string;
}

export interface ExtractedEntity {
  name: string;
  type: "module" | "page" | "field" | "action";
  parentName?: string;
  fieldType?: string;
  actionType?: string;
  validations?: string[];
}

export interface ExtractedEdge {
  sourceName: string;
  targetName: string;
  sourceType: string;
  targetType: string;
  flowType: "BUSINESS_FLOW" | "DATA_FLOW";
  status: "extracted" | "inferred";
  label?: string;
  sourceQuote?: string;
}

export interface ParseResult {
  entities: ExtractedEntity[];
  edges: ExtractedEdge[];
}

export interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId?: string;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  data?: Record<string, unknown>;
}
