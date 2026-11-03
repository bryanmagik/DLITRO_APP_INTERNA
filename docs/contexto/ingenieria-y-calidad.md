# Ingeniería y calidad (detalle)

> Flujo de trabajo, estándares de frontend/backend, testing, QA manual y comunicación.
>
> Movido desde el antiguo `CLAUDE.md` (secciones originales: 4 17 18 21 22 26 27 28 35 36 37 38 41). Las reglas operativas obligatorias están en [`CLAUDE.md`](../../CLAUDE.md).

## Core Development Workflow

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

## Frontend Development Core

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

## Backend Development Core

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

## Testing & QA Core

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

## Manual QA Workflow

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

## Code Quality

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

## Existing Code First

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

## Dependency Discipline

Do not install new dependencies automatically just because they make implementation easier.

Before adding a dependency:

1. Check whether the project already solves the problem.
2. Evaluate bundle/runtime impact.
3. Evaluate maintenance status.
4. Evaluate security implications.
5. Determine whether native/platform functionality is sufficient.

Prefer fewer high-quality dependencies.

## Feature Completion

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

## Communication With the Developer

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

## Avoid Unrequested Scope Expansion

Do not turn a small task into a massive refactor unless necessary.

If you discover unrelated problems:

- Mention them.
- Classify their importance.
- Do not automatically rewrite everything.

Prioritize controlled incremental improvement.

## Architectural Decision Principle

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

## Session Startup Protocol

At the beginning of a substantial development session:

1. Read this `CLAUDE.md`.
2. Inspect repository status.
3. Understand the requested task.
4. Identify the affected subsystem.
5. Read relevant `.claude/` documentation if available.
6. Inspect existing implementation.
7. Identify environment implications.
8. Identify security/data risks.
9. Create a concise implementation plan.
10. Begin work.

Do not assume architecture from memory when repository evidence is available.

The repository is the source of truth for implementation details.

