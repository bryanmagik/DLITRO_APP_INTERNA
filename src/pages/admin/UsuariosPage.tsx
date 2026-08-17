import { useEffect, useState } from "react";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore, type Rol } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Usuario {
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
interface Sucursal {
  id: string;
  nombre: string;
}

const ROLES: { value: Rol; label: string }[] = [
  { value: "superadmin", label: "Superadmin" },
  { value: "admin", label: "Admin" },
  { value: "encargado", label: "Encargado" },
  { value: "tomador_pedidos", label: "Tomador de pedidos" },
  { value: "preparador", label: "Preparador" },
  { value: "despachador", label: "Despachador" },
  { value: "jefe_bodega", label: "Jefe de bodega" },
  { value: "contador_rrhh", label: "Contador / RRHH" },
];

const SIN_SUCURSAL = "__sin_sucursal__";
const ROLES_OPERACIONALES: Rol[] = ["tomador_pedidos", "preparador", "despachador"];

function nombreUsuario(u: Pick<Usuario, "nombre" | "apellido" | "nombre_completo">): string {
  return u.nombre_completo || `${u.nombre}${u.apellido ? ` ${u.apellido}` : ""}`.trim();
}

export default function UsuariosPage() {
  const { perfil } = useAuthStore();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);

  // form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rut, setRut] = useState("");
  const [rol, setRol] = useState<Rol>("tomador_pedidos");
  const [sucursalId, setSucursalId] = useState<string>(SIN_SUCURSAL);
  const [activo, setActivo] = useState(true);

  const cargar = async () => {
    setLoading(true);
    const [usRes, ssRes] = await Promise.all([
      supabase.from("usuarios").select("*").order("created_at", { ascending: false }),
      supabase.from("sucursales").select("id, nombre").order("nombre"),
    ]);
    setUsuarios((usRes.data as Usuario[]) ?? []);
    setSucursales((ssRes.data as Sucursal[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setNombre("");
    setApellido("");
    setTelefono("");
    setRut("");
    setRol("tomador_pedidos");
    setSucursalId(SIN_SUCURSAL);
    setActivo(true);
    setEditando(null);
  };

  const abrirNuevo = () => {
    resetForm();
    if (perfil?.rol === "encargado") {
      setSucursalId(perfil.sucursal_id ?? SIN_SUCURSAL);
    }
    setOpen(true);
  };

  const abrirEditar = (u: Usuario) => {
    setEditando(u);
    setNombre(u.nombre);
    setApellido(u.apellido ?? "");
    setTelefono(u.telefono ?? "");
    setRut(u.rut ?? "");
    setRol(u.rol);
    setSucursalId(u.sucursal_id ?? SIN_SUCURSAL);
    setActivo(u.activo ?? true);
    setOpen(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const sucFinal = sucursalId === SIN_SUCURSAL ? null : sucursalId;

      if (editando) {
        const { error } = await supabase
          .from("usuarios")
          .update({
            nombre,
            apellido: apellido || null,
            telefono: telefono || null,
            rut: rut || null,
            rol,
            sucursal_id: sucFinal,
            activo,
          })
          .eq("id", editando.id);
        if (error) throw error;
        toast.success("Usuario actualizado");
      } else {
        // Crear usuario vía Edge Function (usa service role key en el servidor)
        const { data: fnData, error: fnError } = await supabase.functions.invoke("crear-usuario", {
          body: {
            email,
            password,
            nombre,
            apellido: apellido || null,
            telefono: telefono || null,
            rut: rut || null,
            rol,
            sucursal_id: sucFinal,
          },
        });

        if (fnError) {
          // Extraer el mensaje real del body de la respuesta (FunctionsHttpError)
          let msg = fnError.message;
          try {
            const context = (fnError as { context?: { json?: () => Promise<{ error?: string }> } }).context;
            const body = await context?.json?.();
            if (body?.error) msg = body.error;
          } catch {
            // Keep the SDK message when the function response has no JSON body.
          }
          throw new Error(msg);
        }
        if (fnData?.error) throw new Error(fnData.error);

        toast.success("Usuario creado correctamente");
      }

      setOpen(false);
      resetForm();
      cargar();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const sucursalNombre = (id: string | null) =>
    id ? sucursales.find((s) => s.id === id)?.nombre ?? "—" : "—";

  const rolLabel = (r: Rol) => ROLES.find((x) => x.value === r)?.label ?? r;

  if (perfil && !["superadmin", "admin", "encargado"].includes(perfil.rol)) {
    return <p className="text-muted-foreground">No tenés permisos para ver esta página.</p>;
  }

  const rolesDisponibles = perfil?.rol === "encargado"
    ? ROLES.filter((r) => ROLES_OPERACIONALES.includes(r.value))
    : ROLES;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-foreground tracking-wide">Usuarios</h1>
          <p className="text-muted-foreground text-sm">Gestioná todo el equipo dlitro</p>
        </div>
        <Button onClick={abrirNuevo} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo usuario
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Cargando…
          </div>
        ) : usuarios.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No hay usuarios todavía. Creá el primero.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 border-b border-border">
              <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {nombreUsuario(u)}
                    </div>
                    {u.rut && <div className="text-xs text-muted-foreground">{u.rut}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      {rolLabel(u.rol)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{sucursalNombre(u.sucursal_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.telefono ?? "—"}</td>
                  <td className="px-4 py-3">
                    {u.activo ? (
                      <span className="inline-flex items-center gap-1.5 text-success text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-wide">
              {editando ? "Editar usuario" : "Nuevo usuario"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={guardar} className="space-y-4">
            {!editando && (
              <>
                <div className="space-y-2">
                  <Label className="label-upper">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="label-upper">Contraseña inicial</Label>
                  <Input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-background"
                  />
                  <p className="text-xs text-muted-foreground">Mínimo 6 caracteres</p>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="label-upper">Nombre</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required className="bg-background" />
              </div>
              <div className="space-y-2">
                <Label className="label-upper">Apellido</Label>
                <Input value={apellido} onChange={(e) => setApellido(e.target.value)} className="bg-background" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="label-upper">RUT</Label>
                <Input value={rut} onChange={(e) => setRut(e.target.value)} className="bg-background" />
              </div>
              <div className="space-y-2">
                <Label className="label-upper">Teléfono</Label>
                <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="bg-background" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="label-upper">Rol</Label>
                <Select value={rol} onValueChange={(v) => setRol(v as Rol)}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {rolesDisponibles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="label-upper">Sucursal</Label>
                <Select value={sucursalId} onValueChange={setSucursalId}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {perfil?.rol !== "encargado" && <SelectItem value={SIN_SUCURSAL}>Sin sucursal</SelectItem>}
                    {sucursales.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between bg-secondary/30 px-3 py-2 rounded-md">
              <Label className="label-upper m-0">Usuario activo</Label>
              <Switch checked={activo} onCheckedChange={setActivo} />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
