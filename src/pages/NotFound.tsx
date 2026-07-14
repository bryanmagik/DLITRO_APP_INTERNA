import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <h1 className="font-display text-7xl text-primary">404</h1>
        <p className="text-muted-foreground uppercase tracking-widest text-sm">Página no encontrada</p>
        <a href="/" className="inline-block text-primary underline hover:text-primary/80 mt-4">
          Volver al inicio
        </a>
      </div>
    </div>
  );
};

export default NotFound;
