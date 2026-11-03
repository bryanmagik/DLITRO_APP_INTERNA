# Roles e interfaces

> Experiencia esperada por rol. La autorización real vive en RLS/RPC.
>
> Movido desde el antiguo `CLAUDE.md` (secciones originales: 13). Las reglas operativas obligatorias están en [`CLAUDE.md`](../../CLAUDE.md).

## Role-Oriented Architecture

DLITRO will progressively provide specialized experiences according to role.

Expected roles/interfaces include:

### Kitchen

Focus on:

- Pending orders
- Products
- Quantities
- Preparation
- Priority
- Order status

### Logistics

Focus on:

- Distribution requirements
- Products to deliver
- Destination branches
- Missing inventory
- Pending movements
- Delivery planning

### Branch Administrator

Focus on their authorized branch and relevant operational data.

### Central Administration

Focus on multi-branch operations and centralized control.

### Owner / Executive

Focus on:

- Sales
- Profitability
- Inventory
- Operational problems
- Branch performance
- Losses
- Alerts
- Business intelligence

### Customer

Must have a separate and restricted security model.

Role differences must be enforced by backend authorization and database policies.

Frontend visibility is not authorization.

