# QoE Lite — Quality of Earnings Platform

A web application that lets non-accountants (business brokers, sellers, searchers) produce **lender-grade Quality of Earnings reports and Proofs of Cash** for SMB M&A transactions (sub-$20M EBITDA focus), with output robust enough for SBA lenders, banks, and private equity buyers to underwrite deals.

📄 **Product spec: [docs/PRD.md](docs/PRD.md)** — full feature set, underwriting checklist, APIs, architecture, roadmap.

## What's built (walking skeleton)

- **Auth & multi-tenant workspaces** — Supabase auth, orgs with row-level security on every table, append-only audit log.
- **Drag-and-drop document intake** — Uppy + tus resumable uploads to Supabase Storage; automatic document classification (rules-based, optional Claude API enhancement via `ANTHROPIC_API_KEY`); one-click confirmation for anything uncertain.
- **Ingestion** — bank statement CSV (header-synonym detection, debit/credit or signed-amount layouts) and OFX/QFX → immutable transaction ledger; monthly P&L CSV → canonical chart of accounts. Statement completeness checks (running-balance continuity, missing months).
- **Proof of cash** — deterministic month-by-month reconciliation of book revenue/expenses to bank deposits/disbursements; automatic inter-account transfer matching; flagged variances resolved through a plain-English workbench or acknowledged as disclosed exceptions.
- **EBITDA bridge** — reported EBITDA → adjusted EBITDA with evidence-required add-backs, lender scrutiny tiers (documented / partially supported / unsupported), and an SDE view.
- **Report** — HTML QoE report preview (notice to readers, exec summary, bridge, proof-of-cash appendix, exceptions, document index) gated by validation checks that block finalization until data issues are resolved or disclosed.
- **Demo mode** — one click seeds "Bluebird HVAC LLC" (12 months, 2 bank accounts, ~530 transactions) through the real pipeline, with two designed proof-of-cash exceptions to resolve.

All financial math is integer-cents and deterministic; `tests/engine.test.ts` verifies the engine against independently computed golden values (`npm test`).

## Development

```bash
npm install
npm test          # engine + parser golden tests
npm run dev       # http://localhost:3000
npm run fixtures  # regenerate demo fixtures + expected.json
```

Supabase schema lives in `supabase/migrations/`. Connection defaults (URL + publishable key — public by design) are committed in `src/lib/supabase/config.ts` and can be overridden with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Deployment

Deploys as a standard Next.js app on Vercel — no required env vars. Optional: `ANTHROPIC_API_KEY` enables AI-assisted document classification.

`/api/selftest?email=…&password=…` (authenticates as the supplied user) runs the full pipeline against live Supabase and returns a pass/fail checklist — useful as a post-deploy smoke test.
