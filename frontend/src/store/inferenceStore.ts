import { create } from "zustand";
import { request } from "../api/client";

// ── Types ──

export type InferencePhase =
  | "idle"
  | "refining"
  | "reviewing"
  | "evaluating"
  | "deciding";

export interface EntityTagData {
  id?: string; // matched DB id (existing only)
  name: string;
  type: "module" | "page" | "field" | "action";
  isNew: boolean;
  parentName?: string;
  fieldType?: string;
  actionType?: string;
}

export interface DiffResult {
  greenIds: string[];
  redIds: string[];
  tooltips: Record<string, string>;
}

// ── Store ──

interface InferenceStore {
  inputText: string;
  setInputText: (text: string) => void;

  isProcessing: boolean;
  phase: InferencePhase;
  error: string | null;

  refinedText: string;
  entities: EntityTagData[];

  diffResult: DiffResult | null;
  decisionPanelVisible: boolean;

  // Actions
  submitRefine: (projectId: string, text: string) => Promise<void>;
  updateEntity: (index: number, data: Partial<EntityTagData>) => void;
  submitEvaluate: (projectId: string) => Promise<void>;
  confirmSave: (projectId: string) => Promise<void>;
  revertChanges: () => void;
  resetInference: () => void;
}

export const useInferenceStore = create<InferenceStore>((set, get) => ({
  inputText: "",
  isProcessing: false,
  phase: "idle",
  error: null,
  refinedText: "",
  entities: [],
  diffResult: null,
  decisionPanelVisible: false,

  setInputText: (text) => set({ inputText: text }),

  submitRefine: async (projectId, text) => {
    set({ isProcessing: true, phase: "refining", error: null });
    try {
      const result = await request<{
        refinedText: string;
        entities: EntityTagData[];
      }>(`/inference/refine`, {
        method: "POST",
        body: JSON.stringify({ projectId, rawText: text }),
      });
      set({
        refinedText: result.refinedText,
        entities: result.entities,
        phase: "reviewing",
        isProcessing: false,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "精炼失败",
        isProcessing: false,
        phase: "idle",
      });
    }
  },

  updateEntity: (index, data) => {
    set((state) => {
      const entities = [...state.entities];
      if (entities[index]) entities[index] = { ...entities[index], ...data };
      return { entities };
    });
  },

  submitEvaluate: async (projectId) => {
    const { refinedText, entities } = get();
    set({ isProcessing: true, phase: "evaluating", error: null });
    try {
      const result = await request<DiffResult>(`/inference/evaluate`, {
        method: "POST",
        body: JSON.stringify({ projectId, refinedText, entities }),
      });
      set({
        diffResult: result,
        phase: "deciding",
        decisionPanelVisible: true,
        isProcessing: false,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "评估失败",
        isProcessing: false,
        phase: "reviewing",
      });
    }
  },

  confirmSave: async (projectId) => {
    set({ isProcessing: true });
    try {
      await request(`/commits/${projectId}`, {
        method: "POST",
        body: JSON.stringify({ message: "推演确认" }),
      });
      set({
        phase: "idle",
        diffResult: null,
        decisionPanelVisible: false,
        refinedText: "",
        entities: [],
        inputText: "",
        isProcessing: false,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "保存失败",
        isProcessing: false,
      });
    }
  },

  revertChanges: () => {
    set({
      phase: "idle",
      diffResult: null,
      decisionPanelVisible: false,
      refinedText: "",
      entities: [],
      inputText: "",
      error: null,
    });
  },

  resetInference: () => {
    set({
      inputText: "",
      isProcessing: false,
      phase: "idle",
      error: null,
      refinedText: "",
      entities: [],
      diffResult: null,
      decisionPanelVisible: false,
    });
  },
}));
