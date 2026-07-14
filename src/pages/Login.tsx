import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore, rutaPorRol } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import loginBg from "@/assets/login-bg.jpg";

const DLITRO_LOGO = "/LOGO Original.png";

export default function Login() {
  const navigate = useNavigate();
  const { session, perfil } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (session && perfil) {
      navigate(rutaPorRol(perfil.rol), { replace: true });
    }
  }, [session, perfil, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError("Email o contraseña incorrectos");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-background animate-fade-in">
      {/* Left — visual */}
      <div
        className="relative hidden md:flex md:w-1/2 items-center justify-center overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(135deg, rgba(5,20,12,0.85), rgba(5,30,15,0.7)), url(${loginBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Floating green blobs */}
        <div className="absolute -top-20 -left-16 w-80 h-80 rounded-full bg-primary/30 blur-3xl animate-blob" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-primary/20 blur-3xl animate-blob" style={{ animationDelay: "4s" }} />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-emerald-400/10 blur-3xl animate-blob" style={{ animationDelay: "8s" }} />

        <div className="relative z-10 text-center px-12">
          <img
            src={DLITRO_LOGO}
            alt="dlitro"
            className="mx-auto h-64 w-64 object-contain drop-shadow-2xl"
          />
          <div className="mt-4 h-px w-24 bg-primary mx-auto" />
          <p className="text-white/80 mt-6 tracking-[0.3em] text-sm uppercase font-light">
            Sistema de Gestión
          </p>
          <p className="text-white/60 mt-2 tracking-[0.2em] text-xs uppercase">
            Tragos Preparados
          </p>
        </div>
      </div>

      {/* Mobile header */}
      <div
        className="md:hidden relative py-12 flex flex-col items-center justify-center overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #052e16 0%, #064e3b 50%, #022c22 100%)",
        }}
      >
        <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full bg-primary/30 blur-3xl animate-blob" />
        <div className="absolute -bottom-10 -right-10 w-56 h-56 rounded-full bg-primary/20 blur-3xl animate-blob" style={{ animationDelay: "4s" }} />
        <img
          src={DLITRO_LOGO}
          alt="dlitro"
          className="relative h-24 w-24 object-contain"
        />
        <p className="relative text-white/70 mt-2 tracking-widest text-xs uppercase">Sistema de Gestión</p>
      </div>

      {/* Right — form */}
      <div className="flex-1 md:w-1/2 flex items-center justify-center p-6 md:p-12 bg-background">
        <div className="w-full max-w-md">
          <div className="mb-10">
            <h2 className="text-4xl font-bold text-foreground tracking-tight">
              Bienvenido
            </h2>
            <p className="text-muted-foreground mt-2">
              Ingresá tus credenciales para continuar
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className={`space-y-5 ${shake ? "animate-shake" : ""}`}
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="tu@email.com"
                  className="h-12 pl-10 rounded-xl border-border bg-background shadow-sm focus-visible:ring-primary/40 focus-visible:shadow-md transition-shadow"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Contraseña
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-12 pl-10 pr-10 rounded-xl border-border bg-background shadow-sm focus-visible:ring-primary/40 focus-visible:shadow-md transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl px-4 py-3 animate-fade-in">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-widest uppercase shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-10">
            dlitro © 2026 · Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  );
}