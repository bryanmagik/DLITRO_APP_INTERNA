import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";

export type Rol =
  | "superadmin"
  | "admin"
  | "encargado"
  | "tomador_pedidos"
  | "preparador"
  | "despachador"
  | "jefe_bodega"
  | "logistica"
  | "contador_rrhh";

export interface UsuarioPerfil {
  id: string;
  nombre: string;
  apellido: string | null;
  nombre_completo: string | null;
  rol: Rol;
  sucursal_id: string | null;
  activo: boolean | null;
  telefono: string | null;
  rut: string | null;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  perfil: UsuarioPerfil | null;
  sucursalNombre: string | null;
  loading: boolean;
  setSession: (s: Session | null) => void;
  setPerfil: (p: UsuarioPerfil | null, sucursalNombre?: string | null) => void;
  setLoading: (l: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  perfil: null,
  sucursalNombre: null,
  loading: true,
  setSession: (s) => set({ session: s, user: s?.user ?? null }),
  setPerfil: (p, sucursalNombre = null) => set({ perfil: p, sucursalNombre }),
  setLoading: (l) => set({ loading: l }),
  reset: () => set({ session: null, user: null, perfil: null, sucursalNombre: null }),
}));

export const rutaPorRol = (rol: Rol): string => {
  switch (rol) {
    case "superadmin":
    case "admin":
      return "/admin/dashboard";
    case "encargado":
      return "/encargado/dashboard";
    case "tomador_pedidos":
      return "/turno/pedidos";
    case "preparador":
      return "/preparador";
    case "despachador":
      return "/despachador";
    case "jefe_bodega":
      return "/bodega";
    case "logistica":
      return "/bodega/pedidos";
    case "contador_rrhh":
      return "/contador";
    default:
      return "/";
  }
};