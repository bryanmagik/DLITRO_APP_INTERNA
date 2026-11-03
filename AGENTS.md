# DLITRO — Codex Master Instructions

> This file defines the permanent operating rules for any Codex session working on DLITRO.
>
> These instructions apply to the entire repository unless a more specific project instruction explicitly overrides them.
>
> DLITRO is a real business system. Changes can affect inventory, orders, sales, logistics, franchises, payments, users, and financial information. Treat the codebase and its data accordingly.

---

# 1. Project Identity

**Project:** DLITRO  
**Type:** Multi-branch operational management platform  
**Primary backend:** Supabase / PostgreSQL  
**Current maturity:** Early-stage product, approximately v0.2–v0.4  
**Target:** Production-grade operational platform

DLITRO is not merely an inventory application.

The long-term vision is to create a centralized operational platform capable of providing visibility and control over:

- Inventory
- Orders
- Sales
- Branches
- Franchises
- Logistics
- Kitchen / production
- Purchases
- Internal distribution
- Customers
- Payments
- Employees and permissions
- Losses and shrinkage
- Operational risks
- Business intelligence
- AI-assisted operations

The objective is to progressively become the operational source of truth for the business.

---

# 2. Business Context

DLITRO operates a beverage delivery business with multiple branches.

The system exists to solve real operational problems such as:

- Excessive manual work
- WhatsApp-dependent order management
- Inventory discrepancies
- Operational disorder
- Poor traceability
- Losses
- Shrinkage
- Internal theft risks
- Incorrect stock movements
- Lack of centralized reporting
- Weak visibility across branches
- Excessive staffing requirements for repetitive processes

Every feature should ultimately contribute to at least one of these goals:

1. Increase operational control.
2. Reduce human error.
3. Reduce unnecessary manual work.
4. Improve traceability.
5. Prevent losses.
6. Improve decision-making.
7. Automate repetitive processes.
8. Increase business scalability.
9. Generate measurable financial value.

Do not implement features only because they are technically interesting.

Prefer features that solve measurable business problems.

---

# 3. Current Product Philosophy

DLITRO must not be treated as a mature v1.0 product yet.

The current strategic sequence is:

```text
MAP
↓
IDENTIFY LEAKS
↓
REPAIR
↓
SECURE
↓
TEST
↓
STABILIZE
↓
SCALE
```

Before aggressively adding new functionality, prioritize understanding and strengthening the existing platform.

When encountering legacy or existing code, do not immediately rewrite it.

First understand:

- Why it exists
- What depends on it
- Which business process it supports
- Which database entities it touches
- Which permissions apply
- Whether another implementation already solves the same problem

---

# 4. Core Development Workflow

For any non-trivial task, follow this workflow:

```text
UNDERSTAND
↓
INSPECT
↓
PLAN
↓
IMPLEMENT
↓
VALIDATE
↓
TEST
↓
SECURITY REVIEW
↓
REGRESSION CHECK
↓
DONE
```

Do not jump directly from request to implementation.

Before modifying code:

1. Inspect the relevant files.
2. Identify existing architecture and patterns.
3. Search for reusable components/functions/hooks/services.
4. Inspect related database entities when relevant.
5. Identify permissions and authorization requirements.
6. Identify possible side effects.
7. Determine the current environment.
8. Create the smallest safe implementation.

Prefer modifying existing abstractions over creating parallel implementations.

Avoid unnecessary duplication.

---

# 5. Environment Awareness

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

---

# 6. STAGING

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

---

# 7. PRODUCTION SAFETY RULE

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

---

# 8. Production Database Protection

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

---

# 9. Branch Model

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

---

# 10. Franchise Business Rules

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

---

# 11. Orders Strategy

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

---

# 12. Customer Platform

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

---

# 13. Role-Oriented Architecture

DLITRO will progressively provide specialized experiences according to role.

Expected roles/interfaces include:

## Kitchen

Focus on:

- Pending orders
- Products
- Quantities
- Preparation
- Priority
- Order status

## Logistics

Focus on:

- Distribution requirements
- Products to deliver
- Destination branches
- Missing inventory
- Pending movements
- Delivery planning

## Branch Administrator

Focus on their authorized branch and relevant operational data.

## Central Administration

Focus on multi-branch operations and centralized control.

## Owner / Executive

Focus on:

- Sales
- Profitability
- Inventory
- Operational problems
- Branch performance
- Losses
- Alerts
- Business intelligence

## Customer

Must have a separate and restricted security model.

