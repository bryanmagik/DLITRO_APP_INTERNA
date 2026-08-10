import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Genera latest.json para GitHub Releases a partir de tauri.conf.json.
 *
 * Uso:
 *   node scripts/crear-release.js --sig path/al/archivo.sig
 *   node scripts/crear-release.js --sig path/al/archivo.sig --notes "Correcciones y mejoras"
 *
 * Requiere --sig con un archivo .sig existente y no vacío.
 * Si falta, el script aborta sin escribir latest.json (evita romper el updater).
 *
 * Tras el build, firmar con TAURI_SIGNING_PRIVATE_KEY y pasar --sig
 * al .sig del installer NSIS.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const confPath = resolve(root, "src-tauri/tauri.conf.json");
const outPath = resolve(root, "latest.json");

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  console.error("  Uso: node scripts/crear-release.js --sig path/al/archivo.sig [--notes \"...\"]");
  process.exit(1);
}

const conf = JSON.parse(readFileSync(confPath, "utf8"));
const version = conf.version;
const productName = conf.productName || "dlitro";
const notes = argValue("--notes") ?? "Nueva versión disponible";
const sigPath = argValue("--sig");

if (!sigPath) {
  fail("Falta --sig. No se generó latest.json (signature vacío rompe el auto-updater).");
}

const sigResolved = resolve(sigPath);
if (!existsSync(sigResolved)) {
  fail(`No existe el archivo .sig: ${sigResolved}\n  No se generó latest.json.`);
}

const signature = readFileSync(sigResolved, "utf8").trim();
if (!signature) {
  fail(`El archivo .sig está vacío: ${sigResolved}\n  No se generó latest.json.`);
}

const tag = `v${version}`;
const installerName = `${productName}_${version}_x64-setup.exe`;
const url = `https://github.com/bryanmagik/DLITRO_APP_INTERNA/releases/download/${tag}/${installerName}`;

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      url,
      signature,
    },
  },
};

writeFileSync(outPath, `${JSON.stringify(latest, null, 2)}\n`, "utf8");
console.log(`✓ Escrito ${outPath}`);
console.log(`  version:   ${version}`);
console.log(`  url:       ${url}`);
console.log(`  signature: (desde ${sigResolved})`);
