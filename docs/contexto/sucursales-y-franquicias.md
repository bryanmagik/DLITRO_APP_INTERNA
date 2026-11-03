# Sucursales y franquicias

> Modelo de sucursales propias/franquicia y venta logística a franquicias.
>
> Movido desde el antiguo `CLAUDE.md` (secciones originales: 9 10). Las reglas operativas obligatorias están en [`CLAUDE.md`](../../CLAUDE.md).

## Branch Model

DLITRO contains different types of branches.

At minimum:

```text
OWNED
FRANCHISE
```

Approximately five branches are company-owned, with additional branches operating as franchises.

Branch type is a fundamental business attribute.

It can affect:

- Inventory rules
- Product pricing
- Internal sales
- Logistics
- Permissions
- Reports
- Margins
- Purchasing
- Profitability
- Business intelligence

Never assume all branches follow identical business rules.

Any branch-related implementation must consider whether behavior differs between OWNED and FRANCHISE locations.

## Franchise Business Rules

Franchises can purchase logistical supplies/products from DLITRO.

This creates an additional business model:

```text
PURCHASE
↓
CENTRAL INVENTORY
↓
INTERNAL DISTRIBUTION
↓
SALE TO FRANCHISE
↓
COST
↓
SALE PRICE
↓
MARGIN
↓
LOGISTICS PROFIT
```

Example:

```text
Company cost:
10 units = CLP $10,000

Franchise sale:
10 units = CLP $20,000

Gross profit:
CLP $10,000

Markup on cost:
100%

Gross margin on revenue:
50%
```

Do not confuse:

**inventory transfer**

with:

**sale to franchise**

They represent different business events and may require different accounting, reporting, and inventory behavior.

