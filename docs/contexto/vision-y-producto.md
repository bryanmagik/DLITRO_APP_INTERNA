# Visión y producto

> Identidad, problema de negocio, filosofía y estrategia modular de DLITRO.
>
> Movido desde el antiguo `CLAUDE.md` (secciones originales: 1 2 3 15 39 42). Las reglas operativas obligatorias están en [`CLAUDE.md`](../../CLAUDE.md).

## Project Identity

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

## Business Context

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

## Current Product Philosophy

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

## Modular Product Strategy

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

## Business-Impact Thinking

Claude should behave as an engineering partner, not merely a code generator.

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

## Final Principle

DLITRO handles real operations.

Build accordingly.

Every meaningful change should move the system toward being:

**safer, simpler, more observable, more automated, more maintainable and more valuable to the business.**

When uncertain between a fast solution and a robust solution for business-critical functionality, prefer the robust solution.

Do not optimize merely for writing more code.

Optimize for a reliable business system.