Role differences must be enforced by backend authorization and database policies.

Frontend visibility is not authorization.

---

# 14. AI Strategy

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

---

# 15. Modular Product Strategy

DLITRO should evolve as a modular platform.

Potential modules include:

```text
DLITRO CORE
│
├── Inventory
├── Orders
├── Logistics
├── Purchases
├── Branch Management
│
├── Kitchen
├── Customer Platform
├── AI Assistant
├── Advanced Analytics
├── Franchise Management
└── Additional future modules
```

Some modules may be:

- Developed
- Tested
- Feature-flagged
- Hidden
- Activated later

Do not assume every implemented module must immediately become available to every customer or branch.

Prefer architectures compatible with controlled feature activation when appropriate.

---

# 16. Commercial Context

DLITRO is intended to generate recurring revenue.

Current reference pricing has historically been approximately:

```text
CLP $85,000 / branch / month
```

The strategic objective is to progressively increase value and pricing as functionality increases.

Potential target:

```text
Internal application:
CLP $150,000–$200,000 / branch / month

Customer web platform:
approximately CLP $80,000 / branch / month
```

The product strategy is:

```text
MORE AUTOMATION
+
MORE CONTROL
+
LOWER LOSSES
+
LOWER OPERATIONAL COST
+
BETTER INFORMATION
=
MORE BUSINESS VALUE
```

Technical decisions should support this long-term scalability.

---

# 17. Frontend Development Core

Every frontend task must consider:

- User experience
- Responsive behavior
- Accessibility
- Reusable components
- Visual consistency
- Maintainability
- Performance
- Clear information hierarchy
- Loading states
- Empty states
- Error states
- Success feedback
- Form validation
- Keyboard usability where relevant

Before creating a component:

1. Search for an existing reusable component.
2. Inspect the current design system.
3. Follow established conventions.
4. Avoid unnecessary one-off UI patterns.

Do not sacrifice maintainability for cosmetic speed.

---

# 18. Backend Development Core

Backend work must prioritize:

- Clear responsibilities
- Input validation
- Authentication
- Authorization
- Error handling
- Data integrity
- Secure defaults
- Observability
- Performance
- Maintainability
- Idempotency where appropriate

Business-critical operations should not rely solely on frontend logic.

Sensitive business rules belong in trusted backend/database layers where appropriate.

---

# 19. Database Core

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

---

# 20. Cybersecurity Core

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

---

# 21. Testing & QA Core

Relevant changes should consider:

- Unit tests
- Integration tests
- API tests
- End-to-end tests
- Edge cases
- Regression tests
- Validation tests
- Responsive checks
- Browser compatibility
- Basic performance
- Acceptance criteria

Not every task requires every type of test.

Use judgment based on risk.

However, business-critical logic should have stronger test coverage.

---

# 22. Manual QA Workflow

DLITRO also uses manual testing in STAGING.

Manual findings may be reported as:

```text
WORKS
FAILS
UNEXPECTED BEHAVIOR
IMPROVEMENT
```

When receiving a bug report:

Do not immediately patch the visible symptom.

Follow:

```text
REPRODUCE
↓
TRACE
↓
IDENTIFY ROOT CAUSE
↓
ASSESS IMPACT
↓
FIX
↓
TEST
↓
REGRESSION CHECK
```

When reasonable, create a regression test for the discovered defect.

---

# 23. High-Risk Domains

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

---

# 24. Inventory Integrity

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

---

# 25. Order Integrity

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

---

# 26. Code Quality

Prefer:

- Clear naming
- Small focused functions
- Strong typing
- Reusable abstractions
- Explicit behavior
- Simple architecture
- Predictable patterns

Avoid:

- Massive components
- Massive functions
- Duplicate business logic
- Hidden side effects
- Unnecessary `any`
- Silent failures
- Magic values
- Hardcoded secrets
- Dead code
- Premature abstraction

Do not overengineer.

Choose the simplest architecture that safely supports current and reasonably expected future requirements.

---

# 27. Existing Code First

Before creating:

- Components
- Hooks
- Services
- Utilities
- Database functions
- Types
- Constants
- Helpers

Search the repository.

If equivalent functionality already exists:

- Reuse it
- Extend it
- Refactor it if necessary

Do not create parallel implementations without a strong reason.

---

# 28. Dependency Discipline

Do not install new dependencies automatically just because they make implementation easier.

Before adding a dependency:

1. Check whether the project already solves the problem.
2. Evaluate bundle/runtime impact.
3. Evaluate maintenance status.
4. Evaluate security implications.
5. Determine whether native/platform functionality is sufficient.

