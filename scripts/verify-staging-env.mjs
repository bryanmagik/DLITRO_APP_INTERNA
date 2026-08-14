import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PRODUCTION_REF = "uwymxjmyasnlmkitzvej";
const STAGING_REF = "suscxwjloggmbsqdlgpj";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

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

const root = process.cwd();
const envPath = resolve(root, ".env.staging");
const configPath = resolve(root, "supabase", "config.toml");
const envContents = readFileSync(envPath, "utf8");
const configContents = readFileSync(configPath, "utf8");
const env = parseEnv(envContents);

const failures = [];

if (envContents.includes(PRODUCTION_REF) || configContents.includes(PRODUCTION_REF)) {
  failures.push("Se detecto la referencia de PRODUCCION en la configuracion de staging.");
}

if (env.VITE_SUPABASE_PROJECT_ID !== STAGING_REF) {
  failures.push(`VITE_SUPABASE_PROJECT_ID debe ser ${STAGING_REF}.`);
}

if (env.VITE_SUPABASE_URL !== STAGING_URL) {
  failures.push(`VITE_SUPABASE_URL debe ser ${STAGING_URL}.`);
}

if (!env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  failures.push("Falta VITE_SUPABASE_PUBLISHABLE_KEY.");
} else if (
  !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") &&
  !env.VITE_SUPABASE_PUBLISHABLE_KEY.includes(`.${STAGING_REF}.`)
) {
  failures.push("La clave configurada no tiene un formato publico reconocido.");
}

for (const name of Object.keys(env)) {
  if (/SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY/i.test(name)) {
    failures.push(`Variable privilegiada no permitida en frontend: ${name}.`);
  }
}

if (!new RegExp(`^project_id\\s*=\\s*["']${STAGING_REF}["']`, "m").test(configContents)) {
  failures.push(`supabase/config.toml debe usar project_id = "${STAGING_REF}".`);
}

if (failures.length > 0) {
  console.error("Verificacion de staging FALLIDA:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Staging verificado: ${STAGING_REF} (${STAGING_URL}).`);
