import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import SeguimientoPedidoPage from "./pages/SeguimientoPedidoPage";
import AppLayout from "./components/layout/AppLayout";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { useAuthInit } from "./hooks/useAuthInit";
import { useVerificarActualizacion } from "./hooks/useVerificarActualizacion";
import { PagePlaceholder } from "./components/PagePlaceholder";
import UsuariosPage from "./pages/admin/UsuariosPage";
import SucursalesPage from "./pages/admin/SucursalesPage";
import ProductosPage from "./pages/admin/ProductosPage";
import CostosPage from "./pages/admin/CostosPage";
import RecetasPage from "./pages/admin/RecetasPage";
import PromocionesPage from "./pages/admin/PromocionesPage";
import BaseDespachadoresPage from "./pages/admin/BaseDespachadoresPage";
import PedidosAdminPage from "./pages/admin/PedidosAdminPage";
import TarifasDespachoPage from "./pages/admin/TarifasDespachoPage";
import TurnoPage from "./pages/turno/TurnoPage";
import PedidosPage from "./pages/turno/PedidosPage";
import PedidosOnlinePage from "./pages/turno/PedidosOnlinePage";
import PedidosNelyPage from "./pages/turno/PedidosNelyPage";
import DespachadoresPage from "./pages/turno/DespachadoresPage";
import BodegaPage from "./pages/turno/BodegaPage";
import GastosPage from "./pages/turno/GastosPage";
import EstadoCajaPage from "./pages/turno/EstadoCajaPage";
import ConfiguracionPage from "./pages/turno/ConfiguracionPage";
import MapaDespachos from "./pages/turno/MapaDespachos";
import CocinaPage from "./pages/preparador/CocinaPage";
import EncargadoDashboard from "./pages/encargado/EncargadoDashboard";
import LogisticaPage from "./pages/encargado/LogisticaPage";
import BodegaCentralPage from "./pages/bodega/BodegaCentralPage";
import PedidosSucursalesPage from "./pages/bodega/PedidosSucursalesPage";
import ChoferesPage from "./pages/bodega/ChoferesPage";
import HistorialPage from "./pages/bodega/HistorialPage";
import InventariosPage from "./pages/bodega/InventariosPage";
import DiferenciasPage from "./pages/bodega/DiferenciasPage";
import StockSucursalesPage from "./pages/bodega/StockSucursalesPage";
import StockMinimosPage from "./pages/bodega/StockMinimosPage";
import JarrosPage from "./pages/bodega/JarrosPage";
import InsumosPage from "./pages/bodega/InsumosPage";
import { Navigate } from "react-router-dom";
import ContadorPage from "./pages/contador/ContadorPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AuditoriaDespachosPage from "./pages/admin/AuditoriaDespachosPage";
import VersionBadge from "./components/VersionBadge";

const queryClient = new QueryClient();

const AuthBoot = ({ children }: { children: React.ReactNode }) => {
  useAuthInit();
  useVerificarActualizacion();
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthBoot>
          <VersionBadge />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/seguimiento/:pedidoId" element={<SeguimientoPedidoPage />} />

            {/* Admin / Superadmin */}
            <Route
              element={
                <ProtectedRoute roles={["superadmin", "admin"]}>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              <Route path="/admin/auditoria-despachos" element={<AuditoriaDespachosPage />} />
              <Route path="/admin/auditoria" element={<AuditoriaDespachosPage />} />
              <Route path="/admin/sucursales" element={<SucursalesPage />} />
              <Route
                path="/admin/pedidos"
                element={
                  <ProtectedRoute roles={["superadmin"]}>
                    <PedidosAdminPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/admin/productos" element={<ProductosPage />} />
              <Route path="/admin/costos" element={<CostosPage />} />
              <Route path="/admin/recetas" element={<RecetasPage />} />
              <Route path="/admin/promociones" element={<PromocionesPage />} />
              <Route path="/admin/reportes" element={<PagePlaceholder title="Reportes" />} />
              <Route path="/admin/usuarios" element={<UsuariosPage />} />
              <Route path="/admin/base-despachadores" element={<BaseDespachadoresPage />} />
              <Route path="/admin/tarifas-despacho" element={<TarifasDespachoPage />} />
              <Route path="/admin/configuracion" element={<PagePlaceholder title="Configuración" />} />
            </Route>

            {/* Encargado */}
            <Route
              element={
                <ProtectedRoute roles={["encargado"]}>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/encargado/dashboard" element={<EncargadoDashboard />} />
              <Route path="/encargado/pedidos" element={<PagePlaceholder title="Pedidos" />} />
              <Route path="/encargado/turnos" element={<PagePlaceholder title="Turnos" />} />
              <Route path="/encargado/stock" element={<PagePlaceholder title="Stock" />} />
              <Route path="/encargado/logistica" element={<LogisticaPage />} />
              <Route path="/encargado/equipo" element={<PagePlaceholder title="Mi equipo" />} />
            </Route>

            {/* Tomador */}
            <Route
              element={
                <ProtectedRoute roles={["tomador_pedidos"]}>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/turno" element={<TurnoPage />}>
                <Route index element={<Navigate to="pedidos" replace />} />
                <Route path="pedidos" element={<PedidosPage />} />
                <Route path="pedidos-online" element={<PedidosOnlinePage />} />
                <Route path="pedidos-nely" element={<PedidosNelyPage />} />
                <Route path="despachadores" element={<DespachadoresPage />} />
                <Route path="bodega" element={<BodegaPage />} />
              <Route path="gastos" element={<GastosPage />} />
              <Route path="caja" element={<EstadoCajaPage />} />
              <Route path="mapa" element={<MapaDespachos />} />
              <Route path="configuracion" element={<ConfiguracionPage />} />
              </Route>
            </Route>

            {/* Preparador */}
            <Route
              path="/preparador"
              element={
                <ProtectedRoute roles={["preparador"]}>
                  <CocinaPage />
                </ProtectedRoute>
              }
            />

            {/* Despachador (login propio reservado, hoy no logean) */}
            <Route
              element={
                <ProtectedRoute roles={["despachador"]}>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/despachador" element={<PagePlaceholder title="Despachos" />} />
            </Route>

            {/* Jefe de bodega */}
            <Route
              element={
                <ProtectedRoute roles={["jefe_bodega", "logistica"]}>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/bodega" element={<BodegaCentralPage />} />
              <Route path="/bodega/pedidos" element={<PedidosSucursalesPage />} />
              <Route path="/bodega/stock-sucursales" element={<StockSucursalesPage />} />
              <Route path="/bodega/stock-minimos" element={<StockMinimosPage />} />
              <Route path="/bodega/jarros" element={<JarrosPage />} />
              <Route path="/bodega/choferes" element={<ChoferesPage />} />
              <Route path="/bodega/historial" element={<HistorialPage />} />
              <Route path="/bodega/inventarios" element={<InventariosPage />} />
              <Route path="/bodega/diferencias" element={<DiferenciasPage />} />
              <Route path="/bodega/insumos" element={<InsumosPage />} />
            </Route>

            {/* Contador / RRHH (+ admin/superadmin lectura) */}
            <Route
              element={
                <ProtectedRoute roles={["contador_rrhh", "superadmin", "admin"]}>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/contador" element={<ContadorPage />} />
              <Route path="/contador/descuadres" element={<PagePlaceholder title="Descuadres" />} />
              <Route path="/contador/asistencia" element={<PagePlaceholder title="Asistencia" />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthBoot>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
