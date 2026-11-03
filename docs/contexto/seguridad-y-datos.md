# Seguridad e integridad de datos (detalle)

> Versión extendida de las reglas de ambientes, base de datos, seguridad, inventario, pedidos y finanzas.
>
> Movido desde el antiguo `CLAUDE.md` (secciones originales: 5 6 7 8 19 20 23 24 25 29 30 31 32 33 34). Las reglas operativas obligatorias están en [`CLAUDE.md`](../../CLAUDE.md).

## Environment Awareness

DLITRO uses separated environments.

The two primary operational contexts are:

- STAGING
- PRODUCTION

Never assume they contain identical:

- Data
- Database state
- Environment variables
- Authentication configuration
- Secrets
- Storage
- RLS policies
- Functions
- Integrations
- External services

Always identify which environment a task affects before performing potentially dangerous operations.

## STAGING

STAGING is the primary environment for:

- Development
- QA
- Manual testing
- Database migrations
- RLS testing
- Feature validation
- Integration testing
- Experiments
- Regression testing

A Supabase branch/environment exists specifically for testing changes before production.

STAGING should be treated as a controlled laboratory.

However, staging is NOT permission to behave recklessly.

Avoid unnecessary destructive operations even in staging.

Before destructive operations:

1. Understand the impact.
2. Determine whether existing test data matters.
3. Prefer reversible migrations.
4. Preserve useful development data when possible.

## PRODUCTION SAFETY RULE

Production contains real business-critical information.

Never execute destructive or irreversible production changes without explicit user authorization.

Changes involving any of the following must receive additional scrutiny:

- Database migrations
- RLS policies
- Authentication
- Authorization
- Triggers
- PostgreSQL functions
- RPCs
- Edge Functions
- Inventory
- Orders
- Sales
- Payments
- Cash
- Pricing
- Promotions
- Franchise transactions
- User permissions
- Data deletion

Whenever possible:

```text
IMPLEMENT
↓
STAGING
↓
TEST
↓
SECURITY REVIEW
↓
VALIDATE
↓
PRODUCTION PLAN
↓
EXPLICIT AUTHORIZATION
↓
PRODUCTION
```

Never interpret:

> "The implementation works"

as:

> "Deploy it to production."

These are different decisions.

## Production Database Protection

Production data must always be considered real and valuable.

Never casually execute:

```sql
DROP TABLE
DROP DATABASE
TRUNCATE
DELETE FROM table;
```

or equivalent destructive operations.

Before large UPDATE or DELETE operations:

- Verify the target rows.
- Prefer SELECT previews.
- Consider transactions.
- Consider backups.
- Consider rollback strategy.
- Confirm environment.
- Confirm authorization.

Never modify production data merely to simplify development.

## Database Core

Supabase/PostgreSQL is a critical part of DLITRO.

Every database change must consider:

- Schema design
- Primary keys
- Foreign keys
- Constraints
- Unique constraints
- Indexes
- Nullability
- RLS
- Triggers
- PostgreSQL functions
- RPC
- Transactions
- Concurrency
- Data integrity
- Migration safety
- Query performance

Never solve an integrity problem only in the frontend if the database can safely enforce the invariant.

Prefer database constraints for invariants that must always remain true.

## Cybersecurity Core

Every relevant implementation must consider:

- Authentication
- Authorization
- RLS
- Privilege escalation
- IDOR
- Input validation
- Secret exposure
- Data exposure
- SQL injection
- XSS
- CSRF when applicable
- Abuse cases
- Logging
- Rate limiting when applicable
- Sensitive information handling

Important rule:

> FRONTEND AUTHORIZATION IS NEVER SUFFICIENT SECURITY.

Hiding a button does not prevent an unauthorized action.

Always verify server/database authorization.

## High-Risk Domains

Treat these areas as HIGH RISK:

```text
INVENTORY
CASH
PAYMENTS
ORDERS
PROMOTIONS
PRICING
DATABASE MIGRATIONS
RLS
TRIGGERS
AUTHENTICATION
AUTHORIZATION
SALES
FRANCHISE TRANSACTIONS
```

Changes to these domains require deeper reasoning.

Always ask:

- What happens on failure?
- Can this execute twice?
- Is the operation idempotent?
- Can concurrent requests create inconsistencies?
- Can a user manipulate the request?
- Can another branch access the data?
- Can stock become negative?
- Can money be counted twice?
- Can the operation partially succeed?
- Is rollback possible?
- Is there an audit trail?

## Inventory Integrity

Inventory is financial data.

Treat inventory mutations as business-critical operations.

For every inventory operation consider:

```text
SOURCE
↓
MOVEMENT
↓
DESTINATION
↓
QUANTITY
↓
ACTOR
↓
TIMESTAMP
↓
REASON
↓
RESULT
```

Avoid silently changing stock without traceability.

Whenever practical, prefer auditable inventory movements over unexplained direct quantity modifications.

## Order Integrity

For order-related changes consider the complete lifecycle.

Example:

```text
ORDER CREATED
↓
CONFIRMED
↓
STOCK RESERVED / DEDUCTED
↓
PREPARATION
↓
DISPATCH
↓
DELIVERY
↓
COMPLETION
```

Also consider:

```text
CANCELLATION
PAYMENT FAILURE
DUPLICATE REQUEST
PARTIAL FAILURE
REFUND
STOCK RESTORATION
```

Never modify one part of the order lifecycle without checking downstream effects.

## Secrets

Never hardcode:

- API keys
- Supabase service role keys
- Payment secrets
- Database passwords
- Private tokens
- OAuth secrets

Use environment variables and existing secret-management patterns.

Never expose server-only secrets to browser bundles.

## Logging

Do not log sensitive information unnecessarily.

Avoid logging:

- Passwords
- Tokens
- Authentication secrets
- Payment credentials
- Full sensitive customer information

Logs should help diagnose problems without becoming a data leak.

## Migrations

Database schema changes must be migration-driven whenever the project architecture supports it.

Migrations should ideally be:

- Explicit
- Reviewable
- Reproducible
- Safe
- Version controlled

Before creating a migration inspect existing migrations and schema conventions.

Never casually rewrite migration history that may already have been applied to shared environments.

## RLS

Row Level Security is a core security boundary.

For every table containing user, branch, operational, financial, order, inventory, or franchise data, evaluate whether RLS is required.

RLS policies should consider:

```text
WHO
CAN DO WHAT
TO WHICH ROWS
UNDER WHICH CONDITIONS
```

Test both:

- Allowed behavior
- Forbidden behavior

A policy is not considered validated simply because authorized access works.

Unauthorized access must also be tested.

## Authorization

Always distinguish:

```text
AUTHENTICATION
"Who are you?"

AUTHORIZATION
"What are you allowed to do?"
```

Being authenticated does not imply unrestricted access.

Branch-level permissions are especially important.

A user associated with Branch A must not automatically gain access to Branch B.

Administrative privileges must be explicit.

## Financial Calculations

Financial calculations must be deterministic and traceable.

When working with:

- Revenue
- Cost
- Margin
- Profit
- Discounts
- Promotions
- Payments

clarify the definition being used.

For example:

```text
Profit = Revenue - Cost

Markup % = Profit / Cost × 100

Gross Margin % = Profit / Revenue × 100
```

Do not confuse markup with margin.

Prefer integer minor units or appropriate PostgreSQL numeric types for money rather than unsafe floating-point calculations.

