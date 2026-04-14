import { create } from 'zustand';

// Viewer 状态类型，管理缩放、当前页和当前高亮命中。
interface ViewerState {
  scale: number;
  currentPage: number;
  activeHitId?: string;
  setScale: (scale: number) => void;
  setCurrentPage: (page: number) => void;
  setActiveHitId: (hitId?: string) => void;
}

// 创建全局 Viewer 状态仓库。
export const useViewerStore = create<ViewerState>((set) => ({
  scale: 1,
  currentPage: 1,
  activeHitId: undefined,
  setScale: (scale) => set({ scale }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setActiveHitId: (activeHitId) => set({ activeHitId })
}));
