import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { LogOut, Moon, Sun, Plus, ArrowRightLeft } from "lucide-react";
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
          <header className="app-header h-14 border-b border-border bg-card flex items-center px-4 gap-4 sticky top-0 z-30">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div className="flex-1 flex items-center gap-3 min-w-0">
              {sucursalNombre && (
                <span className="font-display text-xl text-primary truncate">
                  {sucursalNombre.toUpperCase()}
                </span>
              )}
              {turnoInfo && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest">
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
            <div className="flex items-center gap-3 text-sm">
              {turnoInfo && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary uppercase tracking-wider h-8"
                    onClick={turnoInfo.onCambioTurno}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Cambio
                  </Button>
                  {turnoInfo.puedeCerrarTurno ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive uppercase tracking-wider h-8"
                      onClick={turnoInfo.onCerrarTurno}
                    >
                      Cerrar
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
                              className="border-destructive/40 text-destructive/50 uppercase tracking-wider h-8"
                            >
                              Cerrar
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
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Cambiar tema"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              )}
              <div className="text-right hidden sm:block">
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
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}