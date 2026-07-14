import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShoppingCart, ClipboardList } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTurno } from "./TurnoPage";
import NuevoPedidoTab from "./tabs/NuevoPedidoTab";
import MisPedidosTab from "./tabs/MisPedidosTab";

export default function PedidosPage() {
  const { turno } = useTurno();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => (searchParams.get("tab") === "mis" ? "mis" : "nuevo"));

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "mis" || t === "nuevo") setTab(t);
  }, [searchParams]);
  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="bg-card border border-border h-auto p-1">
        <TabsTrigger value="nuevo" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <ShoppingCart className="h-4 w-4" /> Nuevo pedido
        </TabsTrigger>
        <TabsTrigger value="mis" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <ClipboardList className="h-4 w-4" /> Mis pedidos
        </TabsTrigger>
      </TabsList>
      <TabsContent value="nuevo"><NuevoPedidoTab turno={turno} /></TabsContent>
      <TabsContent value="mis"><MisPedidosTab turno={turno} /></TabsContent>
    </Tabs>
  );
}