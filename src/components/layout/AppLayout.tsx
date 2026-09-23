import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { LogOut, Moon, Sun, Plus, ArrowRightLeft, CircleStop } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useTurnoHeaderStore } from "@/stores/turnoHeaderStore";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const rolLabel: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  encargado: "Encargado",
  tomador_pedidos: "Tomador",
  preparador: "Preparador",
  despachador: "Despachador",
  jefe_bodega: "Jefe de Bodega",
  contador_rrhh: "Contador / RRHH",
};

export default function AppLayout() {
  const { perfil, sucursalNombre } = useAuthStore();
  const { pathname } = useLocation();
  const glass = !pathname.startsWith("/turno");
  const turnoInfo = useTurnoHeaderStore((s) => s.info);

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("dlitro-theme") as "dark" | "light") || "dark";
  });

  useEffect(() => {
    localStorage.setItem("dlitro-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <SidebarProvider>
      <div
        className={`min-h-screen flex w-full bg-background ${
          glass ? `glass-theme glass-${theme}` : ""
        }`}
      >
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="app-header min-h-14 border-b border-border bg-card flex items-center px-2 py-2 gap-2 sm:px-4 sm:gap-3 sticky top-0 z-30">
            <SidebarTrigger className="shrink-0 text-muted-foreground hover:text-foreground" />
            <div className="flex-1 flex items-center gap-2 min-w-0 sm:gap-3">
              {sucursalNombre && (
                <span className="font-display text-lg text-primary truncate sm:text-xl">
                  {sucursalNombre.toUpperCase()}
                </span>
              )}
              {turnoInfo && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest shrink-0">
                  <span className="hidden md:inline">·</span>
                  <span>Caja: <span className="text-foreground font-medium normal-case">${turnoInfo.cajaChica.toLocaleString("es-CL")}</span></span>
                  <button
                    type="button"
                    onClick={turnoInfo.onAgregarCaja}
                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 border border-primary/30 rounded px-1.5 py-0.5 hover:bg-primary/10 transition-colors"
                    title="Agregar caja chica"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 text-sm shrink-0 sm:gap-2 lg:gap-3">
              {turnoInfo && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary uppercase tracking-wider h-8 px-2 sm:px-3"
                    onClick={turnoInfo.onCambioTurno}
                    title="Cambiar turno"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Cambio</span>
                  </Button>
                  {turnoInfo.puedeCerrarTurno ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive uppercase tracking-wider h-8 px-2 sm:px-3"
                      onClick={turnoInfo.onCerrarTurno}
                      title="Cerrar turno"
                    >
                      <span className="hidden sm:inline">Cerrar</span>
                      <CircleStop className="h-3.5 w-3.5 sm:hidden" />
                    </Button>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              className="border-destructive/40 text-destructive/50 uppercase tracking-wider h-8 px-2 sm:px-3"
                              aria-label="Cerrar turno"
                            >
                              <span className="hidden sm:inline">Cerrar</span>
                              <CircleStop className="h-3.5 w-3.5 sm:hidden" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Solo puede cerrar el turno quien lo abrió</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </>
              )}
              {glass && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Cambiar tema"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              )}
              <div className="text-right hidden lg:block">
                <div className="text-foreground font-medium leading-tight">
                  {perfil?.nombre_completo || perfil?.nombre}
                </div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  {perfil ? rolLabel[perfil.rol] : ""}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 min-w-0 overflow-auto p-3 sm:p-4 xl:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