Prefer fewer high-quality dependencies.

---

# 29. Secrets

Never hardcode:

- API keys
- Supabase service role keys
- Payment secrets
- Database passwords
- Private tokens
- OAuth secrets

Use environment variables and existing secret-management patterns.

Never expose server-only secrets to browser bundles.

---

# 30. Logging

Do not log sensitive information unnecessarily.

Avoid logging:

- Passwords
- Tokens
- Authentication secrets
- Payment credentials
- Full sensitive customer information

Logs should help diagnose problems without becoming a data leak.

---

# 31. Migrations

Database schema changes must be migration-driven whenever the project architecture supports it.

Migrations should ideally be:

- Explicit
- Reviewable
- Reproducible
- Safe
- Version controlled

Before creating a migration inspect existing migrations and schema conventions.

Never casually rewrite migration history that may already have been applied to shared environments.

---

# 32. RLS

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

---

# 33. Authorization

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

---

# 34. Financial Calculations

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

---

# 35. Feature Completion

A feature is NOT done merely because:

- It compiles
- The page renders
- The happy path works

Definition of Done should consider:

```text
FUNCTIONALITY
+
VALIDATION
+
AUTHORIZATION
+
ERROR HANDLING
+
LOADING STATES
+
EMPTY STATES
+
RESPONSIVE
+
SECURITY
+
TESTS
+
REGRESSION
+
DATABASE INTEGRITY
```

Apply proportionally according to the feature's risk.

---

# 36. Communication With the Developer

When working on a significant task:

Before implementation, explain briefly:

1. What you found.
2. What you intend to change.
3. Which files/areas are affected.
4. Important risks.

After implementation, report:

1. What changed.
2. Why.
3. Tests/checks performed.
4. Remaining risks.
5. Anything requiring manual verification.

Do not hide uncertainty.

If something cannot be verified, say so.

---

# 37. Avoid Unrequested Scope Expansion

Do not turn a small task into a massive refactor unless necessary.

If you discover unrelated problems:

- Mention them.
- Classify their importance.
- Do not automatically rewrite everything.

Prioritize controlled incremental improvement.

---

# 38. Architectural Decision Principle

When multiple solutions exist, prioritize in this order:

```text
SECURITY
↓
DATA INTEGRITY
↓
CORRECTNESS
↓
MAINTAINABILITY
↓
USER EXPERIENCE
↓
PERFORMANCE
↓
DEVELOPMENT SPEED
```

This order may vary slightly depending on the task, but security and business data integrity should never be sacrificed merely for speed.

---

# 39. Business-Impact Thinking

Codex should behave as an engineering partner, not merely a code generator.

When appropriate, consider:

- Does this reduce operational work?
- Does this prevent losses?
- Does this improve traceability?
- Does this reduce staffing requirements?
- Does this improve decision-making?
- Does this create measurable value?
- Can this become a paid module?
- Does this create unnecessary complexity?

Technical quality and business value should reinforce each other.

---

# 40. Future Documentation

More detailed project instructions may exist under:

```text
.Codex/
├── PROJECT_CONTEXT.md
├── BUSINESS_RULES.md
├── ARCHITECTURE.md
├── DATABASE.md
├── ENVIRONMENTS.md
├── SECURITY.md
├── TESTING.md
└── ROADMAP.md
```

When these files exist, consult the relevant documentation before making significant changes.

This `AGENTS.md` remains the master operating policy.

Specific documentation may add detail but should not silently weaken:

- Production safety
- Security
- Authorization
- Data integrity
- Testing requirements

---

# 41. Session Startup Protocol

At the beginning of a substantial development session:

1. Read this `AGENTS.md`.
2. Inspect repository status.
3. Understand the requested task.
4. Identify the affected subsystem.
5. Read relevant `.Codex/` documentation if available.
6. Inspect existing implementation.
7. Identify environment implications.
8. Identify security/data risks.
9. Create a concise implementation plan.
10. Begin work.

Do not assume architecture from memory when repository evidence is available.

The repository is the source of truth for implementation details.

---

# 42. Final Principle

DLITRO handles real operations.

Build accordingly.

Every meaningful change should move the system toward being:

**safer, simpler, more observable, more automated, more maintainable and more valuable to the business.**

When uncertain between a fast solution and a robust solution for business-critical functionality, prefer the robust solution.

Do not optimize merely for writing more code.

Optimize for a reliable business system.