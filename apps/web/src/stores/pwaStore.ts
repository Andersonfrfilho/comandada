import { create } from 'zustand'

interface PWAState {
  isInstalled: boolean
  updateAvailable: boolean
  installPrompt: BeforeInstallPromptEvent | null
  setInstallPrompt(prompt: BeforeInstallPromptEvent | null): void
  setInstalled(installed: boolean): void
  setUpdateAvailable(available: boolean): void
}

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const usePWAStore = create<PWAState>()((set) => ({
  isInstalled: false,
  updateAvailable: false,
  installPrompt: null,
  setInstallPrompt: (prompt) => set({ installPrompt: prompt }),
  setInstalled: (installed) => set({ isInstalled: installed }),
  setUpdateAvailable: (available) => set({ updateAvailable: available }),
}))
