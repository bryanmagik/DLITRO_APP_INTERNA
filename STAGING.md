# Flujo seguro de DLITRO

## Ambientes

| Ambiente | Carpeta | Rama | Supabase |
| --- | --- | --- | --- |
| Produccion | `C:\\Users\\bryan\\OneDrive\\Escritorio\\PROYECTOS\\DLITRO` | `main` | DLITRO ULTIMATE (`uwymxjmyasnlmkitzvej`) |
| Staging | `C:\\Users\\bryan\\OneDrive\\Escritorio\\PROYECTOS\\DLITRO-STAGING` | `staging/security-hardening` | Preview `staging-security` (`suscxwjloggmbsqdlgpj`) |

Las dos carpetas pertenecen al mismo repositorio Git mediante un worktree. El worktree de produccion conserva sus cambios locales actuales. Las migraciones de staging deben dirigirse exclusivamente a la Preview Branch documentada arriba.

## Uso cotidiano

Trabajar en seguridad solamente desde la carpeta `DLITRO-STAGING`.

```powershell
cd C:\Users\bryan\OneDrive\Escritorio\PROYECTOS\DLITRO-STAGING
npm run verify:staging-env
npm run dev:staging
```

`dev:staging` y `build:staging` ejecutan primero una barrera de seguridad. El proceso se detiene si la URL, el project ref o `supabase/config.toml` no corresponden exactamente a la Preview Branch, si aparece la referencia de produccion o si se declara una variable privilegiada como `service_role`.

## Archivos de entorno

- `.env.staging` contiene los valores locales y esta ignorado por Git.
- `.env.staging.example` documenta solo variables publicas y se puede versionar.
- El frontend admite exclusivamente `VITE_SUPABASE_PUBLISHABLE_KEY`; nunca agregar `service_role`, secret keys ni claves privadas a variables `VITE_*`.
- Para ejecutar Vite usar siempre el modo staging (`npm run dev:staging` o `npm run build:staging`), porque un `npm run dev` simple carga `.env`, no `.env.staging`.

## Comprobaciones Git

```powershell
git worktree list
git branch --show-current
git status --short
git check-ignore -v .env.staging
git ls-files -- .env .env.staging
```

El ultimo comando no debe listar `.env` ni `.env.staging`.
