# Asistente de IA

> Estrategia del asistente operativo de IA y sus límites de seguridad.
>
> Movido desde el antiguo `CLAUDE.md` (secciones originales: 14). Las reglas operativas obligatorias están en [`CLAUDE.md`](../../CLAUDE.md).

## AI Strategy

DLITRO plans to integrate an AI operational assistant.

The AI should allow authorized users to ask questions such as:

> What do I need to distribute today?

> Which branches are low on stock?

> How much did we sell this week?

> Why did sales decrease?

The AI is an intelligence layer over operational data.

It must never become a security bypass.

AI access must respect:

- Authentication
- Authorization
- User role
- Branch scope
- RLS
- Data sensitivity

The AI must never retrieve data the authenticated user could not normally access.

