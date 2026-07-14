import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore, rutaPorRol, type Rol } from "@/stores/authStore";

interface Props {
  children: React.ReactNode;
  roles?: Rol[];
}

export const ProtectedRoute = ({ children, roles }: Props) => {
  const { session, perfil, loading } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-display text-3xl text-primary animate-pulse">dlitro</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!perfil) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <div className="font-display text-4xl text-primary">dlitro</div>
        <p className="text-foreground">Tu cuenta no tiene perfil asignado.</p>
        <p className="text-sm text-muted-foreground">Contactá al administrador para que te dé acceso.</p>
      </div>
    );
  }

  if (roles && !roles.includes(perfil.rol)) {
    return <Navigate to={rutaPorRol(perfil.rol)} replace />;
  }

  return <>{children}</>;
};