# Product Requirements Document — QoE Lite

**Product:** QoE Lite — Quality of Earnings & Proof of Cash platform for SMB M&A
**Version:** 1.0 (Draft)
**Date:** July 2026
**Status:** Approved for architecture & MVP scoping

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals, Non-Goals & Success Metrics](#3-goals-non-goals--success-metrics)
4. [Users & Personas](#4-users--personas)
5. [Core Feature Set](#5-core-feature-set)
6. ["No Accounting Knowledge" UX Requirements](#6-no-accounting-knowledge-ux-requirements)
7. [What Banks & PE Buyers Require (Underwriting Checklist)](#7-what-banks--pe-buyers-require-underwriting-checklist)
8. [APIs & Third-Party Services](#8-apis--third-party-services)
9. [Open-Source Repos to Repurpose](#9-open-source-repos-to-repurpose)
10. [Architecture & Data Model](#10-architecture--data-model)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Roadmap](#12-roadmap)
13. [Open Questions & Risks](#13-open-questions--risks)
14. [Glossary](#14-glossary)

---

## 1. Overview

QoE Lite is a web application that lets a non-accountant — a business broker, a seller, or a searcher — produce a **lender-grade Quality of Earnings (QoE) report and Proof of Cash** for a small or lower-middle-market business. The initial focus is transactions **below $20M EBITDA** (with a core sweet spot of $1M–$15M revenue / sub-$5M EBITDA deals), but the data model and analysis engine are architected to scale to bulge-bracket-size engagements (multi-entity, multi-currency, multi-reviewer).

The primary operator is **sell-side**: brokers and sellers preparing a QoE-lite package to support the asking price, pre-empt buyer diligence, and satisfy the buyer's lender. The report *consumers* are SBA and conventional lenders, PE buyers, searchers, and independent sponsors — so credibility, source-traceability, and standard report structure are the product's non-negotiables.

**Design principles:**

1. **Deterministic core, AI-assisted edges.** Every number in the report (proof of cash, EBITDA bridge, net working capital) is produced by deterministic, auditable computation. AI (LLM) is used for document classification, extraction assistance, add-back *suggestions*, anomaly flagging, and narrative drafting — never for financial arithmetic, and always with visible sourcing.
2. **Every figure drills to source.** Any number in the report can be traced back to a source document page/cell or an accounting-system record. This is what makes the output defensible to a credit committee.
3. **The app never silently guesses.** Ambiguity becomes a plain-English question to the user. Unresolved items become disclosed exceptions in the report, never hidden assumptions.

---

## 2. Problem Statement

- A full QoE from a transaction advisory firm costs **$30k–$100k+** and takes 4–8 weeks. Sub-$5M deals get "QoE-lite" engagements at **$7k–$30k** — or skip QoE entirely and blow up in lender underwriting.
- Seller books in the SMB segment are almost never deal-ready: cash-basis or hybrid accounting, commingled personal expenses, undocumented add-backs, and tax returns that don't tie to internal P&Ls.
- SBA 7(a) lenders (under SOP 50 10 8) must verify seller financials, scrutinize every add-back, demonstrate **DSCR ≥ 1.15x** (most target 1.25x+), and typically require a business valuation when goodwill exceeds $250k — many now request a QoE or equivalent proof-of-cash work product.
- Brokers and sellers have no tool to produce this themselves. Existing options are either full-service humans (slow, expensive) or generic spreadsheet templates (error-prone, not traceable, not trusted).

**Opportunity:** a software product that compresses a QoE-lite engagement from weeks to days at a fraction of the cost, with output quality that lenders and PE buyers will accept for underwriting.

---

## 3. Goals, Non-Goals & Success Metrics

### Goals

| # | Goal |
|---|------|
| G1 | A non-accountant can complete a QoE-lite engagement (upload → reconcile → report) with no outside help |
| G2 | Output is accepted by SBA/conventional lenders and PE buyers for underwriting without re-performance |
| G3 | Proof of cash ties book earnings to bank activity month-by-month, with all variances explained or disclosed |
| G4 | Every add-back is evidence-linked and rated for documentation quality |
| G5 | Time-to-first-draft-report < 1 business day after documents are uploaded |
| G6 | Architecture supports deals from Main Street to bulge bracket (multi-entity, multi-currency, roles/review) |

### Non-Goals (v1)

- Not an audit, review, or attestation under AICPA standards — the report explicitly discloses this.
- Not a general bookkeeping or accounting system (we normalize and analyze; we don't maintain the client's books).
- Not a business valuation tool (we output the inputs a valuator/lender needs; a valuation module may come later).
- No buy-side workflow in v1 (buyers consume reports via share links; buy-side mode is Phase 3).

### Success Metrics

| Metric | Target |
|--------|--------|
| Median time from upload-complete → draft report | < 24 hours |
| % of reports accepted by lender without re-work | > 85% |
| Extraction accuracy (transaction-level, vs. human-verified sample) | > 99% on digital PDFs, > 97% on scans |
| Proof of cash tie-out (unexplained variance) | < 0.5% of period revenue, or disclosed |
| % of add-backs with attached evidence at report time | 100% (hard gate) |
| Operator NPS (broker/seller) | > 50 |

---

## 4. Users & Personas

### P1 — Broker / Seller Operator (primary)
Business broker or owner-seller preparing a business for sale. **No accounting background.** Needs a guided, wizard-style flow; plain-English explanations; and confidence the output won't embarrass them in diligence. Uploads documents, answers clarifying questions, reviews suggested add-backs, and generates the report.

### P2 — Lender Credit Analyst (report consumer)
SBA 7(a) or conventional acquisition lender. Needs: tax-return-to-book reconciliation, proof of cash, scrutinized add-backs with evidence, DSCR at the proposed debt load, working capital analysis, customer concentration. Consumes the PDF report and the read-only web version with drill-down; may request the Excel databook.

### P3 — PE / Searcher Buyer Analyst (report consumer)
Independent sponsor, search fund, or small PE associate. Needs: adjusted EBITDA bridge with rationale per adjustment, revenue quality and concentration, NWC peg support, monthly databook in Excel to plug into their model.

### P4 — Advisory Firm (Phase 3)
CPA / transaction-advisory firm running QoE-lite engagements for many clients. Needs multi-client workspaces, white-label reports, preparer/reviewer sign-off workflow, and engagement management.

---

## 5. Core Feature Set

Every module below is **deterministic with drill-to-source on every number**. AI involvement per module is explicitly stated.

### 5.1 Data Ingestion

**F1.1 — Drag-and-drop document upload (v1)**
- Full-page and panel drop zones supporting multi-file and **folder drag-and-drop**, paste-from-clipboard, and mobile camera capture.
- Resumable, chunked uploads (tus protocol) with per-file progress, retry, and batch status — a 36-month engagement can be 150+ files.
- Accepted formats: PDF (digital and scanned), XLSX/XLS/CSV, PNG/JPG, OFX/QFX, QBO/QBB exports.
- Document types supported at launch:
  - Bank statements (operating, payroll, savings, credit card, merchant/processor statements)
  - Tax returns: 1120, 1120-S, 1065 (+ K-1s, 4562 depreciation schedules), Schedule C
  - Internal financials: P&L (monthly/annual), balance sheet, trial balance, general ledger export
  - AR aging, AP aging, inventory listings, fixed-asset registers, debt schedules
  - Payroll registers / 941s / W-3s
  - Leases, major customer contracts (for revenue-quality context)
- **AI role:** automatic classification of document type, entity, account, and period on upload ("Chase •••4821 operating account — March 2024 statement"), with confidence score; low confidence routes to a one-click confirmation.

**F1.2 — Accounting system sync (v1)**
- Direct connection to QuickBooks Online and Xero at launch (NetSuite, Sage Intacct, QuickBooks Desktop in Phase 3) via a unified accounting API (see §8).
- Pulls: chart of accounts, GL journal detail, monthly P&L and balance sheet, AR/AP agings, customer/vendor lists, invoices/bills.
- Read-only OAuth flow the *seller* can complete from an emailed magic link, without needing an app account ("connect your QuickBooks" request link).

**F1.3 — Bank data linking (Phase 2)**
- Optional Plaid connection for direct bank transaction/asset data as an alternative to statement upload. Statement upload remains the primary path — SMB sellers frequently will not link accounts, and closed accounts can't be linked.

**F1.4 — Document request list / completeness checker (v1)**
- Auto-generated diligence checklist based on engagement scope and detected periods: "Missing: Jan–Mar 2024 statements for Chase •••4821; 2023 Form 1120-S."
- Detects statement continuity gaps (ending balance ≠ next beginning balance ⇒ missing statement or missing account).
- Shareable request-list link so the seller/CPA can upload directly against outstanding items.

### 5.2 Extraction & Normalization

**F2.1 — Document extraction pipeline (v1)**
- OCR + table extraction converts statements, returns, and financials into structured records with **per-field confidence scores and page/cell provenance**.
- Deterministic parsers first (structured formats: OFX/QFX, CSV, digital-PDF table extraction); Document-AI/LLM-vision fallback for scans and messy layouts; low-confidence fields route to a human-review queue with the source image side-by-side.
- Validation invariants enforced at parse time: beginning balance + deposits − disbursements = ending balance per statement; debits = credits per GL export; page continuity.

**F2.2 — Canonical chart of accounts mapping (v1)**
- All financial data normalizes to a canonical CoA (revenue streams, COGS, opex categories, owner comp, non-operating, etc.).
- **AI role:** suggests the mapping from the client's CoA / statement descriptions; user confirms via a simple review grid; mappings are remembered per engagement and reusable as templates.

**F2.3 — Monthly financial data model (v1)**
- Target dataset: **36 months historical + TTM + stub period**, by month, by entity: P&L, balance sheet, and bank-transaction ledger.
- Multi-entity consolidation with eliminations (needed for both SMB owners with multiple LLCs and larger deals).

### 5.3 Proof of Cash (flagship)

**F3.1 — Automated proof of cash (v1)**
- Month-by-month, per-account reconciliation of **book revenue → bank deposits** and **book expenses → bank disbursements**, then a combined all-accounts roll-up:
  - Reported revenue per books
  - ± timing (AR change, deferred revenue change)
  - − non-revenue deposits (transfers, loan proceeds, owner contributions, refunds re-deposited)
  - = expected deposits, compared to actual bank deposits → **variance**
  - Symmetric build for expenses/disbursements.
- Inter-account transfer matching (identifies and nets transfers between the business's own accounts so they don't inflate revenue/expense).
- Variance thresholds (default: flag any month where unexplained variance > 0.5% of revenue or > $2,500, configurable) with red/yellow/green status per month.

**F3.2 — Reconciliation workbench (v1)**
- Spreadsheet-style grid where flagged items are resolved with guided, plain-English prompts: "This $18,000 deposit on 3/14 doesn't match any invoice. What is it?" with one-click classifications (customer payment, owner contribution, loan proceeds, transfer, other + note).
- Every resolution is recorded with user, timestamp, and rationale — resolutions become footnotes/exceptions in the report appendix.
- **AI role:** proposes the most likely classification for each unmatched item from description, counterparty, amount patterns, and GL context; user confirms.

**F3.3 — Cash-basis / cash-heavy handling (v1)**
- Explicit support for cash-basis books and cash-heavy businesses: the proof of cash degrades gracefully into a **deposit analysis** (bank-verified revenue floor) with clearly disclosed limitations rather than a false tie-out.

### 5.4 Adjusted EBITDA Bridge

**F4.1 — EBITDA bridge builder (v1)**
- Reported net income → EBITDA (interest, taxes, D&A from GL/returns) → **Adjusted EBITDA**, monthly and annually, rendered as a waterfall and a schedule.
- Adjustment categories: owner compensation normalization (to market replacement salary), personal/discretionary expenses, one-time/non-recurring items, rent normalization (related-party real estate to market), pro-forma adjustments (signed contracts, discontinued operations), accounting-method corrections (cash→accrual, cutoff errors).
- **Every adjustment requires:** (a) linked evidence (document, GL lines, or bank transactions), (b) a written rationale, (c) a category. **Report generation is blocked** for adjustments missing evidence — they must be either documented or dropped.

**F4.2 — Add-back scrutiny score (v1)**
- Each add-back is rated the way a lender will rate it: **Documented / Partially supported / Unsupported**, using deterministic rules (evidence present? recurring in bank data? third-party document?).
- Bridge shows adjusted EBITDA at three conservatism levels: all add-backs, documented-only, and documented + partially supported — so the seller sees the deal through the lender's eyes before the lender does.

**F4.3 — AI add-back discovery (v1)**
- **AI role:** scans GL and bank transactions for candidate add-backs (personal vehicles, country club, family members on payroll, one-time legal settlements, COVID-era items, owner insurance) and *suggests* them with the supporting transactions attached. User accepts/rejects each; nothing enters the bridge without confirmation.

**F4.4 — SDE view (v1)**
- Seller's Discretionary Earnings presentation (EBITDA + one owner's full compensation) alongside adjusted EBITDA — the standard metric for Main-Street and SBA deals.

### 5.5 Revenue Quality

**F5.1 (v1)** Revenue by stream and by customer (from GL/invoice data): top-10/top-20 customer concentration, largest-customer % of revenue and gross profit.
**F5.2 (v1)** Monthly revenue trend, seasonality index, growth decomposition (price vs. volume where unit data exists).
**F5.3 (Phase 2)** Cohort/retention analysis for recurring-revenue businesses; contract coverage (revenue under contract vs. spot); backlog analysis.
**F5.4 (v1)** Revenue-recognition red flags (deterministic rules + AI-flagged anomalies, human-reviewed): quarter/year-end spikes, round-dollar entries, negative-margin invoices, channel stuffing patterns, related-party revenue.

### 5.6 Net Working Capital

**F6.1 (v1)** Monthly NWC schedule (defined and adjustable: which accounts are in/out, cash-free debt-free toggle), 12/24-month averages, and a **NWC peg recommendation** with methodology note.
**F6.2 (v1)** Cash conversion cycle (DSO/DIO/DPO) trends.
**F6.3 (v1)** AR aging quality (concentration, > 90-day %, bad-debt history), AP stretch detection, inventory aging/obsolescence indicators.

### 5.7 Income Statement & Balance Sheet Analytics

**F7.1 (v1)** Monthly IS with margin trends, variance flags (any line ± X% vs. trailing average, explained via drill-down), gross margin by stream.
**F7.2 (v1)** Balance sheet review: related-party balances, loans to/from shareholders, debt schedule build (for the buyer's sources & uses), off-balance-sheet items checklist (leases, guarantees).
**F7.3 (v1)** Payroll analysis: headcount and comp by role from payroll registers; family-member identification; 941 reconciliation to GL payroll expense.

### 5.8 Lender-Specific Outputs

**F8.1 — Tax-return-to-book reconciliation (v1).** Line-by-line reconciliation of filed returns (1120/1120-S/1065/Sched C) to internal P&Ls per year, with variance explanations. *Lenders underwrite off tax returns — this schedule is frequently the first thing a credit analyst checks.*
**F8.2 — DSCR module (v1).** User (or lender) enters proposed deal structure (price, equity injection, SBA 7(a)/conventional terms, seller note); app computes historical and pro-forma **DSCR** against adjusted EBITDA / SDE at each conservatism level; flags months/years below 1.15x (SBA SOP 50 10 8 floor) and 1.25x (market threshold).
**F8.3 — Lender pack export (Phase 2).** One-click bundle: QoE report + proof of cash appendix + tax reconciliation + DSCR schedule + document index, formatted for credit-memo attachment.

### 5.9 Report Generation

**F9.1 — QoE report (v1).** Branded PDF following the standard engagement structure:
1. Notice to Readers (scope, limitations, not-an-audit disclosure)
2. Glossary
3. Business background
4. Executive summary & key points of interest
5. Accounting process & data quality assessment
6. Quality of Earnings (adjusted EBITDA bridge with adjustment detail)
7. Net working capital & cash conversion cycle
8. Income statement analysis
9. Balance sheet analysis
10. Appendix A — Procedures performed
11. Appendix B — Proof of cash
12. Appendix C — Supporting schedules & document index

**F9.2 — AI narrative with human review (v1).** **AI role:** drafts the narrative sections strictly from computed schedules and user-entered rationales, citing figures; every paragraph is editable and must be human-approved before the report is finalizable. AI never introduces numbers not present in the deterministic schedules (enforced by post-generation numeric validation against the schedule data).
**F9.3 — Excel databook (v1).** Monthly P&L/BS, EBITDA bridge, proof of cash, NWC, and revenue schedules as a linked Excel workbook — what PE analysts actually plug into their models.
**F9.4 — Shareable web report (Phase 2).** Read-only, permissioned link (buyer/lender email-gated) with interactive drill-down from any figure to its source evidence; view/download analytics for the seller.
**F9.5 — Versioning (v1).** Immutable published versions; changes after publish require a new version with a change log.

### 5.10 Trust & Audit Infrastructure

**F10.1 (v1)** Immutable audit trail: every extracted value, mapping decision, reconciliation resolution, adjustment, and narrative edit records who/what/when and source lineage.
**F10.2 (v1)** Source lineage: every report figure resolves to (document ID, page, region) or (accounting-API record ID) — powering both the drill-down UI and defensibility.
**F10.3 (v1)** Validation gates before report finalization: proof of cash tied or exceptions acknowledged; all adjustments evidenced; completeness checklist resolved or waived with disclosure; tax reconciliation complete for all years presented.
**F10.4 (Phase 2)** Preparer/reviewer roles with sign-off workflow (required for advisory-firm tier; optional otherwise).
**F10.5 (v1)** Engagement scope record: periods covered, procedures performed, and data limitations auto-compiled into Appendix A.

---

## 6. "No Accounting Knowledge" UX Requirements

| # | Requirement |
|---|-------------|
| U1 | **Guided wizard flow**: Engagement setup → Upload → Confirm classifications → Resolve questions → Review add-backs → Review schedules → Generate report. The user always knows the next action; a progress bar covers the whole engagement. |
| U2 | **Plain-English everywhere**: every accounting concept has an inline explainer ("Proof of cash checks that the revenue in the books actually showed up in the bank"). No unexplained jargon in any user-facing prompt. |
| U3 | **Questions, not spreadsheets**: ambiguity is surfaced as simple, single-decision questions with evidence shown ("Is this $12,400/yr payment to 'ABC Leasing' a business vehicle or personal?"). The workbench grid exists for power users; the question queue is the default path. |
| U4 | **Confidence made visible**: extracted values show confidence; anything below threshold requires confirmation. The user is never responsible for catching silent errors. |
| U5 | **Seller interview mode**: templated management-interview questionnaire (owner comp, related parties, one-time events, customer relationships) whose answers feed the add-back module and narrative. |
| U6 | **Hard gates, soft language**: report generation is blocked until validation gates (F10.3) pass, with friendly explanations of exactly what's missing and how to fix it. |
| U7 | **Undo everything**: all decisions are reversible pre-publication; the audit trail records reversals. |
| U8 | **Time-to-value**: a first "data quality snapshot" (what we received, what's missing, headline revenue/EBITDA per books) renders within minutes of first upload — before any user work. |

---

## 7. What Banks & PE Buyers Require (Underwriting Checklist)

This is the acceptance bar for G2. The report must supply every item below; **product coverage** maps each to features.

| Requirement (lender/PE) | Product coverage |
|---|---|
| Adjusted EBITDA with itemized, evidenced add-backs | F4.1–F4.3 |
| Add-back scrutiny (lenders reject undocumented add-backs) | F4.2 scrutiny score + hard evidence gate |
| Proof of cash / bank verification of revenue & expenses | F3.1–F3.3 |
| Tax-return-to-book reconciliation | F8.1 |
| DSCR ≥ 1.15x demonstrated (SBA SOP 50 10 8); 1.25x market | F8.2 |
| SDE presentation (Main Street / SBA deals) | F4.4 |
| 3 years + interim/TTM monthly financials | F2.3 |
| Net working capital analysis & peg | F6.1–F6.3 |
| Customer concentration & revenue quality | F5.1–F5.4 |
| Related-party transactions identified | F7.2, F4.1 (rent normalization) |
| Debt schedule & off-balance-sheet obligations | F7.2 |
| Payroll verification (941s vs. GL) | F7.3 |
| Procedures performed & scope disclosure | F10.5, report Appendix A |
| Source documentation index & drill-down | F10.2, F9.4 |
| Independent, tamper-evident work product | F10.1 audit trail, F9.5 versioning |

---

## 8. APIs & Third-Party Services

| Category | Recommended | Alternatives / Notes |
|---|---|---|
| **Unified accounting API** | **Codat** — lending-oriented, pre-calculated financial metrics ("Assess" endpoints), built for exactly this buyer profile | Rutter (stronger read/write + commerce data); Merge (if accounting is secondary); or **direct Intuit QuickBooks Online API + Xero API** to start cheaper — QBO+Xero covers ~90% of SMB sellers; abstract behind our own interface so Codat can be swapped in |
| **Bank data (Phase 2)** | **Plaid** (Transactions, Assets) | Statement upload remains primary path; Plaid is an accelerator when the seller will link |
| **Document AI / OCR** | **Azure Document Intelligence** (prebuilt layout + custom models for statements/returns) | AWS Textract; LlamaParse / Reducto for messy PDFs; deterministic parsers first for structured formats (see §9) |
| **LLM** | **Claude API** — classification, CoA-mapping suggestions, add-back discovery, anomaly flags, narrative drafting; vision fallback for degraded scans | Default to the current mid-tier model for high-volume classification; top-tier model for narrative/complex analysis. All outputs constrained to cite source records; numeric post-validation against deterministic schedules |
| **Auth / DB / Storage** | **Supabase** — Postgres (RLS multi-tenancy), Auth (incl. magic links for seller upload/OAuth flows), Storage (documents), Edge Functions | — |
| **Hosting** | **Vercel** (Next.js app) | Python worker on Fly.io/Railway for heavy computation (see §10) |
| **Background jobs / queues** | Supabase queues or Inngest/Trigger.dev for pipeline orchestration | Parsing/reconciliation pipelines must be idempotent and resumable |
| **PDF generation** | Playwright print-to-PDF from the report's web view (one rendering codebase) | react-pdf |
| **Excel export** | exceljs / SheetJS | Databook with real formulas, not flat values |
| **File upload** | Uppy + tus (resumable) on Supabase Storage | react-dropzone for simple zones (see §9) |
| **E-signature (Phase 2)** | Dropbox Sign | DocuSign; engagement letters & rep letters |
| **Billing** | Stripe | Per-engagement pricing + subscription tiers |
| **Email** | Resend | Request-list notifications, share-link invites |
| **IRS transcripts (Phase 3)** | IRS income-verification / 8821-based transcript services (e.g., Halcyon-style APIs) | Gold-standard tax verification for lenders |
| **Monitoring** | Sentry + Vercel/Supabase logs | Pipeline observability is a trust feature |

---

## 9. Open-Source Repos to Repurpose

No existing open-source QoE application exists to fork wholesale. The following are **component-level accelerators**, mapped to modules:

| Repo | License-check needed | Repurpose for |
|---|---|---|
| [`sebastienrousseau/bankstatementparser`](https://github.com/sebastienrousseau/bankstatementparser) | ✔ | **Proof-of-cash ingestion core (F2.1, F3.1)** — parses CAMT/ISO 20022, OFX/QFX, MT940, CSV, and PDFs (digital + scanned) into a unified transaction model with deterministic parsers, LLM/vision fallback, balance-continuity verification, dedupe, page provenance, and a REST API. Closest match to our pipeline design; wrap in the Python worker |
| [`JerBouma/FinanceToolkit`](https://github.com/JerBouma/FinanceToolkit) | ✔ | **Analytics engine patterns (F5–F7)** — 50+ ratio/metric implementations (EBITDA, margins, efficiency ratios) to adapt; oriented to public-company data, so we reuse computation patterns, not the data layer |
| [`transloadit/uppy`](https://github.com/transloadit/uppy) + [tus](https://tus.io) | ✔ (MIT) | **F1.1 drag-and-drop** — resumable chunked uploads, folder drop, progress UI, Supabase-compatible tus endpoint |
| [`react-dropzone/react-dropzone`](https://github.com/react-dropzone/react-dropzone) | ✔ (MIT) | Lightweight headless drop zones embedded in checklist items (upload-against-request) |
| [`dream-num/univer`](https://github.com/dream-num/univer) | ✔ (Apache-2.0) | **F3.2 reconciliation workbench & schedule grids** — open-source Sheets-like engine; alternative: AG Grid Community. (Handsontable is no longer free for commercial use — avoid) |
| [`marlanperumal/pdf_statement_reader`](https://github.com/marlanperumal/pdf_statement_reader), `tabula-py`, `camelot` | ✔ | PDF table-extraction fallbacks in the parsing pipeline (F2.1) |
| [`anthropics/financial-services-plugins`](https://github.com/anthropics/financial-services-plugins) | ✔ | Prompt/tool patterns for financial modeling (3-statement logic, comps) to inform DSCR module and AI-analysis prompts |
| `beancount` / `hledger` (plain-text accounting) | ✔ | Reference implementations for double-entry invariants and ledger validation rules (F2.1 validation), not runtime dependencies |

**Action item for engineering:** verify each repo's license (and maintenance health) before adoption; `bankstatementparser` in particular should be evaluated hands-on against a corpus of real US bank statements early in MVP, with a build-vs-wrap decision documented.

---

## 10. Architecture & Data Model

### 10.1 System architecture

```
┌────────────────────────────────────────────────────────────┐
│  Next.js app (Vercel)                                      │
│  wizard UI · workbench grids (Univer/AG Grid) · report view│
└──────────────┬─────────────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────────────┐
│  Supabase                                                  │
│  Postgres (RLS multi-tenant) · Auth · Storage (documents)  │
│  Edge Functions (light jobs, webhooks)                     │
└──────┬───────────────────────────────┬─────────────────────┘
       │ queue (jobs)                  │ webhooks
┌──────▼──────────────────┐   ┌────────▼────────────────────┐
│ Python worker (Fly.io)  │   │ Integrations                │
│ FastAPI + pandas        │   │ Codat/QBO/Xero · Plaid      │
│ statement parsing       │   │ Azure Doc Intelligence      │
│ proof-of-cash engine    │   │ Claude API · Stripe · Resend│
│ schedule computation    │   └─────────────────────────────┘
└─────────────────────────┘
```

- **Deterministic financial engine lives in the Python worker** (pandas + Decimal arithmetic; never floats for money), exposed as idempotent jobs: parse-document, build-ledger, run-proof-of-cash, compute-schedules, render-databook.
- **LLM calls are isolated in an "AI suggestions" service layer** whose outputs are always *proposals* persisted with model/version/prompt-hash and confidence — accepted or rejected by a human, never auto-applied to schedules.

### 10.2 Data model (core entities)

```
org ─┬─ user (role: owner/preparer/reviewer/viewer)
     └─ engagement (deal) ─┬─ entity (1..n, consolidation tree)
                           ├─ document ── document_page ── extraction (field, value,
                           │                                confidence, provenance)
                           ├─ account (bank/credit/GL) ── transaction (immutable,
                           │                              source_ref → extraction | api_record)
                           ├─ coa_mapping (client account → canonical account)
                           ├─ financial_fact (entity, period, canonical account, value,
                           │                  lineage[] → transaction/extraction ids)
                           ├─ reconciliation_item (status, resolution, resolver, rationale)
                           ├─ adjustment (category, amount by period, rationale,
                           │              evidence[] → document/transaction, scrutiny_score)
                           ├─ schedule (proof_of_cash | ebitda_bridge | nwc | ... ,
                           │            computed, versioned, input_hash)
                           ├─ question (AI/system-raised, answer, answered_by)
                           ├─ report_version (immutable snapshot, narrative blocks,
                           │                  share_links, change_log)
                           └─ audit_event (append-only)
```

Key properties: **facts are immutable and lineage-linked**; schedules are pure functions of facts + confirmed decisions (recomputable and hash-verified); report versions snapshot everything.

### 10.3 Scaling beyond SMB

The same model handles bulge-bracket engagements because scale lives in data volume and workflow, not schema: unlimited entities with a consolidation tree and eliminations; multi-currency fields on facts (single-currency presentation in v1); preparer/reviewer roles and sign-off (Phase 2); per-module scope toggles so a full-scope engagement just enables more procedures; API access for LOS/data-room integration (Phase 3).

---

## 11. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Accuracy** | Money as integer cents / Decimal end-to-end. Every schedule recomputable from immutable facts; recompute hash must match stored hash. Proof-of-cash tolerance policy configurable, defaults per §5.3. Golden-file regression suite of anonymized real engagements gates every release of the financial engine. |
| **Security** | Tax returns and bank statements = highest sensitivity. Encryption at rest & in transit; Supabase RLS enforced multi-tenancy with automated cross-tenant access tests; signed, expiring URLs for documents; SSN/EIN masked in UI by default; SOC 2 Type I targeted within 12 months of launch, Type II thereafter. |
| **Privacy/retention** | Per-engagement retention policy; full data-room export (all documents + schedules + audit log) and verified deletion on request. |
| **Performance** | Data-quality snapshot < 5 min after upload; 36 months of statements parsed < 10 min (parallel per-document jobs); workbench grid interactions < 100ms at 50k transactions; report render < 60s. |
| **Reliability** | All pipeline jobs idempotent & resumable; partial-failure surfaces as per-document status, never a stuck engagement; human-review queue for low-confidence extraction is a designed state, not an error path. |
| **AI governance** | Model/version/prompt recorded per suggestion; numeric claims in generated narrative validated against schedule data before save; zero data retention arrangement with LLM provider; per-engagement AI-usage disclosure available. |
| **Availability** | 99.9% target for app; report share links served from immutable snapshots (highest availability requirement — a lender hitting a dead link kills trust). |

---

## 12. Roadmap

### Phase 1 — MVP (target: lender-acceptable sell-side QoE-lite)
- Engagement wizard, drag-and-drop ingestion (F1.1), completeness checker (F1.4)
- QBO + Xero sync (F1.2)
- Extraction pipeline + CoA mapping + monthly data model (F2.x)
- **Proof of cash + reconciliation workbench (F3.x)**
- **EBITDA bridge + evidence-gated add-backs + scrutiny score + SDE (F4.x)**
- NWC schedule + peg (F6.1–6.3), IS/BS analytics (F7.1–7.3)
- Tax-return-to-book reconciliation (F8.1), DSCR module (F8.2)
- PDF report + Excel databook + versioning (F9.1–9.3, F9.5)
- Audit trail, lineage, validation gates (F10.1–10.3, F10.5)

### Phase 2 — Lender distribution & depth
- Plaid bank linking (F1.3); shareable web report with drill-down (F9.4); lender pack export (F8.3)
- Revenue-quality deep dive: cohorts/retention/contract coverage (F5.3)
- Preparer/reviewer sign-off workflow (F10.4); e-signed engagement letters
- Benchmarking vs. industry (NAICS-level margin comparisons)

### Phase 3 — Upmarket & platform
- Advisory-firm tier: multi-client workspaces, white-label reports
- NetSuite, Sage Intacct, QuickBooks Desktop connectors
- IRS transcript retrieval (8821 flow); buy-side mode (buyer-initiated QoE on received data)
- Public API for lender LOS / data-room integrations; multi-currency presentation

---

## 13. Open Questions & Risks

| # | Question / Risk | Current stance |
|---|---|---|
| R1 | **Professional positioning**: the report is not an audit/review/attestation and no CPA opines on it. Will lenders accept a software-produced QoE-lite? | Mitigate with radical traceability (drill-to-source), scope disclosure, and early design-partner validation with 3–5 SBA lenders before GA. Consider an optional "reviewed by a licensed CPA" marketplace tier later. |
| R2 | **Liability for extraction/analysis errors** | Terms of service + disclosed confidence/tolerances + human-confirmation gates; E&O insurance evaluation before GA. |
| R3 | **Cash-heavy businesses** where proof of cash cannot tie | F3.3 deposit-analysis mode with explicit disclosure; never present a false tie-out. |
| R4 | **Codat pricing at SMB volumes** vs. building direct QBO/Xero | Start direct QBO+Xero behind our own interface; adopt Codat when NetSuite/Sage demand or lender-product features justify it. |
| R5 | **`bankstatementparser` fitness** for US bank-statement corpus | Hands-on evaluation in MVP sprint 1; build-vs-wrap decision documented. |
| R6 | **Seller cooperation** (won't connect QBO, slow uploads) | Magic-link request lists (F1.4) and seller-facing upload UX are first-class, not afterthoughts. |
| R7 | **Scope creep toward full QoE** | Per-module scope toggles keep "lite" the default; full-scope is a pricing tier, not a fork. |

---

## 14. Glossary

- **QoE (Quality of Earnings):** analysis validating that reported earnings are accurate, sustainable, and cash-backed; the core diligence work product in M&A.
- **Proof of Cash:** reconciliation of book revenue/expenses to actual bank deposits/disbursements over the period.
- **Add-back / Adjustment:** expense (or income) removed from reported results to normalize EBITDA (e.g., owner's personal expenses, one-time items).
- **Adjusted EBITDA:** earnings before interest, taxes, depreciation & amortization, normalized for add-backs.
- **SDE (Seller's Discretionary Earnings):** adjusted EBITDA plus one full-time owner's total compensation; standard for Main-Street deals.
- **NWC Peg:** target level of net working capital to be delivered at close.
- **DSCR (Debt Service Coverage Ratio):** cash flow available for debt service ÷ debt service; SBA floor 1.15x (SOP 50 10 8), market norm ≥ 1.25x.
- **TTM:** trailing twelve months.
- **SOP 50 10 8:** SBA's standard operating procedure governing 7(a) lender underwriting requirements.
