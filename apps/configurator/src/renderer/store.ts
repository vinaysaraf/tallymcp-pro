import { create } from "zustand";
import type { ClientId, TallyStatus } from "../shared/ipc-types.js";

export type Screen = "home" | "health-check" | "settings" | "smartscreen-guide";

export interface AppStoreState {
  currentScreen: Screen;
  tallyStatus: TallyStatus;
  configuredClients: Set<ClientId>;
  lastError?: string;
  navigateTo: (screen: Screen) => void;
  setTallyStatus: (status: TallyStatus) => void;
  markClientConfigured: (id: ClientId) => void;
  unmarkClientConfigured: (id: ClientId) => void;
  isClientConfigured: (id: ClientId) => boolean;
  setLastError: (msg: string) => void;
  clearLastError: () => void;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  currentScreen: "home",
  tallyStatus: { reachable: false, probedAt: 0 },
  configuredClients: new Set<ClientId>(),
  lastError: undefined,

  // Clears lastError on screen change so stale errors don't follow the
  // user across screens (Cursor review M1 — error auto-dismiss UX).
  navigateTo: (screen) => set({ currentScreen: screen, lastError: undefined }),
  setTallyStatus: (status) => set({ tallyStatus: status }),
  markClientConfigured: (id) =>
    set((state) => ({
      configuredClients: new Set(state.configuredClients).add(id),
    })),
  unmarkClientConfigured: (id) =>
    set((state) => {
      const next = new Set(state.configuredClients);
      next.delete(id);
      return { configuredClients: next };
    }),
  isClientConfigured: (id) => get().configuredClients.has(id),
  setLastError: (msg) => set({ lastError: msg }),
  clearLastError: () => set({ lastError: undefined }),
}));
