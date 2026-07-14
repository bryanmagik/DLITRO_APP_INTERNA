import { create } from "zustand";

export interface TurnoHeaderInfo {
  cajaChica: number;
  puedeCerrarTurno: boolean;
  onAgregarCaja: () => void;
  onCambioTurno: () => void;
  onCerrarTurno: () => void;
}

interface TurnoHeaderState {
  info: TurnoHeaderInfo | null;
  setInfo: (i: TurnoHeaderInfo | null) => void;
}

export const useTurnoHeaderStore = create<TurnoHeaderState>((set) => ({
  info: null,
  setInfo: (i) => set({ info: i }),
}));