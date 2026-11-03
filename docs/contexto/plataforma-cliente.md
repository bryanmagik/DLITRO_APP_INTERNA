# Pedidos web y plataforma cliente

> Estrategia para sacar la toma de pedidos de WhatsApp y plataforma para clientes.
>
> Movido desde el antiguo `CLAUDE.md` (secciones originales: 11 12). Las reglas operativas obligatorias están en [`CLAUDE.md`](../../CLAUDE.md).

## Orders Strategy

A major operational problem is order intake through WhatsApp.

During high-demand periods, approximately 4–5 people may be required to manually process orders.

This creates:

- Labor costs
- Duplicate work
- Errors
- Poor traceability
- Operational disorder
- Difficult reporting
- Scaling limitations

DLITRO aims to progressively centralize order management.

Long-term flow:

```text
CUSTOMER
↓
DLITRO WEB
↓
ORDER
↓
BRANCH
↓
KITCHEN
↓
LOGISTICS
↓
DELIVERY
```

The goal is to reduce manual order-taking and move staff toward supervision and exception handling.

## Customer Platform

The DLITRO ecosystem includes or plans to include a customer-facing platform.

Expected capabilities include:

- Customer ordering
- Google authentication
- Branch selection/routing
- Order tracking
- Cash on delivery
- Future online payments
- Promotions
- Customer accounts

The customer-facing platform and the internal operational application have different security boundaries.

Never expose internal business data to customer-facing interfaces.

