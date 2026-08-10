import { useCallback, useEffect, useState } from "react";
import { Loader2, Printer, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  DEFAULT_IMPRESORA_COCINA,
  DEFAULT_IMPRESORA_TOMA,
  getConfigImpresoraCocina,
  getConfigImpresoraToma,
  getMetodoImpresion,
  getUltimoLogImpresion,
  imprimirPrueba,
  listarImpresoras,
  setConfigImpresoraCocina,
  setConfigImpresoraToma,
  setMetodoImpresion,
  type MetodoImpresion,
  type PrinterConfig,
} from "@/services/printer";

function CardImpresora({
  titulo,
  descripcion,
  config,
  impresoras,
  defaultNombre,
  loading,
  onChange,
  onPrueba,
  probando,
}: {
  titulo: string;
  descripcion: string;
  config: PrinterConfig;
  impresoras: string[];
  defaultNombre: string;
  loading: boolean;
  onChange: (c: PrinterConfig) => void;
  onPrueba: () => void;
  probando: boolean;
}) {
  const opciones = impresoras.includes(config.nombre)
    ? impresoras
    : config.nombre
      ? [config.nombre, ...impresoras]
      : impresoras.length > 0
        ? impresoras
        : [defaultNombre];

  const patch = (partial: Partial<PrinterConfig>) => onChange({ ...config, ...partial });

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Printer className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg tracking-wide text-foreground">{titulo}</h3>
          <p className="text-xs text-muted-foreground">{descripcion}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Impresora local</Label>
        <Select value={config.nombre} onValueChange={(v) => patch({ nombre: v })} disabled={loading}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder={loading ? "Cargando impresoras…" : "Seleccionar impresora"} />
          </SelectTrigger>
          <SelectContent>
            {opciones.map((nombre) => (
              <SelectItem key={nombre} value={nombre}>{nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        className="w-full uppercase tracking-wider"
        onClick={onPrueba}
        disabled={probando || !config.nombre}
      >
        {probando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
        Imprimir prueba
      </Button>
    </div>
  );
}

export default function ConfiguracionPage() {
  const [configToma, setConfigTomaState] = useState(getConfigImpresoraToma);
  const [configCocina, setConfigCocinaState] = useState(getConfigImpresoraCocina);
  const [impresoras, setImpresoras] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [probandoToma, setProbandoToma] = useState(false);
  const [probandoCocina, setProbandoCocina] = useState(false);
  const [metodo, setMetodoState] = useState<MetodoImpresion>(getMetodoImpresion);
  const [ultimoLog, setUltimoLog] = useState(getUltimoLogImpresion);

  const cargarImpresoras = useCallback(async () => {
    setLoading(true);
    const lista = await listarImpresoras();
    setImpresoras(lista);
    setLoading(false);
  }, []);

  useEffect(() => {
    setConfigTomaState(getConfigImpresoraToma());
    setConfigCocinaState(getConfigImpresoraCocina());
    cargarImpresoras();
  }, [cargarImpresoras]);

  const guardar = () => {
    setConfigImpresoraToma(configToma);
    setConfigImpresoraCocina(configCocina);
    setMetodoImpresion(metodo);
    toast.success("Configuración guardada");
  };

  const probar = async (rol: "Toma de Pedidos" | "Cocina", config: PrinterConfig, setProbando: (v: boolean) => void) => {
    setProbando(true);
    try {
      await imprimirPrueba(rol, config);
      setUltimoLog(getUltimoLogImpresion());
      toast.success(`Prueba enviada a ${config.nombre}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo imprimir la prueba");
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl tracking-wide text-foreground">Configuración</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Impresoras del puesto</p>
        </div>
        <Button variant="outline" size="sm" onClick={cargarImpresoras} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Método de impresión local</Label>
        <Select value={metodo} onValueChange={(v) => setMetodoState(v as MetodoImpresion)}>
          <SelectTrigger className="bg-background max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="raw">RAW Windows (recomendado SEWOO)</SelectItem>
            <SelectItem value="plugin">Plugin tauri-plugin-printer-v2</SelectItem>
            <SelectItem value="auto">Auto (plugin → fallback RAW)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          La impresión se realiza localmente mediante Tauri usando la impresora instalada en este puesto.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardImpresora
          titulo="Impresora Toma de Pedidos"
          descripcion="Comanda completa para el tomador de pedidos"
          config={configToma}
          impresoras={impresoras}
          defaultNombre={DEFAULT_IMPRESORA_TOMA}
          loading={loading}
          onChange={setConfigTomaState}
          onPrueba={() => probar("Toma de Pedidos", configToma, setProbandoToma)}
          probando={probandoToma}
        />
        <CardImpresora
          titulo="Impresora Cocina / Preparación"
          descripcion="Comanda simplificada para el preparador"
          config={configCocina}
          impresoras={impresoras}
          defaultNombre={DEFAULT_IMPRESORA_COCINA}
          loading={loading}
          onChange={setConfigCocinaState}
          onPrueba={() => probar("Cocina", configCocina, setProbandoCocina)}
          probando={probandoCocina}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={guardar} className="uppercase tracking-wider">
          <Save className="h-4 w-4 mr-2" /> Guardar configuración
        </Button>
      </div>

      {ultimoLog && (
        <div className="bg-muted/40 border border-border rounded-lg p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Último log de impresión</p>
          <pre className="text-[10px] whitespace-pre-wrap break-all font-mono text-foreground">{ultimoLog}</pre>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Impresoras por defecto: «{DEFAULT_IMPRESORA_TOMA}» / «{DEFAULT_IMPRESORA_COCINA}».
      </p>
    </div>
  );
}
