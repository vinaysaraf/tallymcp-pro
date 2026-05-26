import { create } from "zustand";
import type { ClientId, TallyStatus, UpdateStatus } from "../shared/ipc-types.js";

export type Screen = "home" | "health-check" | "settings" | "smartscreen-guide";

export type FirewallSkipReason = "non-admin" | "group-policy";

export interface AppStoreState {
  currentScreen: Screen;
  tallyStatus: TallyStatus;
  configuredClients: Set<ClientId>;
  lastError?: string;
  firewallSkipReason?: FirewallSkipReason;
  updateStatus?: UpdateStatus;
  updateDismissedThisSession: boolean;
  navigateTo: (screen: Screen) => void;
  setTallyStatus: (status: TallyStatus) => void;
  markClientConfigured: (id: ClientId) => void;
  unmarkClientConfigured: (id: ClientId) => void;
  isClientConfigured: (id: ClientId) => boolean;
  setLastError: (msg: string) => void;
  clearLastError: () => void;
  setFirewallSkipReason: (reason: FirewallSkipReason) => void;
  clearFirewallSkipReason: () => void;
  setUpdateStatus: (status: UpdateStatus) => void;
  dismissUpdate: () => void;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  currentScreen: "home",
  tallyStatus: { reachable: false, probedAt: 0 },
  configuredClients: new Set<ClientId>(),
  lastError: undefined,
  firewallSkipReason: undefined,
  updateStatus: undefined,
  updateDismissedThisSession: false,

  // Clears lastError and firewallSkipReason on screen change so stale errors
  // don't follow the user across screens (Cursor review M1 — error auto-dismiss UX,
  // Phase 3.1 firewall reason hygiene).
  navigateTo: (screen) => set({ currentScreen: screen, lastError: undefined, firewallSkipReason: undefined }),
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
  setFirewallSkipReason: (reason) => set({ firewallSkipReason: reason }),
  clearFirewallSkipReason: () => set({ firewallSkipReason: undefined }),
  setUpdateStatus: (status) => set({ updateStatus: status }),
  dismissUpdate: () => set({ updateDismissedThisSession: true }),
}));
