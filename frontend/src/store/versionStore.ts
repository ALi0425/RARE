import { create } from "zustand";
import { request } from "../api/client";

export interface CommitData {
  id: string;
  version: number;
  message: string;
  createdAt: string;
}

interface VersionStore {
  commits: CommitData[];
  loading: boolean;
  previewMode: boolean;
  previewVersion: number | null;

  loadCommits: (projectId: string) => Promise<void>;
  enterPreview: (version: number) => void;
  exitPreview: () => void;
  reset: () => void;
}

export const useVersionStore = create<VersionStore>((set) => ({
  commits: [],
  loading: false,
  previewMode: false,
  previewVersion: null,

  loadCommits: async (projectId) => {
    set({ loading: true });
    try {
      const data = await request<CommitData[]>(`/commits/${projectId}`);
      set({ commits: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  enterPreview: (version) => {
    set({ previewMode: true, previewVersion: version });
  },

  exitPreview: () => {
    set({ previewMode: false, previewVersion: null });
  },

  reset: () => {
    set({ commits: [], loading: false, previewMode: false, previewVersion: null });
  },
}));
