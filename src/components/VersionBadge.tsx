import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";

/** Badge fijo con la versión real de la app Tauri instalada. */
export default function VersionBadge() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    getVersion()
      .then((v) => {
        if (!cancelled && v) setVersion(v);
      })
      .catch(() => {
        /* no-op fuera de Tauri / error de API */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!version) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-2 right-3 z-[100] select-none text-[10px] font-mono tracking-wide text-muted-foreground/50"
      aria-label={`Versión ${version}`}
    >
      v{version}
    </div>
  );
}
