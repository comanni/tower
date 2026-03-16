import { create } from 'zustand';

export interface ServerConfig {
  version: string;
  workspaceRoot: string;
  permissionMode: string;
  claudeExecutable: string;
}

interface SettingsState {
  isOpen: boolean;
  skillsBrowserOpen: boolean;
  theme: 'dark' | 'light';
  serverConfig: ServerConfig | null;
  setOpen: (open: boolean) => void;
  setSkillsBrowserOpen: (open: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setServerConfig: (config: ServerConfig) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  isOpen: false,
  skillsBrowserOpen: false,
  theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  serverConfig: null,
  setOpen: (open) => set({ isOpen: open }),
  setSkillsBrowserOpen: (open) => set({ skillsBrowserOpen: open }),
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    set({ theme });
  },
  setServerConfig: (config) => set({ serverConfig: config }),
}));
