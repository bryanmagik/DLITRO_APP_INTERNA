import { Navigate } from "react-router-dom";
import { useAuthStore, rutaPorRol } from "@/stores/authStore";

const Index = () => {
  const { session, perfil, loading } = useAuthStore();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-display text-3xl text-primary animate-pulse">dlitro</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (!perfil) return <Navigate to="/login" replace />;
  return <Navigate to={rutaPorRol(perfil.rol)} replace />;
};

export default Index;
