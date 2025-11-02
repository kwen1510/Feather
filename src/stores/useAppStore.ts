import { create } from 'zustand';

interface AppState {
  // Session state
  sessionId: string | null;
  sessionStatus: 'loading' | 'waiting' | 'active' | 'ended' | 'no-session' | 'created' | null;
  
  // Actions
  setSessionId: (sessionId: string | null) => void;
  setSessionStatus: (status: AppState['sessionStatus']) => void;
  resetSession: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  sessionId: null,
  sessionStatus: null,
  
  // Actions
  setSessionId: (sessionId) => set({ sessionId }),
  setSessionStatus: (sessionStatus) => set({ sessionStatus }),
  resetSession: () => set({ sessionId: null, sessionStatus: null }),
}));

