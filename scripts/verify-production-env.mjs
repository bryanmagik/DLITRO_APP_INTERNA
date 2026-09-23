import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PRODUCTION_REF = "uwymxjmyasnlmkitzvej";
const STAGING_REF = "suscxwjloggmbsqdlgpj";
const PRODUCTION_URL = `https://${PRODUCTION_REF}.supabase.co`;

function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return separator === -1
          ? [line, ""]
          : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

const envPath = resolve(process.cwd(), ".env.production");

if (!existsSync(envPath)) {
  console.error(
    "Verificacion de produccion FALLIDA:\n- Falta .env.production. Copia .env.production.example y completa únicamente las claves públicas.",
  );
  process.exit(1);
}

const envContents = readFileSync(envPath, "utf8");
const env = parseEnv(envContents);
const failures = [];

if (envContents.includes(STAGING_REF)) {
  failures.push("Se detecto la referencia de STAGING en la configuracion de produccion.");
}

if (env.VITE_SUPABASE_PROJECT_ID !== PRODUCTION_REF) {
  failures.push(`VITE_SUPABASE_PROJECT_ID debe ser ${PRODUCTION_REF}.`);
}

if (env.VITE_SUPABASE_URL !== PRODUCTION_URL) {
  failures.push(`VITE_SUPABASE_URL debe ser ${PRODUCTION_URL}.`);
}

if (!env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  failures.push("Falta VITE_SUPABASE_PUBLISHABLE_KEY de produccion.");
} else if (
  !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") &&
  !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith("eyJ")
) {
  failures.push("La clave configurada no tiene un formato publico reconocido.");
}

for (const name of Object.keys(env)) {
  if (/SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY/i.test(name)) {
    failures.push(`Variable privilegiada no permitida en frontend: ${name}.`);
  }
}

if (failures.length > 0) {
  console.error("Verificacion de produccion FALLIDA:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Produccion verificada: ${PRODUCTION_REF} (${PRODUCTION_URL}).`);
