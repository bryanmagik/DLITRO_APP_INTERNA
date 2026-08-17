import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Store,
  ClipboardList,
  ShoppingBag,
  Target,
  BarChart3,
  Users,
  Settings,
  Boxes,
  ArrowLeftRight,
  Calculator,
  Bike,
  MapPin,
  ChefHat,
  ShoppingCart,
  Warehouse,
  Truck,
  PackageCheck,
  LayoutGrid,
  DollarSign,
  BookOpen,
  Beer,
  ClipboardCheck,
  AlertTriangle,
  Globe,
  Package,
  Smartphone,
  Map,
  GitCompareArrows,
  Wallet,
  History,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuthStore, type Rol } from "@/stores/authStore";
import { usePedidosOrigenPendientes } from "@/hooks/usePedidosOrigenPendientes";

const DLITRO_LOGO = "/LOGO Original.png";
import { Badge } from "@/components/ui/badge";

type Item = { title: string; url: string; icon: typeof LayoutDashboard };

const menuPorRol: Record<Rol, Item[]> = {
  superadmin: [
    { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
    { title: "Panel de Auditoría", url: "/admin/auditoria", icon: History },
    { title: "Sucursales", url: "/admin/sucursales", icon: Store },
    { title: "Pedidos", url: "/admin/pedidos", icon: ClipboardList },
    { title: "Productos", url: "/admin/productos", icon: ShoppingBag },
    { title: "Costos", url: "/admin/costos", icon: DollarSign },
    { title: "Recetas", url: "/admin/recetas", icon: BookOpen },
    { title: "Promociones", url: "/admin/promociones", icon: Target },
    { title: "Caja por Día", url: "/contador", icon: Calculator },
    { title: "Reportes", url: "/admin/reportes", icon: BarChart3 },
    { title: "Usuarios", url: "/admin/usuarios", icon: Users },
    { title: "Base Despachadores", url: "/admin/base-despachadores", icon: Bike },
    { title: "Tarifas de Despacho", url: "/admin/tarifas-despacho", icon: MapPin },
    { title: "Configuración", url: "/admin/configuracion", icon: Settings },
  ],
  admin: [
    { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
    { title: "Panel de Auditoría", url: "/admin/auditoria", icon: History },
    { title: "Sucursales", url: "/admin/sucursales", icon: Store },
    { title: "Pedidos", url: "/admin/pedidos", icon: ClipboardList },
    { title: "Productos", url: "/admin/productos", icon: ShoppingBag },
    { title: "Costos", url: "/admin/costos", icon: DollarSign },
    { title: "Recetas", url: "/admin/recetas", icon: BookOpen },
    { title: "Promociones", url: "/admin/promociones", icon: Target },
    { title: "Caja por Día", url: "/contador", icon: Calculator },
    { title: "Reportes", url: "/admin/reportes", icon: BarChart3 },
    { title: "Usuarios", url: "/admin/usuarios", icon: Users },
    { title: "Base Despachadores", url: "/admin/base-despachadores", icon: Bike },
    { title: "Tarifas de Despacho", url: "/admin/tarifas-despacho", icon: MapPin },
    { title: "Configuración", url: "/admin/configuracion", icon: Settings },
  ],
  encargado: [
    { title: "Mi Sucursal", url: "/encargado/dashboard", icon: LayoutDashboard },
    { title: "Pedidos", url: "/encargado/pedidos", icon: ClipboardList },
    { title: "Turnos", url: "/encargado/turnos", icon: ClipboardList },
    { title: "Stock", url: "/encargado/stock", icon: Boxes },
    { title: "Logística", url: "/encargado/logistica", icon: Truck },
    { title: "Mi Equipo", url: "/encargado/equipo", icon: Users },
  ],
  tomador_pedidos: [
    { title: "Pedidos", url: "/turno/pedidos", icon: ShoppingCart },
    { title: "Pedidos Online", url: "/turno/pedidos-online", icon: Globe },
    { title: "Pedidos NELY", url: "/turno/pedidos-nely", icon: Smartphone },
    { title: "Despachadores", url: "/turno/despachadores", icon: Bike },
    { title: "Mapa de Despachos", url: "/turno/mapa", icon: Map },
    { title: "Bodega", url: "/turno/bodega", icon: Boxes },
    { title: "Gastos", url: "/turno/gastos", icon: Calculator },
    { title: "Caja", url: "/turno/caja", icon: Wallet },
    { title: "Configuración", url: "/turno/configuracion", icon: Settings },
  ],
  preparador: [
    { title: "Cocina", url: "/preparador", icon: ChefHat },
  ],
  despachador: [
    { title: "Despachos", url: "/despachador", icon: Bike },
  ],
  jefe_bodega: [
    { title: "Bodega Central", url: "/bodega", icon: Warehouse },
    { title: "Pedidos Sucursales", url: "/bodega/pedidos", icon: PackageCheck },
    { title: "Stock Sucursales", url: "/bodega/stock-sucursales", icon: LayoutGrid },
    { title: "Stock Mínimos", url: "/bodega/stock-minimos", icon: AlertTriangle },
    { title: "Insumos", url: "/bodega/insumos", icon: Package },
    { title: "Control de Jarros", url: "/bodega/jarros", icon: Beer },
    { title: "Choferes", url: "/bodega/choferes", icon: Bike },
    { title: "Inventarios", url: "/bodega/inventarios", icon: ClipboardCheck },
    { title: "Diferencias", url: "/bodega/diferencias", icon: GitCompareArrows },
    { title: "Historial", url: "/bodega/historial", icon: ClipboardList },
  ],
  logistica: [
    { title: "Mis Despachos", url: "/bodega/pedidos", icon: Truck },
  ],
  contador_rrhh: [
    { title: "Caja por Día", url: "/contador", icon: Calculator },
    { title: "Descuadres", url: "/contador/descuadres", icon: BarChart3 },
    { title: "Asistencia", url: "/contador/asistencia", icon: Users },
  ],
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { perfil } = useAuthStore();
  const { pathname } = useLocation();

  const items = perfil ? menuPorRol[perfil.rol] ?? [] : [];
  const sucursalTomador = perfil?.rol === "tomador_pedidos" ? perfil?.sucursal_id : null;
  const { count: pendientesOnline } = usePedidosOrigenPendientes(sucursalTomador, "online");
  const { count: pendientesNely } = usePedidosOrigenPendientes(sucursalTomador, "nely");

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="bg-sidebar">
        <div className="px-4 py-5 border-b border-sidebar-border flex items-center justify-center">
          <div
            className={`rounded-full bg-white shadow-md flex items-center justify-center overflow-hidden ${
              collapsed ? "h-8 w-8" : "h-16 w-16"
            }`}
          >
            <img
              src={DLITRO_LOGO}
              alt="dlitro"
              className="h-full w-full object-contain"
            />
          </div>
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.url || pathname.startsWith(item.url + "/");
                const showBadgeOnline = item.url === "/turno/pedidos-online" && pendientesOnline > 0;
                const showBadgeNely = item.url === "/turno/pedidos-nely" && pendientesNely > 0;
                const badgeCount = showBadgeOnline ? pendientesOnline : showBadgeNely ? pendientesNely : 0;
                const showBadge = showBadgeOnline || showBadgeNely;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink
                        to={item.url}
                        className={`flex items-center gap-3 ${
                          active
                            ? "bg-sidebar-accent text-primary font-semibold"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <span className="uppercase tracking-wider text-xs flex-1">{item.title}</span>
                        )}
                        {showBadge && (
                          <Badge className="bg-destructive text-destructive-foreground h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold animate-pulse">
                            {badgeCount}
                          </Badge>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
